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

async function tarifer(provider: string, modele: string, entree = 1, sortie = 3) {
  (await base()).prepare(`INSERT INTO tarifs_modeles (provider, modele, prix_entree_mtok, prix_sortie_mtok, devise, updated_at)
    VALUES (?, ?, ?, ?, 'CHF', ?)`).run(provider, modele, entree, sortie, Date.now());
}

async function solde(id: number) {
  return ((await base()).prepare('SELECT solde FROM etablissements WHERE id = ?').get(id) as any).solde as number;
}

describe('Scénario alternatif : dictée en classe, sur la clé de l’école', () => {
  it('salle ouverte, Mistral : clé interne, ligne de journal comme le chat (IP, prix figés, montant)', async () => {
    const { id, ip } = await ecoleOuverte();
    await tarifer('mistral', 'voxtral-mini-latest', 1, 3);
    routeur = () => ({ json: { text: 'x'.repeat(40) } });
    const r = await dicter({ provider: 'mistral' }, { ip });
    expect(r.status).toBe(200);
    expect((espion.mock.calls[0][1]!.headers as any).Authorization).toBe('Bearer cle-serveur-mistral');
    const [ligne] = await journal();
    // Sans `usage` rendu par le fournisseur : estimation (40 car. / 4) côté SORTIE.
    expect(ligne).toMatchObject({ ip, etablissement_id: id, provider: 'mistral', model: 'voxtral-mini-latest',
      tokens: 10, tokens_in: 0, tokens_out: 10, used_server_key: 1, prompt_id: null, teacher_email: null,
      client_id: `ip:${ip}`, prix_entree_mtok: 1, prix_sortie_mtok: 3, tarif_repli: '' });
    expect(ligne.tarif_at).toBeGreaterThan(0);
    // 10 jetons × 3 / 1 M, arrondi VERS LE HAUT au centime : 0.01.
    expect(ligne.montant).toBe(0.01);
  });

  it('débit réel du porte-monnaie : jetons rendus par le fournisseur, prélevés au registre', async () => {
    const { id, ip } = await ecoleOuverte(10);
    await tarifer('openai', 'gpt-4o-mini-transcribe', 2, 10);
    routeur = () => ({ json: { text: 'Bonjour', usage: { input_tokens: 500_000, output_tokens: 100_000 } } });
    const r = await dicter({ provider: 'openai' }, { ip });
    expect(r.status).toBe(200);
    const [ligne] = await journal();
    expect(ligne).toMatchObject({ model: 'gpt-4o-mini-transcribe', tokens_in: 500_000, tokens_out: 100_000,
      tokens: 600_000, montant: 2 });
    expect(await solde(id)).toBe(8);
    const mvt = (await base()).prepare('SELECT * FROM credit_mouvements WHERE etablissement_id = ?').all(id) as any[];
    expect(mvt).toEqual([expect.objectContaining({ genre: 'consommation', montant: -2, solde: 8 })]);
  });

  it('salle ouverte, OpenAI : le modèle RÉELLEMENT appelé est inscrit (repli whisper-1), au moins 1 jeton', async () => {
    const { ip } = await ecoleOuverte();
    routeur = (_url, init) => (init!.body as FormData).get('model') === 'gpt-4o-mini-transcribe'
      ? { status: 404, json: { error: { message: 'indisponible' } } }
      : { json: { text: '' } };
    await dicter({ provider: 'openai' }, { ip });
    expect((await journal())[0]).toMatchObject({ provider: 'openai', model: 'whisper-1', tokens: 1, tokens_out: 1 });
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

  it('porte-monnaie de l’école à sec : 402 ERR_SCHOOL_NO_CREDIT, rien n’est envoyé ni journalisé', async () => {
    // Anomalie corrigée (UC-23) : la dictée était servie sur la clé d'une école
    // à sec, sans rien décompter. Même refus que /api/completion, AVANT l'appel.
    const { id, ip } = await ecoleOuverte(0);
    const r = await dicter({ provider: 'mistral' }, { ip });
    expect(r.status).toBe(402);
    expect(r.json.error.code).toBe('ERR_SCHOOL_NO_CREDIT');
    expect(espion).not.toHaveBeenCalled();
    expect(await journal()).toHaveLength(0);
    expect(await solde(id)).toBe(0);
  });

  it('école RESPIRE à solde nul : servie, journalisée aux prix du jour, rien de prélevé', async () => {
    const { id, ip } = await ecoleOuverte(0);
    (await base()).prepare('UPDATE etablissements SET respire = 1 WHERE id = ?').run(id);
    await tarifer('mistral', 'voxtral-mini-latest', 1, 3);
    const r = await dicter({ provider: 'mistral' }, { ip });
    expect(r.status).toBe(200);
    expect((await journal())[0]).toMatchObject({ prix_sortie_mtok: 3, montant: 0 });
    expect(await solde(id)).toBe(0);
  });

  it('quotas de l’école : plafond mensuel puis quota quotidien par élève → 429', async () => {
    const { id, ip } = await ecoleOuverte();
    const db = await base();
    db.prepare('UPDATE etablissements SET token_quota_monthly = 5 WHERE id = ?').run(id);
    db.prepare(`INSERT INTO usage_log (ts, ip, etablissement_id, provider, model, tokens, used_server_key, client_id)
      VALUES (?, ?, ?, 'mistral', 'm', 5, 1, 'autre')`).run(Date.now(), ip, id);
    let r = await dicter({ provider: 'mistral' }, { ip });
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe('ERR_QUOTA_ETABLISSEMENT');

    db.prepare('UPDATE etablissements SET token_quota_monthly = 0, quota_per_student_daily = 3 WHERE id = ?').run(id);
    db.prepare(`INSERT INTO usage_log (ts, ip, etablissement_id, provider, model, tokens, used_server_key, client_id)
      VALUES (?, ?, ?, 'mistral', 'm', 3, 1, ?)`).run(Date.now(), ip, id, `ip:${ip}`);
    r = await dicter({ provider: 'mistral' }, { ip });
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe('ERR_QUOTA_ELEVE');
    // Un autre élève (clientId anonyme distinct) garde son propre pot.
    r = await dicter({ provider: 'mistral', clientId: 'abcdef12-3456' }, { ip });
    expect(r.status).toBe(200);
    expect(espion).toHaveBeenCalledTimes(1);
  });

  it('séance : fournisseur non coché par l’enseignant → 403 ERR_PROVIDER_NOT_IN_SESSION ; coché → attribué', async () => {
    const { id, ip } = await ecoleOuverte();
    (await base()).prepare(`INSERT INTO session_settings (etablissement_id, web_search, set_by_email, expires_at, providers)
      VALUES (?, 1, 'prof@ecole.ch', ?, 'openai')`).run(id, Date.now() + 3_600_000);
    const refuse = await dicter({ provider: 'mistral' }, { ip });
    expect(refuse.status).toBe(403);
    expect(refuse.json.error.code).toBe('ERR_PROVIDER_NOT_IN_SESSION');
    expect(espion).not.toHaveBeenCalled();
    expect((await dicter({ provider: 'openai' }, { ip })).status).toBe(200);
    expect((await journal())[0]).toMatchObject({ teacher_email: 'prof@ecole.ch' });
  });

  it('clé personnelle sur le réseau d’une école à sec : servie, rien de journalisé ni de prélevé', async () => {
    const { ip } = await ecoleOuverte(0);
    const r = await dicter({ provider: 'mistral', apiKey: 'cle-perso' }, { ip });
    expect(r.status).toBe(200);
    expect(await journal()).toHaveLength(0);
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
