// UC-12 — Tests fonctionnels : « Régénérer une réponse en montant l'échelle des
// modèles ». Le super-administrateur règle l'échelle (/api/admin/ladder), le
// navigateur la lit (/api/ladder) et « Régénérer » renvoie la même question
// au barreau suivant (/api/completion, champ `rung`). Seul le réseau sortant
// (catalogue OpenRouter, API Mistral) est doublé.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, creerCompte, creerEtablissement } from '../../helpers/db';
import { doublerFetch } from '../../helpers/fetch';
import { SUGGESTED_LADDER } from '../../../src/shared/ladder';

vi.mock('../../../src/server/mail', () => ({
  sendVerificationCode: vi.fn(async () => {}),
  notifyAdmin: vi.fn(),
}));

import echellePublique from '../../../src/pages/api/ladder';
import echelleAdmin from '../../../src/pages/api/admin/ladder';
import completion from '../../../src/pages/api/completion';

// Chaque appel a sa propre adresse : les limiteurs de débit sont par IP.
// 198.51.100.0/24 n'appartient à aucune école : on est « hors campus ».
let n = 0;
const ipNeuve = () => `198.51.100.${++n}`;

// Catalogue public d'OpenRouter, tel que la doublure le sert. Il nourrit la
// liste d'OpenRouter lui-même ET, par suffixe, celle d'OpenAI.
const CATALOGUE_OPENROUTER = [
  'openai/gpt-5.4-mini', 'openai/gpt-5.5',
  'mistralai/mistral-small-3.2-24b-instruct', 'anthropic/claude-sonnet-5',
];
/** Requêtes envoyées à l'API Mistral, corps décodé. */
const appelsMistral: any[] = [];

