// UC-13 — Tests unitaires : le CATALOGUE des modèles (src/server/models.ts).
// Source native (avec clé) > déduction d'OpenRouter > modèle par défaut ;
// cache JSON dans DATA_DIR, rafraîchi au plus une fois par jour, jamais
// bloquant. Le réseau est doublé ; chaque test recharge le module (mémoire,
// vols en cours et purgatoire des échecs sont des variables de module) et
// repart d'un cache disque vide.
import fs from 'fs';
import path from 'path';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { poserEnv } from '../../helpers/env';
import { doublerFetch, type Routeur } from '../../helpers/fetch';

// La sonde de tarifs (déclenchée quand une liste change) ne doit rien joindre.
const sonde = vi.hoisted(() => ({ appels: 0 }));
vi.mock('../../../src/server/sondeTarifs', () => ({
  sonderTarifs: async () => { sonde.appels++; },
}));

const FICHIER = () => path.join(process.env.DATA_DIR!, 'models.json');
const CLES = ['SECRET_MISTRAL_API_KEY', 'SECRET_ANTHROPIC_API_KEY', 'SECRET_GEMINI_API_KEY', 'SECRET_QWEN_API_KEY'];

const HEURE = 60 * 60 * 1000;
const T0 = new Date('2026-09-01T08:00:00Z').getTime();

async function charger(routeur: Routeur, env: Record<string, string> = {}) {
  fs.rmSync(FICHIER(), { force: true });
  poserEnv(env);
  const espion = doublerFetch(routeur);
  const m = await import('../../../src/server/models');
  return { ...m, espion };
}
const attendre = (ms = 30) => new Promise(r => setTimeout(r, ms));
const lireCache = () => JSON.parse(fs.readFileSync(FICHIER(), 'utf8'));

afterEach(() => {
  vi.useRealTimers();
  poserEnv(Object.fromEntries(CLES.map(k => [k, undefined])));
  sonde.appels = 0;
});

const OPENROUTER = 'https://openrouter.ai/api/v1/models';
const catalogueOpenrouter = (ids: string[]) => ({ json: { data: ids.map(id => ({ id })) } });

describe('sources de la liste', () => {
  it('sans clé ni source : le seul modèle par défaut, aucun appel réseau', async () => {
    const m = await charger(() => ({ status: 500 }));
    const r = await m.getModels('mistral');
    expect(r).toMatchObject({ source: 'defaut', models: ['mistral-medium-latest'] });
    expect(m.espion).not.toHaveBeenCalled();
  });

  it('OpenAI sans clé : liste DÉDUITE d’OpenRouter (préfixe et variante « :free » retirés)', async () => {
    const m = await charger(url => url === OPENROUTER
      ? catalogueOpenrouter(['openai/o3', 'openai/gpt-5:free', 'openai/gpt-5', 'openai/text-embedding-3-large', 'google/gemini-x'])
      : { status: 404 });
    const r = await m.getModels('openai');
    expect(r.source).toBe('openrouter');
    // Trié, dédoublonné, plongements écartés, modèle par défaut garanti.
    expect(r.models).toEqual(['gpt-5', 'gpt-5.1', 'o3']);
  });

  it('OpenRouter lui-même : son catalogue public, identifiants complets', async () => {
    const m = await charger(url => url === OPENROUTER
      ? catalogueOpenrouter(['mistralai/mistral-small', 'anthropic/claude-sonnet-5'])
      : { status: 404 });
    const r = await m.getModels('openrouter');
    expect(r.source).toBe('native');
    expect(r.models).toEqual(['anthropic/claude-sonnet-5', 'mistralai/mistral-small', 'openai/gpt-5.1']);
  });

  it('clé de catalogue du serveur : liste NATIVE, en-tête Bearer, bruit non conversationnel filtré', async () => {
    const m = await charger(url => url === 'https://api.mistral.ai/v1/models'
      ? catalogueOpenrouter(['mistral-large-latest', 'mistral-embed', 'mistral-ocr-latest', 'codestral-latest', 'mistral-small-latest'])
      : { status: 404 }, { SECRET_MISTRAL_API_KEY: 'cle-mistral' });
    const r = await m.getModels('mistral');
    expect(r.source).toBe('native');
    expect(r.models).toEqual(['codestral-latest', 'mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest']);
    const init = m.espion.mock.calls[0][1] as RequestInit;
    expect((init.headers as any).Authorization).toBe('Bearer cle-mistral');
  });

  it('Anthropic : en-têtes x-api-key et anthropic-version', async () => {
    const m = await charger(() => catalogueOpenrouter(['claude-opus-5']), { SECRET_ANTHROPIC_API_KEY: 'cle-a' });
    await m.getModels('anthropic');
    const [url, init] = m.espion.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/models');
    expect(init.headers).toEqual({ 'x-api-key': 'cle-a', 'anthropic-version': '2023-06-01' });
  });

  it('Gemini : en-tête x-goog-api-key et dialecte « models/… »', async () => {
    const m = await charger(() => ({ json: { models: [{ name: 'models/gemini-pro-latest' }, { name: 'models/imagen-4' }] } }),
      { SECRET_GEMINI_API_KEY: 'cle-g' });
    const r = await m.getModels('gemini');
    expect((m.espion.mock.calls[0][1] as any).headers).toEqual({ 'x-goog-api-key': 'cle-g' });
    expect(r.models).toEqual(['gemini-3.5-flash', 'gemini-pro-latest']);
  });

  it('fournisseur chinois (clé de catalogue seule) : modèles « coder », image, audio écartés', async () => {
    const m = await charger(() => catalogueOpenrouter(['qwen3.7-plus', 'qwen3-coder-plus', 'qwen-image', 'qwen-tts', 'qwen3.7-max']),
      { SECRET_QWEN_API_KEY: 'cle-q' });
    expect((await m.getModels('qwen')).models).toEqual(['qwen-plus', 'qwen3.7-max', 'qwen3.7-plus']);
  });

  it('clé du VISITEUR : sert à demander la liste native, sans être conservée', async () => {
    const m = await charger(url => url === 'https://api.mistral.ai/v1/models'
      ? catalogueOpenrouter(['mistral-large-latest']) : { status: 404 });
    const r = await m.getModels('mistral', 'cle-visiteur');
    expect(r.source).toBe('native');
    expect((m.espion.mock.calls[0][1] as any).headers.Authorization).toBe('Bearer cle-visiteur');
    expect(fs.readFileSync(FICHIER(), 'utf8')).not.toContain('cle-visiteur');
  });
});

