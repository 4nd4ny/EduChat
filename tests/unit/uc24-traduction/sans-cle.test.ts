// UC-24 — Tests unitaires : traduction SANS clé interne Anthropic (la
// configuration de test par défaut). La publication ne doit pas en souffrir :
// l'échec est consigné, le fournisseur n'est jamais appelé.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { viderBase, creerTuteur } from '../../helpers/db';
import { doublerFetch } from '../../helpers/fetch';
import { traduireTuteur, MODELE_TRADUCTION } from '../../../src/server/traduction';

beforeEach(async () => { await viderBase(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('traduireTuteur sans clé interne', () => {
  it('consigne un échec explicite pour chaque langue sans appeler le réseau', async () => {
    const id = await creerTuteur({ name: 'Socrate' });
    const reseau = doublerFetch(() => ({ status: 500 }));
    const etats = await traduireTuteur(id);
    expect(reseau).not.toHaveBeenCalled();
    expect(etats).toHaveLength(3);
    for (const e of etats) {
      expect(e.state).toBe('failed');
      expect(e.detail).toContain('SECRET_ANTHROPIC_API_KEY');
    }
  });
  it('le modèle par défaut est Claude Haiku', () => {
    expect(MODELE_TRADUCTION).toMatch(/^claude-haiku/);
  });
});
