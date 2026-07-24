import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../server/db';
import { requireAuth, isAdminEmail } from '../../server/token';
import { ERR } from '../../shared/providers';

// Identité et rôles du compte porté par le jeton — relus EN BASE à chaque
// appel (un vieux jeton ne donne aucun droit périmé). Utilisé par les pages
// réservées (modes duals des promptagogues, etc.).
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }
  const auth = requireAuth(req);
  if (!auth) return res.status(401).json({ error: { code: 'ERR_AUTH_REQUIRED' } });

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
