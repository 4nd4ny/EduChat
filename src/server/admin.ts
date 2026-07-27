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

// DEPUIS LE MULTI-ÉCOLES : la portée « ecole » ne se lit plus sur
// users.etablissement_id (une seule école par compte) mais sur l'ÉCOLE ACTIVE
// du signataire et sur le fait qu'il y soit administrateur — lien par lien
// (src/server/appartenance.ts). Un enseignant administrateur au collège A et
// simple membre au collège B administre A quand A est actif, et rien du tout
// quand B l'est. Le choix vient du navigateur, la vérification vient de la
// base : les deux ne sont jamais la même chose.

import type { NextApiRequest } from 'next';
import { requireAuth, isAdminEmail, TokenPayload } from './token';
import {
  choixEcole, ecoleActivePourCompte, ecolePrincipale, estAdminDe, estEnseignantDe,
} from './appartenance';

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

  // L'ÉCOLE ACTIVE D'ABORD, LE RANG ENSUITE. L'ordre importe : c'est parce
  // que l'école est résolue (et son lien revérifié) avant de regarder le rang
  // qu'un identifiant annoncé par le navigateur ne peut jamais désigner
  // l'école d'autrui. Sans école active, pas de portée « ecole » — la
  // combinaison n'a pas de sens, et c'est précisément celle qui, mal traitée
  // en aval, retomberait sur une portée globale.
  const etablissementId = ecoleActivePourCompte(auth.email, choixEcole(req));
  if (etablissementId === null) return null;
  if (!estAdminDe(auth.email, etablissementId)) return null;

  return { niveau: 'ecole', auth, etablissementId };
}

// ─── LES TUTEURS DE L'ÉCOLE : UNE TROISIÈME PORTÉE ───────────────────────────
//
// UN ENSEIGNANT NON-ADMINISTRATEUR ADMINISTRE LES TUTEURS DE SON ÉCOLE
// (décision du client). Relire, corriger et valider les tuteurs proposés chez
// soi est un geste de collègue, pas un pouvoir d'administration : l'exiger d'un
// administrateur d'école ferait de lui le goulot de toute la pédagogie de
// l'établissement.
//
// CE QUE CETTE PORTÉE N'OUVRE PAS, et c'est délibéré : le porte-monnaie, les
// comptes, la facture, le catalogue ouvert ou non — qui restent à
// /etablissement — ni « partager / réserver » un tuteur hors des murs, qui est
// la politique de catalogue de l'école, donc son administration. La liste ci-
// dessous est donc VOLONTAIREMENT courte : lister, modifier, valider ce qui
// est soumis, et modérer les commentaires portant sur ces tuteurs-là.
//
// Un TROISIÈME niveau plutôt qu'un « ecole » élargi : les deux ne voient pas
// la même chose (l'administrateur voit AUSSI les tuteurs de la plateforme,
// l'enseignant jamais), et un booléen « estAdmin » posé à côté de la portée
// serait tôt ou tard oublié par un appelant. Ici encore, TypeScript force à
// regarder le niveau avant de lire l'identifiant.
export type PorteeTuteurs =
  | { niveau: 'super'; auth: TokenPayload }
  | { niveau: 'ecole'; auth: TokenPayload; etablissementId: number }
  | { niveau: 'enseignant'; auth: TokenPayload; etablissementId: number };

/**
 * Qui gère des tuteurs, et pour quelle école ?
 *
 * L'administration D'ABORD : un administrateur d'école (ou le site) garde
 * exactement la portée qu'il avait, sans repasser par le test d'enseignant —
 * administrer une école n'oblige pas à y enseigner. L'enseignant simple vient
 * ensuite, et seulement pour l'ÉCOLE ACTIVE, revérifiée en base comme partout
 * ailleurs (src/server/appartenance.ts).
 */
