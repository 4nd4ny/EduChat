// UC-13 — Tests fonctionnels : « Choisir un fournisseur et un modèle ».
// Le sélecteur du chat lit /api/providers (le périmètre : ce que ce visiteur
// peut CHOISIR, et ce que le serveur PAIE), puis /api/models (la liste de
// modèles du fournisseur choisi). Le super-administrateur suit et reconstruit
// le catalogue (/api/admin/models). Le réseau est doublé ; les réglages lus au
// chargement (clés serveur, repli gratuit) imposent un rechargement des
// modules, d'où des imports dynamiques.
import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { appeler } from '../../helpers/api';
import { poserEnv } from '../../helpers/env';
import { doublerFetch, type Routeur } from '../../helpers/fetch';

vi.mock('../../../src/server/sondeTarifs', () => ({ sonderTarifs: async () => {} }));

const ENV = ['SECRET_MISTRAL_API_KEY', 'SECRET_GEMINI_API_KEY', 'SECRET_OPENROUTER_API_KEY', 'SECRET_ANTHROPIC_API_KEY',
  'SECRET_FREE_PROVIDER'];

let n = 0;
const horsCampus = () => `198.51.100.${++n}`;
const CAMPUS = '192.0.2.10';
const TOUTE_LA_SEMAINE = JSON.stringify([0, 1, 2, 3, 4, 5, 6].map(day => ({ day, start: '00:00', end: '23:59' })));

let espion: ReturnType<typeof doublerFetch>;
const OPENROUTER = 'https://openrouter.ai/api/v1/models';
const routeurParDefaut: Routeur = url => {
  if (url === OPENROUTER) return { json: { data: [{ id: 'openai/gpt-5' }, { id: 'openai/o3' }] } };
  if (url === 'https://api.mistral.ai/v1/models') return { json: { data: [{ id: 'mistral-large-latest' }] } };
  return { status: 401, json: {} };
};

/** Recharge routes et fabrique avec la configuration donnée, base et catalogue vides. */
async function charger(env: Record<string, string> = {}, routeur: Routeur = routeurParDefaut) {
  fs.rmSync(path.join(process.env.DATA_DIR!, 'models.json'), { force: true });
  poserEnv(env);
  espion = doublerFetch(routeur);
  const db = await import('../../helpers/db');
  await db.viderBase();
  return {
    ...db,
    providers: (await import('../../../src/pages/api/providers')).default,
    models: (await import('../../../src/pages/api/models')).default,
    adminModels: (await import('../../../src/pages/api/admin/models')).default,
    userKeys: await import('../../../src/server/userKeys'),
  };
}

afterEach(() => { poserEnv(Object.fromEntries(ENV.map(k => [k, undefined]))); });

