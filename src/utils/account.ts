// Compte vérifié côté navigateur : jeton HMAC en localStorage 'educhat-token'.
// Le jeton n'est qu'une preuve d'identité pour ÉCRIRE (publier, administrer) ;
// le serveur relit les rôles en base à chaque requête sensible.

const TOKEN_KEY = 'educhat-token';

/**
 * ÉCOLE ACTIVE — le choix, et rien d'autre.
 *
 * Un compte peut appartenir à plusieurs écoles (décision B). Ce qui est rangé
 * ici est une PRÉFÉRENCE d'affichage : l'identifiant voyage dans l'en-tête
 * `x-educhat-ecole`, et le serveur le REVÉRIFIE contre la table de liaison à
 * chaque requête (src/server/appartenance.ts). Écrire n'importe quoi dans ce
 * localStorage ne donne donc accès à rien — au pire, le serveur retombe sur
 * l'école principale et /api/me renvoie la correction.
 */
const ECOLE_KEY = 'educhat-ecole';

/** L'en-tête qui porte le choix — doit rester égal à ENTETE_ECOLE côté serveur. */
const ENTETE_ECOLE = 'x-educhat-ecole';

export type Account = { name: string; email: string; exp: number };

/** L'école active choisie dans ce navigateur, ou null (aucun choix posé). */
export function getEcoleActive(): number | null {
  if (typeof window === 'undefined') return null;
  const brut = Number(localStorage.getItem(ECOLE_KEY));
  return Number.isInteger(brut) && brut > 0 ? brut : null;
}

/**
 * Poser (ou effacer) l'école active. L'événement permet aux écrans déjà
 * montés de se relire : sans lui, le sélecteur changerait l'en-tête des
 * requêtes SUIVANTES tout en laissant à l'écran les chiffres de l'école
 * précédente — le pire des deux mondes.
 */
export function setEcoleActive(id: number | null) {
  if (id === null) localStorage.removeItem(ECOLE_KEY);
  else localStorage.setItem(ECOLE_KEY, String(id));
  window.dispatchEvent(new Event('ecoleChanged'));
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event('accountChanged'));
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event('accountChanged'));
}

/** Identité du compte local (décodage du payload, sans vérification de la
 *  signature — celle-ci n'appartient qu'au serveur). */
export function getAccount(): Account | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload?.email !== 'string' || Date.now() > payload.exp) return null;
    return payload as Account;
  } catch {
    return null;
  }
}

/**
 * En-têtes d'authentification pour les endpoints d'écriture.
 *
 * L'école active y est jointe quand elle est posée : toutes les gardes serveur
 * la lisent déjà (requireAdmin, ecoleActive), il n'y a donc RIEN d'autre à
 * câbler route par route. Elle n'accompagne que le jeton : sans identité, un
 * choix d'école ne veut rien dire.
 */
export function authHeaders(): Record<string, string> {
  const token = getToken();
  if (!token) return {};
  const ecole = getEcoleActive();
  return ecole === null
    ? { Authorization: `Bearer ${token}` }
    : { Authorization: `Bearer ${token}`, [ENTETE_ECOLE]: String(ecole) };
}
