import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../../server/db';
import { requireAdmin } from '../../../server/admin';
import { ERR } from '../../../shared/providers';

// Tous les commentaires, vus par l'ADMINISTRATION — la modération elle-même
// passe par PATCH /api/prompts/[name]/comments (droits auteur/admin).
// L'admin voit tout : en attente d'abord, puis le reste, du plus récent au
// plus ancien. Rien n'est jamais supprimé (« hidden » = masqué).
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req)) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }
  const db = getDb();
  const select = `
    SELECT c.id, c.body, c.status, c.created_at AS createdAt,
           c.moderated_at AS moderatedAt, c.moderated_by AS moderatedBy,
           p.name AS promptName, p.author_email AS promptAuthorEmail
    FROM comments c JOIN prompts p ON p.id = c.prompt_id`;
  // Les EN ATTENTE, intégralement (c'est la file de travail) ; l'historique
  // modéré, borné aux 500 plus récents AVEC le total — la troncature est
  // annoncée, jamais silencieuse (rien n'est supprimé, la table ne fait que
  // croître).
  const pending = db.prepare(`${select} WHERE c.status = 'pending' ORDER BY c.created_at DESC`).all();
  const moderated = db.prepare(`${select} WHERE c.status != 'pending' ORDER BY c.created_at DESC LIMIT 500`).all();
  const moderatedTotal = (db.prepare("SELECT COUNT(*) AS n FROM comments WHERE status != 'pending'").get() as { n: number }).n;
  res.status(200).json({ comments: [...pending, ...moderated], moderatedTotal });
}