describe('GET /api/providers — le périmètre de ce visiteur-ci', () => {
  it('anonyme hors campus, sans repli gratuit : rien à choisir (démonstration vide)', async () => {
    const m = await charger();
    const r = await appeler(m.providers, { ip: horsCampus() });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ served: [], internalKey: false, visibles: [], motif: 'demo', campus: false, compte: false });
    expect(r.headers['cache-control']).toBe('private, no-store');
  });

  it('anonyme hors campus avec repli gratuit : OpenRouter seul', async () => {
    const m = await charger({ SECRET_FREE_PROVIDER: 'openrouter', SECRET_OPENROUTER_API_KEY: 'k' });
    const r = await appeler(m.providers, { ip: horsCampus() });
    expect(r.json.visibles).toEqual(['openrouter']);
    // Drapeau rouge : jamais annoncé « servi » par la plateforme.
    expect(r.json.served).toEqual([]);
  });

  it('élève anonyme sur le réseau de l’école : fournisseurs scolaires, motif « ecole »', async () => {
    const m = await charger();
    await m.creerEtablissement({ ips: CAMPUS });
    const r = await appeler(m.providers, { ip: CAMPUS });
    expect(r.json).toMatchObject({ visibles: ['mistral', 'anthropic', 'openai'], motif: 'ecole', campus: true, compte: false });
  });

  it('compte vérifié hors campus : tous les fournisseurs', async () => {
    const m = await charger();
    const token = await m.creerCompte('adulte@exemple.ch');
    const r = await appeler(m.providers, { ip: horsCampus(), token });
    expect(r.json).toMatchObject({ motif: 'tout', compte: true, campus: false });
    expect(r.json.visibles).toHaveLength(11);
  });

  it('compte sur le campus : les règles de l’école… sauf s’il a mémorisé SA clé', async () => {
    const m = await charger();
    await m.creerEtablissement({ ips: CAMPUS });
    const token = await m.creerCompte('prof@ecole.ch');
    expect((await appeler(m.providers, { ip: CAMPUS, token })).json.motif).toBe('ecole');
    m.userKeys.storeUserKey('prof@ecole.ch', 'grok', 'xai-cle');
    const r = await appeler(m.providers, { ip: CAMPUS, token });
    expect(r.json.motif).toBe('tout');
    expect(r.json.visibles).toContain('grok');
  });

  it('compte sur le campus avec un crédit personnel : tout', async () => {
    const m = await charger();
    await m.creerEtablissement({ ips: CAMPUS });
    const token = await m.creerCompte('credit@ecole.ch', { solde: 10 });
    expect((await appeler(m.providers, { ip: CAMPUS, token })).json.motif).toBe('tout');
  });

  it('un jeton dont le compte a disparu ne vaut plus compte', async () => {
    const m = await charger();
    const token = await m.creerCompte('efface@exemple.ch');
    (await m.base()).prepare('DELETE FROM users WHERE email = ?').run('efface@exemple.ch');
    const r = await appeler(m.providers, { ip: horsCampus(), token });
    expect(r.json).toMatchObject({ compte: false, motif: 'demo' });
  });

  it('« served » : seuls les fournisseurs scolaires dont la clé serveur existe', async () => {
    const m = await charger({ SECRET_MISTRAL_API_KEY: 'm', SECRET_GEMINI_API_KEY: 'g', SECRET_OPENROUTER_API_KEY: 'o' });
    const r = await appeler(m.providers, { ip: horsCampus() });
    // Gemini écarté, OpenRouter drapeau rouge : jamais annoncés servis.
    expect(r.json.served).toEqual(['mistral']);
  });

  it('séance restreinte par l’enseignant : le fournisseur décoché sort de « served »', async () => {
    const m = await charger({ SECRET_MISTRAL_API_KEY: 'm', SECRET_ANTHROPIC_API_KEY: 'a' });
    const etab = await m.creerEtablissement({ ips: CAMPUS, hours: TOUTE_LA_SEMAINE });
    (await m.base()).prepare(`INSERT INTO session_settings (etablissement_id, web_search, set_by_email, providers, expires_at)
      VALUES (?, 1, 'prof@ecole.ch', 'anthropic', ?)`).run(etab, Date.now() + 3_600_000);
    const r = await appeler(m.providers, { ip: CAMPUS });
    expect(r.json.served).toEqual(['anthropic']);
    // En plage horaire de l'école : la clé interne répond.
    expect(r.json.internalKey).toBe(true);
  });

  it('école hors plage horaire : pas de clé interne', async () => {
    const m = await charger({ SECRET_MISTRAL_API_KEY: 'm' });
    await m.creerEtablissement({ ips: CAMPUS });
    expect((await appeler(m.providers, { ip: CAMPUS })).json.internalKey).toBe(false);
  });

  it('méthode autre que GET → 405', async () => {
    const m = await charger();
    const r = await appeler(m.providers, { method: 'POST', ip: horsCampus() });
    expect(r.status).toBe(405);
    expect(r.json.error.code).toBe('ERR_METHOD_NOT_ALLOWED');
  });
});

