// UC-22 — Tests fonctionnels : « Consulter la fréquentation publique et la
// santé du service ». Le bandeau de l'accueil (src/site/SiteStats.tsx) appelle
// /api/stats?cid=… toutes les 30 s ; la supervision appelle /api/health ; le
// formulaire d'inscription d'une école appelle /api/ip. Les routes sont
// rechargées par test (le module de statistiques garde un cache de 5 s) et
// l'horloge est simulée.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { appeler } from '../../helpers/api';
import { poserEnv } from '../../helpers/env';

const ENV = ['SECRET_FREE_PROVIDER', 'SECRET_OPENROUTER_API_KEY', 'SECRET_ALLOWED_IPS', 'SECRET_PROXY_TOKEN'];
const T0 = new Date('2026-09-29T10:00:00Z').getTime();
let horloge = T0;
/** Avance l'horloge au-delà du cache de 5 s des compteurs. */
const plusTard = (ms = 6_000) => { horloge += ms; vi.setSystemTime(horloge); };

async function charger(env: Record<string, string> = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  horloge = T0;
  vi.setSystemTime(T0);
  poserEnv(env);
  const db = await import('../../helpers/db');
  await db.viderBase();
  return {
    ...db,
    stats: (await import('../../../src/pages/api/stats')).default,
    health: (await import('../../../src/pages/api/health')).default,
    ip: (await import('../../../src/pages/api/ip')).default,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock('../../../src/server/db');
  poserEnv(Object.fromEntries(ENV.map(k => [k, undefined])));
});

const CID_A = '6f1c0d2e-1111-4a4a-9b9b-000000000001';
const CID_B = '6f1c0d2e-2222-4a4a-9b9b-000000000002';

describe('Scénario nominal : le bandeau de fréquentation (GET /api/stats)', () => {
  it('rend les agrégats publics et compte le visiteur « en ligne »', async () => {
    const m = await charger();
    await m.creerCompte('a@exemple.ch');
    await m.creerTuteur({ name: 'Socrate' });
    const r = await appeler(m.stats, { query: { cid: CID_A }, ip: '198.51.100.1' });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ accounts: 1, prompts: 1, tokens: 0, online: 1, freeCreditsUsd: null, freeBudgetUsd: null });
    expect(r.headers['cache-control']).toBe('no-store');
  });

  it('chaque navigateur compte une fois, quel que soit le nombre de rafraîchissements', async () => {
    const m = await charger();
    await appeler(m.stats, { query: { cid: CID_A }, ip: '198.51.100.1' });
    plusTard();
    await appeler(m.stats, { query: { cid: CID_A }, ip: '198.51.100.1' });
    plusTard();
    const r = await appeler(m.stats, { query: { cid: CID_B }, ip: '198.51.100.1' });
    expect(r.json.online).toBe(2);
    // Aucune trace en clair de l'identifiant ni de l'adresse.
    const lignes = (await m.base()).prepare('SELECT id FROM presence').all() as any[];
    expect(JSON.stringify(lignes)).not.toMatch(/6f1c0d2e|198\.51/);
  });

  it('dans les 5 secondes, les compteurs viennent du cache (le nouveau venu n’y est pas encore)', async () => {
    const m = await charger();
    await appeler(m.stats, { query: { cid: CID_A }, ip: '198.51.100.1' });
    const r = await appeler(m.stats, { query: { cid: CID_B }, ip: '198.51.100.2' });
    expect(r.json.online).toBe(1);
    plusTard();
    expect((await appeler(m.stats, { query: { cid: CID_B }, ip: '198.51.100.2' })).json.online).toBe(2);
  });

  it('un visiteur inactif depuis plus de 5 minutes n’est plus « en ligne »', async () => {
    const m = await charger();
    await appeler(m.stats, { query: { cid: CID_A }, ip: '198.51.100.1' });
    plusTard(6 * 60_000);
    expect((await appeler(m.stats, { query: { cid: CID_B }, ip: '198.51.100.2' })).json.online).toBe(1);
  });

  it('un identifiant invalide est ignoré : le visiteur est alors compté par son adresse', async () => {
    const m = await charger();
    await appeler(m.stats, { query: { cid: '<script>' }, ip: '198.51.100.1' });
    plusTard();
    await appeler(m.stats, { query: { cid: 'court' }, ip: '198.51.100.1' });
    plusTard();
    const r = await appeler(m.stats, { ip: '198.51.100.3' });
    expect(r.json.online).toBe(2);
  });

  it('repli gratuit servi : le budget du jour s’affiche', async () => {
    const m = await charger({ SECRET_FREE_PROVIDER: 'openrouter', SECRET_OPENROUTER_API_KEY: 'k' });
    const r = await appeler(m.stats, { query: { cid: CID_A }, ip: '198.51.100.1' });
    expect(r.json).toMatchObject({ freeCreditsUsd: 1, freeBudgetUsd: 1 });
  });

  it('méthode autre que GET → 405', async () => {
    const m = await charger();
    const r = await appeler(m.stats, { method: 'POST', ip: '198.51.100.1' });
    expect(r.status).toBe(405);
    expect(r.json.error.code).toBe('ERR_METHOD_NOT_ALLOWED');
    expect(r.headers.allow).toEqual(['GET']);
  });

  it('base indisponible → 500 ERR_STATS (le bandeau se tait côté client)', async () => {
    vi.doMock('../../../src/server/db', () => ({ getDb: () => { throw new Error('base fermée'); } }));
    poserEnv({});
    const stats = (await import('../../../src/pages/api/stats')).default;
    const r = await appeler(stats, { query: { cid: CID_A }, ip: '198.51.100.1' });
    expect(r.status).toBe(500);
    expect(r.json.error.code).toBe('ERR_STATS');
  });
});

