import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../server/db';
import { requireAuth, isAdminEmail } from '../../server/token';
import { ERR } from '../../shared/providers';

// Identité et rôles du compte porté par le jeton — relus EN BASE à chaque
// appel (un vieux jeton ne donne aucun droit périmé). Utilisé par les pages
// réservées (modes duals des promptagogues, etc.).
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }
  const auth = requireAuth(req);
  if (!auth) return res.status(401).json({ error: { code: 'ERR_AUTH_REQUIRED' } });

  // Consentement à la sauvegarde des conversations. Il n'était jusqu'ici
  // écrit qu'à la vérification de l'email : on ne pouvait donc plus le
  // retirer — ni le redonner après un effacement total, qui le remet à zéro.
  if (req.method === 'PUT') {
    if (typeof req.body?.syncOptin !== 'boolean') {
      return res.status(400).json({ error: { code: 'ERR_PROFILE_INVALID' } });
    }
    getDb().prepare('UPDATE users SET sync_optin = ? WHERE email = ? AND verified_at IS NOT NULL')
      .run(req.body.syncOptin ? 1 : 0, auth.email);
    return res.status(200).json({ ok: true, syncOptin: req.body.syncOptin });
  }

  const user = getDb().prepare(
    'SELECT name, is_promptagogue, is_teacher FROM users WHERE email = ? AND verified_at IS NOT NULL')
    .get(auth.email) as { name: string; is_promptagogue: number; is_teacher: number } | undefined;

  return res.status(200).json({
    email: auth.email,
    name: user?.name || auth.name,
    isPromptagogue: !!user?.is_promptagogue,
    isTeacher: !!user?.is_teacher,
    isAdmin: isAdminEmail(auth.email),
  });
}
