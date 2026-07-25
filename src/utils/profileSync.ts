// Synchronisation du profil avec le serveur (étape 15, opt-in).
//
// Stratégie volontairement simple : à chaque synchronisation, le profil
// serveur est d'abord FUSIONNÉ localement (applyProfile est additif : rien
// n'est écrasé), puis l'état local fusionné est renvoyé au serveur. Les deux
// côtés convergent, « le plus récent gagne » au niveau du profil entier.

import { getToken } from './account';
import { applyProfile, buildProfile, isProfile } from './profile';

export type SyncResult =
  | { ok: true; mergedConversations: number }
  | { ok: false; reason: 'auth' | 'optout' | 'error' };

export async function syncProfile(): Promise<SyncResult> {
  const token = getToken();
  if (!token) return { ok: false, reason: 'auth' };
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  let merged = 0;
  try {
    // 1. Récupérer et fusionner le profil serveur (additif, jamais destructif).
    const getResponse = await fetch('/api/profile', { headers });
    if (getResponse.status === 401) return { ok: false, reason: 'auth' };
    if (getResponse.ok) {
      const data = await getResponse.json();
      if (data.profile && isProfile(data.profile)) {
        merged = applyProfile(data.profile).conversations;
      }
    }

    // 2. Renvoyer l'état local fusionné.
    const putResponse = await fetch('/api/profile', {
      method: 'PUT', headers,
      body: JSON.stringify({ profile: buildProfile() }),
    });
    if (putResponse.status === 403) return { ok: false, reason: 'optout' };
    if (!putResponse.ok) return { ok: false, reason: 'error' };
    return { ok: true, mergedConversations: merged };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/**
 * Sauvegarde AUTOMATIQUE : pousse l'état local vers le serveur, sans jamais
 * ramener le profil distant. La fusion (additive) reste réservée à la
 * synchronisation explicite — sinon une conversation supprimée ici
 * réapparaîtrait à la sauvegarde suivante.
 */
export async function pushProfile(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  try {
    const response = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ profile: buildProfile() }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function deleteServerProfile(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  const response = await fetch('/api/profile', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  return response.ok;
}
