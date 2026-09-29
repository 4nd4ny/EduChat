// UC-12 — Tests unitaires : l'échelle telle que le code la PROPOSE et la lit
// (src/shared/ladder.ts) — fonctions pures, partagées client/serveur.
import { describe, it, expect } from 'vitest';
import {
  RUNGS, RUNG_REASONING, SUGGESTED_LADDER, LADDER_PROVIDERS, modelForRung, hasHigherRung, isRung,
} from '../../../src/shared/ladder';
import { PROVIDER_IDS, providerDefaults } from '../../../src/shared/providers';

describe('proposition du code (SUGGESTED_LADDER)', () => {
  it('propose une échelle de 1 à 3 barreaux non vides pour CHAQUE fournisseur', () => {
    expect(Object.keys(SUGGESTED_LADDER).sort()).toEqual([...PROVIDER_IDS].sort());
    for (const p of PROVIDER_IDS) {
      const echelle = SUGGESTED_LADDER[p];
      expect(echelle.length).toBeGreaterThanOrEqual(1);
      expect(echelle.length).toBeLessThanOrEqual(3);
      for (const m of echelle) expect(m.trim()).toBe(m);
      expect(new Set(echelle).size).toBe(echelle.length); // aucun barreau répété
    }
  });
  it('certains fournisseurs n’ont que deux barreaux (échelle courte plutôt qu’inventée)', () => {
    expect(SUGGESTED_LADDER.deepseek).toHaveLength(2);
    expect(SUGGESTED_LADDER.kimi).toHaveLength(2);
  });
  it('les fournisseurs de l’échelle sont exactement ceux du catalogue', () => {
    expect(LADDER_PROVIDERS).toEqual(PROVIDER_IDS);
    expect(RUNGS).toEqual([1, 2, 3]);
  });
});

describe('RUNG_REASONING', () => {
  it('un barreau plus haut demande plus d’effort', () => {
    expect(RUNG_REASONING).toEqual({ 1: 'low', 2: 'medium', 3: 'high' });
  });
});

describe('modelForRung', () => {
  const echelle = ['petit', 'moyen', 'grand'];
  it('rend le modèle du barreau demandé', () => {
    expect(modelForRung(echelle, 1, 'mistral')).toBe('petit');
    expect(modelForRung(echelle, 2, 'mistral')).toBe('moyen');
    expect(modelForRung(echelle, 3, 'mistral')).toBe('grand');
  });
  it('borne le barreau à l’échelle réelle (jamais au-delà du dernier)', () => {
    expect(modelForRung(['a', 'b'], 3, 'mistral')).toBe('b');
    expect(modelForRung(echelle, 99, 'mistral')).toBe('grand');
  });
  it('un barreau nul, négatif, fractionnaire ou non numérique retombe au premier cran', () => {
    expect(modelForRung(echelle, 0, 'mistral')).toBe('petit');
    expect(modelForRung(echelle, -2, 'mistral')).toBe('petit');
    expect(modelForRung(echelle, Number.NaN, 'mistral')).toBe('petit');
    expect(modelForRung(echelle, 2.9, 'mistral')).toBe('moyen'); // tronqué, pas arrondi
  });
  it('une échelle vide retombe sur le modèle par défaut du fournisseur (filet)', () => {
    expect(modelForRung([], 2, 'anthropic')).toBe(providerDefaults.anthropic.model);
  });
});

describe('hasHigherRung', () => {
  it('dit s’il reste un cran au-dessus', () => {
    expect(hasHigherRung(['a', 'b', 'c'], 1)).toBe(true);
    expect(hasHigherRung(['a', 'b', 'c'], 2)).toBe(true);
    expect(hasHigherRung(['a', 'b', 'c'], 3)).toBe(false);
    expect(hasHigherRung(['a', 'b'], 2)).toBe(false);
  });
  it('une échelle vide ou à un barreau ne promet aucune montée', () => {
    expect(hasHigherRung([], 1)).toBe(false);
    expect(hasHigherRung(['seul'], 1)).toBe(false);
  });
});

describe('isRung', () => {
  it('n’accepte que les entiers 1, 2 et 3', () => {
    for (const v of [1, 2, 3]) expect(isRung(v)).toBe(true);
    for (const v of [0, 4, 1.5, '2', null, undefined, NaN]) expect(isRung(v)).toBe(false);
  });
});
