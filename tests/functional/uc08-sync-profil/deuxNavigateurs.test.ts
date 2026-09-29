// UC-08 — Test fonctionnel de bout en bout : deux navigateurs d'un même
// compte se synchronisent par le VRAI client (src/utils/profileSync.ts) et la
// VRAIE route (/api/profile). La doublure de fetch achemine chaque requête du
// client vers le handler, sans serveur HTTP ; chaque navigateur a son propre
// localStorage (doublure).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerCompte } from '../../helpers/db';
import { doublerFetch } from '../../helpers/fetch';
import {
  creerNavigateur, utiliser, historique, poserHistorique, conversation, type Navigateur,
} from '../../unit/uc08-sync-profil/doublureNavigateur';

import profil from '../../../src/pages/api/profile';
import { syncProfile, pushProfile, deleteServerConversations, deleteServerProfile } from '../../../src/utils/profileSync';

let n = 0;
/** Achemine les fetch du client vers la route réelle. */
function brancherServeur() {
  return doublerFetch(async (url, init) => {
    expect(url).toBe('/api/profile');
    const entetes = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const r = await appeler(profil, {
      method: init?.method ?? 'GET',
      headers: entetes,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      ip: `198.51.100.${++n % 250}`,
    });
    return { status: r.status, json: r.json };
  });
}

let portable: Navigateur;
let fixe: Navigateur;
async function sur<T>(nav: Navigateur, action: () => Promise<T>): Promise<T> {
  utiliser(nav);
  brancherServeur();
  return action();
}

beforeEach(async () => {
  await viderBase();
  const jeton = await creerCompte('ada@ecole.ch', { syncOptin: true });
  portable = creerNavigateur('portable');
  fixe = creerNavigateur('fixe');
  for (const nav of [portable, fixe]) nav.stockage.set('educhat-token', jeton);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Scénario nominal : deux appareils convergent', () => {
  it('chaque appareil récupère les conversations de l’autre', async () => {
    poserHistorique(portable, { p1: conversation('Portable', 10) });
    poserHistorique(fixe, { f1: conversation('Fixe', 20) });
    portable.stockage.set('prompt-favorites', '["Socrate"]');
    fixe.stockage.set('totalTokens', '900');

    expect(await sur(portable, syncProfile)).toEqual({ ok: true, mergedConversations: 0 });
    expect(await sur(fixe, syncProfile)).toEqual({ ok: true, mergedConversations: 1 });
    expect(await sur(portable, syncProfile)).toEqual({ ok: true, mergedConversations: 1 });

    for (const nav of [portable, fixe]) {
      expect(Object.keys(historique(nav)).sort()).toEqual(['f1', 'p1']);
      expect(JSON.parse(nav.stockage.get('prompt-favorites')!)).toEqual(['Socrate']);
    }
    expect(portable.stockage.get('totalTokens')).toBe('900');
  });

  it('la sauvegarde automatique pousse sans rapatrier, le serveur fusionne quand même', async () => {
    poserHistorique(portable, { p1: conversation('Portable', 10) });
    poserHistorique(fixe, { f1: conversation('Fixe', 20) });
    expect(await sur(portable, pushProfile)).toBe(true);
    expect(await sur(fixe, pushProfile)).toBe(true);
    expect(Object.keys(historique(fixe))).toEqual(['f1']); // rien rapatrié
    const s = JSON.parse(((await base()).prepare('SELECT data FROM profiles').get() as any).data);
    expect(Object.keys(s.conversations).sort()).toEqual(['f1', 'p1']);
  });
});

describe('Scénario alternatif : effacer sur un appareil, disparaître sur l’autre', () => {
  it('une conversation effacée depuis « Mes données » disparaît aussi de l’autre appareil', async () => {
    poserHistorique(portable, { a: conversation('A', 1), b: conversation('B', 2) });
    await sur(portable, syncProfile);
    await sur(fixe, syncProfile);
    expect(Object.keys(historique(fixe)).sort()).toEqual(['a', 'b']);

    expect(await sur(portable, () => deleteServerConversations(['a']))).toBe(true);
    expect(Object.keys(historique(portable))).toEqual(['b']);

    // Le fixe, qui a encore « a », se synchronise : il la retire et ne la renvoie pas.
    await sur(fixe, syncProfile);
    expect(Object.keys(historique(fixe))).toEqual(['b']);
    const s = JSON.parse(((await base()).prepare('SELECT data FROM profiles').get() as any).data);
    expect(Object.keys(s.conversations)).toEqual(['b']);
  });

  it('après un effacement total, la synchronisation répond « optout »', async () => {
    poserHistorique(portable, { a: conversation('A', 1) });
    await sur(portable, syncProfile);
    expect(await sur(portable, deleteServerProfile)).toBe(true);
    expect(await sur(fixe, syncProfile)).toEqual({ ok: false, reason: 'optout' });
    expect(await sur(fixe, pushProfile)).toBe(false);
    expect((await base()).prepare('SELECT 1 FROM profiles').get()).toBeUndefined();
  });

  it('sans consentement, la synchronisation répond « optout » et rien n’est stocké', async () => {
    (await base()).prepare('UPDATE users SET sync_optin = 0').run();
    poserHistorique(portable, { a: conversation('A', 1) });
    expect(await sur(portable, syncProfile)).toEqual({ ok: false, reason: 'optout' });
    expect((await base()).prepare('SELECT 1 FROM profiles').get()).toBeUndefined();
  });
});
