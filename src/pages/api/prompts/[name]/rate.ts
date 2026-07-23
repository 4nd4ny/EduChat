import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../../../server/db';
import { getPublishedByName } from '../../../../server/prompts';
import { getClientIp, isRateLimited } from '../../../../server/access';
import { ERR } from '../../../../shared/providers';

// Note humaine 1-5 étoiles, ouverte à tout le monde (pivot v3).
// Anti-revote : dédoublonnage localStorage côté client, assumé comme suffisant
// pour une communauté scolaire — derrière le NAT d'un établissement, toute
// l'école partage une IP, un dédoublonnage serveur par IP écraserait les votes
// légitimes des élèves. Le rate-limiting par IP borne seulement les abus massifs.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  const ip = getClientIp(req);
  if (await isRateLimited(ip, 10, 'rate')) {
    return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
  }

  const stars = Number(req.body?.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return res.status(400).json({ error: { code: 'ERR_RATING_INVALID' } });
  }

  const row = getPublishedByName(String(req.query.name ?? ''));
  if (!row) return res.status(404).json({ error: { code: 'ERR_PROMPT_UNKNOWN' } });

  getDb().prepare('UPDATE prompts SET rating_sum = rating_sum + ?, rating_count = rating_count + 1 WHERE id = ?')
    .run(stars, row.id);

  const updated = getPublishedByName(row.name)!;
  res.status(200).json({
    ratingAvg: Math.round((updated.rating_sum / updated.rating_count) * 10) / 10,
    ratingCount: updated.rating_count,
  });
}
