// UC-21 — Tests unitaires : la sonde du catalogue public d'OpenRouter
// (src/server/sondeTarifs.ts, sonderTarifs). Le catalogue et le taux de change
// sont servis par la doublure du fetch global (./catalogue.ts) ; la monnaie de
// facturation est celle du socle (CHF, taux doublé à 0.8 par défaut).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { viderBase, base } from '../../helpers/db';
import { doublerFetch } from '../../helpers/fetch';
import { doublerSources, modele, CATALOGUE } from './catalogue';
import { sonderTarifs, RATIO_ENTREE, type Proposition } from '../../../src/server/sondeTarifs';
import { setLadder } from '../../../src/server/ladder';
import { SCHOOL_PROVIDER_IDS } from '../../../src/shared/providers';

beforeEach(async () => { await viderBase(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const de = (props: Proposition[], provider: string) => props.find(p => p.provider === provider)!;
const lignesModeles = async () => (await base())
  .prepare('SELECT provider, modele, prix_entree_mtok AS e, prix_sortie_mtok AS s, devise, source FROM tarifs_modeles ORDER BY provider, modele')
  .all() as Array<{ provider: string; modele: string; e: number; s: number; devise: string; source: string }>;

describe('périmètre et appels sortants', () => {
  it('ne sonde que les trois fournisseurs d’école, trois barreaux chacun', async () => {
    doublerSources();
    const props = await sonderTarifs();
    expect(props.map(p => p.provider).sort()).toEqual(['anthropic', 'mistral', 'openai']);
    expect([...SCHOOL_PROVIDER_IDS].sort()).toEqual(['anthropic', 'mistral', 'openai']);
    for (const p of props) expect(p.barreaux.map(b => b.rang)).toEqual([1, 2, 3]);
  });

  it('interroge le catalogue OpenRouter puis Frankfurter (USD → CHF), rien d’autre', async () => {
    const espion = doublerSources();
    await sonderTarifs();
    const urls = espion.mock.calls.map(c => String(c[0]));
    expect(urls).toEqual([
      'https://openrouter.ai/api/v1/models',
      'https://api.frankfurter.app/latest?from=USD&to=CHF',
    ]);
  });
});

describe('correspondance barreau → modèle du catalogue', () => {
  it('Anthropic : le nom daté retrouve la version précise, jamais le pointeur « ~…-latest »', async () => {
    doublerSources();
    const a = de(await sonderTarifs(), 'anthropic');
    expect(a.barreaux.map(b => [b.barreau, b.modele])).toEqual([
      ['claude-haiku-4-5-20251001', 'anthropic/claude-haiku-4.5'],
      ['claude-sonnet-5', 'anthropic/claude-sonnet-5'],
      ['claude-opus-5', 'anthropic/claude-opus-5'],
    ]);
  });

  it('OpenAI : « gpt-5.5-pro », plus récent, ne capte pas « gpt-5.5 »', async () => {
    doublerSources();
    const o = de(await sonderTarifs(), 'openai');
    expect(o.barreaux.map(b => b.modele)).toEqual(['openai/gpt-5.4-mini', 'openai/gpt-5.5', 'openai/gpt-5.5-pro']);
  });

  it('Mistral : variante datée la plus récente (large-2512) et alias « latest » par préfixe (medium-3-5)', async () => {
    doublerSources();
    const m = de(await sonderTarifs(), 'mistral');
    expect(m.barreaux.map(b => b.modele)).toEqual([
      'mistralai/mistral-small-3.2', 'mistralai/mistral-medium-3-5', 'mistralai/mistral-large-2512',
    ]);
  });

  it('un homonyme chez un autre vendeur n’est jamais retenu quand le bon vendeur est présent', async () => {
    doublerSources();
    const a = de(await sonderTarifs(), 'anthropic');
    expect(a.barreaux.every(b => b.modele.startsWith('anthropic/'))).toBe(true);
  });

  it('sans aucune entrée du vendeur, la recherche retombe sur le catalogue entier (homonyme compris)', async () => {
    // Comportement voulu par le code (« un quatrième fournisseur d'école ne doit
    // pas rendre la sonde muette ») — voir la section « Anomalies constatées ».
    doublerSources({ catalogue: [modele('autre/claude-sonnet-5', 99, 99, 1)] });
    const a = de(await sonderTarifs(), 'anthropic');
    expect(a.barreaux[1]).toMatchObject({ modele: 'autre/claude-sonnet-5', entreeMtok: 79.2, sortieMtok: 79.2, detail: '' });
  });

  it('un barreau réglé sur « latest » tout court ne correspond à rien (jamais un modèle tiré au hasard)', async () => {
    setLadder('mistral', ['latest']);
    doublerSources();
    const m = de(await sonderTarifs(), 'mistral');
    expect(m.barreaux).toHaveLength(1);
    expect(m.barreaux[0]).toMatchObject({
      modele: '', entreeMtok: 0, sortieMtok: 0,
      detail: 'Aucune correspondance pour « latest » dans le catalogue OpenRouter.',
    });
  });

  it('ANOMALIE — la recherche par préfixe (8 caractères) confond « mistral-small » et « mistral-saba »', async () => {
    // cible « mistralsmall » → préfixe « mistrals », que « mistralsaba » partage :
    // le plus récent l'emporte, et le barreau Small est chiffré au prix de Saba.
    doublerSources({ catalogue: [...CATALOGUE, modele('mistralai/mistral-saba', 0.2, 0.6, 500)] });
    const m = de(await sonderTarifs(), 'mistral');
    expect(m.barreaux[0]).toMatchObject({ barreau: 'mistral-small-latest', modele: 'mistralai/mistral-saba' });
  });
});

describe('conversion et arrondis', () => {
  it('convertit les $/jeton en prix par million dans la devise de facturation, au centime', async () => {
    doublerSources({ taux: 0.8 });
    const a = de(await sonderTarifs(), 'anthropic');
    expect(a.devise).toBe('CHF');
    expect(a.barreaux.map(b => [b.entreeMtok, b.sortieMtok])).toEqual([[0.8, 4], [1.6, 8], [4, 20]]);
  });

  it('le mélange suit le ratio entrée/sortie 75/25', async () => {
    doublerSources({ taux: 1 });
    const a = de(await sonderTarifs(), 'anthropic');
    expect(RATIO_ENTREE).toBe(0.75);
    expect(a.barreaux[0].melangeMtok).toBe(2);        // 1 × 0.75 + 5 × 0.25
    expect(a.melangeMtok).toBe(10);                   // 5 × 0.75 + 25 × 0.25
  });

  it('retient le barreau le plus HAUT, pas le plus cher (Mistral Large < Medium)', async () => {
    doublerSources({ taux: 1 });
    const m = de(await sonderTarifs(), 'mistral');
    expect(m.rangRetenu).toBe(3);
    expect(m).toMatchObject({ modele: 'mistralai/mistral-large-2512', entreeMtok: 0.5, sortieMtok: 1.5 });
    expect(m.barreaux[1].sortieMtok).toBeGreaterThan(m.sortieMtok);
  });

  it('une échelle plus courte retient son dernier barreau', async () => {
    setLadder('anthropic', ['claude-haiku-4-5-20251001', 'claude-sonnet-5', '']);
    doublerSources({ taux: 1 });
    const a = de(await sonderTarifs(), 'anthropic');
    expect(a.rangRetenu).toBe(2);
    expect(a.modele).toBe('anthropic/claude-sonnet-5');
  });

  it('ANOMALIE — un prix inférieur à 0,005 par million s’arrondit à zéro sans aucun détail', async () => {
    // Le détail est calculé sur la valeur NON arrondie (donc vide), les montants
    // sur la valeur arrondie (donc 0) : aucune ligne tarifs_modeles, et rien
    // dans la proposition ne dit pourquoi.
    doublerSources({ catalogue: [modele('openai/gpt-5.4-mini', 0.004, 0.004, 1)], taux: 1 });
    const o = de(await sonderTarifs(), 'openai');
    expect(o.barreaux[0]).toMatchObject({ modele: 'openai/gpt-5.4-mini', entreeMtok: 0, sortieMtok: 0, detail: '' });
    expect((await lignesModeles()).some(l => l.modele === 'gpt-5.4-mini')).toBe(false);
  });
});

describe('écriture : tarifs_modeles et propositions', () => {
  it('écrit un prix d’entrée et de sortie par barreau, clé = nom de l’échelle, source = OpenRouter', async () => {
    doublerSources({ taux: 0.8 });
    await sonderTarifs();
    const lignes = await lignesModeles();
    expect(lignes).toHaveLength(9);
    expect(lignes.find(l => l.modele === 'claude-haiku-4-5-20251001')).toEqual({
      provider: 'anthropic', modele: 'claude-haiku-4-5-20251001', e: 0.8, s: 4, devise: 'CHF',
      source: 'anthropic/claude-haiku-4.5',
    });
  });

  it('écrit la proposition (barreaux en JSON, devise, date) sans jamais toucher prix_mtok', async () => {
    const db = await base();
    db.prepare('INSERT INTO tarifs (provider, prix_mtok, updated_at) VALUES (?, 12.5, 1)').run('anthropic');
    doublerSources();
    await sonderTarifs();
    const a = db.prepare('SELECT * FROM tarifs WHERE provider = ?').get('anthropic') as any;
    expect(a.prix_mtok).toBe(12.5);
    expect(a.updated_at).toBe(1);
    expect(a.propose_modele).toBe('anthropic/claude-opus-5');
    expect(a.propose_devise).toBe('CHF');
    expect(a.propose_at).toBeGreaterThan(0);
    expect(JSON.parse(a.propose_barreaux)).toHaveLength(3);
    // Un fournisseur sans ligne est créé à prix_mtok = 0.
    expect((db.prepare('SELECT prix_mtok FROM tarifs WHERE provider = ?').get('openai') as any).prix_mtok).toBe(0);
  });

  it('une seconde sonde met à jour les prix relevés', async () => {
    doublerSources({ taux: 1 });
    await sonderTarifs();
    vi.unstubAllGlobals();
    doublerSources({ taux: 2 });
    await sonderTarifs();
    expect((await lignesModeles()).find(l => l.modele === 'claude-opus-5')).toMatchObject({ e: 10, s: 50 });
  });

  it('une entrée sans prix n’écrit rien et le dit', async () => {
    doublerSources({ catalogue: [modele('anthropic/claude-opus-5', 0, 0, 1)] });
    const a = de(await sonderTarifs(), 'anthropic');
    expect(a.barreaux[2].detail).toBe('« anthropic/claude-opus-5 » ne porte pas de prix.');
    expect(a.detail).toBe(a.barreaux[2].detail);
    expect(await lignesModeles()).toEqual([]);
  });

  it('un barreau introuvable n’écrit pas de ligne (le repli du porte-monnaie prendra la main)', async () => {
    doublerSources({ catalogue: CATALOGUE.filter(m => m.id !== 'anthropic/claude-opus-5') });
    await sonderTarifs();
    const noms = (await lignesModeles()).map(l => l.modele);
    expect(noms).not.toContain('claude-opus-5');
    expect(noms).toContain('claude-sonnet-5');
  });
});

describe('pannes : catalogue ou taux de change injoignable', () => {
  it('taux injoignable : proposition en USD, AUCUN tarif applicable écrit, les anciens sont gardés', async () => {
    doublerSources({ taux: 0.8 });
    await sonderTarifs();
    const avant = await lignesModeles();
    vi.unstubAllGlobals();
    doublerSources({ taux: null });
    const a = de(await sonderTarifs(), 'anthropic');
    expect(a.devise).toBe('USD');
    expect(a.barreaux[0]).toMatchObject({ entreeMtok: 1, sortieMtok: 5 });   // dollars bruts
    expect(await lignesModeles()).toEqual(avant);
    const t = (await base()).prepare('SELECT propose_devise FROM tarifs WHERE provider = ?').get('anthropic') as any;
    expect(t.propose_devise).toBe('USD');
  });

  it('un taux illisible (non numérique) vaut injoignable', async () => {
    doublerFetch(url => url.includes('openrouter')
      ? { json: { data: CATALOGUE } }
      : { json: { rates: { CHF: 'beaucoup' } } });
    expect(de(await sonderTarifs(), 'openai').devise).toBe('USD');
    expect(await lignesModeles()).toEqual([]);
  });

  it('catalogue en erreur HTTP : chaque barreau le dit, rien n’est écrit dans tarifs_modeles', async () => {
    doublerSources({ statutCatalogue: 500 });
    const props = await sonderTarifs();
    for (const p of props) {
      expect(p.barreaux.every(b => b.detail === 'Catalogue OpenRouter injoignable : HTTP 500')).toBe(true);
      expect(p.entreeMtok).toBe(0);
    }
    expect(await lignesModeles()).toEqual([]);
  });

  it('catalogue injoignable (exception réseau) : le message est repris, tronqué à 200 caractères', async () => {
    doublerFetch(url => {
      if (url.includes('openrouter')) throw new Error('x'.repeat(300));
      return { json: { rates: { CHF: 0.8 } } };
    });
    const [p] = await sonderTarifs();
    expect(p.detail).toBe(`Catalogue OpenRouter injoignable : ${'x'.repeat(200)}`);
  });

  it('une panne du catalogue écrase la proposition précédente (zéros + détail), pas les prix appliqués', async () => {
    doublerSources();
    await sonderTarifs();
    vi.unstubAllGlobals();
    doublerSources({ statutCatalogue: 503 });
    await sonderTarifs();
    const db = await base();
    const t = db.prepare('SELECT propose_entree, propose_detail FROM tarifs WHERE provider = ?').get('anthropic') as any;
    expect(t).toEqual({ propose_entree: 0, propose_detail: 'Catalogue OpenRouter injoignable : HTTP 503' });
    expect((await lignesModeles()).length).toBe(9);
  });
});
