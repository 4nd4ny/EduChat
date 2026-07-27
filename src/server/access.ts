// Contrôle d'accès partagé entre /api/auth et /api/completion.
//
// Extrait de src/pages/api/auth.ts pour que la route de complétion puisse
// vérifier l'état de déverrouillage AVANT de dépenser les clés API du serveur.
// L'étape 9 étendra ce module avec la résolution IP → établissement en base
// (les variables SECRET_ALLOWED_IPS / SECRET_ALLOWED_HOURS restant en
// amorçage et en secours).

import fs from 'fs/promises';
import path from 'path';
import lockfile from 'proper-lockfile';
import { isIP } from 'net';
import { DateTime } from 'luxon';
import type { NextApiRequest } from 'next';
import type { EtabRow } from './etablissements';
import { AllowedHours, AllowedIps, DataDir, ProxyToken, TrustedProxyIps } from '../utils/env';

// Le chemin n'est PAS exporté, et c'est délibéré. Tant qu'il l'était, refermer
// une salle s'écrivait `fs.unlink(LOCK_FILE_PATH)` depuis n'importe quelle
// route — c'est-à-dire fermer la salle de TOUTES les écoles à la fois. Le
// fichier ne se touche plus que par les quatre fonctions ci-dessous, qui savent
// toutes de QUELLE école elles parlent.
const LOCK_FILE_PATH = path.join(DataDir, 'auth_lock.json');
const RATE_FILE_PATH = path.join(DataDir, 'rate_limit.json');

/**
 * Le pair TCP immédiat est-il un proxy de confiance ? C'est LA condition pour
 * accorder foi à l'en-tête X-Real-IP : sans elle, n'importe quel voisin du
 * réseau Docker joignant le conteneur en direct pourrait forger l'IP d'une
 * école et voler son budget (défaut relevé en revue).
 */
