// UC-13 — Tests unitaires : le PÉRIMÈTRE des fournisseurs
// (src/server/accesFournisseurs.ts) — la matrice lieu × compte × moyen propre,
// le moyen de paiement personnel et le fournisseur du repli gratuit.
//
// Les cas qui dépendent d'une variable d'environnement lue au chargement
// (clés serveur, SECRET_FREE_PROVIDER, SECRET_ALLOWED_IPS) rechargent les
// modules (poserEnv + import dynamique).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { poserEnv } from '../../helpers/env';

const ENV_TOUCHEES = ['SECRET_FREE_PROVIDER', 'SECRET_OPENROUTER_API_KEY', 'SECRET_GEMINI_API_KEY', 'SECRET_ALLOWED_IPS'];

async function charger(env: Record<string, string | undefined> = {}) {
  poserEnv(env);
  const helpers = await import('../../helpers/db');
  await helpers.viderBase();
  const acces = await import('../../../src/server/accesFournisseurs');
  const userKeys = await import('../../../src/server/userKeys');
  const providers = await import('../../../src/shared/providers');
  return { ...helpers, ...acces, ...userKeys, ...providers };
}

afterEach(() => { poserEnv(Object.fromEntries(ENV_TOUCHEES.map(k => [k, undefined]))); });

const HORS_CAMPUS = '198.51.100.10';
const CAMPUS = '192.0.2.10';

describe('perimetreFournisseurs — la matrice en quatre cases', () => {
  let m: Awaited<ReturnType<typeof charger>>;
  beforeEach(async () => {
    m = await charger();
    await m.creerEtablissement({ ips: CAMPUS });
  });

  it('anonyme hors campus, sans repli gratuit : liste vide, motif « demo »', () => {
    expect(m.perimetreFournisseurs({ ip: HORS_CAMPUS, email: null }))
      .toEqual({ fournisseurs: [], motif: 'demo', campus: false, compte: false });
  });

  it('anonyme sur le campus : les fournisseurs scolaires, motif « ecole »', () => {
    expect(m.perimetreFournisseurs({ ip: CAMPUS, email: null }))
      .toEqual({ fournisseurs: m.SCHOOL_PROVIDER_IDS, motif: 'ecole', campus: true, compte: false });
  });

  it('un anonyme sur le campus ne lève jamais les règles de l’école, même « moyen propre » annoncé', () => {
    expect(m.perimetreFournisseurs({ ip: CAMPUS, email: null, moyenPropre: true }).motif).toBe('ecole');
  });

  it('compte vérifié hors campus : tout, motif « tout »', async () => {
    await m.creerCompte('adulte@exemple.ch');
    expect(m.perimetreFournisseurs({ ip: HORS_CAMPUS, email: 'adulte@exemple.ch' }))
      .toEqual({ fournisseurs: m.PROVIDER_IDS, motif: 'tout', campus: false, compte: true });
  });

  it('compte sur le campus sans moyen propre : règles de l’école', async () => {
    await m.creerCompte('prof@ecole.ch');
    expect(m.perimetreFournisseurs({ ip: CAMPUS, email: 'prof@ecole.ch', moyenPropre: false }))
      .toEqual({ fournisseurs: m.SCHOOL_PROVIDER_IDS, motif: 'ecole', campus: true, compte: true });
  });

  it('compte sur le campus AVEC moyen propre : tout', async () => {
    await m.creerCompte('prof@ecole.ch');
    expect(m.perimetreFournisseurs({ ip: CAMPUS, email: 'prof@ecole.ch', moyenPropre: true }).motif).toBe('tout');
  });

  it('un jeton sans compte vérifié en base ne vaut pas compte', async () => {
    const db = await m.base();
    db.prepare('INSERT INTO users (email, name, created_at) VALUES (?, ?, ?)').run('fantome@exemple.ch', 'f', Date.now());
    expect(m.perimetreFournisseurs({ ip: HORS_CAMPUS, email: 'fantome@exemple.ch' }).compte).toBe(false);
    expect(m.perimetreFournisseurs({ ip: HORS_CAMPUS, email: 'efface@exemple.ch' }).motif).toBe('demo');
  });

  it('une adresse illisible compte pour une école (défaut qui garde l’école au travail)', () => {
    for (const ip of ['', 'unknown']) {
      expect(m.perimetreFournisseurs({ ip, email: null })).toMatchObject({ campus: true, motif: 'ecole' });
    }
  });
});

