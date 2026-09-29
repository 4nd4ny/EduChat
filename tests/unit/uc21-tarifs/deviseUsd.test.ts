// UC-21 — Tests unitaires : une facturation EN DOLLARS (SECRET_BILLING_CURRENCY=USD).
// La constante est figée au chargement de src/utils/env.ts : on pose
// l'environnement, on recharge les modules, puis on les importe dynamiquement.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { poserEnv } from '../../helpers/env';
import { viderBase, base } from '../../helpers/db';
import { doublerSources } from './catalogue';

beforeAll(() => { poserEnv({ SECRET_BILLING_CURRENCY: 'USD' }); });
afterAll(() => { poserEnv({ SECRET_BILLING_CURRENCY: undefined }); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('monnaie de facturation USD', () => {
  it('taux = 1 sans interroger Frankfurter ; les prix sont écrits en USD et appliqués', async () => {
    await viderBase();
    const espion = doublerSources({ taux: null });   // Frankfurter « en panne » : ne doit pas compter
    const { sonderTarifs } = await import('../../../src/server/sondeTarifs');
    const props = await sonderTarifs();
    expect(espion.mock.calls.map(c => String(c[0]))).toEqual(['https://openrouter.ai/api/v1/models']);
    const a = props.find(p => p.provider === 'anthropic')!;
    expect(a.devise).toBe('USD');
    expect(a.barreaux[0]).toMatchObject({ entreeMtok: 1, sortieMtok: 5 });
    const ligne = (await base()).prepare('SELECT devise FROM tarifs_modeles WHERE modele = ?').get('claude-opus-5') as any;
    expect(ligne.devise).toBe('USD');
    const { tarifDuModele } = await import('../../../src/server/porteMonnaie');
    expect(tarifDuModele('anthropic', 'claude-opus-5')).toMatchObject({ entree: 5, sortie: 25, repli: '' });
  });
});
