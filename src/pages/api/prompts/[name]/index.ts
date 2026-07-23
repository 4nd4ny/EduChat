import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../../../server/db';
import { getPublishedByName, toCard } from '../../../../server/prompts';
import { ERR } from '../../../../shared/providers';

// Fiche publique d'un prompt socratique : métadonnées, texte INTÉGRAL
// (décision client : les prompts sont publics, l'école est gratuite) et
// historique des versions.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  const name = String(req.query.name ?? '');
  const row = getPublishedByName(name);
  if (!row) return res.status(404).json({ error: { code: 'ERR_PROMPT_UNKNOWN' } });

  const versions = getDb()
    .prepare('SELECT version, created_at AS createdAt, length(body) AS sizeBytes FROM prompt_versions WHERE prompt_id = ? ORDER BY version DESC')
    .all(row.id);

  res.status(200).json({ prompt: { ...toCard(row), body: row.body }, versions });
}
