import { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { getDb } from '../../../server/db';
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
  if (await isRateLimited(ip, 5)) {
    // Même réponse que le succès : indistincte.
    return res.status(200).json({ ok: true });
  }

  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const name = String(req.body?.name ?? '').trim().slice(0, 80);
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

  db.prepare(`
    INSERT INTO email_codes (email, name, code_hash, expires_at, attempts, send_count, window_start)
    VALUES (@email, @name, @hash, @expires, 0, @count, @window)
    ON CONFLICT(email) DO UPDATE SET
      name = @name, code_hash = @hash, expires_at = @expires, attempts = 0,
      send_count = @count, window_start = @window
  `).run({
    email, name, hash: codeHash, expires: now + CODE_TTL_MS,
    count: inWindow ? existing!.send_count + 1 : 1,
    window: inWindow ? existing!.window_start : now,
  });

  try {
    await sendVerificationCode(email, name, code);
  } catch (error) {
    console.error('Échec d\'envoi du code de vérification :', error);
    // Réponse toujours indistincte — l'utilisateur peut redemander un code.
  }

  res.status(200).json({ ok: true });
}