describe('Santé du service (GET /api/health)', () => {
  it('répond ok avec le nombre de tuteurs publiés', async () => {
    const m = await charger();
    await m.creerTuteur({ name: 'Publié' });
    await m.creerTuteur({ name: 'Brouillon', status: 'draft' });
    const r = await appeler(m.health, { ip: '198.51.100.1' });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, publishedPrompts: 1 });
  });

  it('exclut les tuteurs publiés ARCHIVÉS, comme le bandeau public', async () => {
    // Anomalie corrigée (fiche UC-22) : la sonde comptait aussi les archivés.
    const m = await charger();
    await m.creerTuteur({ name: 'Publié' });
    await m.creerTuteur({ name: 'Archivé', archived: true });
    expect((await appeler(m.health, { ip: '198.51.100.1' })).json.publishedPrompts).toBe(1);
    expect((await appeler(m.stats, { ip: '198.51.100.1' })).json.prompts).toBe(1);
  });

  it('ne filtre pas la méthode (sonde de supervision)', async () => {
    const m = await charger();
    expect((await appeler(m.health, { method: 'HEAD', ip: '198.51.100.1' })).status).toBe(200);
  });

  it('base indisponible → 500 { ok: false }', async () => {
    vi.doMock('../../../src/server/db', () => ({ getDb: () => { throw new Error('base fermée'); } }));
    poserEnv({});
    const health = (await import('../../../src/pages/api/health')).default;
    const r = await appeler(health, { ip: '198.51.100.1' });
    expect(r.status).toBe(500);
    expect(r.json).toEqual({ ok: false });
  });
});

describe('Adresse vue par le serveur (GET /api/ip)', () => {
  it('rend l’adresse retenue, non reconnue, non revendiquée', async () => {
    const m = await charger();
    const r = await appeler(m.ip, { ip: '198.51.100.20' });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ip: '198.51.100.20', isIpAllowed: false, revendiquee: false });
  });

  it('« revendiquee » : l’adresse appartient déjà à un établissement — un booléen, pas son nom', async () => {
    const m = await charger();
    await m.creerEtablissement({ name: 'Collège Secret', ips: '192.0.2.40' });
    const r = await appeler(m.ip, { ip: '192.0.2.40' });
    expect(r.json).toEqual({ ip: '192.0.2.40', isIpAllowed: false, revendiquee: true });
    expect(r.text + JSON.stringify(r.json)).not.toContain('Collège Secret');
  });

  it('« isIpAllowed » : IP d’amorçage déclarée dans SECRET_ALLOWED_IPS', async () => {
    const m = await charger({ SECRET_ALLOWED_IPS: '192.0.2.50' });
    expect((await appeler(m.ip, { ip: '192.0.2.50' })).json).toMatchObject({ isIpAllowed: true, revendiquee: false });
  });

  it('derrière un proxy à secret : un X-Real-IP forgé est ignoré, l’adresse socket est rendue', async () => {
    const m = await charger({ SECRET_PROXY_TOKEN: 'secret-du-proxy' });
    expect((await appeler(m.ip, { ip: '192.0.2.40' })).json.ip).toBe('10.99.99.99');
    const r = await appeler(m.ip, { ip: '192.0.2.40', headers: { 'X-Proxy-Token': 'secret-du-proxy' } });
    expect(r.json.ip).toBe('192.0.2.40');
  });
});
