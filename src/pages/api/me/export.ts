import type { NextApiRequest, NextApiResponse } from 'next';
import { collectAccountExport, isVerifiedAccount } from '../../../server/accountData';
import { getClientIp, isRateLimited } from '../../../server/access';
import { requireAuth } from '../../../server/token';
import { ERR } from '../../../shared/providers';

// Portabilité (RGPD art. 20) : l'intégralité des données du compte, en un
// fichier JSON lisible. Route séparée de l'amorçage : elle lit le corps de
// tous les tuteurs et de toutes leurs versions, on ne la fait pas peser sur
// l'ouverture de la page.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  const auth = requireAuth(req);
  if (!auth) return res.status(401).json({ error: { code: 'ERR_AUTH_REQUIRED' } });
  if (!isVerifiedAccount(auth.email)) return res.status(401).json({ error: { code: 'ERR_AUTH_REQUIRED' } });

  // Plus parcimonieux que la page : un export est lourd, et rien ne justifie
  // d'en demander dix par minute.
  if (await isRateLimited(getClientIp(req), 5, 'meexport')) {
    return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
  }

  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="educhat-mes-donnees.json"');
  return res.status(200).send(JSON.stringify(collectAccountExport(auth.email), null, 2));
}
