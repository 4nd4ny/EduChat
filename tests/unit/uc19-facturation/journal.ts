// UC-19 — Utilitaire propre à ce cas : écrire des lignes de journal d'usage
// (usage_log) telles que /api/completion les écrit, pour fabriquer la
// consommation d'un mois sans appeler de fournisseur.
import { base } from '../../helpers/db';

export type LigneUsage = {
  ts: number;
  etablissementId?: number | null;
  ip?: string;
  teacherEmail?: string | null;
  provider?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  /** Total des jetons ; par défaut entrée + sortie. */
  tokens?: number;
  serverKey?: boolean;
  prixEntree?: number;
  prixSortie?: number;
  /** Montant figé par l'appel (ce que le porte-monnaie a prélevé). */
  montant?: number;
  repli?: string;
  /** 0 = ligne antérieure au prix par modèle (aucun prix figé). */
  tarifAt?: number;
};

export async function journaliser(l: LigneUsage): Promise<number> {
  const db = await base();
  const tin = l.tokensIn ?? 0, tout = l.tokensOut ?? 0;
  const info = db.prepare(`INSERT INTO usage_log (ts, ip, etablissement_id, teacher_email, prompt_id, provider, model,
      tokens, tokens_in, tokens_out, used_server_key, client_id, prix_entree_mtok, prix_sortie_mtok, montant, tarif_repli, tarif_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)`)
    .run(l.ts, l.ip ?? '10.0.0.1', l.etablissementId ?? null, l.teacherEmail ?? null,
      l.provider ?? 'anthropic', l.model ?? 'claude-haiku', l.tokens ?? tin + tout, tin, tout,
      l.serverKey === false ? 0 : 1, l.prixEntree ?? 0, l.prixSortie ?? 0, l.montant ?? 0,
      l.repli ?? '', l.tarifAt ?? l.ts);
  return Number(info.lastInsertRowid);
}

/** Un instant au milieu de juillet 2026 (UTC) — le mois de référence des tests. */
export const JUILLET = Date.UTC(2026, 6, 15, 10);
