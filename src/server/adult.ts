// Qui peut atteindre les fournisseurs écartés au titre de l'AI Act.
//
// DEUX CONDITIONS, ET LA PREMIÈRE PRIME SUR TOUT :
//
//  1. LE LIEU. Depuis l'IP d'un établissement — enregistré en base, ou d'
//     amorçage (SECRET_ALLOWED_IPS) — ces fournisseurs sont injoignables, quel
//     que soit le compte et quelle que soit la clé. C'est la seule règle qu'on
//     puisse promettre à une école sans réserve : « sur votre réseau, ces
//     modèles n'existent pas ». La clé interne les refuse par ailleurs quoi
//     qu'il arrive, y compris hors des murs (voir /api/completion) : la
//     plateforme ne finance jamais ce qu'elle écarte.
//
//  2. LA PERSONNE. Ailleurs, il faut un compte dont la MAJORITÉ A ÉTÉ VÉRIFIÉE
//     — un entretien avec l'administration, ou un enseignant qui répond de ses
//     élèves majeurs. On ne conserve que la décision (users.adult_verified_at).
//
// ─── POURQUOI LA SECONDE CONDITION RESTE, ET NE DOIT PAS « SE SIMPLIFIER » ───
//
// L'argument qui la fait tomber se présente toujours de la même façon, et il
// est séduisant : hors de l'école, le visiteur apporte forcément sa propre clé
// (la plateforme ne sert jamais les siennes ici), donc il paie, donc il n'
// engage que lui — pourquoi lui demander quoi que ce soit ?
//
// PARCE QUE « HORS DE L'ÉCOLE », C'EST AUSSI LA CHAMBRE D'UN ÉLÈVE DE QUATORZE
// ANS. L'AI Act n'interdit pas d'exposer des mineurs à ces systèmes DANS UNE
// SALLE DE CLASSE : il interdit de les y exposer. Le réseau du collège est le
// seul endroit où nous SAVONS avoir affaire à des mineurs ; ce n'est pas le
// seul où il y en a, et le catalogue d'EduChat s'adresse d'abord à eux. Rendre
// Grok, DeepSeek ou Qwen sélectionnables par un visiteur anonyme au motif qu'il
// n'est pas sur le wifi de son école, c'est retirer la protection très
// exactement là où l'école ne peut plus rien voir. Le défaut se prend fermé.
//
// CE QUE LE CLIENT A TRANCHÉ, ET QU'ON N'ESSAIE PAS D'ARRANGER : un enseignant
// qui veut par ailleurs ces fournisseurs avec ses propres clés se fera un
// SECOND COMPTE, certifié pour lui-même, séparé de son compte de travail. On ne
// concilie pas les deux usages sur un même compte — on le DIT dans l'interface,
// à l'endroit où l'absence se constate (src/chat/NoteAIAct.tsx).

import { getDb } from './db';
import { isKnownIp } from './access';
import { resolveEtablissementByIp } from './etablissements';

export type AdultVerdict = { allowed: boolean; reason: 'ok' | 'school-network' | 'not-verified' };

export function isAdultVerified(email: string | null | undefined): boolean {
  if (!email) return false;
  const row = getDb().prepare('SELECT adult_verified_at FROM users WHERE email = ?').get(email) as
    { adult_verified_at: number | null } | undefined;
  return !!row?.adult_verified_at;
}

/**
 * L'appel vient-il d'une école ? — la première question, et elle porte sur un
 * LIEU.
 *
 * L'IP, et rien d'autre : les établissements enregistrés en base, plus les IP
 * d'amorçage SECRET_ALLOWED_IPS, qui sont littéralement celles de l'école dans
 * un déploiement mono-établissement.
 *
 * ON NE REGARDE PAS LE VERROU GLOBAL (mayUseServerKeys → auth_lock.json), et ce
 * retrait est délibéré : ce verrou n'est pas un lieu, c'est un interrupteur de
 * portée mondiale. Une salle déverrouillée à Genève refusait le motif
 * « réseau scolaire » à un adulte certifié de l'autre bout du monde, pendant
 * l'heure du cours, et lui affichait donc une explication fausse. Le verrou
 * commande la DÉPENSE de la clé interne ; d'où l'on appelle est une autre
 * question, et elle se lit sur l'adresse. Le durcissement ne se perd pas pour
 * autant : les IP d'amorçage restent écartées HORS des heures d'ouverture, ce
 * que mayUseServerKeys ne faisait pas.
 *
 * UNE ADRESSE ILLISIBLE COMPTE POUR UNE ÉCOLE, et c'est le seul endroit du
 * fichier où l'on répond sans savoir. getClientIp rend « unknown » quand il n'a
 * pu lire ni l'en-tête du proxy ni l'adresse de la socket ; or les deux
 * lectures ci-dessous répondent NON à « unknown » — l'ignorance produirait donc
 * la réponse la plus OUVERTE de toutes, et un proxy mal reconfiguré ferait
 * silencieusement sortir tout un établissement du filtre. L'hypothèse la plus
 * sûre sur une adresse qu'on ne sait pas lire est qu'elle sort d'une salle de
 * classe : un adulte certifié verra alors la liste scolaire, ce qui se répare
 * en réparant le proxy, tandis que l'inverse ne se répare pas du tout.
 *
 * Synchrone à dessein, comme les deux lectures qu'elle enchaîne : un appelant
 * qui oublierait un `await` recevrait sinon un verdict toujours indéfini, donc
 * toujours interprété comme un refus — une panne silencieuse et à l'envers.
 */
function depuisUneEcole(ip: string): boolean {
  if (!ip || ip === 'unknown') return true;
  return resolveEtablissementByIp(ip) !== null || isKnownIp(ip);
}

/**
 * Ce visiteur peut-il atteindre les fournisseurs écartés au titre de l'AI Act
 * (Gemini, Grok, DeepSeek, Qwen, Kimi, GLM, MiniMax) ?
 *
 * UNE SEULE FONCTION POUR DEUX USAGES, et c'est voulu. Elle répond aussi bien
 * pour la LISTE proposée (chat, duel, /api/providers) que pour le NOMMAGE LIBRE
 * d'un modèle derrière un intermédiaire (OpenRouter hors échelle, /api/completion).
 * On a un temps voulu distinguer les deux — « la liste est dressée par nous,
 * le champ libre non » — en ouvrant la liste à tout visiteur hors école. Les
 * deux verdicts sont alors redevenus identiques dès qu'on a rétabli la
 * certification pour la liste, et deux fonctions jumelles dont les commentaires
 * jurent qu'elles diffèrent sont une invitation à se tromper de garde. Le jour
 * où les deux droits divergeront POUR DE BON, il faudra deux fonctions ; tant
 * qu'ils ne divergent pas, il n'en faut qu'une.
 *
 * L'ORDRE DES DEUX REFUS PORTE UN SENS, et l'interface s'en sert : « réseau
 * scolaire » d'abord, parce que c'est le seul motif qu'aucun compte ne lève.
 */
export function mayUseAdultProviders(ip: string, email: string | null | undefined): AdultVerdict {
  if (depuisUneEcole(ip)) return { allowed: false, reason: 'school-network' };
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
