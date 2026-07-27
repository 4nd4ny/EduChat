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
import { AllowedHours, AllowedIps, DataDir, ProxyToken, TrustedProxyIps } from '../utils/env';

export const LOCK_FILE_PATH = path.join(DataDir, 'auth_lock.json');
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
  // Aucun contrôle configuré : comportement historique, NON durci.
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

/** Échéance du verrou global (ms epoch), ou 0 si le site est verrouillé. */
export async function getAuthLockExpiry(): Promise<number> {
  try {
    const exists = await fs.access(LOCK_FILE_PATH).then(() => true).catch(() => false);
    if (!exists) return 0;
    const lockData = JSON.parse(await fs.readFile(LOCK_FILE_PATH, 'utf8'));
    return Date.now() < lockData.timestamp ? lockData.timestamp : 0;
  } catch {
    return 0;
  }
}

/** Le site est-il actuellement déverrouillé (verrou global posé par /api/auth) ? */
export async function checkAuthLock(): Promise<boolean> {
  try {
    const exists = await fs.access(LOCK_FILE_PATH).then(() => true).catch(() => false);
    if (!exists) return false;
    const lockData = JSON.parse(await fs.readFile(LOCK_FILE_PATH, 'utf8'));
    if (Date.now() < lockData.timestamp) return true;
    await fs.unlink(LOCK_FILE_PATH); // verrou expiré
  } catch (error) {
    console.error("Erreur lors de la vérification du verrou d'authentification:", error);
  }
  return false;
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
 * Vrai si le site est déverrouillé, ou si l'appel vient d'une IP d'établissement
 * pendant une plage horaire autorisée.
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
 */
export async function mayUseServerKeys(ip: string): Promise<boolean> {
  if (await checkAuthLock()) return true;
  const { resolveEtablissementByIp, parseHours, isWithinSchedule } = await import('./etablissements');
  const etab = resolveEtablissementByIp(ip);
  if (etab) {
    const own = parseHours(etab.hours);
    return own.length > 0 ? isWithinSchedule(own) : isAccessAllowed();
  }
  return isKnownIp(ip) && isAccessAllowed();
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
