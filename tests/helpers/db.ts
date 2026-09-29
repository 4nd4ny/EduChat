// Fabrique de données de test, écrite directement en base — comme le ferait
// l'historique d'un vrai déploiement. Chaque fonction charge ses modules
// DYNAMIQUEMENT : un test qui a modifié l'environnement puis appelé
// vi.resetModules() obtient ainsi la base et la configuration courantes.

/** Vide toutes les tables (le catalogue d'amorçage compris, sauf demande contraire). */
export async function viderBase(opts: { garderAmorcage?: boolean } = {}) {
  const { getDb } = await import('../../src/server/db');
  const db = getDb();
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[])
    .map(t => t.name);
  db.transaction(() => {
    for (const t of tables) {
      if (opts.garderAmorcage && (t === 'prompts' || t === 'prompt_versions')) continue;
      db.prepare(`DELETE FROM ${t}`).run();
    }
  })();
  return db;
}

export async function base() {
  const { getDb } = await import('../../src/server/db');
  return getDb();
}

export type OptionsCompte = {
  name?: string;
  promptagogue?: boolean;
  teacher?: boolean;
  etablissementId?: number | null;
  schoolAdmin?: boolean;
  syncOptin?: boolean;
  solde?: number;
};

/** Crée un compte vérifié et renvoie son jeton. */
export async function creerCompte(email: string, o: OptionsCompte = {}): Promise<string> {
  const db = await base();
  const { issueToken } = await import('../../src/server/token');
  const now = Date.now();
  db.prepare(`INSERT OR REPLACE INTO users (email, name, verified_at, is_promptagogue, is_teacher, etablissement_id,
              sync_optin, created_at, is_school_admin, solde)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(email, o.name ?? email.split('@')[0], now, o.promptagogue === false ? 0 : 1, o.teacher ? 1 : 0,
      o.etablissementId ?? null, o.syncOptin ? 1 : 0, now, o.schoolAdmin ? 1 : 0, o.solde ?? 0);
  if (o.etablissementId) {
    db.prepare(`INSERT OR REPLACE INTO user_etablissements (email, etablissement_id, is_admin, created_at)
                VALUES (?, ?, ?, ?)`).run(email, o.etablissementId, o.schoolAdmin ? 1 : 0, now);
  }
  return issueToken(o.name ?? email.split('@')[0], email);
}

export type OptionsEtab = {
  name?: string;
  ips?: string;
  respire?: boolean;
  hours?: string;
  activeProvider?: string;
  quotaMensuel?: number;
  quotaEleve?: number;
  solde?: number;
  catalogueOuvert?: boolean;
  atelier?: boolean;
  contributionPct?: number;
  billingEmail?: string;
};

/** Crée un établissement et renvoie son id. */
export async function creerEtablissement(o: OptionsEtab = {}): Promise<number> {
  const db = await base();
  const info = db.prepare(`INSERT INTO etablissements (name, ips, respire, token_quota_monthly, quota_per_student_daily,
      hours, active_provider, billing_email, created_at, solde, catalogue_ouvert, atelier_promptagogue, contribution_pct)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(o.name ?? 'Collège de test', o.ips ?? '', o.respire ? 1 : 0, o.quotaMensuel ?? 0, o.quotaEleve ?? 0,
      o.hours ?? '', o.activeProvider ?? '', o.billingEmail ?? '', Date.now(), o.solde ?? 0,
      o.catalogueOuvert ? 1 : 0, o.atelier ? 1 : 0, o.contributionPct ?? -1);
  return Number(info.lastInsertRowid);
}

export type OptionsTuteur = {
  name: string;
  body?: string;
  description?: string;
  language?: string;
  status?: 'draft' | 'pending' | 'published' | 'retired';
  authorEmail?: string | null;
  shareToken?: string | null;
  etablissementId?: number | null;
  publie?: boolean;
  usage?: number;
  ratingSum?: number;
  ratingCount?: number;
  createdAt?: number;
  archived?: boolean;
  webSearch?: boolean;
};

/** Crée un tuteur (et sa version 1) ; renvoie son id. */
export async function creerTuteur(o: OptionsTuteur): Promise<number> {
  const db = await base();
  const now = o.createdAt ?? Date.now();
  const body = o.body ?? `Tu es ${o.name}, un tuteur socratique. Ne donne jamais la réponse.`;
  const info = db.prepare(`INSERT INTO prompts (name, author_email, author_name, language, description, body, version, status,
      share_token, web_search, created_at, updated_at, usage_count, rating_sum, rating_count, size_bytes,
      etablissement_id, publie, archived)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(o.name, o.authorEmail ?? null, o.authorEmail ? o.authorEmail.split('@')[0] : 'EduChat', o.language ?? 'fr',
      o.description ?? `Description de ${o.name}`, body, o.status ?? 'published', o.shareToken ?? null,
      o.webSearch ? 1 : 0, now, now, o.usage ?? 0, o.ratingSum ?? 0, o.ratingCount ?? 0, Buffer.byteLength(body),
      o.etablissementId ?? null, o.publie ? 1 : 0, o.archived ? 1 : 0);
  const id = Number(info.lastInsertRowid);
  db.prepare('INSERT INTO prompt_versions (prompt_id, version, body, created_at) VALUES (?, 1, ?, ?)').run(id, body, now);
  return id;
}