describe('cache d’un jour, jamais bloquant', () => {
  it('écrit models.json dans DATA_DIR et ne redemande rien avant 24 h', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const m = await charger(() => catalogueOpenrouter(['openai/gpt-5']));
    await m.getModels('openai');
    expect(lireCache().entries.openai).toMatchObject({ source: 'openrouter', at: T0 });
    const appels = m.espion.mock.calls.length;
    vi.setSystemTime(T0 + 23 * HEURE);
    const r = await m.getModels('openai');
    expect(r.updatedAt).toBe(T0);
    await attendre();
    expect(m.espion.mock.calls.length).toBe(appels);
  });

  it('cache périmé : l’ancienne liste est rendue AUSSITÔT, la nouvelle arrive en arrière-plan', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    let ids = ['openai/gpt-5'];
    const m = await charger(url => url === OPENROUTER ? catalogueOpenrouter(ids) : { status: 404 });
    await m.getModels('openai');
    // Le catalogue d'OpenRouter lui-même est mémorisé 24 h : on passe le jour.
    ids = ['openai/gpt-6'];
    vi.setSystemTime(T0 + 25 * HEURE);
    const perime = await m.getModels('openai');
    expect(perime.models).toEqual(['gpt-5', 'gpt-5.1']);
    await attendre();
    expect((await m.getModels('openai')).models).toEqual(['gpt-5.1', 'gpt-6']);
  });

  it('le cache disque est relu au démarrage (redémarrage du serveur)', async () => {
    fs.writeFileSync(FICHIER(), JSON.stringify({ entries: { mistral: { at: Date.now(), source: 'native', models: ['m-du-disque'] } } }));
    poserEnv({});
    const espion = doublerFetch(() => ({ status: 500 }));
    const m = await import('../../../src/server/models');
    expect((await m.getModels('mistral')).models).toEqual(['m-du-disque']);
    expect(espion).not.toHaveBeenCalled();
  });

  it('un cache disque illisible est ignoré (on repart de zéro)', async () => {
    fs.writeFileSync(FICHIER(), '{pas du json');
    poserEnv({});
    doublerFetch(() => ({ status: 500 }));
    const m = await import('../../../src/server/models');
    expect((await m.getModels('mistral')).source).toBe('defaut');
  });

  it('une seule interrogation en vol par fournisseur (démarrage à froid)', async () => {
    const m = await charger(() => catalogueOpenrouter(['mistral-large-latest']), { SECRET_MISTRAL_API_KEY: 'k' });
    const [a, b] = await Promise.all([m.getModels('mistral'), m.getModels('mistral')]);
    expect(a.models).toEqual(b.models);
    expect(m.espion).toHaveBeenCalledTimes(1);
  });

  it('PANNE du fournisseur à l’échéance : l’ancienne liste reste EN PLACE, réessai dans l’heure', async () => {
    // Anomalie corrigée (fiche UC-13) : le repli « défaut » rendu par build()
    // remplaçait la liste native complète pendant 24 h.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    let panne = false;
    let ids = ['mistral-large-latest'];
    const m = await charger(() => panne ? { status: 503 } : catalogueOpenrouter(ids),
      { SECRET_MISTRAL_API_KEY: 'k' });
    expect((await m.getModels('mistral')).models).toEqual(['mistral-large-latest', 'mistral-medium-latest']);
    expect(m.espion).toHaveBeenCalledTimes(1);
    panne = true;
    vi.setSystemTime(T0 + 25 * HEURE);
    await m.getModels('mistral');
    await attendre();
    expect(m.espion).toHaveBeenCalledTimes(2);
    const apres = await m.getModels('mistral');
    // La bonne liste, avec sa date d'origine (elle n'a pas été confirmée).
    expect(apres).toMatchObject({ source: 'native', models: ['mistral-large-latest', 'mistral-medium-latest'], updatedAt: T0 });
    expect(lireCache().entries.mistral).toMatchObject({ source: 'native', at: T0 });

    // Pas de nouvel essai avant l'heure…
    vi.setSystemTime(T0 + 25 * HEURE + 30 * 60_000);
    await m.getModels('mistral');
    await attendre();
    expect(m.espion).toHaveBeenCalledTimes(2);

    // … puis le fournisseur revient : la liste est relue et redatée.
    panne = false;
    ids = ['mistral-large-latest', 'mistral-small-latest'];
    vi.setSystemTime(T0 + 26 * HEURE + 1);
    await m.getModels('mistral');
    await attendre();
    expect(m.espion).toHaveBeenCalledTimes(3);
    expect(await m.getModels('mistral')).toMatchObject({
      source: 'native', updatedAt: T0 + 26 * HEURE + 1,
      models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'],
    });
  });

  it('PANNE : une liste qu’on n’arrive plus à confirmer depuis sept jours cède au repli', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    let panne = false;
    const m = await charger(() => panne ? { status: 503 } : catalogueOpenrouter(['mistral-large-latest']),
      { SECRET_MISTRAL_API_KEY: 'k' });
    await m.getModels('mistral');
    panne = true;
    vi.setSystemTime(T0 + 7 * 24 * HEURE + 1);
    await m.getModels('mistral');
    await attendre();
    expect(await m.getModels('mistral')).toMatchObject({ source: 'defaut', models: ['mistral-medium-latest'] });
  });

  it('PANNE pendant la reconstruction de l’administration : l’ancienne liste reste aussi', async () => {
    let panne = false;
    const m = await charger(() => panne ? { status: 503 } : catalogueOpenrouter(['mistral-large-latest']),
      { SECRET_MISTRAL_API_KEY: 'k' });
    await m.getModels('mistral');
    panne = true;
    const r = await m.refreshAllModels();
    expect(r.find(l => l.provider === 'mistral')).toEqual({ provider: 'mistral', source: 'native', count: 2 });
    await attendre();
    expect(sonde.appels).toBe(0);
  });
});

