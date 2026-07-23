// Export / import du PROFIL complet du navigateur : conversations, favoris,
// notes données et compteur de tokens. C'est le format de portabilité entre
// navigateurs (exigence n°11) — et la future charge utile de la
// synchronisation serveur opt-in (étape 15).

import { getHistory, History } from '../context/History';

export const PROFILE_FORMAT = 1;

export type Profile = {
  educhatProfile: number;
  exportedAt: number;
  conversations: History;
  favorites: string[];
  ratings: Record<string, number>;
  totalTokens: number;
};

export function buildProfile(): Profile {
  const read = (key: string, fallback: string) => {
    try { return JSON.parse(localStorage.getItem(key) || fallback); } catch { return JSON.parse(fallback); }
  };
  return {
    educhatProfile: PROFILE_FORMAT,
    exportedAt: Date.now(),
    conversations: getHistory(),
    favorites: read('prompt-favorites', '[]'),
    ratings: read('prompt-ratings', '{}'),
    totalTokens: parseInt(localStorage.getItem('totalTokens') || '0', 10) || 0,
  };
}

export function isProfile(data: any): data is Profile {
  return !!data && typeof data === 'object' && typeof data.educhatProfile === 'number';
}

/**
 * Applique un profil importé en FUSIONNANT avec l'existant : les conversations
 * du fichier s'ajoutent (celles du navigateur sont conservées), favoris et
 * notes s'unissent, le compteur de tokens prend le maximum des deux.
 * Le jeton de compte (educhat-token) n'est JAMAIS inclus ni écrasé.
 */
export function applyProfile(profile: Profile): { conversations: number } {
  if (!profile.conversations || typeof profile.conversations !== 'object') {
    throw new Error('Profil invalide : aucune conversation.');
  }
  const existing = getHistory();
  let added = 0;
  for (const [id, conversation] of Object.entries(profile.conversations)) {
    if (!existing[id] && conversation && Array.isArray((conversation as any).messages)) {
      existing[id] = conversation;
      added += 1;
    }
  }
  localStorage.setItem('pg-history', JSON.stringify(existing));

  const favorites = new Set<string>([
    ...JSON.parse(localStorage.getItem('prompt-favorites') || '[]'),
    ...(Array.isArray(profile.favorites) ? profile.favorites : []),
  ]);
  localStorage.setItem('prompt-favorites', JSON.stringify(Array.from(favorites)));

  const ratings = {
    ...(profile.ratings && typeof profile.ratings === 'object' ? profile.ratings : {}),
    ...JSON.parse(localStorage.getItem('prompt-ratings') || '{}'),
  };
  localStorage.setItem('prompt-ratings', JSON.stringify(ratings));

  const localTokens = parseInt(localStorage.getItem('totalTokens') || '0', 10) || 0;
  localStorage.setItem('totalTokens', String(Math.max(localTokens, Number(profile.totalTokens) || 0)));
  window.dispatchEvent(new Event('totalTokensUpdated'));

  return { conversations: added };
}

export function downloadProfile() {
  const blob = new Blob([JSON.stringify(buildProfile(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `educhat-profil-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