export function requireGestionTuteurs(req: NextApiRequest): PorteeTuteurs | null {
  const admin = requireAdmin(req);
  if (admin) return admin;

  const auth = requireAuth(req);
  if (!auth) return null;
  const etablissementId = ecoleActivePourCompte(auth.email, choixEcole(req));
  if (etablissementId === null) return null;
  // estEnseignantDe, et NON estMembre : le simple lien d'appartenance s'obtient
  // en vérifiant son adresse depuis une IP d'école — élèves compris (voir le
  // commentaire de estEnseignantDe, qui porte toute la démonstration).
  if (!estEnseignantDe(auth.email, etablissementId)) return null;

  return { niveau: 'enseignant', auth, etablissementId };
}

/**
 * Ce tuteur relève-t-il de cette portée ? — la garde de toute ACTION sur un
 * tuteur (modifier, valider, modérer ses commentaires).
 *
 * Le rattachement NULL (catalogue de la PLATEFORME : tuteurs fondateurs,
 * propositions anonymes hors école) ne répond JAMAIS vrai pour une école. Le
 * test doit donc écarter le NULL avant de comparer : deux valeurs absentes des
 * deux côtés d'une égalité, et le catalogue de la plateforme tomberait entre
 * les mains de la première école venue.
 */
export function tuteurDeLEcole(portee: PorteeTuteurs, etablissementIdDuTuteur: number | null): boolean {
  if (portee.niveau === 'super') return true;
  return etablissementIdDuTuteur !== null && etablissementIdDuTuteur === portee.etablissementId;
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
 * les comptes que SON école a reçus d'une administration — et jamais un
 * super-administrateur, dont le rang vient du fichier de configuration et ne
 * se retire pas depuis une interface.
 *
 * L'ÉCOLE PRINCIPALE, ET NON L'APPARTENANCE — la nuance est la garde entière.
 *
 * Le lien d'appartenance se RAMASSE : vérifier son adresse depuis une IP
 * d'établissement en pose un (src/pages/api/verify/confirm.ts), élèves
 * compris, et l'inscription en libre-service laisse un inconnu DÉCLARER
 * lui-même les IP de « son » école. Fonder la portée sur estMembre revenait
 * donc à ceci : j'inscris une école sur une adresse que je contrôle, je
 * vérifie un SECOND compte depuis cette adresse, et le voilà dans ma portée.
 * Or la portée commande la CERTIFICATION DE MAJORITÉ, qui ouvre les
 * fournisseurs écartés au titre de l'AI Act (Gemini, Grok, DeepSeek… hors
 * réseau scolaire, en clé personnelle). La garde « personne ne se certifie
 * soi-même » ne voit rien passer : les deux comptes sont deux adresses. Le
 * commentaire de cette garde, dans /api/admin/users, tenait justement pour
 * acquis que « deux inscrits en libre-service atterrissent dans DEUX écoles,
 * donc hors de la portée l'un de l'autre » — estMembre effaçait la
 * démonstration sans la remplacer, et le complice n'avait plus à être
 * complice.
 *
 * users.etablissement_id, lui, ne se ramasse pas : il est posé par le site
 * (/api/admin/users, réservé au super) ou par l'inscription, qui ne rattache
 * QUE le demandeur. C'est la trace d'une DÉCISION, et c'est ce qu'on exige.
 * Cette lecture est aussi celle de la liste servie en GET par
 * /api/admin/users : ce qui s'écrit et ce qui s'affiche disent la même chose.
 *
 * CE QUE CELA COÛTE, dit franchement : un administrateur d'école ne peut pas
 * nommer administrateur un collègue que seule une IP rattache à son école. Le
 * jour où user_etablissements portera une PROVENANCE (ip / admin /
 * inscription), c'est ici qu'il faudra lire « lien non posé par une IP » —
 * même chantier que celui qu'annonce estEnseignantDe.
 */
export function dansLaPortee(scope: AdminScope, email: string): boolean {
  if (isAdminEmail(email)) return scope.niveau === 'super';
  if (scope.niveau === 'super') return true;
  return ecolePrincipale(email) === scope.etablissementId;
}

/** Début du mois courant (UTC) — période de référence des quotas et factures. */
export function monthStartUtc(year?: number, month?: number): number {
  const now = new Date();
  return Date.UTC(year ?? now.getUTCFullYear(), (month ?? now.getUTCMonth() + 1) - 1, 1);
}
