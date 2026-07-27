// QUELS FOURNISSEURS POUR CETTE REQUÊTE-CI — la règle, une seule fois écrite.
//
// ─── CE QUI A CHANGÉ, ET POURQUOI LA CERTIFICATION D'ÂGE A DISPARU ──────────
//
// On demandait naguère une « majorité certifiée » pour atteindre les
// fournisseurs écartés hors du réseau d'une école. Un élève qui basculait son
// téléphone en 4G quittait ce réseau ; la certification, elle, ne le suivait
// pas — mais rien ne l'empêchait non plus de se présenter sans compte du tout.
// Une restriction qu'un geste contourne n'est pas une restriction : c'est un
// décor, et un décor coûte en complexité ce qu'il ne rapporte pas en
// protection. Ce qui protège réellement, c'est LE RÉSEAU DE L'ÉCOLE : là, un
// mineur est sous la responsabilité de l'institution, et c'est l'engagement
// qu'EduChat tient devant une direction.
//
// ─── LA MATRICE, EN QUATRE CASES ────────────────────────────────────────────
//
//  ANONYME, HORS CAMPUS  → la DÉMONSTRATION seule : le repli gratuit et rien
//    d'autre. Sans compte et sans moyen de paiement, il n'y a rien à facturer
//    et personne à qui demander des comptes. C'est l'inverse de l'ancienne
//    règle, qui proposait tout à tout le monde en accompagnant la liste d'un
//    avertissement — un avertissement n'a jamais rien empêché. Il n'y a ici
//    rien d'alarmant à dire : la liste est simplement courte.
//
//    CE QUE « SEULEMENT LE REPLI GRATUIT » NE VEUT PAS DIRE, et l'audit a eu
//    raison de poser la question. Cette personne peut coller SA PROPRE clé du
//    fournisseur libre (OpenRouter aujourd'hui) et obtenir, à ses frais, un
//    modèle de l'échelle plutôt que le petit modèle gratuit imposé. Le
//    fournisseur, lui, ne change pas : c'est le seul de sa liste, et toute
//    autre clé — Mistral, Claude — se heurte au refus de /api/completion.
//    Ce n'est pas une brèche, et la tenter de fermer coûterait plus qu'elle ne
//    rapporte : aucun franc de la plateforme ni d'une école n'est engagé (la
//    clé est la sienne), aucun fournisseur écarté n'est atteint (il n'y en a
//    pas un seul dans sa liste), et nommer un modèle hors échelle chez cet
//    intermédiaire lui est déjà refusé faute de compte. Interdire en plus à
//    quelqu'un de payer lui-même chez le seul fournisseur qu'on lui propose
//    ferait de la démonstration la seule surface du site où sa propre clé ne
//    vaut rien — un refus que rien ne protège.
//
//  ANONYME, SUR LE CAMPUS → la clé de l'école et les fournisseurs qu'elle a le
//    droit de servir (SCHOOL_PROVIDER_IDS). Inchangé.
//
//  COMPTE, HORS CAMPUS → tout. Il est identifié, il paie, il répond de lui-même.
//
//  COMPTE, SUR LE CAMPUS → les règles de l'école, SAUF s'il dispose d'un moyen
//    de paiement personnel ASSOCIÉ AVANT de venir. L'école ne finance jamais un
//    fournisseur écarté ; ce qu'un adulte paie lui-même ne la regarde pas.
//
// ─── « ASSOCIÉ AVANT DE VENIR » : POURQUOI PAS LA CLÉ TAPÉE DANS LA PAGE ────
//
// Sur le campus, le moyen propre se lit EN BASE — une clé mémorisée sur le
// compte, ou un crédit personnel en cours —, jamais dans le corps de la
// requête. La différence est toute la
// garde : une clé collée dans un champ, c'est le geste d'un élève de troisième
// qui a trouvé une clé sur un forum, et il suffirait alors de ce geste pour
// rouvrir en classe ce que l'école a écarté. Une clé mémorisée sur un compte
// vérifié suppose au contraire une décision antérieure, prise ailleurs, par
// quelqu'un que l'on sait nommer. Hors campus la question ne se pose pas : le
// compte suffit, et la clé n'y est plus qu'un moyen de payer.
//
// Le moyen propre se lit GLOBALEMENT, et non fournisseur par fournisseur : il
// dit « ce compte a les siens », pas « ce compte peut payer celui-ci ». Un
// périmètre calculé par fournisseur divergerait aussitôt de la liste affichée
// (elle, ne connaît pas le fournisseur qui sera choisi) — et une liste qui
// promet ce que la complétion refuse est le défaut que ce module existe pour
// supprimer. Qui PAIE reste vérifié à part, au moment de l'appel : sans clé
// pour le fournisseur choisi, la clé interne prend le relais… et elle refuse
// tout net les fournisseurs écartés.
//
// ─── LE PÉRIMÈTRE N'EST PAS LE PAIEMENT ─────────────────────────────────────
//
// Cette fonction répond à « que puis-je CHOISIR ? ». Elle ne dit ni qui paie ni
// ce qui sera réellement appelé. Trois gardes indépendantes vivent ailleurs, et
// aucune ne se déduit d'ici :
//   · la clé INTERNE d'une école ne paie jamais un fournisseur écarté ni un
//     drapeau rouge (/api/completion) — quelle que soit la case de la matrice ;
//   · le repli gratuit IMPOSE son fournisseur et son modèle, donc il ne sert
//     jamais le fournisseur choisi ; son budget est celui du gestionnaire et il
//     ne s'ouvre à personne de plus ;
//   · nommer soi-même un modèle derrière un intermédiaire (OpenRouter, page
//     « duel ») demande un COMPTE : sans quoi on demanderait par la bande, en
//     une ligne de requête, ce qu'aucune de nos listes ne contient.

