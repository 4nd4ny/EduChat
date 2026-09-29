// UC-23 — Tests fonctionnels : ÉCOUTER les réponses (POST /api/speak, voix
// Voxtral). La route garde en mémoire le catalogue des voix pendant 24 h : le
// module est donc RECHARGÉ avant chaque test (vi.resetModules), pour que
// chaque scénario parte d'un cache vide. La base, elle, reste celle du fichier.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SECRET_MISTRAL_API_KEY = 'cle-serveur-mistral';
});

import { appeler, type ApiHandler } from '../../helpers/api';
import { viderBase, base, creerCompte, creerEtablissement } from '../../helpers/db';
import { doublerFetch, type Routeur } from '../../helpers/fetch';

let n = 0;
const ipMaison = () => `198.51.100.${++n}`;
let m = 0;
const ipEcole = () => `192.0.2.${++m}`;

const VOIX = { items: [{ slug: 'en_paul', languages: ['en_us'] }, { slug: 'fr_marie', languages: ['fr_FR'] }] };
const MP3 = Buffer.from('MP3-FACTICE').toString('base64');

let speak: ApiHandler;
let routeur: Routeur;
let espion: ReturnType<typeof doublerFetch>;

beforeEach(async () => {
  vi.resetModules();
  speak = (await import('../../../src/pages/api/speak')).default;
  await viderBase();
  routeur = url => url.endsWith('/audio/voices') ? { json: VOIX } : { json: { audio_data: MP3 } };
  espion = doublerFetch((url, init) => routeur(url, init));
});
afterEach(() => { vi.unstubAllGlobals(); });

const lire = (body: Record<string, unknown>, o: { ip?: string; token?: string } = {}) =>
  appeler(speak, { method: 'POST', ip: o.ip ?? ipMaison(), token: o.token, body });

const appelsSynthese = () => espion.mock.calls.filter(c => String(c[0]).endsWith('/audio/speech'));

async function journal() {
  return (await base()).prepare('SELECT * FROM usage_log').all() as any[];
}

describe('Scénario nominal : lecture Voxtral avec sa clé Mistral', () => {
  it('choisit la voix de la langue, rend un MP3 non mis en cache, sans journal', async () => {
    const r = await lire({ text: 'Bonjour, que sais-tu déjà ?', locale: 'fr', apiKey: 'cle-perso' });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('audio/mpeg');
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.text).toBe('MP3-FACTICE');
    const [url, init] = appelsSynthese()[0];
    expect(url).toBe('https://api.mistral.ai/v1/audio/speech');
    expect((init!.headers as any).Authorization).toBe('Bearer cle-perso');
    expect(JSON.parse(String(init!.body))).toEqual({ model: 'voxtral-mini-tts-latest', input: 'Bonjour, que sais-tu déjà ?', voice: 'fr_marie' });
    expect(await journal()).toHaveLength(0);
  });

  it('la langue est lue sur ses deux premières lettres (en-GB → voix anglaise)', async () => {
    await lire({ text: 'Hello', locale: 'en-GB', apiKey: 'k' });
    expect(JSON.parse(String(appelsSynthese()[0][1]!.body)).voice).toBe('en_paul');
  });

  it('le catalogue des voix est interrogé une fois puis gardé en mémoire', async () => {
    await lire({ text: 'Un', apiKey: 'k' });
    await lire({ text: 'Deux', apiKey: 'k' });
    expect(espion.mock.calls.filter(c => String(c[0]).endsWith('/audio/voices'))).toHaveLength(1);
    expect(appelsSynthese()).toHaveLength(2);
  });

  it('le texte est borné à 2000 caractères et nettoyé des espaces', async () => {
    await lire({ text: `  ${'a'.repeat(2500)}  `, apiKey: 'k' });
    expect(JSON.parse(String(appelsSynthese()[0][1]!.body)).input).toHaveLength(2000);
  });

  it('clé Mistral MÉMORISÉE sur le compte', async () => {
    const jeton = await creerCompte('eleve@maison.ch');
    const { storeUserKey } = await import('../../../src/server/userKeys');
    storeUserKey('eleve@maison.ch', 'mistral', 'cle-memorisee');
    const r = await lire({ text: 'Salut' }, { token: jeton });
    expect(r.status).toBe(200);
    expect((appelsSynthese()[0][1]!.headers as any).Authorization).toBe('Bearer cle-memorisee');
  });
});

