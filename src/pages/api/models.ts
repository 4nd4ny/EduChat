import type { NextApiRequest, NextApiResponse } from 'next';
import { getModels } from '../../server/models';
import { ERR, isProviderId } from '../../shared/providers';

// Modèles proposés pour un fournisseur (catalogue rafraîchi une fois par
// jour côté serveur). Public : aucune donnée personnelle, aucune clé — juste
// des noms de modèles, que le client affiche en suggestions.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }
  const provider = req.query.provider;
  if (!isProviderId(provider)) return res.status(400).json({ error: { code: ERR.PROVIDER } });

  try {
    const { models, updatedAt } = await getModels(provider);
    // Le catalogue ne bouge qu'une fois par jour : le navigateur peut le
    // garder une heure sans risque.
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json({ models, updatedAt });
  } catch (error) {
    console.error('Catalogue de modèles indisponible :', error);
    return res.status(200).json({ models: [], updatedAt: 0 });
  }
}
