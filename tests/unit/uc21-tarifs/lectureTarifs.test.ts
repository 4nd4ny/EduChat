// UC-21 — Tests unitaires : ce qu'on relit des tarifs.
//   · src/server/sondeTarifs.ts : propositions, tarifsAppliques, lienVerification ;
//   · src/server/facturation.ts : tarifs, reglerTarif (le prix unique du site) ;
//   · src/server/porteMonnaie.ts : tarifDuModele, en tant qu'il lit ce que ce
//     cas écrit (prix relevés par la sonde, prix unique réglé à la main).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { viderBase, base } from '../../helpers/db';
import { doublerSources } from './catalogue';
import { propositions, tarifsAppliques, lienVerification, sonderTarifs } from '../../../src/server/sondeTarifs';
import { tarifs, reglerTarif } from '../../../src/server/facturation';
import { tarifDuModele } from '../../../src/server/porteMonnaie';
import { setLadder } from '../../../src/server/ladder';

beforeEach(async () => { await viderBase(); });
afterEach(() => { vi.unstubAllGlobals(); });

async function prixModele(provider: string, modele: string, entree: number, sortie: number, devise = 'CHF') {
  (await base()).prepare(`INSERT INTO tarifs_modeles (provider, modele, prix_entree_mtok, prix_sortie_mtok, devise, source, updated_at)
    VALUES (?, ?, ?, ?, ?, 'src', 1)`).run(provider, modele, entree, sortie, devise);
}

describe('lienVerification', () => {
  it('pointe le catalogue public filtré sur l’éditeur, pour les fournisseurs d’école seulement', () => {
    expect(lienVerification('anthropic')).toBe('https://openrouter.ai/models?order=most-popular&q=anthropic');
    expect(lienVerification('mistral')).toContain('q=mistral');
    expect(lienVerification('gemini')).toBeNull();
    expect(lienVerification('openrouter')).toBeNull();
  });
});

describe('tarifs / reglerTarif — le prix unique du site', () => {
  it('crée puis met à jour la ligne ; un prix négatif est ramené à zéro', () => {
    reglerTarif('anthropic', 3.5);
    reglerTarif('openai', 2);
    reglerTarif('anthropic', 4);
    reglerTarif('mistral', -7);
    expect(tarifs()).toEqual({ anthropic: 4, openai: 2, mistral: 0 });
  });

  it('ne touche pas à la proposition de la sonde', async () => {
    doublerSources();
    await sonderTarifs();
    const avant = propositions().anthropic;
    reglerTarif('anthropic', 9);
    expect(propositions().anthropic).toEqual(avant);
    expect(tarifs().anthropic).toBe(9);
  });
});

describe('propositions — relecture de la dernière sonde', () => {
  it('rend par fournisseur les barreaux, la devise mesurée et le rang retenu', async () => {
    doublerSources({ taux: 0.8 });
    await sonderTarifs();
    const p = propositions();
    expect(Object.keys(p).sort()).toEqual(['anthropic', 'mistral', 'openai']);
    expect(p.anthropic).toMatchObject({ modele: 'anthropic/claude-opus-5', entreeMtok: 4, sortieMtok: 20, devise: 'CHF', rangRetenu: 3 });
    expect(p.anthropic.barreaux).toHaveLength(3);
  });

  it('ignore les lignes que la sonde n’a jamais écrites (propose_at = 0)', () => {
    reglerTarif('anthropic', 3);
    expect(propositions()).toEqual({});
  });

  it('ligne antérieure à la migration : barreaux vides, devise de facturation, rang 0 — sans lever', async () => {
    (await base()).prepare(`INSERT INTO tarifs (provider, prix_mtok, updated_at, propose_entree, propose_modele, propose_at, propose_barreaux, propose_devise)
      VALUES ('openai', 0, 1, 2.5, 'openai/x', 5, '', '')`).run();
    expect(propositions().openai).toMatchObject({ entreeMtok: 2.5, barreaux: [], devise: 'CHF', rangRetenu: 0 });
  });

  it('JSON illisible ou non tabulaire : barreaux vides', async () => {
    const db = await base();
    db.prepare(`INSERT INTO tarifs (provider, prix_mtok, updated_at, propose_at, propose_barreaux) VALUES ('openai', 0, 1, 5, '{pas du json')`).run();
    db.prepare(`INSERT INTO tarifs (provider, prix_mtok, updated_at, propose_at, propose_barreaux) VALUES ('mistral', 0, 1, 5, '{"a":1}')`).run();
    const p = propositions();
    expect(p.openai.barreaux).toEqual([]);
    expect(p.mistral.barreaux).toEqual([]);
  });
});