import { getDb } from './db';
import { isKnownIp } from './access';
import { resolveEtablissementByIp } from './etablissements';
import { listUserKeyProviders } from './userKeys';
import { aDuCredit, titulaireCompte } from './porteMonnaie';
import { DeveloperKeys, FreeProvider } from '../utils/env';
import { isProviderId, providerDefaults, PROVIDER_IDS, SCHOOL_PROVIDER_IDS, type ProviderId }
  from '../shared/providers';

/**
 * Pourquoi ce périmètre-là.
 *   'tout'  — aucun retrait : compte hors campus, ou compte qui paie lui-même ;
 *   'ecole' — les règles de l'établissement d'où l'on appelle ;
 *   'demo'  — la démonstration publique, seule.
 * Ce motif REMONTE JUSQU'À L'INTERFACE : « ici, sur ce réseau » et « il vous
 * faut un compte » n'appellent pas la même phrase, et un booléen unique
 * obligerait à deviner laquelle.
 */
export type MotifPerimetre = 'tout' | 'ecole' | 'demo';

export type DemandeAcces = {
  /** D'OÙ l'on appelle. getClientIp, jamais un en-tête brut. */
  ip: string;
  /**
   * QUI appelle : l'email porté par le jeton (requireAuth), ou null. Le jeton
   * ne fait pas foi à lui seul — la fonction relit le compte en base avant de
   * le tenir pour identifié.
   */
  email: string | null | undefined;
  /**
   * Ce compte dispose-t-il d'un moyen de paiement PERSONNEL déjà associé ?
   * À calculer avec aUnMoyenPropre() — ne l'inventez pas depuis le corps de la
   * requête : sur le campus, c'est précisément ce qui ferait la différence
   * entre une décision et un copier-coller.
   */
  moyenPropre?: boolean;
};

export type Perimetre = {
  /** Ce que ce visiteur-ci peut choisir, ici et maintenant. */
  fournisseurs: readonly ProviderId[];
  motif: MotifPerimetre;
  /** L'appel vient du réseau d'un établissement. */
  campus: boolean;
  /** Un compte VÉRIFIÉ en base est présent — pas seulement un jeton signé. */
  compte: boolean;
};

