// Doublure minimale d'un NAVIGATEUR pour le code client de synchronisation
// (src/utils/profile.ts, src/utils/profileSync.ts, src/context/History.tsx) :
// un localStorage en mémoire et un objet window qui sait émettre des
// événements. Plusieurs navigateurs peuvent coexister ; utiliser() désigne
// celui que voit le code client.
import { vi } from 'vitest';

export type Navigateur = {
  nom: string;
  stockage: Map<string, string>;
  evenements: string[];
  localStorage: Storage;
  window: any;
};

export function creerNavigateur(nom = 'navigateur'): Navigateur {
  const stockage = new Map<string, string>();
  const evenements: string[] = [];
  const localStorage: Storage = {
    get length() { return stockage.size; },
    clear: () => stockage.clear(),
    getItem: (k: string) => (stockage.has(k) ? stockage.get(k)! : null),
    key: (i: number) => Array.from(stockage.keys())[i] ?? null,
    removeItem: (k: string) => { stockage.delete(k); },
    setItem: (k: string, v: string) => { stockage.set(k, String(v)); },
  };
  const window = {
    dispatchEvent: (e: Event) => { evenements.push(e.type); return true; },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return { nom, stockage, evenements, localStorage, window };
}

/** Le code client verra désormais CE navigateur. */
export function utiliser(nav: Navigateur) {
  vi.stubGlobal('localStorage', nav.localStorage);
  vi.stubGlobal('window', nav.window);
}

/** Raccourcis de lecture/écriture du stockage d'un navigateur. */
export function historique(nav: Navigateur): Record<string, any> {
  return JSON.parse(nav.stockage.get('pg-history') ?? '{}');
}
export function poserHistorique(nav: Navigateur, h: Record<string, any>) {
  nav.stockage.set('pg-history', JSON.stringify(h));
}

export const conversation = (nom: string, t: number, messages: unknown[] = [{ role: 'user', content: nom }]) =>
  ({ name: nom, createdAt: t, lastMessage: t, messages });
