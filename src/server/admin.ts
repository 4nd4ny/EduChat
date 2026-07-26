// DEUX NIVEAUX D'ADMINISTRATION.
//
//   SUPER-ADMINISTRATEUR — l'administration du SITE. Sa liste vit dans
//   SECRET_ADMIN_EMAILS, sur le serveur, et NULLE PART AILLEURS : aucune
//   interface ne permet d'en créer un. C'est volontaire — le seul pouvoir
//   qu'on ne délègue pas est celui de se donner des pouvoirs. Un super voit
//   toutes les écoles, crée les établissements, nomme les administrateurs
//   d'école, règle l'échelle des modèles et suit les factures impayées.
//
//   ADMINISTRATEUR D'ÉCOLE — un enseignant à qui l'on confie SON établissement.
//   Il valide les prompts, modère les commentaires, gère les comptes de son
//   école (enseignants, majorité certifiée, et d'autres administrateurs de la
//   même école) et lit la facture de sa clé interne. Il ne sort jamais de son
//   établissement. C'est ce qui rend une école autonome sans lui donner la
//   main sur les autres.
//
// LA PORTÉE EST UNE UNION DISCRIMINÉE, PAS UN CHAMP NULLABLE. Un
// « etablissementId: number | null » se lit trop facilement « pas de filtre »
// là où il fallait lire « toutes les écoles », et l'erreur serait silencieuse :
// une requête sans WHERE rendrait la facture de tout le monde. Ici, TypeScript
// refuse de lire l'identifiant sans avoir d'abord regardé le niveau.

import type { NextApiRequest } from 'next';
import { getDb } from './db';
import { requireAuth, isAdminEmail, TokenPayload } from './token';

export type AdminScope =
  | { niveau: 'super'; auth: TokenPayload }
  | { niveau: 'ecole'; auth: TokenPayload; etablissementId: number };

/**
 * Le niveau d'administration de la requête, ou null si elle n'en a aucun.
 *
 * Synchrone à dessein : better-sqlite3 l'est, et les routes qui appellent
 * cette garde ne sont pas toutes asynchrones.
 */
export function requireAdmin(req: NextApiRequest): AdminScope | null {
  const auth = requireAuth(req);
  if (!auth) return null;

  // Le super D'ABORD, et sans regarder son établissement. Un compte de
  // super-administrateur peut très bien être rattaché à une école (le nôtre
  // l'est) : le lire ici le réduirait silencieusement à cette école-là.
  if (isAdminEmail(auth.email)) return { niveau: 'super', auth };

  const row = getDb().prepare('SELECT is_school_admin, etablissement_id FROM users WHERE email = ?')
    .get(auth.email) as { is_school_admin: number; etablissement_id: number | null } | undefined;
  if (!row?.is_school_admin) return null;

  // Administrateur d'école SANS école : la combinaison n'a pas de sens, et
  // c'est précisément celle qui, mal traitée en aval, retomberait sur une
  // portée globale. On la refuse ici plutôt que de faire confiance à
  // l'écriture qui l'a produite.
  if (!row.etablissement_id) return null;

  return { niveau: 'ecole', auth, etablissementId: row.etablissement_id };
}

/** Réservé au site : créer un établissement, régler les modèles, les factures. */
export function requireSuperAdmin(req: NextApiRequest): AdminScope | null {
  const scope = requireAdmin(req);
  return scope?.niveau === 'super' ? scope : null;
}

/**
 * Ce compte relève-t-il de la portée de cet administrateur ?
 *
 * Un super répond de tout le monde. Un administrateur d'école ne touche que
 * les membres de SON école — et jamais un super-administrateur, dont le rang
 * vient du fichier de configuration et ne se retire pas depuis une interface.
 */
export function dansLaPortee(scope: AdminScope, email: string): boolean {
  if (isAdminEmail(email)) return scope.niveau === 'super';
  if (scope.niveau === 'super') return true;
  const row = getDb().prepare('SELECT etablissement_id FROM users WHERE email = ?')
    .get(email) as { etablissement_id: number | null } | undefined;
  return !!row && row.etablissement_id === scope.etablissementId;
}

/** Début du mois courant (UTC) — période de référence des quotas et factures. */
export function monthStartUtc(year?: number, month?: number): number {
  const now = new Date();
  return Date.UTC(year ?? now.getUTCFullYear(), (month ?? now.getUTCMonth() + 1) - 1, 1);
}
