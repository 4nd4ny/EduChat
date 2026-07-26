// SÉANCE DE CLASSE — lecture partagée de la table session_settings.
//
// Une séance est posée par un enseignant depuis /session (tuteur déployé,
// recherche web, fournisseurs autorisés) et expire avec le verrou de la salle.
// Ce module ne porte QUE la lecture : l'écriture reste dans
// /api/session-settings, seul endroit où l'on vérifie qui a le droit d'écrire.
//
// Il existe parce que trois routes lisaient la même ligne : la complétion (qui
// applique la règle), /api/providers (qui l'affiche) et /api/session-status
// (qui la relit pour l'enseignant). Une règle recopiée trois fois est une règle
// qui finira par diverger.

import { getDb } from './db';
import { isProviderId, SCHOOL_PROVIDER_IDS, type ProviderId } from '../shared/providers';

/**
 * Valeur écrite dans la colonne `providers` quand l'enseignant a TOUT décoché.
 *
 * POURQUOI UN JETON PLUTÔT QUE LA CHAÎNE VIDE : la colonne vide veut dire
 * « aucune restriction ». Enregistrer une sélection vide telle quelle
 * retournerait le geste le plus fermé de l'enseignant en le plus ouvert de
 * tous — décocher tout aurait rouvert tout. Ce jeton n'est l'identifiant
 * d'aucun fournisseur : il se décode donc en liste vide, mais la colonne, elle,
 * n'est PAS vide, et `seanceRestreinte` le voit.
 */
export const SEANCE_SANS_FOURNISSEUR = 'aucun';

/**
 * Décode la colonne `providers` (identifiants séparés par des virgules).
 *
 * On refiltre TOUJOURS par SCHOOL_PROVIDER_IDS à la lecture : une liste écrite
 * hier ne doit pas rouvrir aujourd'hui un fournisseur que les règles de la
 * plateforme ont depuis écarté. Le résultat peut donc être VIDE alors que la
 * colonne ne l'est pas : c'est `seanceRestreinte` qui distingue les deux, et
 * elle seule — une liste vide ne dit pas « tous ».
 */
export function parseFournisseursSeance(csv: string | null | undefined): ProviderId[] {
  const vus = new Set<ProviderId>();
  for (const brut of String(csv ?? '').split(',')) {
    const id = brut.trim();
    if (isProviderId(id) && SCHOOL_PROVIDER_IDS.includes(id)) vus.add(id);
  }
  return Array.from(vus);
}

/**
 * L'enseignant a-t-il RESTREINT les fournisseurs de sa séance ? On le lit sur
 * la colonne BRUTE, avant tout filtrage : une restriction dont plus aucun
 * identifiant ne survit (jeton « aucun », ou fournisseur depuis écarté par la
 * plateforme) reste une restriction, et se referme sur tout. L'inverse —
 * retomber sur « aucune restriction » — desserrerait une règle que personne
 * n'a desserrée.
 */
export function seanceRestreinte(csv: string | null | undefined): boolean {
  return String(csv ?? '').trim() !== '';
}

export type SeanceActive = {
  /** Recherche web autorisée par l'enseignant (elle ne peut que la couper). */
  webSearch: boolean;
  /** Enseignant à qui la consommation de la séance est attribuée. */
  setByEmail: string | null;
  expiresAt: number;
  /** Fournisseurs cochés, quand `restreint`. Sinon vide et sans portée. */
  fournisseurs: ProviderId[];
  /** Une liste a été posée. Sa longueur peut valoir zéro : plus rien ne passe. */
  restreint: boolean;
};

/** La séance EN COURS de cet établissement, ou null (expirée, absente, hors école). */
export function seanceActive(etablissementId: number | null): SeanceActive | null {
  if (!etablissementId) return null;
  const row = getDb().prepare(`
    SELECT web_search, set_by_email, providers, expires_at
    FROM session_settings WHERE etablissement_id = ? AND expires_at > ?
  `).get(etablissementId, Date.now()) as
    { web_search: number; set_by_email: string | null; providers: string; expires_at: number } | undefined;
  if (!row) return null;
  return {
    webSearch: !!row.web_search,
    setByEmail: row.set_by_email,
    expiresAt: row.expires_at,
    fournisseurs: parseFournisseursSeance(row.providers),
    restreint: seanceRestreinte(row.providers),
  };
}

/**
 * La séance laisse-t-elle passer ce fournisseur ? Pas de séance, ou séance sans
 * liste : oui — l'absence de choix n'est pas une interdiction. Mais dès qu'une
 * liste EXISTE, seul ce qu'elle nomme passe : une liste devenue vide ferme
 * tout, elle n'ouvre rien.
 */
export function seanceAutoriseFournisseur(seance: SeanceActive | null, provider: ProviderId): boolean {
  if (!seance || !seance.restreint) return true;
  return seance.fournisseurs.includes(provider);
}
