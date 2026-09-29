// UC-12 — Tests unitaires : l'échelle EN VIGUEUR (src/server/ladder.ts) —
// proposition du code écrasée par les réglages de l'administration, en base.
import { describe, it, expect, beforeEach } from 'vitest';
import { viderBase, base } from '../../helpers/db';
import { getLadders, getLadder, setLadder } from '../../../src/server/ladder';
import { SUGGESTED_LADDER } from '../../../src/shared/ladder';
import { PROVIDER_IDS } from '../../../src/shared/providers';

beforeEach(async () => { await viderBase(); });

describe('getLadders / getLadder sans réglage', () => {
  it('suit la proposition du code pour chaque fournisseur', () => {
    const lignes = getLadders();
    expect(lignes.map(l => l.provider)).toEqual(PROVIDER_IDS);
    for (const l of lignes) {
      expect(l.rungs).toEqual(SUGGESTED_LADDER[l.provider]);
      expect(l.suggested).toEqual(SUGGESTED_LADDER[l.provider]);
      expect(l.custom).toBe(false);
      expect(l.updatedAt).toBe(0);
    }
    expect(getLadder('mistral')).toEqual(SUGGESTED_LADDER.mistral);
  });
});

describe('setLadder', () => {
  it('enregistre les barreaux de l’administration, nettoyés (espaces, 128 caractères)', async () => {
    const long = 'x'.repeat(200);
    setLadder('mistral', ['  a  ', 'b', long]);
    expect(getLadder('mistral')).toEqual(['a', 'b', 'x'.repeat(128)]);
    const ligne = getLadders().find(l => l.provider === 'mistral')!;
    expect(ligne.custom).toBe(true);
    expect(ligne.updatedAt).toBeGreaterThan(0);
    expect(ligne.suggested).toEqual(SUGGESTED_LADDER.mistral); // la proposition reste lisible
  });

  it('ne garde que trois barreaux et complète par des vides', async () => {
    setLadder('openai', ['a', 'b', 'c', 'd']);
    expect(getLadder('openai')).toEqual(['a', 'b', 'c']);
    setLadder('anthropic', ['seul']);
    const row = (await base()).prepare('SELECT rung1, rung2, rung3 FROM provider_ladder WHERE provider=?')
      .get('anthropic');
    expect(row).toEqual({ rung1: 'seul', rung2: '', rung3: '' });
    expect(getLadder('anthropic')).toEqual(['seul']);
  });

  it('un barreau vide ARRÊTE l’échelle (pas de devinette au-delà)', () => {
    setLadder('mistral', ['a', '', 'c']);
    expect(getLadder('mistral')).toEqual(['a']);
  });

  it('un premier barreau vide supprime le réglage : retour à la proposition', async () => {
    setLadder('mistral', ['a', 'b', 'c']);
    setLadder('mistral', ['', 'b', 'c']);
    expect(getLadder('mistral')).toEqual(SUGGESTED_LADDER.mistral);
    expect((await base()).prepare('SELECT COUNT(*) AS n FROM provider_ladder').get()).toEqual({ n: 0 });
  });

  it('trois barreaux vides (ou une liste vide) = retour à la proposition', () => {
    setLadder('grok', ['a']);
    setLadder('grok', ['', '', '']);
    expect(getLadders().find(l => l.provider === 'grok')!.custom).toBe(false);
    setLadder('grok', ['a']);
    setLadder('grok', []);
    expect(getLadder('grok')).toEqual(SUGGESTED_LADDER.grok);
  });

  it('remplace un réglage existant (une ligne par fournisseur)', async () => {
    setLadder('mistral', ['a', 'b']);
    setLadder('mistral', ['c']);
    expect(getLadder('mistral')).toEqual(['c']);
    expect((await base()).prepare('SELECT COUNT(*) AS n FROM provider_ladder').get()).toEqual({ n: 1 });
  });

  it('les valeurs non textuelles sont converties, null/undefined deviennent vides', () => {
    setLadder('mistral', [42 as any, null as any, 'z']);
    expect(getLadder('mistral')).toEqual(['42']);
  });

  it('le réglage d’un fournisseur ne touche pas les autres', () => {
    setLadder('mistral', ['a']);
    expect(getLadder('openai')).toEqual(SUGGESTED_LADDER.openai);
  });
});

describe('lecture défensive de la table', () => {
  it('une ligne écrite à la main avec un premier barreau blanc est ignorée', async () => {
    (await base()).prepare('INSERT INTO provider_ladder (provider, rung1, rung2, rung3, updated_at) VALUES (?,?,?,?,?)')
      .run('mistral', '   ', 'b', 'c', 1);
    expect(getLadder('mistral')).toEqual(SUGGESTED_LADDER.mistral);
    expect(getLadders().find(l => l.provider === 'mistral')!.custom).toBe(false);
  });
});
