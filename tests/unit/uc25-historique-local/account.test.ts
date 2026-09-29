// UC-25 — Tests unitaires : jeton de compte côté navigateur et en-têtes
// d'authentification (src/utils/account.ts).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installerNavigateur, retirerNavigateur, type Navigateur } from './navigateur';
import {
  getToken, storeToken, clearToken, getAccount, authHeaders, getEcoleActive, setEcoleActive,
} from '../../../src/utils/account';
import { issueToken } from '../../../src/server/token';

let nav: Navigateur;
beforeEach(() => { nav = installerNavigateur(); });
afterEach(() => { retirerNavigateur(); vi.useRealTimers(); });

/** Jeton dont la charge est forgée à la main (signature factice). */
const jetonForge = (charge: unknown) => `${Buffer.from(JSON.stringify(charge)).toString('base64url')}.signature`;

describe('jeton de compte', () => {
  it('storeToken range educhat-token et émet accountChanged ; clearToken l’efface', () => {
    expect(getToken()).toBeNull();
    storeToken('abc.def');
    expect(nav.stockage.getItem('educhat-token')).toBe('abc.def');
    expect(getToken()).toBe('abc.def');
    clearToken();
    expect(getToken()).toBeNull();
    expect(nav.evenements).toEqual(['accountChanged', 'accountChanged']);
  });

  it('côté serveur (pas de window) : aucun jeton', () => {
    nav.stockage.setItem('educhat-token', 'abc');
    vi.stubGlobal('window', undefined);
    expect(getToken()).toBeNull();
  });
});

describe('getAccount', () => {
  it('décode la charge d’un vrai jeton émis par le serveur (base64url sans remplissage)', () => {
    storeToken(issueToken('Élodie Ümlaut', 'elodie@ecole.ch'));
    const compte = getAccount()!;
    expect(compte.email).toBe('elodie@ecole.ch');
    expect(compte.exp).toBeGreaterThan(Date.now());
  });

  it('ne vérifie PAS la signature (rôle du serveur) : un jeton forgé est décodé', () => {
    storeToken(jetonForge({ name: 'X', email: 'x@y.ch', exp: Date.now() + 60_000 }));
    expect(getAccount()?.email).toBe('x@y.ch');
  });

  it('renvoie null pour un jeton expiré, illisible ou sans adresse', () => {
    storeToken(jetonForge({ email: 'x@y.ch', exp: Date.now() - 1 }));
    expect(getAccount()).toBeNull();
    storeToken('!!!.sig');
    expect(getAccount()).toBeNull();
    storeToken(jetonForge({ name: 'sans adresse', exp: Date.now() + 60_000 }));
    expect(getAccount()).toBeNull();
  });

  it('une charge SANS exp numérique est tenue pour invalide (comme côté serveur)', () => {
    storeToken(jetonForge({ email: 'x@y.ch' }));
    expect(getAccount()).toBeNull();
    storeToken(jetonForge({ email: 'x@y.ch', exp: String(Date.now() + 60_000) }));
    expect(getAccount()).toBeNull();
  });

  it('aucun jeton : null', () => {
    expect(getAccount()).toBeNull();
  });
});

describe('école active et en-têtes', () => {
  it('getEcoleActive n’accepte qu’un entier strictement positif', () => {
    expect(getEcoleActive()).toBeNull();
    for (const brut of ['abc', '0', '-3', '2.5', '']) {
      nav.stockage.setItem('educhat-ecole', brut);
      expect(getEcoleActive()).toBeNull();
    }
    nav.stockage.setItem('educhat-ecole', '7');
    expect(getEcoleActive()).toBe(7);
  });

  it('setEcoleActive pose puis efface le choix et émet ecoleChanged', () => {
    setEcoleActive(4);
    expect(nav.stockage.getItem('educhat-ecole')).toBe('4');
    setEcoleActive(null);
    expect(nav.stockage.getItem('educhat-ecole')).toBeNull();
    expect(nav.evenements).toEqual(['ecoleChanged', 'ecoleChanged']);
  });

  it('authHeaders : vide sans jeton, même si une école est choisie', () => {
    setEcoleActive(4);
    expect(authHeaders()).toEqual({});
  });

  it('authHeaders : Bearer seul, puis Bearer + x-educhat-ecole', () => {
    storeToken('abc.def');
    expect(authHeaders()).toEqual({ Authorization: 'Bearer abc.def' });
    setEcoleActive(4);
    expect(authHeaders()).toEqual({ Authorization: 'Bearer abc.def', 'x-educhat-ecole': '4' });
  });
});