function isTrustedProxy(req: NextApiRequest): boolean {
  // Secret partagé posé par le proxy (recommandé : insensible aux changements d'IP).
  if (ProxyToken) return req.headers['x-proxy-token'] === ProxyToken;
  // Ou liste blanche d'IP socket de proxys.
  if (TrustedProxyIps.length) {
    const peer = (req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    return TrustedProxyIps.includes(peer);
  }
  // AUCUN CONTRÔLE CONFIGURÉ : comportement historique, NON durci — et depuis
  // que le verrou de salle est BORNÉ À UNE ÉCOLE, c'est ici que passe le
  // dernier chemin par lequel un appel de nulle part obtient la clé.
  //
  // Le raisonnement tient en trois lignes. Tant que le verrou était global,
  // n'importe qui recevait la clé pendant une ouverture, sans avoir à prétendre
  // quoi que ce soit. Maintenant il faut être à une adresse d'école — donc
  // usurper cette adresse —, et l'usurpation ne coûte un en-tête `X-Real-IP`
  // que si ce test répond « oui » à tout le monde. La garantie promise
  // (« borné au réseau local de l'institution ») repose donc désormais SUR CE
  // TEST : elle vaut ce que vaut SECRET_PROXY_TOKEN ou TRUSTED_PROXY_IPS.
  //
  // On ne bascule PAS le défaut à `false` ici : sans configuration, getClientIp
  // retomberait sur l'adresse socket — celle du proxy inverse —, plus aucune
  // école ne se résoudrait, et la clé de la plateforme cesserait de répondre à
  // tout le monde d'un coup. Le remède est une VARIABLE À RENSEIGNER au
  // déploiement, pas une valeur par défaut qui éteint le service.
  return true;
}

/**
 * Adresse IP réelle du client — CONTRÔLE DE COHÉRENCE anti-usurpation.
 *
 * On n'honore l'en-tête X-Real-IP (posé par le reverse proxy) QUE si la
 * connexion vient d'un proxy de confiance ; sinon on retombe sur l'adresse
 * socket réelle. X-Forwarded-For (fourni par le client) n'est jamais utilisé.
 * Une requête directe forgeant X-Real-IP est ainsi ramenée à son IP socket
 * (une IP Docker interne, qui ne correspond à aucune école).
 */
export function getClientIp(req: NextApiRequest): string {
  const socketIp = (req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  if (isTrustedProxy(req)) {
    const real = req.headers['x-real-ip'];
    if (typeof real === 'string' && isIP(real)) return real;
  }
  return isIP(socketIp) ? socketIp : 'unknown';
}

// ─── LE VERROU DE SALLE S'ARRÊTE AUX MURS DE L'ÉCOLE ────────────────────────
//
// Il fut un temps « verrou global » : un enseignant qui ouvrait sa salle pour
// une heure ouvrait la clé de la plateforme à TOUT visiteur, où qu'il fût sur
// Internet — et la dépense qui s'ensuivait n'était imputée à personne, faute
// d'IP d'établissement pour la porter. Le fichier ne disait pas QUI avait
// ouvert, donc rien ne pouvait borner ce qu'il ouvrait.
//
// Désormais le verrou PORTE L'ÉCOLE qui l'a ouvert, et il n'ouvre que pour les
// adresses de CETTE école-là. Plusieurs écoles peuvent avoir leur salle ouverte
// en même temps sans se voir : c'est le cas normal d'un service
// multi-établissements, pas un cas limite — d'où un fichier à plusieurs
// entrées, et non un fichier présent ou absent.
//
// L'échéance demeure : une salle ouverte puis oubliée se referme d'elle-même,
// et /enseignant peut la refermer avant terme (clearAuthLock).

/**
 * Clé de portée d'un verrou : « à qui cette ouverture profite-t-elle ? ».
 * Deux formes seulement, et jamais rien qui vienne du corps de la requête —
 * une portée se DÉDUIT de l'adresse appelante (salleDepuisIp), sans quoi on
 * remplacerait un trou par un trou paramétrable.
 */
export type CleVerrou = string;

/** L'école d'amorçage : les adresses de SECRET_ALLOWED_IPS, hors base. */
const CLE_AMORCAGE = 'amorcage';

/** La portée d'une école enregistrée en base. */
export function porteeEtablissement(id: number): CleVerrou {
  return `etab:${id}`;
}

export type PorteeSalle = {
  cle: CleVerrou;
  /** L'école en base, ou null pour l'amorçage SECRET_ALLOWED_IPS. */
  etablissement: EtabRow | null;
};

/**
 * DE QUELLE SALLE PARLE CETTE REQUÊTE ? — l'unique façon d'obtenir une portée.
 *
 * Une école enregistrée l'emporte ; à défaut, une adresse de SECRET_ALLOWED_IPS
 * ouvre la portée d'AMORÇAGE. Cette seconde forme suppose ce que documente déjà
 * src/server/accesFournisseurs.ts : ces adresses sont « littéralement celles de
 * l'école dans un déploiement mono-établissement ». Une portée par adresse
 * plutôt qu'une pour la liste entière casserait une école qui sort par
 * plusieurs adresses publiques — l'enseignant ouvrirait depuis l'une, ses
 * élèves appelleraient depuis l'autre et ne verraient rien. Le jour où
 * SECRET_ALLOWED_IPS mélangerait plusieurs institutions, ce raisonnement
 * tomberait : il faudrait alors les enregistrer en base, ce qui est de toute
 * façon le chemin normal.
 *
 * `null` = aucune salle. Ni verrou à lire, ni verrou à poser : c'est la réponse
 * pour un visiteur quelconque d'Internet, et c'est là que se referme le trou.
 */
export async function salleDepuisIp(ip: string): Promise<PorteeSalle | null> {
  const { resolveEtablissementByIp } = await import('./etablissements');
  const etab = resolveEtablissementByIp(ip);
  if (etab) return { cle: porteeEtablissement(etab.id), etablissement: etab };
  if (isKnownIp(ip)) return { cle: CLE_AMORCAGE, etablissement: null };
  return null;
}

/**
 * Format sur disque, version 2 : { version, salles: { <clé>: <échéance ms> } }.
 *
 * MIGRATION ADDITIVE, ET LE DOUTE PENCHE VERS « FERMÉ ». L'ancien format
 * ({ timestamp }) ne porte AUCUNE notion d'école : impossible de deviner à qui
 * il appartenait, et le reconduire rouvrirait à tout Internet précisément le
 * trou qu'on referme. Il est donc lu sans faire tomber le serveur, et tenu pour
 * fermé — comme tout fichier tronqué ou illisible. Un refus se remarque en
 * classe et se répare d'un mot de passe ; une ouverture héritée ne se remarque
 * pas. La première écriture qui suit REMPLACE le document, elle n'y fusionne
 * rien.
 */
const VERSION_VERROUS = 2;

async function lireSalles(): Promise<Record<string, number>> {
  let brut: string;
  try {
    brut = await fs.readFile(LOCK_FILE_PATH, 'utf8');
  } catch (error) {
    // Fichier absent = aucune salle ouverte : l'état NORMAL du site au repos,
    // qui n'a rien à faire dans les journaux.
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.error("Lecture impossible du verrou d'authentification :", error);
    }
    return {};
  }
  try {
    const donnees = JSON.parse(brut);
    if (!donnees || typeof donnees !== 'object') return {};
    if (donnees.version !== VERSION_VERROUS) return {}; // ancien format → fermé
    if (!donnees.salles || typeof donnees.salles !== 'object') return {};
    const salles: Record<string, number> = {};
    for (const [cle, echeance] of Object.entries(donnees.salles as Record<string, unknown>)) {
      // Une échéance qui n'est pas un nombre fini ne vaut pas « ouvert » :
      // `NaN < x` est faux partout, mais on préfère l'écarter à la lecture
      // plutôt que de compter sur une comparaison pour le faire.
      if (typeof echeance === 'number' && Number.isFinite(echeance)) salles[cle] = echeance;
    }
    return salles;
  } catch (error) {
    console.error("Verrou d'authentification illisible (tenu pour fermé) :", error);
    return {};
  }
}

/**
 * Lecture-modification-écriture SOUS VERROU DE FICHIER (proper-lockfile, comme
 * failed_attempts.json et rate_limit.json). Deux écoles qui ouvrent leur salle
 * à la même seconde écriraient sinon l'une par-dessus l'autre : la seconde
 * refermerait la première sans que personne ne l'ait demandé.
 *
 * C'est aussi le SEUL endroit qui purge les échéances dépassées. Une lecture ne
 * touche jamais au fichier — l'ancien code y supprimait le verrou expiré, ce
 * qui, sur un fichier désormais partagé, aurait fait refermer par l'expiration
 * d'une école les salles ouvertes de toutes les autres.
 *
 * ─── ELLE LÈVE, ET C'EST TOUT L'INTÉRÊT ─────────────────────────────────────
 *
 * Cette fonction journalisait l'erreur et rendait la main comme si de rien
 * n'était. Conséquence, sur le geste qui compte le plus : /api/auth répondait
 * « Accès fermé » à un `clearAuthLock` qui n'avait rien fermé — disque plein,
 * verrou de fichier jamais obtenu, permission perdue —, et l'enseignant
 * repartait en croyant sa salle refermée alors qu'elle restait ouverte jusqu'à
 * son échéance. C'est exactement l'ouverture qu'on ne remarque pas, celle que
 * la consigne écarte au profit d'un refus qui, lui, se voit et se répare.
 *
 * L'appelant décide donc quoi en faire, et les deux réponses sont légitimes :
 * une ouverture ou une fermeture DIT son échec à l'écran (fermer sans le
 * savoir est le pire des cas) ; un verrou de courtoisie, lui, reste au mieux
 * de ses possibilités — perdre une classe entière parce qu'un fichier n'a pas
 * pu s'écrire serait le remède pire que le mal.
 */
async function ecrireSalles(muter: (salles: Record<string, number>) => void): Promise<void> {
  let release: (() => Promise<void>) | null = null;
  try {
    // proper-lockfile refuse un chemin inexistant : on crée le fichier AVANT de
    // demander le verrou (même précaution que dans isRateLimited).
    const existe = await fs.access(LOCK_FILE_PATH).then(() => true).catch(() => false);
    if (!existe) {
      await fs.writeFile(LOCK_FILE_PATH, JSON.stringify({ version: VERSION_VERROUS, salles: {} }), 'utf8');
    }
    release = await lockfile.lock(LOCK_FILE_PATH, {
      retries: { retries: 10, factor: 2, minTimeout: 50, maxTimeout: 500 },
      stale: 2000,
    });
    const salles = await lireSalles();
    const maintenant = Date.now();
    for (const cle of Object.keys(salles)) {
      if (salles[cle] <= maintenant) delete salles[cle]; // purge des salles refermées
    }
    muter(salles);
    await fs.writeFile(LOCK_FILE_PATH, JSON.stringify({ version: VERSION_VERROUS, salles }), 'utf8');
  } catch (error) {
    // Journalisée ICI parce que c'est ici qu'on sait ce qui a échoué, et
    // RELANCÉE parce que seul l'appelant sait si l'échec doit se voir.
    console.error("Erreur lors de l'écriture du verrou d'authentification :", error);
    throw error;
  } finally {
    if (release) {
      try { await release(); } catch (e) { console.error('Erreur de libération du verrou :', e); }
    }
  }
}

/**
 * Échéance (ms epoch) du verrou de CETTE salle, ou 0 si elle est fermée.
 * `null` en entrée — appelant sans salle — vaut fermé : on ne répond jamais
 * « ouvert » à qui n'a pas d'école.
 */
export async function getAuthLockExpiry(cle: CleVerrou | null): Promise<number> {
  if (!cle) return 0;
  const echeance = (await lireSalles())[cle] ?? 0;
  return Date.now() < echeance ? echeance : 0;
}

/** La salle de cette école est-elle ouverte en ce moment ? */
export async function checkAuthLock(cle: CleVerrou | null): Promise<boolean> {
  return (await getAuthLockExpiry(cle)) > 0;
}

/**
 * Ouvre la salle d'UNE école pour la durée demandée (déjà plafonnée par
 * l'appelant). LÈVE si l'état n'a pas pu être écrit : une ouverture qu'on croit
 * acquise et qui n'a pas eu lieu envoie une classe entière buter sur un refus
 * sans comprendre pourquoi.
 */
export async function setAuthLock(cle: CleVerrou, durationInMinutes: number): Promise<void> {
  const minutes = Math.max(0, Math.floor(Number(durationInMinutes) || 0));
  await ecrireSalles(salles => { salles[cle] = Date.now() + minutes * 60_000; });
}

/**
 * Referme la salle d'UNE école avant terme, sans toucher aux autres.
 * Idempotent : refermer une salle déjà fermée atteint le résultat voulu.
 *
 * LÈVE si l'écriture échoue, et c'est le point le plus important du fichier :
 * répondre « Accès fermé » sur une fermeture qui n'a pas eu lieu laisse la
 * salle ouverte jusqu'à son échéance sans que personne ne le sache. Un échec
 * annoncé se répare d'un second clic ; une ouverture qu'on croit refermée ne se
 * répare pas, faute d'être remarquée.
 */
export async function clearAuthLock(cle: CleVerrou): Promise<void> {
  await ecrireSalles(salles => { delete salles[cle]; });
}

function isInTimeRange(startHour: number, startMinute: number, endHour: number, endMinute: number, currentHour: number, currentMinute: number): boolean {
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  const current = currentHour * 60 + currentMinute;
  return current >= start && current <= end;
}

/** L'heure courante tombe-t-elle dans une plage horaire d'ouverture ? */
export function isAccessAllowed(): boolean {
  const timeZone = process.env.SET_TIME_ZONE || 'Europe/Zurich';
  const localTime = DateTime.now().setZone(timeZone);
  const currentDay = localTime.weekday % 7; // luxon : 1 = lundi ; on ramène 0 = dimanche

  let accessHours: Array<{ day: number; start: string; end: string }> = [];
  try {
    accessHours = JSON.parse(AllowedHours || '[]');
  } catch {
    console.error('SECRET_ALLOWED_HOURS est invalide (JSON attendu).');
    return false;
  }

  return accessHours.some(entry => {
    const [startHour, startMinute] = entry.start.split(':').map(Number);
    const [endHour, endMinute] = entry.end.split(':').map(Number);
    return entry.day === currentDay
      && isInTimeRange(startHour, startMinute, endHour, endMinute, localTime.hour, localTime.minute);
  });
}

/** L'IP appelante est-elle une IP d'établissement déclarée ? */
export function isKnownIp(ip: string): boolean {
  return AllowedIps.includes(ip);
}

/**
 * Les clés API du serveur peuvent-elles être dépensées pour cette requête ?
 * Vrai si l'appel vient d'une école — enregistrée en base, ou d'amorçage — ET
 * que cette école-là a sa salle ouverte, ou qu'on est dans l'une de ses plages
 * horaires. Hors de toute école : faux, verrou ou pas verrou.
 *
 * Horaires : chaque établissement définit désormais LES SIENS en base (page
 * /etablissement) ; un établissement sans horaires propres retombe sur les
 * horaires globaux du serveur, et les IP hors base (amorçage SECRET_ALLOWED_IPS)
 * restent régies par ces horaires globaux.
 *
 * ─── CETTE FONCTION NE PREND QU'UNE IP, ET C'EST TOUTE LA RÈGLE ──────────────
 *
 * NE JAMAIS y substituer — ni y ajouter — l'école ACTIVE du compte appelant
 * (src/server/appartenance.ts, ecoleEnseignante). Depuis le multi-écoles,
 * l'école active l'emporte sur l'IP partout où il s'agit d'ENSEIGNER : un
 * enseignant retrouve chez lui son espace, son catalogue et sa modération.
 * Elle ne l'emporte NULLE PART où il s'agit de DÉPENSER.
 *
 * La raison tient en une phrase : payer sur la clé d'une école exige d'être
 * physiquement sur son réseau. Autrement, un enseignant rattaché ferait payer
 * son établissement depuis son salon, un dimanche à minuit, hors de toute
 * séance et sans qu'aucun horaire ne l'arrête — et le porte-monnaie que
 * /etablissement affiche cesserait d'être le budget d'un lieu pour devenir un
 * compte ouvert au nom de chacun de ses membres. Le paramètre est une IP parce
 * que la question posée est « d'où appelle-t-on ? », jamais « qui appelle ? ».
 *
 * ET LE VERROU NE FAIT PLUS EXCEPTION. Il se lisait ICI, en première ligne et
 * avant tout test d'adresse : « site déverrouillé → oui ». Une école ouvrait
 * alors sa salle, la clé de la plateforme répondait au monde entier, et la
 * dépense ne retombait sur aucun budget puisque le décompte n'a lieu qu'`if
 * (etablissementId)` — lequel vient de l'IP. Le verrou se lit désormais APRÈS
 * la résolution de la salle et POUR CETTE SALLE : une ouverture ne peut plus
 * profiter à qui n'est pas sur le réseau qui l'a demandée, et ce qu'elle
 * dépense est imputable à l'école qui a ouvert.
 */
export async function mayUseServerKeys(ip: string): Promise<boolean> {
  // Aucune école derrière cette adresse : ni horaires, ni verrou à invoquer.
  const portee = await salleDepuisIp(ip);
  if (!portee) return false;
  // La salle ouverte par l'enseignant PRIME sur l'horaire — c'est tout l'objet
  // du geste : donner cours en dehors des plages convenues.
  if (await checkAuthLock(portee.cle)) return true;
  const { parseHours, isWithinSchedule } = await import('./etablissements');
  if (portee.etablissement) {
    const own = parseHours(portee.etablissement.hours);
    return own.length > 0 ? isWithinSchedule(own) : isAccessAllowed();
  }
  // Amorçage : l'adresse est déjà reconnue (salleDepuisIp l'a vérifié via
  // isKnownIp), restent les horaires globaux du serveur.
  return isAccessAllowed();
}

/**
 * Limitation de débit par IP ET par périmètre fonctionnel, sur le modèle de
 * failed_attempts.json (proper-lockfile). Le périmètre (`scope`) évite qu'une
 * navigation normale — chat + notes + publication — épuise un compteur commun.
 * Retourne true si la requête doit être REFUSÉE.
 */
export async function isRateLimited(ip: string, maxPerMinute = 30, scope = 'global'): Promise<boolean> {
  const windowMs = 60_000;
  const now = Date.now();
  let release: (() => Promise<void>) | null = null;

  try {
    const exists = await fs.access(RATE_FILE_PATH).then(() => true).catch(() => false);
    if (!exists) await fs.writeFile(RATE_FILE_PATH, JSON.stringify({}), 'utf8');

    release = await lockfile.lock(RATE_FILE_PATH, {
      retries: { retries: 10, factor: 2, minTimeout: 50, maxTimeout: 500 },
      stale: 2000,
    });

    let data: Record<string, { count: number; windowStart: number }> = {};
    try {
      data = JSON.parse(await fs.readFile(RATE_FILE_PATH, 'utf8'));
    } catch {
      data = {};
    }

    // Purge des fenêtres expirées : évite que le fichier grossisse indéfiniment.
    for (const key of Object.keys(data)) {
      if (now - data[key].windowStart > windowMs) delete data[key];
    }

    const key = `${scope}|${ip}`;
    const entry = data[key];
    if (!entry || now - entry.windowStart > windowMs) {
      data[key] = { count: 1, windowStart: now };
    } else {
      entry.count += 1;
    }

    const limited = data[key].count > maxPerMinute;
    await fs.writeFile(RATE_FILE_PATH, JSON.stringify(data), 'utf8');
    return limited;
  } catch (error) {
    console.error('Erreur lors de la limitation de débit :', error);
    return false; // en cas d'incident, ne pas bloquer les usages légitimes
  } finally {
    if (release) {
      try { await release(); } catch (e) { console.error('Erreur de libération du verrou :', e); }
    }
  }
}
