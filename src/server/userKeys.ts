// Clés API mémorisées par compte — accès unique à la table user_keys.
//
// Règle de conception : une clé mémorisée ne repart JAMAIS vers le
// navigateur. Le client sait seulement QUELS fournisseurs ont une clé
// enregistrée ; le serveur la déchiffre au moment d'appeler le fournisseur.

import { getDb } from './db';
import { open, seal } from './secretbox';
import { isProviderId, type ProviderId } from '../shared/providers';

export function storeUserKey(email: string, provider: ProviderId, apiKey: string) {
  getDb().prepare(`
    INSERT INTO user_keys (email, provider, key_enc, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(email, provider) DO UPDATE SET key_enc = excluded.key_enc, updated_at = excluded.updated_at
  `).run(email, provider, seal(apiKey), Date.now());
}

export function forgetUserKey(email: string, provider?: ProviderId) {
  // Données techniques de l'utilisateur, effaçables à sa demande : la règle
  // « on ne supprime jamais rien » protège la facturation et les
  // publications, jamais un secret que son propriétaire retire.
  if (provider) getDb().prepare('DELETE FROM user_keys WHERE email = ? AND provider = ?').run(email, provider);
  else getDb().prepare('DELETE FROM user_keys WHERE email = ?').run(email);
}

/** Fournisseurs pour lesquels ce compte a une clé mémorisée. */
export function listUserKeyProviders(email: string): ProviderId[] {
  const rows = getDb().prepare('SELECT provider, key_enc FROM user_keys WHERE email = ?')
    .all(email) as { provider: string; key_enc: string }[];
  // Une clé que l'on ne sait plus déchiffrer (SECRET_TOKEN_KEY changée) ne
  // doit pas être annoncée comme disponible : l'interface promettrait un
  // secret inutilisable et masquerait le champ de saisie.
  return rows.filter(r => open(r.key_enc) !== null).map(r => r.provider).filter(isProviderId);
}

/**
 * Inventaire des clés mémorisées, pour la page « Mes données ».
 *
 * Contrairement à listUserKeyProviders, celui-ci ne CACHE RIEN : une clé
 * devenue indéchiffrable (SECRET_TOKEN_KEY changée) reste une donnée
 * conservée par le serveur — répondre « aucune clé » à une demande d'accès
 * serait faux, et l'intéressé ne pourrait plus l'effacer.
 * Le secret lui-même ne sort jamais, sous aucune forme : ni en clair, ni
 * tronqué, ni en empreinte.
 */
export function listUserKeys(email: string): { provider: ProviderId; updatedAt: number; readable: boolean }[] {
  const rows = getDb().prepare(
    'SELECT provider, key_enc, updated_at AS updatedAt FROM user_keys WHERE email = ? ORDER BY provider')
    .all(email) as { provider: string; key_enc: string; updatedAt: number }[];
  return rows
    .filter(r => isProviderId(r.provider))
    .map(r => ({
      provider: r.provider as ProviderId,
      updatedAt: r.updatedAt,
      readable: open(r.key_enc) !== null,
    }));
}

/** Clé en clair pour un appel au fournisseur, ou null. */
export function readUserKey(email: string, provider: ProviderId): string | null {
  const row = getDb().prepare('SELECT key_enc FROM user_keys WHERE email = ? AND provider = ?')
    .get(email, provider) as { key_enc: string } | undefined;
  return row ? open(row.key_enc) : null;
}

/** Le compte a-t-il accepté la mémorisation des clés ? */
export function keysOptin(email: string): boolean {
  const row = getDb().prepare('SELECT keys_optin FROM users WHERE email = ?').get(email) as
    { keys_optin: number } | undefined;
  return !!row?.keys_optin;
}

export function setKeysOptin(email: string, optin: boolean) {
  getDb().prepare('UPDATE users SET keys_optin = ? WHERE email = ?').run(optin ? 1 : 0, email);
  // Refus = les clés déjà mémorisées disparaissent, sans quoi la case
  // décochée mentirait sur l'état réel du serveur.
  if (!optin) forgetUserKey(email);
}
