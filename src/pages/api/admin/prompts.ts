import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../../server/db';
import { requireAdmin } from '../../../server/admin';
import { ERR } from '../../../shared/providers';

// Vue d'administration des prompts, TOUS statuts confondus (la modération
// elle-même passe par PATCH/DELETE /api/prompts/[name], qui portent les
// règles de droits). Inclut le corps pour examen avant approbation.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req)) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }
  // Les prompts ARCHIVÉS sont définitivement masqués de cette vue (nettoyage
  // d'interface) — ils restent en base avec leurs compteurs, rien n'est supprimé.
  const prompts = getDb().prepare(`
    SELECT name, author_email AS authorEmail, author_name AS authorName, language,
           description, body, version, status, web_search AS webSearch,
           created_at AS createdAt, updated_at AS updatedAt,
           usage_count AS usageCount, tokens_total AS tokensTotal, size_bytes AS sizeBytes
    FROM prompts
    WHERE archived = 0
    ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'draft' THEN 1 WHEN 'published' THEN 2 ELSE 3 END,
             updated_at DESC
  `).all();
  res.status(200).json({ prompts });
}
