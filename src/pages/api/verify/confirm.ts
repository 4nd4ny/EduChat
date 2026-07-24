import { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcrypt';
import { getDb } from '../../../server/db';
import { issueToken } from '../../../server/token';
import { getClientIp, isRateLimited } from '../../../server/access';
import { notifyAdmin } from '../../../server/mail';
import { ERR } from '../../../shared/providers';

const MAX_ATTEMPTS = 5;

// Confirmation du code et émission du jeton de compte.
// POST /api/verify/confirm { email, code, syncOptin? }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  const ip = getClientIp(req);
  if (await isRateLimited(ip, 10, 'confirm')) {
    return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
  }

  const email = String(req.body?.email ?? '').trim().toLowerCase();
  // Tolérant à la saisie : « 123-456 », « 123 456 » et « 123456 » sont équivalents.
  const code = String(req.body?.code ?? '').replace(/[\s-]/g, '');
  const syncOptin = req.body?.syncOptin ? 1 : 0;
  const isTeacher = req.body?.isTeacher ? 1 : 0;

  if (!email || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: { code: 'ERR_CODE_INVALID' } });
  }
  const normalized = `${code.slice(0, 3)}-${code.slice(3)}`;

  const db = getDb();
  const row = db.prepare('SELECT * FROM email_codes WHERE email = ?').get(email) as
    { email: string; name: string; code_hash: string; expires_at: number; attempts: number } | undefined;

  if (!row || Date.now() > row.expires_at) {
    return res.status(400).json({ error: { code: 'ERR_CODE_EXPIRED' } });
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: { code: 'ERR_TOO_MANY_ATTEMPTS' } });
  }

  if (!bcrypt.compareSync(normalized, row.code_hash)) {
    db.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE email = ?').run(email);
    return res.status(401).json({ error: { code: 'ERR_CODE_WRONG' } });
  }

  // Usage unique : le code est consommé, le compte créé ou réactivé.
  const now = Date.now();
  // Nouveau compte ou re-vérification ? (notification admin + rôles)
  const existing = db.prepare('SELECT is_teacher FROM users WHERE email = ?').get(email) as
    { is_teacher: number } | undefined;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM email_codes WHERE email = ?').run(email);
    // is_teacher se DEMANDE à la création ; le rattachement à un établissement,
    // lui, n'est effectif qu'une fois posé par un admin (étape 14).
    // Sur un compte EXISTANT, les rôles ne sont JAMAIS retouchés ici : sinon,
    // une simple re-vérification email annulerait un retrait de rôle décidé
    // par l'administration (les rôles se gèrent dans /admin ; une demande de
    // rôle enseignant sur compte existant part en notification ci-dessous).
    db.prepare(`
      INSERT INTO users (email, name, verified_at, is_promptagogue, is_teacher, sync_optin, created_at)
      VALUES (@email, @name, @now, 1, @teacher, @optin, @now)
      ON CONFLICT(email) DO UPDATE SET
        name = @name, verified_at = @now, sync_optin = @optin
    `).run({ email, name: row.name, now, teacher: isTeacher, optin: syncOptin });
  });
  tx();

  // L'administration est prévenue de chaque NOUVELLE inscription, et d'une
  // demande de rôle enseignant émise par un compte existant qui ne l'a pas.
  if (!existing) {
    notifyAdmin(
      `Nouveau compte : ${row.name || email}`,
      `Une nouvelle personne vient de vérifier son adresse sur EduChat.\n` +
      `Nom public : ${row.name || '(non renseigné)'}\nEmail : ${email}\n` +
      `Rôle demandé : ${isTeacher ? 'ENSEIGNANT (rattachement à poser dans /admin)' : 'promptagogue'}`,
    );
  } else if (isTeacher && !existing.is_teacher) {
    notifyAdmin(
      `Demande de rôle enseignant : ${row.name || email}`,
      `Le compte existant ${email} (${row.name || 'sans nom'}) a re-vérifié son adresse en demandant ` +
      `le rôle ENSEIGNANT. Ce rôle ne s'accorde plus automatiquement : à poser dans /admin si légitime.`,
    );
  }

  res.status(200).json({ token: issueToken(row.name, email), name: row.name, email });
}
