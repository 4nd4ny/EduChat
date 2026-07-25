// L'échelle de modèles effectivement appliquée : proposition du code, écrasée
// barreau par barreau par les choix de l'administration.
//
// Deux règles de prudence héritées des vagues précédentes :
//  - un barreau vide ARRÊTE l'échelle (on ne complète pas avec une devinette) ;
//  - le modèle par défaut du fournisseur reste le filet : une échelle vide
//    n'empêche jamais de converser.

import { getDb } from './db';
import { SUGGESTED_LADDER } from '../shared/ladder';
import { PROVIDER_IDS, providerDefaults, type ProviderId } from '../shared/providers';

export type LadderRow = {
  provider: ProviderId;
  /** Barreaux effectivement utilisés (1 à 3). */
  rungs: string[];
  /** Ce que le code propose, pour que l'administration puisse comparer. */
  suggested: string[];
  /** Vrai si l'administration a posé ses propres valeurs. */
  custom: boolean;
  updatedAt: number;
};

function lireOverrides(): Map<string, { rungs: string[]; at: number }> {
  const rows = getDb().prepare(
    'SELECT provider, rung1, rung2, rung3, updated_at AS at FROM provider_ladder')
    .all() as { provider: string; rung1: string; rung2: string; rung3: string; at: number }[];
  const map = new Map<string, { rungs: string[]; at: number }>();
  for (const r of rows) {
    const rungs: string[] = [];
    for (const v of [r.rung1, r.rung2, r.rung3]) {
      const propre = String(v || '').trim();
      if (!propre) break;          // un trou arrête l'échelle
      rungs.push(propre);
    }
    if (rungs.length) map.set(r.provider, { rungs, at: r.at });
  }
  return map;
}

export function getLadders(): LadderRow[] {
  const overrides = lireOverrides();
  return PROVIDER_IDS.map(provider => {
    const suggested = SUGGESTED_LADDER[provider] ?? [providerDefaults[provider].model];
    const custom = overrides.get(provider);
    return {
      provider,
      rungs: custom?.rungs ?? suggested,
      suggested,
      custom: !!custom,
      updatedAt: custom?.at ?? 0,
    };
  });
}

export function getLadder(provider: ProviderId): string[] {
  const custom = lireOverrides().get(provider);
  return custom?.rungs ?? SUGGESTED_LADDER[provider] ?? [providerDefaults[provider].model];
}

/** Enregistre l'échelle d'un fournisseur. Trois barreaux vides = retour à la proposition. */
export function setLadder(provider: ProviderId, rungs: string[]) {
  const propres = rungs.slice(0, 3).map(r => String(r ?? '').trim().slice(0, 128));
  while (propres.length < 3) propres.push('');
  if (!propres[0]) {
    getDb().prepare('DELETE FROM provider_ladder WHERE provider = ?').run(provider);
    return;
  }
  getDb().prepare(`
    INSERT INTO provider_ladder (provider, rung1, rung2, rung3, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(provider) DO UPDATE SET rung1 = excluded.rung1, rung2 = excluded.rung2,
      rung3 = excluded.rung3, updated_at = excluded.updated_at
  `).run(provider, propres[0], propres[1], propres[2], Date.now());
}
