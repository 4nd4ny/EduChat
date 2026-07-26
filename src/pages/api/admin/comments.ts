import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../../server/db';
import { requireAdmin } from '../../../server/admin';
import { ERR } from '../../../shared/providers';

// Tous les commentaires, vus par l'ADMINISTRATION — la modération elle-même
// passe par PATCH /api/prompts/[name]/comments (droits auteur/admin).
// L'admin voit tout : en attente d'abord, puis le reste, du plus récent au
// plus ancien. Rien n'est jamais supprimé (« hidden » = masqué).
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const scope = requireAdmin(req);
  if (!scope) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }
  const db = getDb();
  // PORTÉE, comme pour les tuteurs eux-mêmes : chaque ligne porte le NOM du
  // tuteur commenté. Servir la file entière à un administrateur d'école lui
  // dirait les tuteurs des autres, que la propriété d'une école sur les siens
  // lui refuse par ailleurs. Il modère les siens et ceux de la plateforme.
  const filtre = scope.niveau === 'ecole'
    ? 'AND (p.etablissement_id = @etab OR p.etablissement_id IS NULL)' : '';
  const args = scope.niveau === 'ecole' ? [{ etab: scope.etablissementId }] : [];
  const select = `
    SELECT c.id, c.body, c.status, c.created_at AS createdAt,
           c.moderated_at AS moderatedAt, c.moderated_by AS moderatedBy,
           p.name AS promptName, p.author_email AS promptAuthorEmail
    FROM comments c JOIN prompts p ON p.id = c.prompt_id`;
  // Les EN ATTENTE, intégralement (c'est la file de travail) ; l'historique
  // modéré, borné aux 500 plus récents AVEC le total — la troncature est
  // annoncée, jamais silencieuse (rien n'est supprimé, la table ne fait que
  // croître).
  const pending = db.prepare(`${select} WHERE c.status = 'pending' ${filtre} ORDER BY c.created_at DESC`).all(...args);
  const moderated = db.prepare(`${select} WHERE c.status != 'pending' ${filtre} ORDER BY c.created_at DESC LIMIT 500`).all(...args);
  const moderatedTotal = (db.prepare(
    `SELECT COUNT(*) AS n FROM comments c JOIN prompts p ON p.id = c.prompt_id
     WHERE c.status != 'pending' ${filtre}`).get(...args) as { n: number }).n;
  res.status(200).json({ comments: [...pending, ...moderated], moderatedTotal });
}
