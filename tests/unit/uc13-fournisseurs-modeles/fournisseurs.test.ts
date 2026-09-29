// UC-13 — Tests unitaires : ce que la clé de l'ÉCOLE peut réellement servir
// (src/server/fournisseurs.ts) — la règle scolaire croisée avec les clés
// serveur présentes.
import { describe, it, expect, afterEach } from 'vitest';
import { poserEnv } from '../../helpers/env';

const CLES = ['SECRET_MISTRAL_API_KEY', 'SECRET_ANTHROPIC_API_KEY', 'SECRET_OPENAI_API_KEY',
  'SECRET_GEMINI_API_KEY', 'SECRET_OPENROUTER_API_KEY', 'SECRET_XAI_API_KEY'];
afterEach(() => { poserEnv(Object.fromEntries(CLES.map(k => [k, undefined]))); });

async function charger(env: Record<string, string>) {
  poserEnv(env);
  return import('../../../src/server/fournisseurs');
}

describe('fournisseursServis', () => {
  it('aucune clé serveur : aucun fournisseur servi', async () => {
    expect((await charger({})).fournisseursServis()).toEqual([]);
  });
  it('seuls les fournisseurs scolaires AVEC une clé non blanche', async () => {
    const m = await charger({
      SECRET_MISTRAL_API_KEY: 'm', SECRET_ANTHROPIC_API_KEY: '   ',
      SECRET_GEMINI_API_KEY: 'g', SECRET_OPENROUTER_API_KEY: 'o', SECRET_XAI_API_KEY: 'x',
    });
    // Gemini/Grok écartés, OpenRouter drapeau rouge, Claude sans vraie clé.
    expect(m.fournisseursServis()).toEqual(['mistral']);
  });
});

describe('estServiParLEcole', () => {
  it('répond sur une chaîne quelconque, fournisseur retiré compris', async () => {
    const m = await charger({ SECRET_MISTRAL_API_KEY: 'm', SECRET_OPENAI_API_KEY: 'o' });
    expect(m.estServiParLEcole('mistral')).toBe(true);
    expect(m.estServiParLEcole('openai')).toBe(true);
    expect(m.estServiParLEcole('anthropic')).toBe(false);
    expect(m.estServiParLEcole('fournisseur-disparu')).toBe(false);
  });
});
