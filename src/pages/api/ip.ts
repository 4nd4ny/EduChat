import { NextApiRequest, NextApiResponse } from 'next';
import { getClientIp, isKnownIp } from '../../server/access';

// L'IP renvoyée est celle du contrôle de cohérence (X-Real-IP posé par le
// proxy, jamais X-Forwarded-For fourni par le client) : ce que voit cette
// route est exactement ce que voient l'accès établissement et la facturation.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const ip = getClientIp(req);
  res.status(200).json({ ip, isIpAllowed: isKnownIp(ip) });
}