describe('amélioration par une clé, et purgatoire d’une minute', () => {
  it('une liste de repli est remplacée TOUT DE SUITE dès qu’une clé apparaît', async () => {
    const m = await charger(url => url === OPENROUTER ? catalogueOpenrouter(['openai/gpt-5'])
      : url === 'https://api.openai.com/v1/models' ? catalogueOpenrouter(['gpt-5', 'gpt-5.5-pro']) : { status: 404 });
    expect((await m.getModels('openai')).source).toBe('openrouter');
    const r = await m.getModels('openai', 'sk-visiteur');
    expect(r.source).toBe('native');
    expect(r.models).toContain('gpt-5.5-pro');
  });

  it('une clé fautive n’est pas réessayée avant une minute', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const m = await charger(() => ({ status: 401, json: { error: 'bad key' } }));
    expect((await m.getModels('mistral', 'mauvaise')).source).toBe('defaut');
    expect(m.espion).toHaveBeenCalledTimes(1);
    vi.setSystemTime(T0 + 30_000);
    await m.getModels('mistral', 'mauvaise');
    expect(m.espion).toHaveBeenCalledTimes(1);
    vi.setSystemTime(T0 + 61_000);
    await m.getModels('mistral', 'mauvaise');
    expect(m.espion).toHaveBeenCalledTimes(2);
  });
});

describe('administration : état et reconstruction', () => {
  it('catalogueStatus dit « jamais » avant toute lecture, puis la source, le nombre et la date', async () => {
    const m = await charger(() => ({ status: 500 }));
    expect(m.catalogueStatus().find(s => s.provider === 'mistral')).toEqual({ provider: 'mistral', source: 'jamais', count: 0, at: 0 });
    await m.getModels('mistral');
    expect(m.catalogueStatus().find(s => s.provider === 'mistral')).toMatchObject({ source: 'defaut', count: 1 });
    expect(m.catalogueStatus()).toHaveLength(m.CATALOGUE_PROVIDERS.length);
  });

  it('refreshAllModels reconstruit les onze listes et lève le purgatoire des échecs', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    let ids = ['openai/gpt-5'];
    const m = await charger(url => url === OPENROUTER ? catalogueOpenrouter(ids) : { status: 404 });
    const premier = await m.refreshAllModels();
    expect(premier).toHaveLength(11);
    expect(premier.find(r => r.provider === 'openai')).toEqual({ provider: 'openai', source: 'openrouter', count: 2 });
    expect(premier.find(r => r.provider === 'mistral')).toEqual({ provider: 'mistral', source: 'defaut', count: 1 });
    // Première construction : rien ne « change », la sonde de tarifs reste muette.
    await attendre();
    expect(sonde.appels).toBe(0);

    // Une liste qui change → la sonde de tarifs est lancée (en arrière-plan).
    ids = ['openai/gpt-6'];
    await m.refreshAllModels();
    await attendre();
    expect(sonde.appels).toBe(1);
  });
});
