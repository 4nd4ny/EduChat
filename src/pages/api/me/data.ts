import type { NextApiRequest, NextApiResponse } from 'next';
import { collectAccountData, isVerifiedAccount } from '../../../server/accountData';
import { getClientIp, isRateLimited } from '../../../server/access';
import { requireAuth } from '../../../server/token';
import { ERR } from '../../../shared/providers';

// Amorçage de la page « Mes données » : TOUT ce que le serveur conserve sur
// ce compte, en un seul appel.
//
// Un seul appel, et non quatre, pour une raison très concrète : les seaux de
// limitation sont comptés PAR IP, et une classe entière partage l'IP de son
// établissement — quatre requêtes au chargement suffiraient à faire tomber
// la page en 429 chez le troisième enseignant de la salle des maîtres.
//
// Contrairement à /api/me (qui tolère un jeton dont le compte a disparu, et
// dont d'autres pages dépendent), cette route EXIGE un compte vérifié en
// base : elle sert des données personnelles, pas une simple identité.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  const auth = requireAuth(req);
  if (!auth) return res.status(401).json({ error: { code: 'ERR_AUTH_REQUIRED' } });
  if (!isVerifiedAccount(auth.email)) return res.status(401).json({ error: { code: 'ERR_AUTH_REQUIRED' } });

  if (await isRateLimited(getClientIp(req), 20, 'medata')) {
    return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
  }

  // Données personnelles : jamais de cache partagé, jamais d'historique.
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json(collectAccountData(auth.email));
}
