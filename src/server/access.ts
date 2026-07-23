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
import { AllowedHours, AllowedIps, DataDir } from '../utils/env';

export const LOCK_FILE_PATH = path.join(DataDir, 'auth_lock.json');
const RATE_FILE_PATH = path.join(DataDir, 'rate_limit.json');

/**
 * Adresse IP réelle du client — CONTRÔLE DE COHÉRENCE anti-usurpation.
 *
 * L'IP identifie l'établissement (accès, quotas, facturation) : elle ne doit
 * pas pouvoir être forgée. Or l'en-tête X-Forwarded-For est fourni par le
 * CLIENT : notre reverse proxy (Nginx Proxy Manager) y AJOUTE l'adresse réelle
 * sans effacer ce que le client a mis en premier — s'y fier permettrait à
 * n'importe qui de se faire passer pour une école et de consommer son budget.
 *
 * On ne fait donc confiance qu'à X-Real-IP, que NPM ÉCRASE systématiquement
 * avec l'adresse de la connexion, puis à l'adresse socket (accès direct en
 * développement). Jamais à X-Forwarded-For.
 */
export function getClientIp(req: NextApiRequest): string {
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && isIP(real)) return real;
  const socketIp = (req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
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
