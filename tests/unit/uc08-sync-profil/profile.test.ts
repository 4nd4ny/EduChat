// UC-08 — Tests unitaires : format du profil et fusion côté navigateur
// (src/utils/profile.ts : buildProfile, isProfile, applyProfile).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { creerNavigateur, utiliser, historique, poserHistorique, conversation, type Navigateur } from './doublureNavigateur';
import { buildProfile, isProfile, applyProfile, PROFILE_FORMAT } from '../../../src/utils/profile';

let nav: Navigateur;
beforeEach(() => { nav = creerNavigateur(); utiliser(nav); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('buildProfile', () => {
  it('rassemble conversations, favoris, notes et compteur — jamais le jeton de compte', () => {
    poserHistorique(nav, { c1: conversation('Maths', 1) });
    nav.stockage.set('prompt-favorites', '["Socrate"]');
    nav.stockage.set('prompt-ratings', '{"Socrate":5}');
    nav.stockage.set('totalTokens', '1200');
    nav.stockage.set('educhat-token', 'jeton-secret');
    const p = buildProfile();
    expect(p).toEqual({
      educhatProfile: PROFILE_FORMAT, exportedAt: expect.any(Number),
      conversations: { c1: conversation('Maths', 1) }, favorites: ['Socrate'], ratings: { Socrate: 5 }, totalTokens: 1200,
    });
    expect(JSON.stringify(p)).not.toContain('jeton-secret');
  });

  it('un stockage vide ou corrompu donne des valeurs par défaut', () => {
    nav.stockage.set('prompt-favorites', '{pas du json');
    nav.stockage.set('totalTokens', 'beaucoup');
    const p = buildProfile();
    expect(p.conversations).toEqual({});
    expect(p.favorites).toEqual([]);
    expect(p.ratings).toEqual({});
    expect(p.totalTokens).toBe(0);
  });
});

describe('isProfile', () => {
  it('reconnaît un profil à son numéro de format', () => {
    expect(isProfile({ educhatProfile: 1 })).toBe(true);
    expect(isProfile({ educhatProfile: '1' })).toBe(false);
    expect(isProfile(null)).toBe(false);
    expect(isProfile('texte')).toBe(false);
  });
});

describe('applyProfile', () => {
  it('ajoute les conversations absentes, sans jamais écraser celles du navigateur', () => {
    poserHistorique(nav, { c1: conversation('Locale', 5) });
    const r = applyProfile({
      educhatProfile: 1, exportedAt: 0, favorites: [], ratings: {}, totalTokens: 0,
      conversations: {
        c1: conversation('Distante plus récente', 99) as any,
        c2: conversation('Nouvelle', 10) as any,
        c3: { name: 'Sans messages' } as any,
      },
    });
    expect(r).toEqual({ conversations: 1 });
    const h = historique(nav);
    expect(Object.keys(h).sort()).toEqual(['c1', 'c2']);
    expect(h.c1.name).toBe('Locale');
  });

  it('unit les favoris, garde les notes locales, prend le maximum des compteurs et prévient la page', () => {
    nav.stockage.set('prompt-favorites', '["A"]');
    nav.stockage.set('prompt-ratings', '{"A":2}');
    nav.stockage.set('totalTokens', '300');
    nav.stockage.set('educhat-token', 'mon-jeton');
    applyProfile({
      educhatProfile: 1, exportedAt: 0, conversations: {},
      favorites: ['A', 'B'], ratings: { A: 5, B: 4 }, totalTokens: 1000,
    });
    expect(JSON.parse(nav.stockage.get('prompt-favorites')!)).toEqual(['A', 'B']);
    expect(JSON.parse(nav.stockage.get('prompt-ratings')!)).toEqual({ A: 2, B: 4 });
    expect(nav.stockage.get('totalTokens')).toBe('1000');
    expect(nav.stockage.get('educhat-token')).toBe('mon-jeton');
    expect(nav.evenements).toContain('totalTokensUpdated');
  });

  it('un compteur distant plus petit ne fait pas baisser le compteur local', () => {
    nav.stockage.set('totalTokens', '500');
    applyProfile({ educhatProfile: 1, exportedAt: 0, conversations: {}, favorites: [], ratings: {}, totalTokens: 10 });
    expect(nav.stockage.get('totalTokens')).toBe('500');
  });

  it('refuse un profil sans conversations', () => {
    expect(() => applyProfile({ educhatProfile: 1 } as any)).toThrow('Profil invalide');
  });
});
