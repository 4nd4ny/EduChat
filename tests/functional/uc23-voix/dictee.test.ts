// UC-23 — Tests fonctionnels : DICTER (POST /api/transcribe). La vraie route
// s'exécute ; seules les API de transcription (OpenAI, Mistral) sont doublées.
// Clés internes OpenAI et Mistral configurées (voie « école »), posées avant
// le chargement de src/utils/env.ts.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SECRET_MISTRAL_API_KEY = 'cle-serveur-mistral';
  process.env.SECRET_OPENAI_API_KEY = 'cle-serveur-openai';
  process.env.SECRET_XAI_API_KEY = 'cle-serveur-xai';
});

import transcribe from '../../../src/pages/api/transcribe';
import { setAuthLock, porteeEtablissement } from '../../../src/server/access';
import { storeUserKey } from '../../../src/server/userKeys';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerCompte, creerEtablissement } from '../../helpers/db';
import { doublerFetch, type Routeur } from '../../helpers/fetch';

let n = 0;
const ipMaison = () => `198.51.100.${++n}`;
let m = 0;
const ipEcole = () => `192.0.2.${++m}`;

const AUDIO = Buffer.from('audio-factice-de-test').toString('base64');
let routeur: Routeur;
let espion: ReturnType<typeof doublerFetch>;

beforeEach(async () => {
  await viderBase();
  routeur = () => ({ json: { text: 'Pourquoi le ciel est bleu ?' } });
  espion = doublerFetch((url, init) => routeur(url, init));
});
afterEach(() => { vi.unstubAllGlobals(); });

const dicter = (body: Record<string, unknown>, o: { ip?: string; token?: string } = {}) =>
  appeler(transcribe, { method: 'POST', ip: o.ip ?? ipMaison(), token: o.token, body: { mimeType: 'audio/webm', audio: AUDIO, ...body } });

async function journal() {
  return (await base()).prepare('SELECT * FROM usage_log').all() as any[];
}

async function ecoleOuverte(solde = 10) {
  const ip = ipEcole();
  const id = await creerEtablissement({ ips: ip, solde });
  await setAuthLock(porteeEtablissement(id), 30);
  return { id, ip };
}

describe('Scénario nominal : dictée avec sa clé personnelle', () => {
  it('OpenAI : relaie l’audio en multipart à gpt-4o-mini-transcribe et rend le texte', async () => {
    const r = await dicter({ provider: 'openai', apiKey: 'sk-perso', mimeType: 'audio/webm;codecs=opus' });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ text: 'Pourquoi le ciel est bleu ?' });
    const [url, init] = espion.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect((init!.headers as any).Authorization).toBe('Bearer sk-perso');
    const form = init!.body as FormData;
    expect(form.get('model')).toBe('gpt-4o-mini-transcribe');
    const fichier = form.get('file') as File;
    expect(fichier.name).toBe('audio.webm');
    expect(fichier.type).toBe('audio/webm');
    expect(Buffer.from(await fichier.arrayBuffer()).toString()).toBe('audio-factice-de-test');
    // Clé personnelle : l'audio n'est ni stocké ni journalisé.
    expect(await journal()).toHaveLength(0);
  });

  it('OpenAI : repli sur whisper-1 si le premier modèle échoue', async () => {
    routeur = (_url, init) => (init!.body as FormData).get('model') === 'gpt-4o-mini-transcribe'
      ? { status: 404, json: { error: { message: 'modèle indisponible' } } }
      : { json: { text: 'par whisper' } };
    const r = await dicter({ provider: 'openai', apiKey: 'sk-perso' });
    expect(r.json).toEqual({ text: 'par whisper' });
    expect(espion).toHaveBeenCalledTimes(2);
  });

  it('Mistral : Voxtral, extension déduite du type (Safari → m4a)', async () => {
    const r = await dicter({ provider: 'mistral', apiKey: 'cle-mistral', mimeType: 'audio/mp4' });
    expect(r.status).toBe(200);
    const [url, init] = espion.mock.calls[0];
    expect(url).toBe('https://api.mistral.ai/v1/audio/transcriptions');
    const form = init!.body as FormData;
    expect(form.get('model')).toBe('voxtral-mini-latest');
    expect((form.get('file') as File).name).toBe('audio.m4a');
  });

  it('extensions des autres formats admis', async () => {
    for (const [mimeType, ext] of [['audio/mpeg', 'mp3'], ['audio/wav', 'wav'], ['audio/ogg', 'ogg']]) {
      await dicter({ provider: 'mistral', apiKey: 'k', mimeType });
      expect(((espion.mock.calls.at(-1)![1]!.body as FormData).get('file') as File).name).toBe(`audio.${ext}`);
    }
  });

  it('clé MÉMORISÉE du compte quand le champ est vide', async () => {
    const jeton = await creerCompte('eleve@maison.ch');
    storeUserKey('eleve@maison.ch', 'mistral', 'cle-memorisee');
    const r = await dicter({ provider: 'mistral' }, { token: jeton });
    expect(r.status).toBe(200);
    expect((espion.mock.calls[0][1]!.headers as any).Authorization).toBe('Bearer cle-memorisee');
  });
});

