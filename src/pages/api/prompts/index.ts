import { NextApiRequest, NextApiResponse } from 'next';
import { listPublished } from '../../../server/prompts';
import { ERR } from '../../../shared/providers';

// Catalogue public des prompts socratiques publiés.
// GET /api/prompts?sort=score|uses|rating|recent|updated|tokens|name&q=recherche
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }
  const sort = String(req.query.sort ?? 'score').slice(0, 16);
  const q = String(req.query.q ?? '').slice(0, 64).trim();
  res.status(200).json({ prompts: listPublished(sort, q) });
}
