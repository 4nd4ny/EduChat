// Doublure du réseau sortant (fetch global) : les fournisseurs d'IA, PayPal,
// OpenRouter ne sont jamais joints pendant les tests.
import { vi } from 'vitest';

export type Reponse = { status?: number; json?: unknown; text?: string; headers?: Record<string, string> };
export type Routeur = (url: string, init?: RequestInit) => Reponse | Promise<Reponse>;

/** Installe une doublure de fetch ; renvoie l'espion pour inspecter les appels. */
export function doublerFetch(routeur: Routeur) {
  const espion = vi.fn(async (entree: any, init?: RequestInit) => {
    const url = typeof entree === 'string' ? entree : entree?.url ?? String(entree);
    const r = await routeur(url, init);
    const corps = r.text ?? (r.json !== undefined ? JSON.stringify(r.json) : '');
    return new Response(corps, { status: r.status ?? 200, headers: r.headers ?? { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', espion);
  return espion;
}
