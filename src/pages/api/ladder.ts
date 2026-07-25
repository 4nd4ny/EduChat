import type { NextApiRequest, NextApiResponse } from 'next';
import { getLadders } from '../../server/ladder';
import { ERR } from '../../shared/providers';

// L'échelle en vigueur, par fournisseur. Public : ce ne sont que des noms de
// modèles, déjà visibles dans le catalogue. Le client s'en sert pour savoir
// s'il reste un cran au-dessus — sans quoi « Régénérer » promettrait une
// montée en gamme qui n'aurait pas lieu.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }
  const ladders: Record<string, string[]> = {};
  for (const row of getLadders()) ladders[row.provider] = row.rungs;
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json({ ladders });
}