beforeEach(async () => {
  await viderBase();
  appelsMistral.length = 0;
  doublerFetch((url, init) => {
    if (url === 'https://openrouter.ai/api/v1/models') {
      return { json: { data: CATALOGUE_OPENROUTER.map(id => ({ id })) } };
    }
    if (url === 'https://api.mistral.ai/v1/conversations') {
      appelsMistral.push(JSON.parse(String(init?.body)));
      return { json: { outputs: [{ content: 'Réponse du modèle' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } } };
    }
    return { status: 404, json: {} };
  });
});

const superAdmin = () => creerCompte('super@educh.at');

describe('Lecture publique de l’échelle (GET /api/ladder)', () => {
  it('rend, sans compte, les barreaux en vigueur de chaque fournisseur', async () => {
    const r = await appeler(echellePublique, { ip: ipNeuve() });
    expect(r.status).toBe(200);
    expect(r.json.ladders.mistral).toEqual(SUGGESTED_LADDER.mistral);
    expect(r.json.ladders.deepseek).toHaveLength(2);
    expect(r.headers['cache-control']).toBe('public, max-age=300');
  });
  it('refuse toute autre méthode que GET', async () => {
    const r = await appeler(echellePublique, { method: 'POST', ip: ipNeuve() });
    expect(r.status).toBe(405);
    expect(r.json.error.code).toBe('ERR_METHOD_NOT_ALLOWED');
    expect(r.headers.allow).toEqual(['GET']);
  });
});

describe('Réglage de l’échelle par le super-administrateur (/api/admin/ladder)', () => {
  it('GET : barreaux, proposition et VALIDITÉ au regard du catalogue vivant', async () => {
    const r = await appeler(echelleAdmin, { token: await superAdmin(), ip: ipNeuve() });
    expect(r.status).toBe(200);
    const parFournisseur = Object.fromEntries(r.json.ladders.map((l: any) => [l.provider, l]));

    // OpenAI : liste déduite d'OpenRouter → vérifiable ; « gpt-5.5-pro » n'y figure pas.
    expect(parFournisseur.openai.verifiable).toBe(true);
    expect(parFournisseur.openai.unknown).toEqual(['gpt-5.5-pro']);
    // OpenRouter : son propre catalogue public.
    expect(parFournisseur.openrouter.verifiable).toBe(true);
    expect(parFournisseur.openrouter.unknown).toEqual(['mistralai/mistral-large-2512']);
    // Mistral : aucune clé, aucun catalogue → seul le défaut, rien n'est prouvé.
    expect(parFournisseur.mistral.verifiable).toBe(false);
    expect(parFournisseur.mistral.unknown).toEqual([]);
    expect(parFournisseur.mistral.catalogue).toBe(1);
    expect(parFournisseur.mistral.custom).toBe(false);
  });

  it('PUT : enregistre un réglage, visible aussitôt dans la lecture publique', async () => {
    const token = await superAdmin();
    const r = await appeler(echelleAdmin, {
      method: 'PUT', token, ip: ipNeuve(),
      body: { provider: 'openai', rungs: ['gpt-5.4-mini', ' gpt-5.5 ', ''] },
    });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    const ligne = r.json.ladders.find((l: any) => l.provider === 'openai');
    expect(ligne).toMatchObject({ rungs: ['gpt-5.4-mini', 'gpt-5.5'], custom: true });

    const publique = await appeler(echellePublique, { ip: ipNeuve() });
    expect(publique.json.ladders.openai).toEqual(['gpt-5.4-mini', 'gpt-5.5']);

    // Les deux barreaux retenus existent au catalogue : plus rien d'inconnu.
    const lecture = await appeler(echelleAdmin, { token, ip: ipNeuve() });
    expect(lecture.json.ladders.find((l: any) => l.provider === 'openai').unknown).toEqual([]);
  });

  it('PUT : un barreau absent du catalogue est accepté mais signalé « inconnu »', async () => {
    const token = await superAdmin();
    await appeler(echelleAdmin, { method: 'PUT', token, ip: ipNeuve(), body: { provider: 'openai', rungs: ['gpt-fantome'] } });
    const lecture = await appeler(echelleAdmin, { token, ip: ipNeuve() });
    expect(lecture.json.ladders.find((l: any) => l.provider === 'openai').unknown).toEqual(['gpt-fantome']);
  });

  it('PUT : trois barreaux vides = retour à la proposition du code', async () => {
    const token = await superAdmin();
    await appeler(echelleAdmin, { method: 'PUT', token, ip: ipNeuve(), body: { provider: 'mistral', rungs: ['a'] } });
    const r = await appeler(echelleAdmin, { method: 'PUT', token, ip: ipNeuve(), body: { provider: 'mistral', rungs: ['', '', ''] } });
    expect(r.json.ladders.find((l: any) => l.provider === 'mistral')).toMatchObject({
      rungs: SUGGESTED_LADDER.mistral, custom: false,
    });
  });

  it('PUT sans liste de barreaux : le réglage est EFFACÉ (retour à la proposition)', async () => {
    // Comportement actuel : `rungs` absent ou non-tableau est lu comme [] —
    // voir « Anomalies constatées » dans la fiche UC-12.
    const token = await superAdmin();
    await appeler(echelleAdmin, { method: 'PUT', token, ip: ipNeuve(), body: { provider: 'mistral', rungs: ['a'] } });
    const r = await appeler(echelleAdmin, { method: 'PUT', token, ip: ipNeuve(), body: { provider: 'mistral', rungs: 'a,b' } });
    expect(r.status).toBe(200);
    expect(r.json.ladders.find((l: any) => l.provider === 'mistral').custom).toBe(false);
  });

  it('PUT : fournisseur inconnu → 400 ERR_PROVIDER_UNSUPPORTED', async () => {
    const r = await appeler(echelleAdmin, {
      method: 'PUT', token: await superAdmin(), ip: ipNeuve(), body: { provider: 'skynet', rungs: ['x'] },
    });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('ERR_PROVIDER_UNSUPPORTED');
  });

  it('méthode non prévue → 405 pour le super-administrateur', async () => {
    const r = await appeler(echelleAdmin, { method: 'DELETE', token: await superAdmin(), ip: ipNeuve() });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toEqual(['GET', 'PUT']);
  });
});

describe('Droits : le super-administrateur ET LUI SEUL, lecture comprise', () => {
  it('anonyme, compte simple, enseignant, administrateur d’école → 403', async () => {
    const etab = await creerEtablissement();
    const jetons = [
      undefined,
      await creerCompte('promptagogue@ecole.ch'),
      await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: etab }),
      await creerCompte('directeur@ecole.ch', { teacher: true, etablissementId: etab, schoolAdmin: true }),
    ];
    for (const token of jetons) {
      for (const method of ['GET', 'PUT', 'DELETE']) {
        const r = await appeler(echelleAdmin, {
          method, token, ip: ipNeuve(), body: { provider: 'mistral', rungs: ['pirate'] },
        });
        expect(r.status).toBe(403);
        expect(r.json.error.code).toBe('ERR_FORBIDDEN');
      }
    }
    // Rien n'a été écrit.
    const publique = await appeler(echellePublique, { ip: ipNeuve() });
    expect(publique.json.ladders.mistral).toEqual(SUGGESTED_LADDER.mistral);
  });
});

