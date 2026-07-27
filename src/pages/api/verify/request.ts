import { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { getDb } from '../../../server/db';
import { signerLienVerification } from '../../../server/token';
import { sendVerificationCode } from '../../../server/mail';
import { getClientIp, isRateLimited } from '../../../server/access';
import { ERR } from '../../../shared/providers';

const CODE_TTL_MS = 15 * 60 * 1000;      // 15 minutes
const SEND_WINDOW_MS = 60 * 60 * 1000;   // fenêtre horaire par adresse
const MAX_SENDS_PER_WINDOW = 3;

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

// Demande d'un code de vérification (compte sans mot de passe).
// POST /api/verify/request { name, email }
//
// La réponse est STRICTEMENT identique que l'adresse soit connue, inconnue ou
// même rate-limitée : aucune énumération d'adresses possible.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  const ip = getClientIp(req);
  if (await isRateLimited(ip, 5, 'verify')) {
    // Même réponse que le succès : indistincte.
    return res.status(200).json({ ok: true });
  }

  const email = String(req.body?.email ?? '').trim().toLowerCase();
  // Le nom n'est plus demandé : redonner son nom à chaque vérification est
  // inutile. On dérive un nom d'affichage de la partie locale de l'adresse
  // (« prenom.nom@ecole.ch » → « prenom.nom ») ; il se personnalise ensuite
  // depuis « Mes données ».
  const name = (String(req.body?.name ?? '').trim() || email.split('@')[0] || '').slice(0, 80);
  // Les deux choix de l'inscription se font désormais ICI, au moment où l'on
  // demande le code, et non plus à la confirmation : le lien du courriel ouvre
  // le compte directement, il n'y a donc plus d'écran intermédiaire pour les
  // poser. Ils partent SIGNÉS dans le lien (voir plus bas), ce qui les fait
  // suivre jusque sur le téléphone qui ouvrira le courriel.
  const syncOptin = req.body?.syncOptin !== false; // défaut : mémoriser (voir /verifier)
  const isTeacher = !!req.body?.isTeacher;
  if (!EMAIL_RE.test(email)) {
    // Seule erreur visible : un format d'adresse manifestement invalide.
    return res.status(400).json({ error: { code: 'ERR_EMAIL_INVALID' } });
  }

  const db = getDb();
  const now = Date.now();
  const existing = db.prepare('SELECT send_count, window_start FROM email_codes WHERE email = ?').get(email) as
    { send_count: number; window_start: number } | undefined;

  // Rate-limiting horaire PAR ADRESSE, silencieux (réponse indistincte).
  const inWindow = existing && now - existing.window_start < SEND_WINDOW_MS;
  if (inWindow && existing!.send_count >= MAX_SENDS_PER_WINDOW) {
    return res.status(200).json({ ok: true });
  }

  // Code à deux fois trois chiffres (exigence n°7), généré cryptographiquement.
  const code = `${crypto.randomInt(0, 1000).toString().padStart(3, '0')}-${crypto.randomInt(0, 1000).toString().padStart(3, '0')}`;
  const codeHash = bcrypt.hashSync(code, 10);
  // UNE SEULE variable d'expiration, écrite en base ET signée dans le lien :
  // deux « now + CODE_TTL_MS » évalués séparément dériveraient, et le lien ne
  // vaudrait plus exactement le code.
  const expires = now + CODE_TTL_MS;

  db.prepare(`
    INSERT INTO email_codes (email, name, code_hash, expires_at, attempts, send_count, window_start)
    VALUES (@email, @name, @hash, @expires, 0, @count, @window)
    ON CONFLICT(email) DO UPDATE SET
      name = @name, code_hash = @hash, expires_at = @expires, attempts = 0,
      send_count = @count, window_start = @window
  `).run({
    email, name, hash: codeHash, expires,
    count: inWindow ? existing!.send_count + 1 : 1,
    window: inWindow ? existing!.window_start : now,
  });

  // Le lien du courriel : adresse + code + choix, signés en HMAC. Il n'est PAS
  // un second justificatif à côté du code — il porte le code lui-même, se
  // vérifie contre le même code_hash et se consomme par la même ligne
  // supprimée. Émettre un nouveau code écrase donc le précédent et invalide du
  // même coup le lien qui l'accompagnait.
  const lien = signerLienVerification({ e: email, c: code, x: expires, s: syncOptin, t: isTeacher });

  try {
    await sendVerificationCode(email, name, code, lien);
  } catch (error) {
    console.error('Échec d\'envoi du code de vérification :', error);
    // Réponse toujours indistincte — l'utilisateur peut redemander un code.
  }

  res.status(200).json({ ok: true });
}
