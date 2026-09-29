// UC-25 — Doublure minimale d'un navigateur pour l'environnement 'node'.
//
// jsdom n'est pas installé : on fournit juste ce que le code côté navigateur
// touche réellement — localStorage, window.dispatchEvent, document.createElement('a')
// (téléchargement) et URL.createObjectURL. Chaque appel à installerNavigateur()
// pose un navigateur NEUF (ou réinstalle un navigateur existant) : c'est ce qui
// permet de simuler « un autre navigateur » dans les tests fonctionnels.
//
// Ce fichier n'est pas un *.test.ts : vitest ne le collecte pas, il est
// importé par les tests unitaires ET fonctionnels de l'UC-25.
import { vi } from 'vitest';

/** localStorage en mémoire, conforme à l'interface Storage. */
export class StockageMemoire implements Storage {
  private donnees = new Map<string, string>();
  get length() { return this.donnees.size; }
  clear() { this.donnees.clear(); }
  getItem(cle: string) { return this.donnees.has(cle) ? this.donnees.get(cle)! : null; }
  key(i: number) { return Array.from(this.donnees.keys())[i] ?? null; }
  removeItem(cle: string) { this.donnees.delete(cle); }
  setItem(cle: string, valeur: string) { this.donnees.set(cle, String(valeur)); }
  /** Instantané lisible (clé → valeur brute), pour les assertions. */
  instantane(): Record<string, string> { return Object.fromEntries(this.donnees); }
}

export type Telechargement = { nom: string; contenu: Promise<string>; type: string };

export type Navigateur = {
  stockage: StockageMemoire;
  /** Types des événements émis via window.dispatchEvent, dans l'ordre. */
  evenements: string[];
  /** Fichiers « téléchargés » par un clic sur un lien <a download>. */
  telechargements: Telechargement[];
  /** Pose ce navigateur comme navigateur courant (globals window/localStorage/document). */
  activer: () => void;
};

/** Crée un navigateur (stockage vide par défaut) et l'active. */
export function installerNavigateur(stockage = new StockageMemoire()): Navigateur {
  const evenements: string[] = [];
  const telechargements: Telechargement[] = [];
  const blobs = new Map<string, Blob>();
  let n = 0;

  const activer = () => {
    vi.stubGlobal('localStorage', stockage);
    vi.stubGlobal('window', {
      localStorage: stockage,
      dispatchEvent: (e: Event) => { evenements.push(e.type); return true; },
    });
    vi.stubGlobal('document', {
      documentElement: { lang: '' },
      createElement: (_balise: string) => {
        const a = {
          href: '', download: '',
          click() {
            const blob = blobs.get(a.href);
            telechargements.push({ nom: a.download, contenu: blob ? blob.text() : Promise.resolve(''), type: blob?.type ?? '' });
          },
        };
        return a;
      },
    });
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b: any) => {
      const url = `blob:test/${++n}`;
      blobs.set(url, b);
      return url;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  };
  activer();
  return { stockage, evenements, telechargements, activer };
}

/** Retire toutes les doublures (à appeler en afterEach). */
export function retirerNavigateur() {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}