describe('Scénario alternatif : dictée en classe, sur la clé de l’école', () => {
  it('salle ouverte, Mistral : clé interne, dictée journalisée avec IP et estimation de jetons', async () => {
    const { id, ip } = await ecoleOuverte();
    routeur = () => ({ json: { text: 'x'.repeat(40) } });
    const r = await dicter({ provider: 'mistral' }, { ip });
    expect(r.status).toBe(200);
    expect((espion.mock.calls[0][1]!.headers as any).Authorization).toBe('Bearer cle-serveur-mistral');
    const [ligne] = await journal();
    expect(ligne).toMatchObject({ ip, etablissement_id: id, provider: 'mistral', model: 'voxtral-mini-latest (dictée)',
      tokens: 10, used_server_key: 1, prompt_id: null, teacher_email: null });
  });

  it('salle ouverte, OpenAI : journalisée sous le modèle « transcription », au moins 1 jeton', async () => {
    const { ip } = await ecoleOuverte();
    routeur = () => ({ json: { text: '' } });
    await dicter({ provider: 'openai' }, { ip });
    expect((await journal())[0]).toMatchObject({ provider: 'openai', model: 'transcription', tokens: 1 });
  });

  it('fournisseur à drapeau rouge ou écarté sur la clé de l’école : 403 ERR_PROVIDER_NOT_ALLOWED', async () => {
    const { ip } = await ecoleOuverte();
    for (const provider of ['grok', 'gemini', 'openrouter']) {
      const r = await dicter({ provider }, { ip });
      expect(r.status).toBe(403);
      expect(r.json.error.code).toBe('ERR_PROVIDER_NOT_ALLOWED');
    }
    expect(espion).not.toHaveBeenCalled();
  });

  it('réseau d’école fermé : 403 ERR_VOICE_KEY', async () => {
    const ip = ipEcole();
    await creerEtablissement({ ips: ip });
    const r = await dicter({ provider: 'mistral' }, { ip });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ERR_VOICE_KEY');
  });

  it('porte-monnaie de l’école à sec : la dictée est quand même servie et rien n’est décompté', async () => {
    // ANOMALIE constatée (voir la doc UC-23) : contrairement à /api/completion
    // (ERR_SCHOOL_NO_CREDIT), /api/transcribe ne vérifie ni le crédit ni les
    // quotas de l'école et ne décompte rien. Le test fige le comportement actuel.
    const { id, ip } = await ecoleOuverte(0);
    const r = await dicter({ provider: 'mistral' }, { ip });
    expect(r.status).toBe(200);
    const [ligne] = await journal();
    expect(ligne.montant).toBe(0);
    expect(((await base()).prepare('SELECT solde FROM etablissements WHERE id = ?').get(id) as any).solde).toBe(0);
  });
});

describe('Scénarios d’erreur', () => {
  it('anonyme hors campus sans clé : 403 ERR_VOICE_KEY, rien n’est envoyé', async () => {
    const r = await dicter({ provider: 'mistral' });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ERR_VOICE_KEY');
    expect(espion).not.toHaveBeenCalled();
  });

  it('fournisseur sans transcription : 400 ERR_VOICE_UNSUPPORTED', async () => {
    const r = await dicter({ provider: 'anthropic', apiKey: 'k' });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('ERR_VOICE_UNSUPPORTED');
  });

  it('fournisseur inconnu : 400 ERR_PROVIDER_UNSUPPORTED', async () => {
    const r = await dicter({ provider: 'siri', apiKey: 'k' });
    expect(r.json.error.code).toBe('ERR_PROVIDER_UNSUPPORTED');
  });

  it('audio invalide : type non admis, absent, trop volumineux, ou vide après décodage', async () => {
    const trop = 'A'.repeat(Math.ceil(15 * 1024 * 1024 * 4 / 3) + 8);
    for (const corps of [
      { mimeType: 'video/mp4' },
      { mimeType: '' },
      { audio: '' },
      { audio: trop },
      { audio: '!!!!' }, // base64 illisible : décodé en zéro octet
    ]) {
      const r = await dicter({ provider: 'mistral', apiKey: 'k', ...corps });
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('ERR_VOICE_INVALID');
    }
    expect(espion).not.toHaveBeenCalled();
  });

  it('fournisseur en erreur : 502 ERR_UPSTREAM', async () => {
    routeur = () => ({ status: 500, json: { message: 'panne' } });
    const r = await dicter({ provider: 'mistral', apiKey: 'k' });
    expect(r.status).toBe(502);
    expect(r.json.error.code).toBe('ERR_UPSTREAM');
  });

  it('méthode autre que POST : 405', async () => {
    const r = await appeler(transcribe, { method: 'GET', ip: ipMaison() });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toEqual(['POST']);
  });

  it('plus de 20 dictées par minute depuis une IP : 429 ERR_RATE_LIMIT', async () => {
    const ip = '198.51.100.250';
    for (let i = 0; i < 20; i++) expect((await dicter({ provider: 'x' }, { ip })).status).toBe(400);
    const r = await dicter({ provider: 'x' }, { ip });
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe('ERR_RATE_LIMIT');
  });
});
