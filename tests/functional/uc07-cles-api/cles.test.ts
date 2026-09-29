// UC-07 — Tests fonctionnels : « Mémoriser ses clés API » (GET/PUT/DELETE
// /api/keys), puis réutilisation d'une clé mémorisée par le serveur pour le
// compte de son propriétaire (/api/models en POST sans clé saisie). Le réseau
// sortant est doublé.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerCompte } from '../../helpers/db';
import { doublerFetch } from '../../helpers/fetch';

import cles from '../../../src/pages/api/keys';
import modeles from '../../../src/pages/api/models';
import { issueToken } from '../../../src/server/token';

let n = 0;
const ipNeuve = () => `192.0.2.${++n}`;

beforeEach(async () => { await viderBase(); });
afterEach(() => { vi.unstubAllGlobals(); });

const lire = (jeton: string) => appeler(cles, { token: jeton, ip: ipNeuve() });
const ecrire = (jeton: string, body: unknown) => appeler(cles, { method: 'PUT', token: jeton, body, ip: ipNeuve() });

describe('Scénario nominal : mémoriser une clé en cochant la case', () => {
  it('consentement et clé dans la même requête ; la clé ne redescend jamais', async () => {
    const jeton = await creerCompte('ada@ecole.ch');
    expect((await lire(jeton)).json).toEqual({ optin: false, providers: [], available: true });

    const r = await ecrire(jeton, { optin: true, provider: 'openai', apiKey: '  sk-ada-123  ' });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, optin: true, providers: ['openai'] });
    expect((await lire(jeton)).json).toEqual({ optin: true, providers: ['openai'], available: true });

    const ligne = (await base()).prepare('SELECT key_enc FROM user_keys WHERE email=?').get('ada@ecole.ch') as any;
    expect(ligne.key_enc).not.toContain('sk-ada-123');
    for (const rep of [r, await lire(jeton)]) expect(JSON.stringify(rep.json)).not.toContain('sk-ada');
  });

  it('une fois le consentement acquis, d’autres clés s’ajoutent sans le redemander', async () => {
    const jeton = await creerCompte('ada@ecole.ch');
    await ecrire(jeton, { optin: true, provider: 'openai', apiKey: 'k1' });
    const r = await ecrire(jeton, { provider: 'mistral', apiKey: 'k2' });
    expect(r.json.providers.sort()).toEqual(['mistral', 'openai']);
  });

  it('le serveur utilise la clé mémorisée pour le compte de son titulaire', async () => {
    const jeton = await creerCompte('ada@ecole.ch');
    await ecrire(jeton, { optin: true, provider: 'mistral', apiKey: 'cle-mistral-ada' });
    const espion = doublerFetch(url => (url.startsWith('https://api.mistral.ai/')
      ? { json: { data: [{ id: 'mistral-large-latest' }, { id: 'mistral-small-latest' }] } }
      : { json: { data: [] } }));
    const r = await appeler(modeles, { method: 'POST', token: jeton, body: { provider: 'mistral' }, ip: ipNeuve() });
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('private, no-store');
    const appelMistral = espion.mock.calls.find(([url]) => String(url).startsWith('https://api.mistral.ai/'));
    expect(appelMistral).toBeDefined();
    expect((appelMistral![1] as any).headers.Authorization).toBe('Bearer cle-mistral-ada');
  });
});

describe('Scénarios alternatifs : oublier', () => {
  it('oublie la clé d’un fournisseur, puis toutes', async () => {
    const jeton = await creerCompte('ada@ecole.ch');
    await ecrire(jeton, { optin: true, provider: 'openai', apiKey: 'k1' });
    await ecrire(jeton, { provider: 'anthropic', apiKey: 'k2' });
    const une = await appeler(cles, { method: 'DELETE', token: jeton, query: { provider: 'openai' }, ip: ipNeuve() });
    expect(une.json).toEqual({ ok: true, providers: ['anthropic'] });
    const toutes = await appeler(cles, { method: 'DELETE', token: jeton, ip: ipNeuve() });
    expect(toutes.json).toEqual({ ok: true, providers: [] });
    // Le consentement, lui, reste acquis.
    expect((await lire(jeton)).json.optin).toBe(true);
  });

  it('décocher le consentement efface toutes les clés', async () => {
    const jeton = await creerCompte('ada@ecole.ch');
    await ecrire(jeton, { optin: true, provider: 'openai', apiKey: 'k1' });
    const r = await ecrire(jeton, { optin: false });
    expect(r.json).toEqual({ ok: true, optin: false, providers: [] });
    expect((await base()).prepare('SELECT COUNT(*) AS n FROM user_keys').get()).toEqual({ n: 0 });
  });

  it('chacun n’oublie que ses propres clés', async () => {
    const a = await creerCompte('a@ecole.ch');
    const b = await creerCompte('b@ecole.ch');
    await ecrire(a, { optin: true, provider: 'openai', apiKey: 'ka' });
    await ecrire(b, { optin: true, provider: 'openai', apiKey: 'kb' });
    await appeler(cles, { method: 'DELETE', token: b, ip: ipNeuve() });
    expect((await lire(a)).json.providers).toEqual(['openai']);
  });
});

