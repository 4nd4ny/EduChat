import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../../server/db';
import { requireAdmin } from '../../../server/admin';
import { ERR } from '../../../shared/providers';

// Comptes vérifiés, vus par l'admin — notamment pour VALIDER le rattachement
// d'un enseignant à un établissement (étape 14) : le rôle se demande à la
// vérification email, le rattachement se pose ici.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req)) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
  const db = getDb();

  if (req.method === 'GET') {
    return res.status(200).json({
      users: db.prepare(`
        SELECT u.email, u.name, u.is_promptagogue AS isPromptagogue, u.is_teacher AS isTeacher,
               u.etablissement_id AS etablissementId, e.name AS etablissementName, u.sync_optin AS syncOptin
        FROM users u LEFT JOIN etablissements e ON e.id = u.etablissement_id
        ORDER BY u.is_teacher DESC, u.email
      `).all(),
    });
  }

  if (req.method === 'POST') {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const etablissementId = req.body?.etablissementId ? Number(req.body.etablissementId) : null;
    if (!email) return res.status(400).json({ error: { code: 'ERR_EMAIL_INVALID' } });
    const info = db.prepare('UPDATE users SET etablissement_id = ? WHERE email = ?').run(etablissementId, email);
    if (info.changes === 0) return res.status(404).json({ error: { code: 'ERR_USER_UNKNOWN' } });
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: { code: ERR.METHOD } });
}
