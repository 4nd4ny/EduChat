import { NextApiRequest, NextApiResponse } from 'next';
import { getClientIp, isKnownIp } from '../../server/access';

// La liste d'IP autorisées provient d'un point unique (src/utils/env.ts, via
// server/access.ts) : plus de relecture directe de process.env sans validation.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const ip = getClientIp(req);
  res.status(200).json({ ip, isIpAllowed: isKnownIp(ip) });
}