describe('Scénario alternatif : lecture en classe sur la clé de l’école', () => {
  async function ecoleOuverte(solde = 10) {
    const ip = ipEcole();
    const id = await creerEtablissement({ ips: ip, solde });
    const { setAuthLock, porteeEtablissement } = await import('../../../src/server/access');
    await setAuthLock(porteeEtablissement(id), 30);
    return { id, ip };
  }
  const solde = async (id: number) =>
    ((await base()).prepare('SELECT solde FROM etablissements WHERE id = ?').get(id) as any).solde as number;
  const tarifer = async (entree: number, sortie: number) => (await base()).prepare(`INSERT INTO tarifs_modeles
    (provider, modele, prix_entree_mtok, prix_sortie_mtok, devise, updated_at)
    VALUES ('mistral', 'voxtral-mini-tts-latest', ?, ?, 'CHF', ?)`).run(entree, sortie, Date.now());

  it('salle ouverte : clé interne Mistral, ligne de journal comme le chat (IP, prix figés, montant)', async () => {
    const { id, ip } = await ecoleOuverte();
    await tarifer(3, 1);
    const r = await lire({ text: 'x'.repeat(41) }, { ip });
    expect(r.status).toBe(200);
    expect((appelsSynthese()[0][1]!.headers as any).Authorization).toBe('Bearer cle-serveur-mistral');
    const [ligne] = await journal();
    // Estimation (41 car. / 4 ≈ 10) côté ENTRÉE : c'est le texte lu.
    expect(ligne).toMatchObject({ ip, etablissement_id: id, provider: 'mistral',
      model: 'voxtral-mini-tts-latest', tokens: 10, tokens_in: 10, tokens_out: 0, used_server_key: 1,
      prix_entree_mtok: 3, prix_sortie_mtok: 1, montant: 0.01 });
    expect(ligne.tarif_at).toBeGreaterThan(0);
  });

  it('débit réel du porte-monnaie de l’école après une lecture', async () => {
    const { id, ip } = await ecoleOuverte(10);
    await tarifer(4, 0);
    routeur = url => url.endsWith('/audio/voices') ? { json: VOIX }
      : { json: { audio_data: MP3, usage: { prompt_tokens: 1_000_000, completion_tokens: 0 } } };
    const r = await lire({ text: 'Bonjour' }, { ip });
    expect(r.status).toBe(200);
    expect((await journal())[0]).toMatchObject({ tokens_in: 1_000_000, montant: 4 });
    expect(await solde(id)).toBe(6);
    expect((await base()).prepare('SELECT genre, montant FROM credit_mouvements WHERE etablissement_id = ?').all(id))
      .toEqual([{ genre: 'consommation', montant: -4 }]);
  });

  it('porte-monnaie de l’école à sec : 402 ERR_SCHOOL_NO_CREDIT, Mistral n’est pas appelé', async () => {
    // Anomalie corrigée (UC-23) : la lecture était servie et payée sans contrôle.
    const { id, ip } = await ecoleOuverte(0);
    const r = await lire({ text: 'Bonjour' }, { ip });
    expect(r.status).toBe(402);
    expect(r.json.error.code).toBe('ERR_SCHOOL_NO_CREDIT');
    expect(espion).not.toHaveBeenCalled();
    expect(await journal()).toHaveLength(0);
    expect(await solde(id)).toBe(0);
  });

  it('séance qui n’a pas coché Mistral : 403 ERR_PROVIDER_NOT_IN_SESSION', async () => {
    const { id, ip } = await ecoleOuverte();
    (await base()).prepare(`INSERT INTO session_settings (etablissement_id, web_search, set_by_email, expires_at, providers)
      VALUES (?, 1, 'prof@ecole.ch', ?, 'anthropic')`).run(id, Date.now() + 3_600_000);
    const r = await lire({ text: 'Bonjour' }, { ip });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ERR_PROVIDER_NOT_IN_SESSION');
    expect(espion).not.toHaveBeenCalled();
  });
});

describe('Repli sur la synthèse du navigateur (réponses non 200)', () => {
  it('aucune voix dans la langue demandée : 415 ERR_TTS_NO_VOICE, pas de synthèse facturée', async () => {
    routeur = url => url.endsWith('/audio/voices') ? { json: { items: [{ slug: 'en_paul', languages: ['en_us'] }] } } : { json: {} };
    const r = await lire({ text: 'Bonjour', locale: 'fr', apiKey: 'k' });
    expect(r.status).toBe(415);
    expect(r.json.error.code).toBe('ERR_TTS_NO_VOICE');
    expect(appelsSynthese()).toHaveLength(0);
  });

  it('catalogue des voix injoignable : 415 également', async () => {
    routeur = () => ({ status: 401, json: { message: 'clé refusée' } });
    const r = await lire({ text: 'Bonjour', apiKey: 'k' });
    expect(r.status).toBe(415);
  });

  it('synthèse refusée ou sans audio : 502 ERR_TTS_FAILED', async () => {
    routeur = url => url.endsWith('/audio/voices') ? { json: VOIX } : { status: 500, text: 'panne' };
    expect((await lire({ text: 'a', apiKey: 'k' })).json.error.code).toBe('ERR_TTS_FAILED');
    routeur = url => url.endsWith('/audio/voices') ? { json: VOIX } : { json: { audio_data: '' } };
    const r = await lire({ text: 'b', apiKey: 'k' });
    expect(r.status).toBe(502);
    expect(r.json.error.code).toBe('ERR_TTS_FAILED');
  });

  it('sans clé (anonyme hors campus) : 403 ERR_VOICE_KEY', async () => {
    const r = await lire({ text: 'Bonjour' });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ERR_VOICE_KEY');
    expect(espion).not.toHaveBeenCalled();
  });
});

describe('Scénarios d’erreur', () => {
  it('texte vide ou blanc : 400 ERR_EMPTY_CONVERSATION', async () => {
    for (const text of [undefined, '', '   ']) {
      const r = await lire({ text, apiKey: 'k' });
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('ERR_EMPTY_CONVERSATION');
    }
  });

  it('méthode autre que POST : 405', async () => {
    const r = await appeler(speak, { method: 'GET', ip: ipMaison() });
    expect(r.status).toBe(405);
    expect(r.json.error.code).toBe('ERR_METHOD_NOT_ALLOWED');
  });

  it('plus de 20 lectures par minute depuis une IP : 429 ERR_RATE_LIMIT', async () => {
    const ip = '198.51.100.250';
    for (let i = 0; i < 20; i++) expect((await lire({ text: '' }, { ip })).status).toBe(400);
    const r = await lire({ text: '' }, { ip });
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe('ERR_RATE_LIMIT');
  });
});
