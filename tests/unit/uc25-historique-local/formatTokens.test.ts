// UC-25 — Tests unitaires : affichage du compteur de tokens (src/utils/formatTokens.ts).
import { describe, it, expect } from 'vitest';
import { formatTokens } from '../../../src/utils/formatTokens';

describe('formatTokens', () => {
  it('sous mille : pas d’unité, trois chiffres significatifs', () => {
    expect(formatTokens(0)).toBe('0.00 Tok.');
    expect(formatTokens(7)).toBe('7.00 Tok.');
    expect(formatTokens(42)).toBe('42.0 Tok.');
    expect(formatTokens(999)).toBe('999 Tok.');
  });

  it('change d’unité par paliers de mille (K, M, G, T…)', () => {
    expect(formatTokens(1000)).toBe('1.00 KTok.');
    expect(formatTokens(12_345)).toBe('12.3 KTok.');
    expect(formatTokens(123_456)).toBe('123 KTok.');
    expect(formatTokens(1_500_000)).toBe('1.50 MTok.');
    expect(formatTokens(2e9)).toBe('2.00 GTok.');
    expect(formatTokens(3e12)).toBe('3.00 TTok.');
  });

  it('plafonne à l’unité Y', () => {
    expect(formatTokens(5e27)).toBe('5000 YTok.');
  });

  it('comportement actuel : l’arrondi peut afficher « 1000 K » au lieu de « 1.00 M »', () => {
    expect(formatTokens(999_999)).toBe('1000 KTok.');
  });

  it('comportement actuel : valeurs négatives ou NaN non filtrées', () => {
    expect(formatTokens(-5000)).toBe('-5000.00 Tok.');
    expect(formatTokens(NaN)).toBe('NaN Tok.');
  });
});
