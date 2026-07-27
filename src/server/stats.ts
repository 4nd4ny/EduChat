// Statistiques publiques de popularité du site + présence « en ligne ».
//
// Tout est calculé À PARTIR DES DONNÉES DÉJÀ EN BASE (comptes, prompts,
// journal de consommation) : aucun traceur, aucun cookie, aucune donnée
// nouvelle sur les visiteurs.
//
// La seule table ajoutée est `presence`, volontairement ANONYME et ÉPHÉMÈRE :
// elle ne contient qu'une empreinte HMAC non réversible (jamais l'IP ni le
// clientId en clair) et une date de dernière activité, purgée au bout de
// quelques minutes. Cette purge est une exigence de minimisation — elle ne
// contredit pas la règle « on ne supprime jamais rien », qui protège les
// données de facturation et de publication.

import crypto from 'crypto';
import { getDb } from './db';
import { FreeDailyUsd, FreePricePerMtok, TokenKey } from '../utils/env';
import { fournisseurLibre } from './accesFournisseurs';

/** Fenêtre pendant laquelle un visiteur est compté « en ligne ». */
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
/** Au-delà, la ligne de présence n'a plus aucune utilité : elle est purgée. */
const PRESENCE_TTL_MS = 15 * 60 * 1000;
/** Les statistiques sont recalculées au plus une fois par tranche de 5 s. */
const CACHE_MS = 5000;

let lastPurge = 0;

/** Empreinte non réversible d'un visiteur (jamais stockée en clair). */
function fingerprint(source: string): string {
  return crypto.createHmac('sha256', TokenKey).update(source).digest('hex').slice(0, 16);
}

/**
 * Purge des présences périmées. Appelée depuis les DEUX chemins (activité et
 * lecture des compteurs) : sans cela, un site sans trafic conserverait ses
 * empreintes indéfiniment, en contradiction avec la TTL annoncée.
 */
function purgePresence(db: ReturnType<typeof getDb>, now: number, force = false) {
  if (!force && now - lastPurge < 60_000) return;
  lastPurge = now;
  db.prepare('DELETE FROM presence WHERE last_seen < ?').run(now - PRESENCE_TTL_MS);
}

/**
 * Marque un visiteur comme actif « maintenant ». Appelé à CHAQUE consultation
 * des compteurs (donc dès l'ouverture de l'accueil, puis à chaque
 * rafraîchissement) et à chaque complétion : le compteur reflète la présence
 * réelle sur le site, pas seulement celle des personnes qui discutent.
 *
 * L'identifiant vient du navigateur (uuid anonyme) : il n'est ni vérifiable ni
 * infalsifiable — ce compteur de fréquentation est une indication, pas une
 * mesure d'audience opposable. C'est le prix à payer pour ne rien traquer.
 */
export function touchPresence(clientId: string, clientIp: string) {
  try {
    const db = getDb();
    const now = Date.now();
    db.prepare(`
      INSERT INTO presence (id, last_seen) VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen
    `).run(fingerprint(clientId || `ip:${clientIp}`), now);
    purgePresence(db, now);
  } catch (error) {
    // Une statistique ne fait jamais échouer une conversation.
    console.error('Présence non enregistrée :', error);
  }
}

export type SiteStats = {
  accounts: number;
  prompts: number;
  tokens: number;
  online: number;
  /** Crédits gratuits restants aujourd'hui, en USD — null si pas de repli gratuit. */
  freeCreditsUsd: number | null;
  freeBudgetUsd: number | null;
};

let cache: { at: number; value: SiteStats } | null = null;

export function getSiteStats(): SiteStats {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.value;

  const db = getDb();
  // La lecture des compteurs est le chemin le plus fréquenté du site : c'est
  // là que la purge des présences périmées a le plus de chances de tourner.
  purgePresence(db, now);
  const one = (sql: string, ...params: unknown[]) =>
    (db.prepare(sql).get(...params as []) as { v: number }).v;

  const accounts = one('SELECT COUNT(*) AS v FROM users WHERE verified_at IS NOT NULL');
  const prompts = one("SELECT COUNT(*) AS v FROM prompts WHERE status = 'published' AND archived = 0");

  // Total des tokens produits par le site, SANS double compte : les échanges
  // avec un tuteur sont cumulés sur la fiche du tuteur (tous modes confondus,
  // clé personnelle incluse) ; le chat libre n'y figure pas et n'est connu que
  // du journal, uniquement pour les clés gérées (prompt_id NULL).
  const tokens =
    one('SELECT COALESCE(SUM(tokens_total), 0) AS v FROM prompts') +
    one('SELECT COALESCE(SUM(tokens), 0) AS v FROM usage_log WHERE prompt_id IS NULL');

  const online = one('SELECT COUNT(*) AS v FROM presence WHERE last_seen > ?', now - ONLINE_WINDOW_MS);

  // Crédits gratuits du jour : le repli gratuit public tourne sur la clé
  // serveur, journalisée SANS IP (used_server_key = 1 AND ip = ''). Les modèles
  // « :free » ne coûtent rien ; seul le filet payant de la cascade consomme le
  // budget quotidien. Estimation volontairement prudente et transparente.
  let freeCreditsUsd: number | null = null;
  let freeBudgetUsd: number | null = null;
  // Mêmes conditions que la route de complétion : annoncer un budget alors que
  // le repli gratuit ne répond pas serait un mensonge affiché en permanence.
  // La MÊME fonction, et non les mêmes conditions recopiées : elle refuse aussi
  // un repli configuré sur un fournisseur écarté, que /api/completion ne sert
  // plus. Deux copies de la condition auraient fini par afficher un budget
  // quotidien pour un repli que le serveur refuse.
  const freeServed = fournisseurLibre() !== null;
  if (freeServed) {
    const day = new Date(now);
    const dayStart = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    const paidTokens = one(`
      SELECT COALESCE(SUM(CASE WHEN model LIKE '%:free' THEN 0 ELSE tokens END), 0) AS v
      FROM usage_log WHERE used_server_key = 1 AND ip = '' AND ts >= ?
    `, dayStart);
    const spent = (paidTokens / 1_000_000) * FreePricePerMtok;
    freeBudgetUsd = FreeDailyUsd;
    freeCreditsUsd = Math.max(0, Math.round((FreeDailyUsd - spent) * 100) / 100);
  }

  const value: SiteStats = { accounts, prompts, tokens, online, freeCreditsUsd, freeBudgetUsd };
  cache = { at: now, value };
  return value;
}
