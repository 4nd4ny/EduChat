// Compte vérifié côté navigateur : jeton HMAC en localStorage 'educhat-token'.
// Le jeton n'est qu'une preuve d'identité pour ÉCRIRE (publier, administrer) ;
// le serveur relit les rôles en base à chaque requête sensible.

const TOKEN_KEY = 'educhat-token';

export type Account = { name: string; email: string; exp: number };

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

/** En-têtes d'authentification pour les endpoints d'écriture. */
export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
