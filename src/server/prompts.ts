// Accès aux prompts socratiques — requêtes partagées par les routes API.

import { getDb, PromptRow } from './db';

// Champs publics d'une carte du catalogue (jamais le share_token).
export type PromptCard = {
  name: string; authorName: string; language: string; description: string;
  version: number; createdAt: number; updatedAt: number;
  usageCount: number; tokensTotal: number;
  ratingAvg: number | null; ratingCount: number;
  sizeBytes: number; webSearch: boolean;
};

export function toCard(row: PromptRow): PromptCard {
  return {
    name: row.name,
    authorName: row.author_email ? row.author_name : (row.author_name || 'Anonyme'),
    language: row.language,
    description: row.description,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    usageCount: row.usage_count,
    tokensTotal: row.tokens_total,
    ratingAvg: row.rating_count > 0 ? Math.round((row.rating_sum / row.rating_count) * 10) / 10 : null,
    ratingCount: row.rating_count,
    sizeBytes: row.size_bytes,
    webSearch: !!row.web_search,
  };
}

// Tris disponibles — le tri s'exécute EN BASE (exigence n°4 du cahier des
// charges : la liste est triable selon les données mémorisées en base).
// « score » mélange usage, note et fraîcheur pour éviter l'effet boule de
// neige des premiers prompts publiés.
const ORDER_BY: Record<string, string> = {
  score: `(usage_count
           + 5.0 * COALESCE(CAST(rating_sum AS REAL) / NULLIF(rating_count, 0), 0)
           + 50.0 / (1.0 + (@now - created_at) / 86400000.0)) DESC`,
  uses: 'usage_count DESC, updated_at DESC',
  rating: 'COALESCE(CAST(rating_sum AS REAL) / NULLIF(rating_count, 0), -1) DESC, rating_count DESC',
  recent: 'created_at DESC',
  updated: 'updated_at DESC',
  tokens: 'tokens_total DESC',
  name: 'name COLLATE NOCASE ASC',
};

// Un prompt ARCHIVÉ (refusé/neutralisé par l'administration) est invisible et
// inutilisable PARTOUT : catalogue, fiche, chat, et même son URL secrète —
// sinon un prompt refusé resterait exploitable (voire sur la clé interne)
// tout en étant invisible de la modération. La ligne reste en base.
export function listPublished(sort: string, search: string): PromptCard[] {
  const db = getDb();
  const orderBy = ORDER_BY[sort] ?? ORDER_BY.score;
  const rows = db.prepare(`
    SELECT * FROM prompts
    WHERE status = 'published' AND archived = 0
      AND (@q = '' OR name LIKE '%' || @q || '%' OR description LIKE '%' || @q || '%')
    ORDER BY ${orderBy}
  `).all({ q: search, now: Date.now() }) as PromptRow[];
  return rows.map(toCard);
}

export function getPublishedByName(name: string): PromptRow | undefined {
  return getDb().prepare("SELECT * FROM prompts WHERE name = ? AND status = 'published' AND archived = 0")
    .get(name) as PromptRow | undefined;
}

export function getByName(name: string): PromptRow | undefined {
  return getDb().prepare('SELECT * FROM prompts WHERE name = ?').get(name) as PromptRow | undefined;
}

export function getByShareToken(token: string): PromptRow | undefined {
  if (!/^[a-f0-9]{24,64}$/.test(token)) return undefined;
  return getDb().prepare('SELECT * FROM prompts WHERE share_token = ? AND archived = 0')
    .get(token) as PromptRow | undefined;
}

// Quotas d'upload (exigences n°8) : 256 Ko par prompt, 1 Mo par utilisateur.
export const MAX_PROMPT_BYTES = 256 * 1024;
export const MAX_USER_BYTES = 1024 * 1024;

export function isValidPromptName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  // Identifiant = nom propre : lettres (accents compris), chiffres, espaces,
  // tirets et apostrophes. « essai » est réservé aux URL secrètes de test.
  if (trimmed.length < 2 || trimmed.length > 64) return false;
  if (trimmed.toLowerCase() === 'essai') return false;
  return /^[\p{L}\p{N}][\p{L}\p{N} '’-]*$/u.test(trimmed);
}
