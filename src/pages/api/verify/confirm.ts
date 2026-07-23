import { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcrypt';
import { getDb } from '../../../server/db';
import { issueToken } from '../../../server/token';
import { getClientIp, isRateLimited } from '../../../server/access';
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
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM email_codes WHERE email = ?').run(email);
    // is_teacher se DEMANDE ici ; le rattachement à un établissement, lui,
    // n'est effectif qu'une fois posé par un admin (étape 14).
    db.prepare(`
      INSERT INTO users (email, name, verified_at, is_promptagogue, is_teacher, sync_optin)
      VALUES (@email, @name, @now, 1, @teacher, @optin)
      ON CONFLICT(email) DO UPDATE SET
        name = @name, verified_at = @now, is_promptagogue = 1,
        is_teacher = MAX(is_teacher, @teacher), sync_optin = @optin
    `).run({ email, name: row.name, now, teacher: isTeacher, optin: syncOptin });
  });
  tx();

  res.status(200).json({ token: issueToken(row.name, email), name: row.name, email });
}