describe('aUnMoyenPropre', () => {
  let m: Awaited<ReturnType<typeof charger>>;
  beforeEach(async () => { m = await charger(); });

  it('personne, ou un compte sans clé ni crédit : non', async () => {
    await m.creerCompte('a@exemple.ch');
    expect(m.aUnMoyenPropre(null)).toBe(false);
    expect(m.aUnMoyenPropre(undefined)).toBe(false);
    expect(m.aUnMoyenPropre('a@exemple.ch')).toBe(false);
  });
  it('une clé mémorisée et lisible : oui', async () => {
    await m.creerCompte('a@exemple.ch');
    m.storeUserKey('a@exemple.ch', 'grok', 'xai-cle');
    expect(m.aUnMoyenPropre('a@exemple.ch')).toBe(true);
  });
  it('une clé mémorisée mais indéchiffrable : non', async () => {
    await m.creerCompte('a@exemple.ch');
    (await m.base()).prepare('INSERT INTO user_keys (email, provider, key_enc, updated_at) VALUES (?,?,?,?)')
      .run('a@exemple.ch', 'grok', 'illisible', Date.now());
    expect(m.aUnMoyenPropre('a@exemple.ch')).toBe(false);
  });
  it('un crédit STRICTEMENT positif : oui ; nul ou négatif : non', async () => {
    await m.creerCompte('riche@exemple.ch', { solde: 5 });
    await m.creerCompte('vide@exemple.ch', { solde: 0 });
    await m.creerCompte('dette@exemple.ch', { solde: -1 });
    expect(m.aUnMoyenPropre('riche@exemple.ch')).toBe(true);
    expect(m.aUnMoyenPropre('vide@exemple.ch')).toBe(false);
    expect(m.aUnMoyenPropre('dette@exemple.ch')).toBe(false);
  });
});

describe('fournisseurLibre — le repli gratuit', () => {
  it('aucun repli configuré : null', async () => {
    const m = await charger();
    expect(m.fournisseurLibre()).toBeNull();
  });
  it('fournisseur configuré mais sans clé serveur (ou clé blanche) : null', async () => {
    expect((await charger({ SECRET_FREE_PROVIDER: 'openrouter' })).fournisseurLibre()).toBeNull();
    expect((await charger({ SECRET_FREE_PROVIDER: 'openrouter', SECRET_OPENROUTER_API_KEY: '   ' })).fournisseurLibre()).toBeNull();
  });
  it('fournisseur inconnu : null', async () => {
    expect((await charger({ SECRET_FREE_PROVIDER: 'skynet', SECRET_OPENROUTER_API_KEY: 'k' })).fournisseurLibre()).toBeNull();
  });
  it('fournisseur ÉCARTÉ (faute de frappe gemini) : null, même avec sa clé', async () => {
    expect((await charger({ SECRET_FREE_PROVIDER: 'gemini', SECRET_GEMINI_API_KEY: 'k' })).fournisseurLibre()).toBeNull();
  });
  it('OpenRouter avec sa clé : servi, et c’est toute la démonstration', async () => {
    const m = await charger({ SECRET_FREE_PROVIDER: 'openrouter', SECRET_OPENROUTER_API_KEY: 'k' });
    expect(m.fournisseurLibre()).toBe('openrouter');
    expect(m.perimetreFournisseurs({ ip: HORS_CAMPUS, email: null }))
      .toMatchObject({ fournisseurs: ['openrouter'], motif: 'demo' });
  });
});

describe('IP d’amorçage SECRET_ALLOWED_IPS', () => {
  it('une IP déclarée dans l’environnement compte pour le campus', async () => {
    const m = await charger({ SECRET_ALLOWED_IPS: '203.0.113.77' });
    expect(m.perimetreFournisseurs({ ip: '203.0.113.77', email: null })).toMatchObject({ campus: true, motif: 'ecole' });
    expect(m.perimetreFournisseurs({ ip: '203.0.113.78', email: null }).campus).toBe(false);
  });
});
