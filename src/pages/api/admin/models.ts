import type { NextApiRequest, NextApiResponse } from 'next';
import { catalogueStatus, refreshAllModels } from '../../../server/models';
import { requireAdmin } from '../../../server/admin';
import { ERR } from '../../../shared/providers';

// Catalogue des modèles, côté administration.
//
//  GET  → état du cache : pour chaque fournisseur, d'où vient sa liste
//         (native = l'éditeur lui-même, openrouter = déduite, defaut = le
//         seul modèle par défaut), combien de modèles, et de quand elle date.
//  POST → reconstruction immédiate, sans attendre l'échéance du jour.
//
// L'intérêt du bouton : après avoir posé une clé qui manquait dans
// educhat.env, la liste d'un fournisseur passe de « son modèle par défaut »
// à son vrai catalogue — sans attendre 24 heures.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req)) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });

  if (req.method === 'GET') {
    return res.status(200).json({ catalogue: catalogueStatus() });
  }

  if (req.method === 'POST') {
    // Onze appels réseau en parallèle : quelques secondes, le temps du plus
    // lent. Les échecs ne lèvent pas — un fournisseur muet garde sa liste.
    const catalogue = await refreshAllModels();
    return res.status(200).json({ ok: true, catalogue });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: { code: ERR.METHOD } });
}
