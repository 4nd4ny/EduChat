// Qui peut atteindre les fournisseurs écartés au titre de l'AI Act.
//
// DEUX conditions, et la première prime sur tout :
//
//  1. LE LIEU. Sur le réseau d'un établissement — reconnu par son IP, ou
//     simplement déverrouillé pour une séance — ces fournisseurs sont
//     injoignables, quel que soit le compte et quelle que soit la clé. C'est
//     la seule règle qu'on puisse promettre à une école sans réserve : « sur
//     votre réseau, ces modèles n'existent pas ». Elle évite aussi d'avoir à
//     exiger deux comptes par personne.
//  2. LA PERSONNE. Ailleurs, il faut un compte dont la majorité a été
//     vérifiée — un entretien vidéo avec l'administration, ou un enseignant
//     qui répond de ses élèves majeurs. On ne conserve que la décision.

import { getDb } from './db';
import { mayUseServerKeys } from './access';
import { resolveEtablissementByIp } from './etablissements';

export type AdultVerdict = { allowed: boolean; reason: 'ok' | 'school-network' | 'not-verified' };

export function isAdultVerified(email: string | null | undefined): boolean {
  if (!email) return false;
  const row = getDb().prepare('SELECT adult_verified_at FROM users WHERE email = ?').get(email) as
    { adult_verified_at: number | null } | undefined;
  return !!row?.adult_verified_at;
}

export async function mayUseAdultProviders(ip: string, email: string | null | undefined): Promise<AdultVerdict> {
  if (resolveEtablissementByIp(ip) || await mayUseServerKeys(ip)) {
    return { allowed: false, reason: 'school-network' };
  }
  if (!isAdultVerified(email)) return { allowed: false, reason: 'not-verified' };
  return { allowed: true, reason: 'ok' };
}

/** Certification par l'administration. Nom du garant, ou vide pour retirer. */
export function setAdultVerified(email: string, garant: string) {
  const propre = garant.trim().slice(0, 120);
  if (!propre) {
    getDb().prepare('UPDATE users SET adult_verified_at = NULL, adult_verified_by = NULL WHERE email = ?').run(email);
    return;
  }
  getDb().prepare('UPDATE users SET adult_verified_at = ?, adult_verified_by = ? WHERE email = ?')
    .run(Date.now(), propre, email);
}