/**
 * L'appel vient-il d'une école ? — la question porte sur un LIEU, et sur rien
 * d'autre : établissements enregistrés en base, plus les IP d'amorçage
 * SECRET_ALLOWED_IPS, qui sont littéralement celles de l'école dans un
 * déploiement mono-établissement.
 *
 * ON NE REGARDE PAS LE VERROU DE SALLE (mayUseServerKeys → auth_lock.json) :
 * il commande la DÉPENSE de la clé interne, pendant une heure de cours. D'où
 * l'on appelle est une autre question — un lieu, pas un moment —, et elle se
 * lit sur l'adresse.
 *
 * LES DEUX LECTURES COÏNCIDENT DÉSORMAIS, et c'est heureux : depuis que le
 * verrou porte l'école qui l'a ouvert, il ne peut s'ouvrir ni se lire que pour
 * les adresses reconnues ici même (salleDepuisIp reprend terme pour terme
 * « établissement en base OU isKnownIp »). Tant qu'il était global, le
 * consulter ici aurait dit « école » à tout Internet une heure durant.
 *
 * UNE ADRESSE ILLISIBLE COMPTE POUR UNE ÉCOLE, et c'est le seul endroit du
 * fichier où l'on répond sans savoir. getClientIp rend « unknown » quand il n'a
 * pu lire ni l'en-tête du proxy ni l'adresse de la socket ; les deux lectures
 * ci-dessous répondraient alors NON, et un proxy mal reconfiguré ferait sortir
 * tout un établissement du filtre sans que personne le remarque.
 *
 * ATTENTION, LA JUSTIFICATION A CHANGÉ AVEC LA MATRICE, et l'ancienne était
 * devenue fausse : « école » n'est plus la réponse la plus FERMÉE — la
 * démonstration l'est (un fournisseur, contre trois). Ce qui tranche
 * aujourd'hui est ailleurs, et tient en deux points :
 *   · AUCUNE des deux réponses n'expose un fournisseur écarté. La liste
 *     scolaire n'en contient pas ; l'engagement pris devant une direction est
 *     donc tenu dans les deux cas, et le choix ne se joue plus sur lui.
 *   · UNE ÉCOLE DONT LE PROXY CASSE DOIT CONTINUER DE TRAVAILLER. Répondre
 *     « démonstration » réduirait tout un établissement à un seul modèle
 *     gratuit, pour une cause invisible depuis la salle de classe. Répondre
 *     « école » lui laisse ses fournisseurs conformes ; ce qu'il en coûte, un
 *     visiteur anonyme qui voit trois fournisseurs RGPD au lieu d'un et peut y
 *     employer sa propre clé, ne met personne en risque.
 * Le jour où la liste scolaire accueillerait un fournisseur écarté, ce
 * raisonnement tomberait et il faudrait inverser le défaut.
 *
 * Synchrone à dessein, comme les deux lectures qu'elle enchaîne : un appelant
 * qui oublierait un `await` recevrait sinon un verdict toujours indéfini, donc
 * toujours interprété comme un refus — une panne silencieuse et à l'envers.
 */
function surLeCampus(ip: string): boolean {
  if (!ip || ip === 'unknown') return true;
  return resolveEtablissementByIp(ip) !== null || isKnownIp(ip);
}

/**
 * UN COMPTE, C'EST UN COMPTE VÉRIFIÉ — et le jeton ne suffit pas à l'affirmer.
 *
 * Toute la matrice repose sur « il est identifié, il répond de lui-même » : le
 * mot « compte » y vaut promesse. Or requireAuth ne vérifie qu'une SIGNATURE,
 * et un jeton vit quatre-vingt-dix jours ; il survit donc à un compte fermé, ou
 * à une ligne users que la suppression RGPD aurait vidée. Relire verified_at,
 * c'est la règle déjà suivie partout où un jeton ouvre quelque chose
 * (/api/me, la garde promptagogue de /api/completion) : LES DROITS SE RELISENT
 * EN BASE, jamais dans le jeton — sinon un vieux jeton porte des droits périmés.
 *
 * Une lecture sur la clé primaire, dans une base SQLite locale : le coût n'est
 * pas un argument contre.
 */
function compteVerifie(email: string | null | undefined): boolean {
  if (!email) return false;
  const row = getDb().prepare('SELECT 1 AS v FROM users WHERE email = ? AND verified_at IS NOT NULL')
    .get(email) as { v: number } | undefined;
  return !!row;
}

/**
 * Ce compte a-t-il de quoi payer par lui-même ?
 *
 * DEUX MOYENS, ET LE POINT EST UNIQUE. Une clé personnelle MÉMORISÉE (table
 * user_keys, chiffrée) — il paie alors directement le fournisseur ; ou un
 * CRÉDIT PERSONNEL en cours (porte-monnaie du compte, src/server/porteMonnaie.ts)
 * — il a payé la plateforme d'avance. Dans les deux cas la phrase de la matrice
 * est vraie au mot : « il est identifié, il paie, il répond de lui-même ».
 *
 * Une clé qu'on ne sait plus déchiffrer ne compte pas : listUserKeyProviders
 * l'écarte déjà, et promettre un moyen de paiement inutilisable ferait afficher
 * une liste que la complétion refuserait. Un crédit à zéro ne compte pas non
 * plus — aDuCredit exige un solde STRICTEMENT positif, faute de quoi avoir
 * possédé un centime un jour vaudrait laissez-passer permanent.
 *
 * ─── CE QUE LE CRÉDIT ÉLARGIT, ET QUI N'EST PAS UN DÉFAUT ───────────────────
 *
 * Le périmètre répond à « que puis-je CHOISIR ? », jamais à « qui paie ? ». Un
 * compte qui, sur le campus, apporte un crédit MAIS AUCUNE CLÉ verra donc les
 * fournisseurs écartés dans son menu et recevra un ERR_PROVIDER_NOT_ALLOWED
 * s'il en choisit un : la clé INTERNE — celle de la plateforme — ne sert jamais
 * un écarté ni un drapeau rouge, quel que soit le payeur. Ce n'est pas un
 * oubli, c'est la ligne à ne pas franchir : un crédit personnel achète des
 * jetons, il n'achète pas le droit de faire sortir la clé d'EduChat de ce
 * qu'elle s'est engagée à servir. Pour atteindre un écarté, il faut SA PROPRE
 * clé — et le crédit sert alors à tout le reste.
 *
 * Cet écart entre la liste et l'appel existait déjà pour les clés (« qui PAIE
 * reste vérifié à part ») ; le crédit le rend simplement plus fréquent. C'est
 * dit ici pour que la prochaine relecture n'y voie pas un bogue.
 */