describe('Scénarios d’erreur', () => {
  it('sans consentement, aucune clé n’est mémorisée', async () => {
    const jeton = await creerCompte('ada@ecole.ch');
    const r = await ecrire(jeton, { provider: 'openai', apiKey: 'k1' });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ERR_KEYS_OPTOUT');
    expect((await base()).prepare('SELECT COUNT(*) AS n FROM user_keys').get()).toEqual({ n: 0 });
  });

  it('fournisseur inconnu ou clé vide/trop longue : refus, et aucun consentement enregistré', async () => {
    const jeton = await creerCompte('ada@ecole.ch');
    const inconnu = await ecrire(jeton, { optin: true, provider: 'inconnu', apiKey: 'k' });
    expect(inconnu.status).toBe(400);
    expect(inconnu.json.error.code).toBe('ERR_PROVIDER_UNSUPPORTED');
    const vide = await ecrire(jeton, { optin: true, provider: 'openai', apiKey: '   ' });
    expect(vide.status).toBe(400);
    expect(vide.json.error.code).toBe('ERR_KEY_INVALID');
    const sansFournisseur = await ecrire(jeton, { optin: true, apiKey: 'k' });
    expect(sansFournisseur.json.error.code).toBe('ERR_PROVIDER_UNSUPPORTED');
    const longue = await ecrire(jeton, { optin: true, provider: 'openai', apiKey: 'k'.repeat(513) });
    expect(longue.json.error.code).toBe('ERR_KEY_INVALID');
    expect((await lire(jeton)).json.optin).toBe(false);
    expect((await ecrire(jeton, { optin: true, provider: 'openai', apiKey: 'k'.repeat(512) })).status).toBe(200);
  });

  it('refuse d’oublier la clé d’un fournisseur inconnu', async () => {
    const jeton = await creerCompte('ada@ecole.ch');
    const r = await appeler(cles, { method: 'DELETE', token: jeton, query: { provider: 'inconnu' }, ip: ipNeuve() });
    expect(r.status).toBe(400);
  });

  it('refuse sans jeton ; 429 au-delà de 20 appels par minute et par IP ; 405', async () => {
    expect((await appeler(cles, { ip: ipNeuve() })).status).toBe(401);
    const jeton = await creerCompte('ada@ecole.ch');
    const ip = ipNeuve();
    for (let i = 0; i < 20; i++) expect((await appeler(cles, { token: jeton, ip })).status).toBe(200);
    const r = await appeler(cles, { token: jeton, ip });
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe('ERR_RATE_LIMIT');
    const m = await appeler(cles, { method: 'POST', token: jeton, ip: ipNeuve() });
    expect(m.status).toBe(405);
    expect(m.headers.allow).toEqual(['GET', 'PUT', 'DELETE']);
  });

  it('un jeton dont le compte n’existe pas peut quand même déposer une clé (anomalie)', async () => {
    // Comportement ACTUEL — voir « Anomalies constatées » : la route ne vérifie
    // pas que le compte existe ; le consentement ne s'écrit nulle part (aucune
    // ligne users) mais la clé, elle, est stockée.
    const fantome = issueToken('Fantôme', 'fantome@ecole.ch');
    const r = await ecrire(fantome, { optin: true, provider: 'openai', apiKey: 'k-fantome' });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, optin: false, providers: ['openai'] });
    expect((await base()).prepare('SELECT COUNT(*) AS n FROM user_keys WHERE email=?').get('fantome@ecole.ch')).toEqual({ n: 1 });
  });
});
