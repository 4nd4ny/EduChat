// UC-25 — Tests unitaires : favoris et notes locales (src/utils/favorites.ts).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installerNavigateur, retirerNavigateur, type Navigateur } from './navigateur';
import { getFavorites, toggleFavorite, getGivenRating, storeGivenRating } from '../../../src/utils/favorites';

let nav: Navigateur;
beforeEach(() => { nav = installerNavigateur(); });
afterEach(() => { retirerNavigateur(); });

describe('favoris', () => {
  it('liste vide par défaut', () => {
    expect(getFavorites()).toEqual([]);
  });

  it('toggleFavorite ajoute puis retire, et persiste dans prompt-favorites', () => {
    expect(toggleFavorite('socrate')).toEqual(['socrate']);
    expect(toggleFavorite('platon')).toEqual(['socrate', 'platon']);
    expect(JSON.parse(nav.stockage.getItem('prompt-favorites')!)).toEqual(['socrate', 'platon']);
    expect(toggleFavorite('socrate')).toEqual(['platon']);
    expect(getFavorites()).toEqual(['platon']);
  });

  it('valeur corrompue : repli sur une liste vide, puis réécriture propre', () => {
    nav.stockage.setItem('prompt-favorites', '{corrompu');
    expect(getFavorites()).toEqual([]);
    expect(toggleFavorite('a')).toEqual(['a']);
  });

  it('un JSON valide mais non tableau se replie sur une liste vide ; toggleFavorite fonctionne', () => {
    nav.stockage.setItem('prompt-favorites', '{"a":1}');
    expect(getFavorites()).toEqual([]);
    expect(toggleFavorite('b')).toEqual(['b']);
    expect(JSON.parse(nav.stockage.getItem('prompt-favorites')!)).toEqual(['b']);
    nav.stockage.setItem('prompt-favorites', '42');
    expect(getFavorites()).toEqual([]);
  });

  it('côté serveur (pas de window) : liste vide', () => {
    vi.stubGlobal('window', undefined);
    expect(getFavorites()).toEqual([]);
  });
});

describe('notes données (anti-revote local)', () => {
  it('range et relit une note par prompt', () => {
    expect(getGivenRating('socrate')).toBeNull();
    storeGivenRating('socrate', 4);
    storeGivenRating('platon', 2);
    expect(getGivenRating('socrate')).toBe(4);
    expect(JSON.parse(nav.stockage.getItem('prompt-ratings')!)).toEqual({ socrate: 4, platon: 2 });
  });

  it('une valeur non numérique n’est pas une note', () => {
    nav.stockage.setItem('prompt-ratings', JSON.stringify({ socrate: '5' }));
    expect(getGivenRating('socrate')).toBeNull();
  });

  it('stockage corrompu : lecture nulle, écriture silencieuse sans exception', () => {
    nav.stockage.setItem('prompt-ratings', '{corrompu');
    expect(getGivenRating('socrate')).toBeNull();
    expect(() => storeGivenRating('socrate', 3)).not.toThrow();
    expect(nav.stockage.getItem('prompt-ratings')).toBe('{corrompu');
  });

  it('côté serveur (pas de window) : aucune note', () => {
    vi.stubGlobal('window', undefined);
    expect(getGivenRating('x')).toBeNull();
  });
});
