// CE QUE LA CLÉ DE L'ÉCOLE PEUT RÉELLEMENT SERVIR.
//
// Deux conditions, et il faut les DEUX :
//   1. la règle — SCHOOL_PROVIDER_IDS (src/shared/providers.ts) : ni
//      fournisseur écarté au titre de l'AI Act, ni drapeau rouge, parce que la
//      route de complétion refuse déjà de les payer sur la clé interne ;
//   2. le fait — une clé serveur réellement présente (DeveloperKeys), sans
//      quoi le fournisseur autorisé reste injoignable.
//
// POURQUOI CÔTÉ SERVEUR ET NULLE PART AILLEURS. Le croisement lit des
// variables SECRET_* : il ne peut pas vivre dans src/shared/providers.ts, qui
// est importé par le navigateur. Ce module n'est donc jamais importé par une
// page — seulement par les routes d'API, qui en publient le RÉSULTAT (une
// liste d'identifiants, que la liste des modèles trahit déjà).
//
// À QUOI ÇA SERT. À ne montrer, dans ce qu'une école lit sur son argent, que
// les fournisseurs qu'elle peut employer. Une ligne « DeepSeek : 0 jeton »
// dans le relevé d'un collège est du bruit, et le bruit fait douter du reste :
// un lecteur qui voit une ligne qu'il ne comprend pas cesse de croire les
// lignes qu'il comprenait.

import { DeveloperKeys } from '../utils/env';
import { SCHOOL_PROVIDER_IDS, ProviderId } from '../shared/providers';

/** Les fournisseurs que la clé interne peut servir à une école, ici et maintenant. */
export function fournisseursServis(): ProviderId[] {
  return SCHOOL_PROVIDER_IDS.filter(id => !!String(DeveloperKeys[id] || '').trim());
}

/**
 * Ce fournisseur est-il servable par la clé de l'école ?
 *
 * Répond sur une chaîne quelconque (et non sur un ProviderId) parce que la
 * question se pose sur des lignes de JOURNAL : usage_log garde le nom du
 * fournisseur tel qu'il était le jour de l'appel, y compris un fournisseur
 * depuis retiré du catalogue. On ne peut donc pas supposer qu'il soit encore
 * connu de providerDefaults.
 */
export function estServiParLEcole(provider: string): boolean {
  return (fournisseursServis() as string[]).includes(provider);
}
