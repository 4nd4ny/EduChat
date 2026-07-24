import { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { getDb } from '../../../server/db';
import {
  listPublished, isValidPromptName, getByName,
  MAX_PROMPT_BYTES, MAX_USER_BYTES,
} from '../../../server/prompts';
import { requireAuth } from '../../../server/token';
import { getClientIp, isRateLimited } from '../../../server/access';
import { ERR } from '../../../shared/providers';

export const config = { api: { bodyParser: { sizeLimit: '512kb' } } };

// GET  /api/prompts — catalogue public trié en base.
// POST /api/prompts — créer un BROUILLON (« en construction ») :
//   - signé (Authorization: Bearer) : rattaché à l'auteur, soumis à son quota de 1 Mo ;
//   - anonyme : possible (décision client), la validation admin sera le seul filtre,
//     et toute la modération (validation, dépublication, archivage) lui reviendra.
//     L'URL secrète renvoyée est alors l'unique « clé » du proposant pour tester
//     et soumettre son brouillon.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const sort = String(req.query.sort ?? 'score').slice(0, 16);
    const q = String(req.query.q ?? '').slice(0, 64).trim();
    return res.status(200).json({ prompts: listPublished(sort, q) });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  const ip = getClientIp(req);
  if (await isRateLimited(ip, 10, 'publish')) {
    return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
  }

  const auth = requireAuth(req);
  const name = String(req.body?.name ?? '').trim();
  const description = String(req.body?.description ?? '').trim().slice(0, 500);
  const language = ['fr', 'en', 'it', 'de'].includes(req.body?.language) ? req.body.language : 'fr';
  const body = String(req.body?.body ?? '');
  const webSearch = req.body?.webSearch ? 1 : 0;
  const sizeBytes = Buffer.byteLength(body, 'utf8');
  // Affiliation (étape « variantes ») : nom du tuteur source → id stocké en
  // métadonnée. Silencieusement ignoré si le nom ne correspond à rien.
  const inspiredByName = String(req.body?.inspiredBy ?? '').trim().slice(0, 64);
  const inspiredById = inspiredByName ? (getByName(inspiredByName)?.id ?? null) : null;

  if (!isValidPromptName(name)) return res.status(400).json({ error: { code: 'ERR_NAME_INVALID' } });
  if (getByName(name)) return res.status(409).json({ error: { code: 'ERR_NAME_TAKEN' } });
  if (sizeBytes < 40) return res.status(400).json({ error: { code: 'ERR_BODY_TOO_SHORT' } });
  if (sizeBytes > MAX_PROMPT_BYTES) return res.status(413).json({ error: { code: 'ERR_BODY_TOO_LARGE' } });

  const db = getDb();

  // Quota par utilisateur (1 Mo) — pour les auteurs identifiés uniquement :
  // l'anonyme n'a pas de compte, la modération a priori est son garde-fou.
  // La suppression n'existant plus, les prompts ARCHIVÉS par l'administration
  // sortent du décompte : le quota reste libérable (jamais un cliquet).
  if (auth) {
    const used = (db.prepare('SELECT COALESCE(SUM(size_bytes), 0) AS total FROM prompts WHERE author_email = ? AND archived = 0')
      .get(auth.email) as { total: number }).total;
    if (used + sizeBytes > MAX_USER_BYTES) {
      return res.status(413).json({ error: { code: 'ERR_QUOTA_USER' } });
    }
  }

  const now = Date.now();
  const shareToken = crypto.randomBytes(16).toString('hex');
  const info = db.prepare(`
    INSERT INTO prompts (name, author_email, author_name, language, description, body, version,
                         status, share_token, web_search, created_at, updated_at, size_bytes, inspired_by)
    VALUES (@name, @email, @authorName, @language, @description, @body, 1,
            'draft', @shareToken, @webSearch, @now, @now, @sizeBytes, @inspiredById)
  `).run({
    name, email: auth?.email ?? null, authorName: auth?.name ?? '',
    language, description, body, shareToken, webSearch, now, sizeBytes, inspiredById,
  });
  db.prepare('INSERT INTO prompt_versions (prompt_id, version, body, created_at) VALUES (?, 1, ?, ?)')
    .run(info.lastInsertRowid, body, now);

  res.status(201).json({ name, shareToken, status: 'draft' });
}