describe('tarifsAppliques — ce qui facture, et ce qui manque', () => {
  it('base vide : les neuf barreaux d’échelle des trois fournisseurs manquent', () => {
    const { prix, manquants } = tarifsAppliques();
    expect(prix).toEqual([]);
    expect(manquants).toHaveLength(9);
    expect(manquants).toContainEqual({ provider: 'mistral', barreau: 'mistral-large-latest' });
  });

  it('après une sonde complète, plus rien ne manque ; tri par fournisseur puis prix de sortie', async () => {
    doublerSources();
    await sonderTarifs();
    const { prix, manquants } = tarifsAppliques();
    expect(manquants).toEqual([]);
    expect(prix.filter(p => p.provider === 'mistral').map(p => p.modele))
      .toEqual(['mistral-small-latest', 'mistral-large-latest', 'mistral-medium-latest']);
    expect(prix[0]).toMatchObject({ provider: 'anthropic', devise: 'CHF', source: expect.stringContaining('anthropic/') });
  });

  it('une ligne dans une autre devise, ou à prix nuls, ne comble pas le trou', async () => {
    await prixModele('anthropic', 'claude-sonnet-5', 2, 10, 'USD');
    await prixModele('anthropic', 'claude-opus-5', 0, 0);
    await prixModele('anthropic', 'claude-haiku-4-5-20251001', 1, 5, 'chf');   // casse indifférente
    const m = tarifsAppliques().manquants.filter(x => x.provider === 'anthropic').map(x => x.barreau);
    expect(m).toEqual(['claude-sonnet-5', 'claude-opus-5']);
  });

  it('suit l’échelle réglée par l’administration, et non la proposition du code', async () => {
    setLadder('openai', ['gpt-maison']);
    const m = tarifsAppliques().manquants.filter(x => x.provider === 'openai');
    expect(m).toEqual([{ provider: 'openai', barreau: 'gpt-maison' }]);
  });
});

describe('tarifDuModele — lecture des prix écrits par ce cas', () => {
  it('le prix relevé par la sonde facture le modèle appelé', async () => {
    doublerSources({ taux: 0.8 });
    await sonderTarifs();
    expect(tarifDuModele('openai', 'gpt-5.5')).toMatchObject({ entree: 4, sortie: 24, repli: '' });
  });

  it('le prix unique réglé à la main ne sert qu’en dernier recours, à l’entrée comme à la sortie', () => {
    reglerTarif('mistral', 3);
    expect(tarifDuModele('mistral', 'mistral-tiny')).toMatchObject({
      entree: 3, sortie: 3, repli: 'Aucun tarif relevé pour « mistral-tiny » : prix unique du fournisseur.',
    });
  });

  it('corrigé — d’anciens prix entrée/sortie sur « tarifs » ne masquent plus le prix unique réglé par le site', async () => {
    // Colonnes tarifs.prix_entree_mtok / prix_sortie_mtok (migration ancienne) :
    // plus aucun code ne les écrit ni ne les montre ; tarifDuModele les lisait
    // AVANT prix_mtok, rendant le POST du site sans effet. Elles sont ignorées.
    (await base()).prepare(`INSERT INTO tarifs (provider, prix_mtok, updated_at, prix_entree_mtok, prix_sortie_mtok)
      VALUES ('anthropic', 0, 1, 0.5, 0.5)`).run();
    reglerTarif('anthropic', 20);
    expect(tarifs().anthropic).toBe(20);
    expect(tarifDuModele('anthropic', 'claude-x')).toMatchObject({ entree: 20, sortie: 20 });
  });

  it('non-régression — ces colonnes mortes, seules, ne fabriquent pas de prix (prix unique à 0 → zéro dit)', async () => {
    (await base()).prepare(`INSERT INTO tarifs (provider, prix_mtok, updated_at, prix_entree_mtok, prix_sortie_mtok)
      VALUES ('anthropic', 0, 1, 0.5, 0.5)`).run();
    const t = tarifDuModele('anthropic', 'claude-x');
    expect(t).toMatchObject({ entree: 0, sortie: 0 });
    expect(t.repli).toContain('rien n\'a été décompté');
  });
});
