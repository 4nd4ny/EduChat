// UC-15 — Tests fonctionnels : cases « fournisseurs autorisés » quand la
// plateforme détient des clés serveur, et salle d'amorçage sans école en base.
// DeveloperKeys et AllowedIps sont figés au chargement de src/utils/env.ts :
// on pose l'environnement puis on charge les routes dynamiquement.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { appeler, type ApiHandler } from '../../helpers/api';
import { poserEnv } from '../../helpers/env';

let reglages: ApiHandler;
let statut: ApiHandler;
let acces: typeof import('../../../src/server/access');
let db: typeof import('../../helpers/db');

beforeAll(async () => {
  poserEnv({
    SECRET_MISTRAL_API_KEY: 'cle-factice-mistral',
    SECRET_OPENAI_API_KEY: 'cle-factice-openai',
    // Anthropic sans clé : hors de l'univers des cases.
    SECRET_XAI_API_KEY: 'cle-factice-grok', // écarté d'un public scolaire : jamais proposé
    SECRET_ALLOWED_IPS: '192.0.2.30',
  });
  reglages = (await import('../../../src/pages/api/session-settings')).default;
  statut = (await import('../../../src/pages/api/session-status')).default;
  acces = await import('../../../src/server/access');
  db = await import('../../helpers/db');
});
afterAll(() => {
  poserEnv({ SECRET_MISTRAL_API_KEY: undefined, SECRET_OPENAI_API_KEY: undefined, SECRET_XAI_API_KEY: undefined, SECRET_ALLOWED_IPS: undefined });
});
beforeEach(async () => { await db.viderBase(); });

let m = 0;
async function ecoleOuverte() {
  const ip = `198.51.100.${++m}`;
  const id = await db.creerEtablissement({ ips: ip });
  await acces.setAuthLock(`etab:${id}`, 30);
  return { id, ip };
}
const providers = async (id: number) =>
  ((await db.base()).prepare('SELECT providers FROM session_settings WHERE etablissement_id = ?').get(id) as any).providers;

describe('Univers des cases : liste scolaire ∩ clés serveur', () => {
  it('session-status propose mistral et openai seulement', async () => {
    const a = await ecoleOuverte();
    expect((await appeler(statut, { method: 'GET', ip: a.ip })).json.schoolProviders).toEqual(['mistral', 'openai']);
  });

  it('tout coché (sur l’univers) = aucune restriction : colonne vide', async () => {
    const a = await ecoleOuverte();
    await appeler(reglages, { method: 'PUT', ip: a.ip, body: { providers: ['openai', 'mistral'] } });
    expect(await providers(a.id)).toBe('');
    const g = (await appeler(reglages, { method: 'GET', ip: a.ip })).json.settings;
    expect(g).toMatchObject({ providers: [], providersRestricted: false });
  });

  it('une partie cochée : restriction enregistrée', async () => {
    const a = await ecoleOuverte();
    await appeler(reglages, { method: 'PUT', ip: a.ip, body: { providers: ['openai'] } });
    expect(await providers(a.id)).toBe('openai');
  });

  it('une case hors univers (anthropic sans clé) est conservée si cochée', async () => {
    const a = await ecoleOuverte();
    await appeler(reglages, { method: 'PUT', ip: a.ip, body: { providers: ['mistral', 'openai', 'anthropic'] } });
    expect(await providers(a.id)).toBe('');
    await appeler(reglages, { method: 'PUT', ip: a.ip, body: { providers: ['anthropic'] } });
    expect(await providers(a.id)).toBe('anthropic');
  });
});

describe('Salle d’amorçage (SECRET_ALLOWED_IPS) sans école en base', () => {
  it('salle ouverte mais aucune école cible : 400 ERR_NO_ETABLISSEMENT', async () => {
    await acces.setAuthLock('amorcage', 30);
    const r = await appeler(reglages, { method: 'PUT', ip: '192.0.2.30', body: {} });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('ERR_NO_ETABLISSEMENT');
  });

  it('session-status : salle ouvrable et ouverte, sans nom d’école', async () => {
    await acces.setAuthLock('amorcage', 30);
    const r = (await appeler(statut, { method: 'GET', ip: '192.0.2.30' })).json;
    expect(r).toMatchObject({ etablissement: null, ecole: null, salleOuvrable: true, open: true });
    expect(r.lockExpiresAt).toBeGreaterThan(Date.now());
  });
});
