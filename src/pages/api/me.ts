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
    const syncOptin = typeof req.body?.syncOptin === 'boolean' ? req.body.syncOptin : undefined;
    // Nom d'affichage : il n'est plus demandé à la vérification (on part de la
    // partie locale de l'adresse), il se personnalise ici. Vide = on revient
    // au nom dérivé, plutôt que d'afficher un compte sans nom.
    const nameBrut = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : undefined;
    if (syncOptin === undefined && nameBrut === undefined) {
      return res.status(400).json({ error: { code: 'ERR_PROFILE_INVALID' } });
    }
    const db = getDb();
    if (syncOptin !== undefined) {
      db.prepare('UPDATE users SET sync_optin = ? WHERE email = ? AND verified_at IS NOT NULL')
        .run(syncOptin ? 1 : 0, auth.email);
    }
    if (nameBrut !== undefined) {
      const nom = nameBrut || auth.email.split('@')[0];
      db.prepare('UPDATE users SET name = ? WHERE email = ? AND verified_at IS NOT NULL')
        .run(nom, auth.email);
      // Le nom d'auteur est dénormalisé sur les tuteurs : sans cette mise à
      // jour, le catalogue continuerait d'afficher l'ancien.
      db.prepare('UPDATE prompts SET author_name = ? WHERE author_email = ?').run(nom, auth.email);
    }
    return res.status(200).json({ ok: true });
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