describe('Scénario nominal : « Régénérer » monte d’un barreau (POST /api/completion)', () => {
  // Un compte vérifié, hors campus, avec sa clé personnelle : le serveur
  // choisit le modèle dans l'échelle, d'après le barreau demandé.
  async function demander(rung: unknown, extra: Record<string, unknown> = {}) {
    const token = await creerCompte('eleve.adulte@exemple.ch');
    return appeler(completion, {
      method: 'POST', token, ip: ipNeuve(),
      body: {
        provider: 'mistral', apiKey: 'cle-personnelle-de-test', rung,
        messages: [{ role: 'user', content: 'Explique la photosynthèse.' }], ...extra,
      },
    });
  }

  it('barreau 1 puis 2 puis 3 : modèle de plus en plus fouillé, effort croissant', async () => {
    const modeles: string[] = [];
    for (const rung of [1, 2, 3]) {
      const r = await demander(rung);
      expect(r.status).toBe(200);
      expect(r.json.reply).toBe('Réponse du modèle');
      modeles.push(r.json.model);
    }
    expect(modeles).toEqual(SUGGESTED_LADDER.mistral);
    expect(appelsMistral.map(a => a.model)).toEqual(SUGGESTED_LADDER.mistral);
    // Chez Mistral, l'effort se traduit en température : « low » = 0,2.
    expect(appelsMistral.map(a => a.completion_args.temperature)).toEqual([0.2, 0.5, 0.5]);
  });

  it('sans barreau (premier envoi) ou avec un barreau invalide : on part du moins cher', async () => {
    expect((await demander(undefined)).json.model).toBe(SUGGESTED_LADDER.mistral[0]);
    expect((await demander(7)).json.model).toBe(SUGGESTED_LADDER.mistral[0]);
    expect((await demander('3')).json.model).toBe(SUGGESTED_LADDER.mistral[0]);
  });

  it('l’échelle réglée par l’administration s’applique à la régénération', async () => {
    await appeler(echelleAdmin, {
      method: 'PUT', token: await superAdmin(), ip: ipNeuve(),
      body: { provider: 'mistral', rungs: ['mistral-maison-1', 'mistral-maison-2'] },
    });
    expect((await demander(2)).json.model).toBe('mistral-maison-2');
    // Échelle à deux barreaux : un barreau 3 est ramené au dernier cran.
    expect((await demander(3)).json.model).toBe('mistral-maison-2');
  });

  it('un modèle nommé explicitement (épinglé) prime sur l’échelle', async () => {
    const r = await demander(3, { model: 'mistral-tiny-latest' });
    expect(r.json.model).toBe('mistral-tiny-latest');
    // L'effort, lui, suit toujours le barreau : « high » → 0,5.
    expect(appelsMistral[0].completion_args.temperature).toBe(0.5);
  });

  it('un effort explicite l’emporte sur celui du barreau', async () => {
    await demander(3, { reasoning: 'low' });
    expect(appelsMistral[0].model).toBe(SUGGESTED_LADDER.mistral[2]);
    expect(appelsMistral[0].completion_args.temperature).toBe(0.2);
  });
});