describe('GET / POST /api/models — la liste des modèles du fournisseur choisi', () => {
  it('GET public : liste que le serveur établit seul, cache navigateur d’une heure', async () => {
    const m = await charger();
    const r = await appeler(m.models, { query: { provider: 'openai' }, ip: horsCampus() });
    expect(r.status).toBe(200);
    expect(r.json.models).toEqual(['gpt-5', 'gpt-5.1', 'o3']);
    expect(r.json.updatedAt).toBeGreaterThan(0);
    expect(r.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('GET sans source : le seul modèle par défaut', async () => {
    const m = await charger();
    const r = await appeler(m.models, { query: { provider: 'mistral' }, ip: horsCampus() });
    expect(r.json.models).toEqual(['mistral-medium-latest']);
  });

  it('POST avec la clé saisie : liste native, jamais en cache partagé', async () => {
    const m = await charger();
    const r = await appeler(m.models, { method: 'POST', body: { provider: 'mistral', apiKey: '  cle-saisie  ' }, ip: horsCampus() });
    expect(r.json.models).toEqual(['mistral-large-latest', 'mistral-medium-latest']);
    expect(r.headers['cache-control']).toBe('private, no-store');
    const appel = espion.mock.calls.find(c => c[0] === 'https://api.mistral.ai/v1/models')!;
    expect((appel[1] as any).headers.Authorization).toBe('Bearer cle-saisie');
  });

  it('POST d’un compte sans clé saisie : le serveur va chercher SA clé mémorisée', async () => {
    const m = await charger();
    const token = await m.creerCompte('prof@exemple.ch');
    m.userKeys.storeUserKey('prof@exemple.ch', 'mistral', 'cle-memorisee');
    const r = await appeler(m.models, { method: 'POST', token, body: { provider: 'mistral' }, ip: horsCampus() });
    expect(r.json.models).toContain('mistral-large-latest');
    const appel = espion.mock.calls.find(c => c[0] === 'https://api.mistral.ai/v1/models')!;
    expect((appel[1] as any).headers.Authorization).toBe('Bearer cle-memorisee');
  });

  it('POST anonyme sans clé : même liste que le GET, cache public', async () => {
    const m = await charger();
    const r = await appeler(m.models, { method: 'POST', body: { provider: 'mistral' }, ip: horsCampus() });
    expect(r.json.models).toEqual(['mistral-medium-latest']);
    expect(r.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('fournisseur absent ou inconnu → 400 ERR_PROVIDER_UNSUPPORTED', async () => {
    const m = await charger();
    for (const opts of [{ query: {} }, { query: { provider: 'skynet' } }, { method: 'POST', body: { provider: 'skynet' } }]) {
      const r = await appeler(m.models, { ...opts, ip: horsCampus() });
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('ERR_PROVIDER_UNSUPPORTED');
    }
  });

  it('méthode autre que GET/POST → 405', async () => {
    const m = await charger();
    const r = await appeler(m.models, { method: 'DELETE', query: { provider: 'mistral' }, ip: horsCampus() });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toEqual(['GET', 'POST']);
  });
});

describe('/api/admin/models — état et reconstruction du catalogue (super-administrateur)', () => {
  it('GET : « jamais » avant toute lecture, puis la source de chaque liste', async () => {
    const m = await charger();
    const token = await m.creerCompte('super@educh.at');
    const avant = await appeler(m.adminModels, { token, ip: horsCampus() });
    expect(avant.status).toBe(200);
    expect(avant.json.catalogue.every((c: any) => c.source === 'jamais')).toBe(true);
    await appeler(m.models, { query: { provider: 'openai' }, ip: horsCampus() });
    const apres = await appeler(m.adminModels, { token, ip: horsCampus() });
    expect(apres.json.catalogue.find((c: any) => c.provider === 'openai')).toMatchObject({ source: 'openrouter', count: 3 });
  });

  it('POST : reconstruction immédiate des onze listes', async () => {
    const m = await charger({ SECRET_MISTRAL_API_KEY: 'k' });
    const token = await m.creerCompte('super@educh.at');
    const r = await appeler(m.adminModels, { method: 'POST', token, ip: horsCampus() });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    const parFournisseur = Object.fromEntries(r.json.catalogue.map((c: any) => [c.provider, c]));
    expect(Object.keys(parFournisseur)).toHaveLength(11);
    expect(parFournisseur.mistral).toMatchObject({ source: 'native', count: 2 });
    expect(parFournisseur.openai.source).toBe('openrouter');
    expect(parFournisseur.anthropic).toMatchObject({ source: 'defaut', count: 1 });
  });

  it('droits : anonyme, compte, administrateur d’école → 403, avant même la méthode', async () => {
    const m = await charger();
    const etab = await m.creerEtablissement();
    const jetons = [undefined, await m.creerCompte('a@exemple.ch'),
      await m.creerCompte('dir@ecole.ch', { etablissementId: etab, schoolAdmin: true, teacher: true })];
    for (const token of jetons) {
      for (const method of ['GET', 'POST', 'PUT']) {
        const r = await appeler(m.adminModels, { method, token, ip: horsCampus() });
        expect(r.status).toBe(403);
        expect(r.json.error.code).toBe('ERR_FORBIDDEN');
      }
    }
    expect(espion).not.toHaveBeenCalled(); // aucune reconstruction déclenchée
  });

  it('méthode non prévue pour le super-administrateur → 405', async () => {
    const m = await charger();
    const r = await appeler(m.adminModels, { method: 'PUT', token: await m.creerCompte('super@educh.at'), ip: horsCampus() });
    expect(r.status).toBe(405);
  });
});
