import { NextApiRequest, NextApiResponse } from 'next';
import { getDb, PromptRow } from '../../../../server/db';
import { getPublishedByName, getByName, toCard, MAX_PROMPT_BYTES, MAX_USER_BYTES } from '../../../../server/prompts';
import { requireAuth, isAdminEmail, TokenPayload } from '../../../../server/token';
import { getClientIp, isRateLimited } from '../../../../server/access';
import { ERR } from '../../../../shared/providers';

export const config = { api: { bodyParser: { sizeLimit: '512kb' } } };

// Cycle de vie d'un prompt (pivot v3 + décisions v2) :
//   draft ── submit ──▶ pending ── approve ──▶ published ── retire ──▶ retired
// L'auteur d'un brouillon est identifié par son jeton, OU par l'URL secrète
// (share_token) pour les propositions anonymes.

type Rights = {
  isAuthor: boolean;      // jeton de l'auteur, ou share_token du brouillon
  isAdmin: boolean;
  isPromptagogue: boolean; // compte vérifié : peut approuver (décision client)
  auth: TokenPayload | null;
};

function resolveRights(req: NextApiRequest, row: PromptRow): Rights {
  const auth = requireAuth(req);
  const shareToken = String(req.body?.shareToken ?? '');
  const byToken = !!auth && !!row.author_email && auth.email === row.author_email;
  const byShare = !!row.share_token && shareToken === row.share_token;
  const isAdmin = !!auth && isAdminEmail(auth.email);
  let isPromptagogue = false;
  if (auth) {
    const user = getDb().prepare('SELECT is_promptagogue FROM users WHERE email = ?').get(auth.email) as
      { is_promptagogue: number } | undefined;
    isPromptagogue = !!user?.is_promptagogue;
  }
  return { isAuthor: byToken || byShare, isAdmin, isPromptagogue, auth };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const name = String(req.query.name ?? '');

  // ---- GET : fiche publique (prompts publiés uniquement) --------------------
  if (req.method === 'GET') {
    const row = getPublishedByName(name);
    if (!row) return res.status(404).json({ error: { code: 'ERR_PROMPT_UNKNOWN' } });
    const versions = getDb()
      .prepare('SELECT version, created_at AS createdAt, length(body) AS sizeBytes FROM prompt_versions WHERE prompt_id = ? ORDER BY version DESC')
      .all(row.id);
    return res.status(200).json({ prompt: { ...toCard(row), body: row.body }, versions });
  }

  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  const ip = getClientIp(req);
  if (await isRateLimited(ip, 20, 'prompt-write')) return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });

  const db = getDb();
  const row = getByName(name);
  if (!row) return res.status(404).json({ error: { code: 'ERR_PROMPT_UNKNOWN' } });
  const rights = resolveRights(req, row);
  const now = Date.now();

  // ---- DELETE : l'auteur identifié peut supprimer SES prompts ; un prompt
  // anonyme ne peut être supprimé que par un admin (décision client n°11). ----
  if (req.method === 'DELETE') {
    const authorCanDelete = !!row.author_email && rights.auth?.email === row.author_email;
    if (!(rights.isAdmin || authorCanDelete)) {
      return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
    }
    db.transaction(() => {
      db.prepare('DELETE FROM prompt_versions WHERE prompt_id = ?').run(row.id);
      db.prepare('DELETE FROM prompt_translations WHERE prompt_id = ?').run(row.id);
      db.prepare('DELETE FROM prompts WHERE id = ?').run(row.id);
    })();
    return res.status(200).json({ ok: true });
  }

  // ---- PATCH : édition et transitions --------------------------------------
  const action = String(req.body?.action ?? 'edit');

  if (action === 'edit') {
    if (!rights.isAuthor && !rights.isAdmin) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
    const body = req.body?.body !== undefined ? String(req.body.body) : row.body;
    const description = req.body?.description !== undefined
      ? String(req.body.description).trim().slice(0, 500) : row.description;
    const webSearch = req.body?.webSearch !== undefined ? (req.body.webSearch ? 1 : 0) : row.web_search;
    const sizeBytes = Buffer.byteLength(body, 'utf8');
    if (sizeBytes < 40) return res.status(400).json({ error: { code: 'ERR_BODY_TOO_SHORT' } });
    if (sizeBytes > MAX_PROMPT_BYTES) return res.status(413).json({ error: { code: 'ERR_BODY_TOO_LARGE' } });

    if (row.author_email) {
      const used = (db.prepare('SELECT COALESCE(SUM(size_bytes), 0) AS total FROM prompts WHERE author_email = ? AND id != ?')
        .get(row.author_email, row.id) as { total: number }).total;
      if (used + sizeBytes > MAX_USER_BYTES) return res.status(413).json({ error: { code: 'ERR_QUOTA_USER' } });
    }

    const bodyChanged = body !== row.body;
    // Un brouillon s'affine sur place ; une édition d'un prompt PUBLIÉ crée une
    // nouvelle version consultable (les conversations en cours restent sur la
    // leur — bascule explicite, décision client n°9).
    const bumpVersion = bodyChanged && row.status === 'published';
    const version = bumpVersion ? row.version + 1 : row.version;
    db.transaction(() => {
      db.prepare('UPDATE prompts SET body = ?, description = ?, web_search = ?, version = ?, updated_at = ?, size_bytes = ? WHERE id = ?')
        .run(body, description, webSearch, version, now, sizeBytes, row.id);
      if (bumpVersion) {
        db.prepare('INSERT INTO prompt_versions (prompt_id, version, body, created_at) VALUES (?, ?, ?, ?)')
          .run(row.id, version, body, now);
      } else if (bodyChanged) {
        db.prepare('UPDATE prompt_versions SET body = ?, created_at = ? WHERE prompt_id = ? AND version = ?')
          .run(body, now, row.id, row.version);
      }
    })();
    return res.status(200).json({ ok: true, version });
  }

  if (action === 'submit') {
    if (!rights.isAuthor) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
    if (row.status !== 'draft') return res.status(409).json({ error: { code: 'ERR_STATUS' } });
    db.prepare("UPDATE prompts SET status = 'pending', updated_at = ? WHERE id = ?").run(now, row.id);
    return res.status(200).json({ ok: true, status: 'pending' });
  }

  if (action === 'approve') {
    // Modération a priori : approbation par un admin OU par un promptagogue
    // vérifié (décision client — la validation protège surtout le flux anonyme).
    if (!(rights.isAdmin || rights.isPromptagogue)) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
    if (row.status !== 'pending') return res.status(409).json({ error: { code: 'ERR_STATUS' } });
    db.prepare("UPDATE prompts SET status = 'published', updated_at = ? WHERE id = ?").run(now, row.id);
    return res.status(200).json({ ok: true, status: 'published' });
  }

  if (action === 'retire') {
    const authorCanRetire = !!row.author_email && rights.auth?.email === row.author_email;
    if (!(rights.isAdmin || authorCanRetire)) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
    if (row.status !== 'published') return res.status(409).json({ error: { code: 'ERR_STATUS' } });
    db.prepare("UPDATE prompts SET status = 'retired', updated_at = ? WHERE id = ?").run(now, row.id);
    return res.status(200).json({ ok: true, status: 'retired' });
  }

  return res.status(400).json({ error: { code: 'ERR_ACTION_UNKNOWN' } });
}
