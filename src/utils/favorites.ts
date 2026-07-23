// Favoris et notes : purement locaux au navigateur (décision client).
// Transportables via l'export de profil (étape 11) et la sync opt-in (étape 15).

const FAVORITES_KEY = 'prompt-favorites';
const RATINGS_KEY = 'prompt-ratings';

export function getFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); } catch { return []; }
}

export function toggleFavorite(name: string): string[] {
  const current = getFavorites();
  const next = current.includes(name) ? current.filter(n => n !== name) : [...current, name];
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  return next;
}

/** Note déjà donnée à un prompt (anti-revote local, assumé « assez bon »). */
export function getGivenRating(name: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const all = JSON.parse(localStorage.getItem(RATINGS_KEY) || '{}');
    return typeof all[name] === 'number' ? all[name] : null;
  } catch { return null; }
}

export function storeGivenRating(name: string, stars: number) {
  try {
    const all = JSON.parse(localStorage.getItem(RATINGS_KEY) || '{}');
    all[name] = stars;
    localStorage.setItem(RATINGS_KEY, JSON.stringify(all));
  } catch { /* stockage indisponible : la note reste côté serveur */ }
}
