// UC-08 — Tests unitaires : client de synchronisation
// (src/utils/profileSync.ts : syncProfile, pushProfile,
// deleteServerConversations, deleteServerProfile). Le serveur est remplacé
// par une doublure de fetch : on vérifie ce que le client ENVOIE et comment il
// réagit à chaque réponse.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { creerNavigateur, utiliser, historique, poserHistorique, conversation, type Navigateur } from './doublureNavigateur';
import { doublerFetch } from '../../helpers/fetch';
import { syncProfile, pushProfile, deleteServerConversations, deleteServerProfile } from '../../../src/utils/profileSync';

let nav: Navigateur;
beforeEach(() => {
  nav = creerNavigateur();
  utiliser(nav);
  nav.stockage.set('educhat-token', 'jeton-de-test');
});
afterEach(() => { vi.unstubAllGlobals(); });

const methode = (init?: RequestInit) => init?.method ?? 'GET';

describe('syncProfile', () => {
  it('sans jeton : « auth », aucun appel', async () => {
    nav.stockage.delete('educhat-token');
    const espion = doublerFetch(() => ({ json: {} }));
    expect(await syncProfile()).toEqual({ ok: false, reason: 'auth' });
    expect(espion).not.toHaveBeenCalled();
  });

  it('fusionne le profil distant, retire les conversations effacées, puis renvoie l’état fusionné', async () => {
    poserHistorique(nav, { locale: conversation('Locale', 1), effacee: conversation('Effacée', 2) });
    const espion = doublerFetch((_url, init) => (methode(init) === 'GET'
      ? { json: { profile: { educhatProfile: 1, conversations: { distante: conversation('Distante', 3) }, favorites: [], ratings: {}, totalTokens: 0 }, deletedConversations: ['effacee'] } }
      : { json: { ok: true, updatedAt: 1 } }));
    expect(await syncProfile()).toEqual({ ok: true, mergedConversations: 1 });
    expect(Object.keys(historique(nav)).sort()).toEqual(['distante', 'locale']);

    const [, initGet] = espion.mock.calls[0];
    expect((initGet as any).headers.Authorization).toBe('Bearer jeton-de-test');
    const [urlPut, initPut] = espion.mock.calls[1];
    expect(urlPut).toBe('/api/profile');
    expect(initPut!.method).toBe('PUT');
    const envoye = JSON.parse(String(initPut!.body)).profile;
    expect(Object.keys(envoye.conversations).sort()).toEqual(['distante', 'locale']);
  });

  it('401 à la lecture : « auth » ; 403 à l’écriture : « optout » ; autre échec : « error »', async () => {
    doublerFetch(() => ({ status: 401, json: {} }));
    expect(await syncProfile()).toEqual({ ok: false, reason: 'auth' });
    doublerFetch((_u, init) => (methode(init) === 'GET' ? { json: { profile: null } } : { status: 403, json: {} }));
    expect(await syncProfile()).toEqual({ ok: false, reason: 'optout' });
    doublerFetch((_u, init) => (methode(init) === 'GET' ? { json: { profile: null } } : { status: 500, json: {} }));
    expect(await syncProfile()).toEqual({ ok: false, reason: 'error' });
  });

  it('une lecture en échec (hors 401) n’empêche pas de pousser l’état local', async () => {
    const espion = doublerFetch((_u, init) => (methode(init) === 'GET' ? { status: 429, json: {} } : { json: { ok: true } }));
    expect(await syncProfile()).toEqual({ ok: true, mergedConversations: 0 });
    expect(espion).toHaveBeenCalledTimes(2);
  });

  it('une coupure réseau donne « error » sans lever', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('hors ligne'); }));
    expect(await syncProfile()).toEqual({ ok: false, reason: 'error' });
  });
});

describe('pushProfile (sauvegarde automatique)', () => {
  it('pousse l’état local SANS rien ramener du serveur', async () => {
    poserHistorique(nav, { c1: conversation('C1', 1) });
    const espion = doublerFetch(() => ({ json: { ok: true } }));
    expect(await pushProfile()).toBe(true);
    expect(espion).toHaveBeenCalledTimes(1);
    expect(espion.mock.calls[0][1]!.method).toBe('PUT');
  });

  it('faux sans jeton, sur refus ou sur coupure', async () => {
    doublerFetch(() => ({ status: 403, json: {} }));
    expect(await pushProfile()).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('hors ligne'); }));
    expect(await pushProfile()).toBe(false);
    nav.stockage.delete('educhat-token');
    expect(await pushProfile()).toBe(false);
  });
});

describe('deleteServerConversations', () => {
  it('efface côté serveur puis dans ce navigateur', async () => {
    poserHistorique(nav, { a: conversation('A', 1), b: conversation('B', 2) });
    const espion = doublerFetch(() => ({ json: { ok: true, deleted: 1 } }));
    expect(await deleteServerConversations(['a'])).toBe(true);
    expect(espion.mock.calls[0][1]!.method).toBe('DELETE');
    expect(JSON.parse(String(espion.mock.calls[0][1]!.body))).toEqual({ conversations: ['a'] });
    expect(Object.keys(historique(nav))).toEqual(['b']);
  });

  it('en cas d’échec serveur, rien n’est effacé localement', async () => {
    poserHistorique(nav, { a: conversation('A', 1) });
    doublerFetch(() => ({ status: 500, json: {} }));
    expect(await deleteServerConversations(['a'])).toBe(false);
    expect(Object.keys(historique(nav))).toEqual(['a']);
  });

  it('une sélection vide n’appelle pas le serveur', async () => {
    const espion = doublerFetch(() => ({ json: {} }));
    expect(await deleteServerConversations([])).toBe(false);
    expect(espion).not.toHaveBeenCalled();
  });
});

describe('deleteServerProfile', () => {
  it('envoie un DELETE sans corps (effacement total)', async () => {
    const espion = doublerFetch(() => ({ json: { ok: true, syncDisabled: true } }));
    expect(await deleteServerProfile()).toBe(true);
    expect(espion.mock.calls[0][1]!.method).toBe('DELETE');
    expect(espion.mock.calls[0][1]!.body).toBeUndefined();
  });

  it('une coupure réseau remonte à l’appelant (pas de try/catch ici, contrairement aux autres)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('hors ligne'); }));
    await expect(deleteServerProfile()).rejects.toThrow('hors ligne');
  });
});