export function aUnMoyenPropre(email: string | null | undefined): boolean {
  if (!email) return false;
  if (listUserKeyProviders(email).length > 0) return true;
  return aDuCredit(titulaireCompte(email));
}

/**
 * LE FOURNISSEUR DU REPLI GRATUIT, ou null s'il n'y en a pas de servable.
 *
 * Trois conditions, et la troisième est un DÉFAUT FERMÉ ajouté par l'audit :
 *   · SECRET_FREE_PROVIDER nomme un fournisseur connu ;
 *   · une clé serveur existe réellement pour lui ;
 *   · IL N'EST PAS ÉCARTÉ d'un public scolaire.
 *
 * La troisième ne protège de rien qu'un exploitant ne puisse déjà faire — c'est
 * lui qui écrit le fichier d'environnement. Elle protège d'une FAUTE DE FRAPPE,
 * et la faute est ici asymétrique : `SECRET_FREE_PROVIDER=gemini` aurait servi,
 * sur la clé interne de la plateforme, à tout visiteur anonyme y compris depuis
 * une salle de classe, un fournisseur qu'aucune autre ligne du code n'accepte
 * de payer. Toutes les autres gardes de /api/completion vérifient `ecarte` ;
 * le repli gratuit était le seul chemin où le fournisseur ne venait pas de la
 * requête, et c'est exactement pour cela qu'on ne le regardait pas.
 * Repli fermé (aucun fournisseur) plutôt que repli écarté : le visiteur reçoit
 * ERR_LOCKED, ce qui se remarque le jour même, au lieu d'une conformité rompue
 * qui ne se remarque jamais.
 *
 * Calculé à chaque appel plutôt que figé à l'import : les variables
 * d'environnement sont lues au démarrage, mais la réponse reste ainsi dérivable
 * en test sans recharger le module.
 */
export function fournisseurLibre(): ProviderId | null {
  const libre = FreeProvider;
  if (!isProviderId(libre)) return null;
  if (providerDefaults[libre].ecarte) return null;
  return String(DeveloperKeys[libre] || '').trim() ? libre : null;
}

/**
 * La démonstration publique : ce fournisseur-là, et rien d'autre. Liste vide si
 * aucun n'est servable — et c'est la vérité : il n'y a rien à proposer à ce
 * visiteur-là, mieux vaut une liste vide qu'une promesse.
 */
function fournisseursDeDemonstration(): readonly ProviderId[] {
  const libre = fournisseurLibre();
  return libre ? [libre] : [];
}

/**
 * LA fonction. Toutes les surfaces l'appellent — la liste proposée
 * (/api/providers, donc le chat et la page « duel ») comme la complétion
 * elle-même (/api/completion). Une règle de conformité écrite deux fois est une
 * règle qui finira par diverger, et c'est toujours la copie la plus permissive
 * qui survit.
 *
 * L'ORDRE DES CAS PORTE UN SENS : le campus se lit d'abord, parce que c'est le
 * lieu qui commande, et le moyen propre ensuite, parce que c'est la seule chose
 * qui lève les règles d'une école — pour un compte, et jamais pour un anonyme.
 */
export function perimetreFournisseurs(demande: DemandeAcces): Perimetre {
  const campus = surLeCampus(demande.ip);
  const compte = compteVerifie(demande.email);

  // HORS CAMPUS. Un compte répond de lui-même : tout. Sinon, la démonstration.
  if (!campus) {
    return compte
      ? { fournisseurs: PROVIDER_IDS, motif: 'tout', campus, compte }
      : { fournisseurs: fournisseursDeDemonstration(), motif: 'demo', campus, compte };
  }

  // SUR LE CAMPUS. Un compte qui apporte ses propres moyens sort des règles de
  // l'école : elle ne paiera rien pour lui, elle n'a donc rien à en dire. Tous
  // les autres — anonymes compris — relèvent de ce que la clé de l'école a le
  // droit de servir.
  if (compte && demande.moyenPropre) {
    return { fournisseurs: PROVIDER_IDS, motif: 'tout', campus, compte };
  }
  return { fournisseurs: SCHOOL_PROVIDER_IDS, motif: 'ecole', campus, compte };
}
