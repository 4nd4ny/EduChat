import type { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { getDb } from '../../../server/db';
import { isVerifiedAccount } from '../../../server/accountData';
import { getClientIp, isRateLimited } from '../../../server/access';
import { requireAuth, issueToken } from '../../../server/token';
import { sendEmailChangeCode, sendEmailChangeWarning } from '../../../server/mail';
import { ERR } from '../../../shared/providers';

// Changement d'adresse email d'un compte.
//
//  POST { newEmail } → envoie un code à la NOUVELLE adresse, et prévient
//                      l'ANCIENNE que la demande a été faite. C'est cet
//                      avertissement qui protège : si le compte a été
//                      détourné, son titulaire l'apprend tout de suite.
//  PUT  { code }     → confirme, puis MIGRE le compte.
//
// La migration est la partie délicate : l'email est la clé primaire du compte
// et sert de référence dans sept tables, sans clé étrangère ni cascade. Tout
// se fait donc dans UNE transaction, explicitement, table par table — un
// oubli laisserait des données orphelines (des tuteurs sans auteur, une
// facturation sans enseignant).

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = requireAuth(req);
  if (!auth) return res.status(401).json({ error: { code: 'ERR_AUTH_REQUIRED' } });
  if (!isVerifiedAccount(auth.email)) return res.status(401).json({ error: { code: 'ERR_AUTH_REQUIRED' } });

  const ip = getClientIp(req);
  if (await isRateLimited(ip, 5, 'email-change')) {
    return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
  }

  const db = getDb();

  if (req.method === 'POST') {
    const newEmail = String(req.body?.newEmail ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(newEmail)) return res.status(400).json({ error: { code: 'ERR_EMAIL_INVALID' } });
    if (newEmail === auth.email) return res.status(400).json({ error: { code: 'ERR_EMAIL_SAME' } });
    const occupe = db.prepare('SELECT 1 FROM users WHERE email = ?').get(newEmail);
    if (occupe) return res.status(409).json({ error: { code: 'ERR_EMAIL_TAKEN' } });

    const code = `${crypto.randomInt(100, 1000)}-${crypto.randomInt(100, 1000)}`;
    db.prepare(`
      INSERT INTO email_changes (old_email, new_email, code_hash, expires_at, attempts)
      VALUES (?, ?, ?, ?, 0)
      ON CONFLICT(old_email) DO UPDATE SET new_email = excluded.new_email,
        code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0
    `).run(auth.email, newEmail, await bcrypt.hash(code, 10), Date.now() + CODE_TTL_MS);

    await sendEmailChangeCode(newEmail, code);
    // Fire-and-forget : l'ancienne adresse doit savoir, mais un échec d'envoi
    // ne doit pas bloquer un changement légitime.
    sendEmailChangeWarning(auth.email, newEmail);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'PUT') {
    const code = String(req.body?.code ?? '').trim();
    const row = db.prepare('SELECT new_email AS newEmail, code_hash AS hash, expires_at AS expires, attempts FROM email_changes WHERE old_email = ?')
      .get(auth.email) as { newEmail: string; hash: string; expires: number; attempts: number } | undefined;
    if (!row) return res.status(404).json({ error: { code: 'ERR_CODE_UNKNOWN' } });
    if (Date.now() > row.expires) {
      db.prepare('DELETE FROM email_changes WHERE old_email = ?').run(auth.email);
      return res.status(410).json({ error: { code: 'ERR_CODE_EXPIRED' } });
    }
    if (row.attempts >= MAX_ATTEMPTS) return res.status(429).json({ error: { code: 'ERR_TOO_MANY_ATTEMPTS' } });
    if (!await bcrypt.compare(code, row.hash)) {
      db.prepare('UPDATE email_changes SET attempts = attempts + 1 WHERE old_email = ?').run(auth.email);
      return res.status(403).json({ error: { code: 'ERR_CODE_INVALID' } });
    }
    // L'adresse a pu être prise entre-temps.
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(row.newEmail)) {
      return res.status(409).json({ error: { code: 'ERR_EMAIL_TAKEN' } });
    }

    const ancien = auth.email;
    const nouveau = row.newEmail;
    db.transaction(() => {
      db.prepare('UPDATE users SET email = ? WHERE email = ?').run(nouveau, ancien);
      db.prepare('UPDATE profiles SET email = ? WHERE email = ?').run(nouveau, ancien);
      db.prepare('UPDATE profile_deletions SET email = ? WHERE email = ?').run(nouveau, ancien);
      db.prepare('UPDATE user_keys SET email = ? WHERE email = ?').run(nouveau, ancien);
      db.prepare('UPDATE prompts SET author_email = ? WHERE author_email = ?').run(nouveau, ancien);
      // La facturation doit rester recalculable : on ne supprime rien, on
      // suit la personne.
      db.prepare('UPDATE usage_log SET teacher_email = ? WHERE teacher_email = ?').run(nouveau, ancien);
      db.prepare('UPDATE session_settings SET set_by_email = ? WHERE set_by_email = ?').run(nouveau, ancien);
      db.prepare('UPDATE comments SET moderated_by = ? WHERE moderated_by = ?').run(nouveau, ancien);
      db.prepare('DELETE FROM email_changes WHERE old_email = ?').run(ancien);
    })();

    // Le jeton portait l'ancienne adresse : il faut en délivrer un neuf,
    // sinon la personne se retrouverait déconnectée d'un compte qui existe.
    const user = db.prepare('SELECT name FROM users WHERE email = ?').get(nouveau) as { name: string } | undefined;
    return res.status(200).json({ ok: true, email: nouveau, token: issueToken(user?.name ?? '', nouveau) });
  }

  res.setHeader('Allow', ['POST', 'PUT']);
  return res.status(405).json({ error: { code: ERR.METHOD } });
}
