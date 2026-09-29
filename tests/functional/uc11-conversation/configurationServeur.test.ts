// UC-11 — Tests fonctionnels : la conversation selon la CONFIGURATION du
// serveur. Ici : aucun repli gratuit, une seule clé interne (Anthropic), et
// une alerte « IP gourmande » à 10 jetons par jour. Posée par vi.hoisted,
// avant le chargement de src/utils/env.ts.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SECRET_ANTHROPIC_API_KEY = 'cle-serveur-anthropic';
  delete process.env.SECRET_FREE_PROVIDER;
  delete process.env.SECRET_FREE_MODEL;
  process.env.SECRET_ALERT_IP_TOKENS_DAILY = '10';
});

const notifications: string[] = [];
vi.mock('../../../src/server/mail', () => ({
  notifyAdmin: vi.fn((sujet: string) => { notifications.push(sujet); }),
  sendVerificationCode: vi.fn(async () => {}),
  sendEmailChangeCode: vi.fn(async () => {}),
  sendEmailChangeWarning: vi.fn(() => {}),
}));

import completion from '../../../src/pages/api/completion';
import { setAuthLock, porteeEtablissement } from '../../../src/server/access';
import { appeler } from '../../helpers/api';
import { viderBase, creerCompte, creerEtablissement } from '../../helpers/db';
import { doublerFetch } from '../../helpers/fetch';

let n = 0;
const ip = (prefixe: string) => `${prefixe}.${++n}`;
const question = [{ role: 'user', content: 'Bonjour' }];

beforeEach(async () => { await viderBase(); notifications.length = 0; });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Sans repli gratuit configuré', () => {
  it('un visiteur anonyme hors campus, sans clé : 401 ERR_LOCKED', async () => {
    const espion = doublerFetch(() => ({ json: {} }));
    const r = await appeler(completion, { method: 'POST', ip: ip('198.51.100'), body: { provider: 'mistral', messages: question } });
    expect(r.status).toBe(401);
    expect(r.json.error.code).toBe('ERR_LOCKED');
    expect(espion).not.toHaveBeenCalled();
  });

  it('un compte sans clé ni crédit : 401 ERR_LOCKED également', async () => {
    doublerFetch(() => ({ json: {} }));
    const jeton = await creerCompte('a@maison.ch');
    const r = await appeler(completion, { method: 'POST', ip: ip('198.51.100'), token: jeton, body: { provider: 'mistral', messages: question } });
    expect(r.json.error.code).toBe('ERR_LOCKED');
  });
});

describe('Clé interne absente pour le fournisseur choisi', () => {
  it('salle ouverte, mais aucune clé serveur Mistral : 503 ERR_NO_API_KEY', async () => {
    const adresse = ip('192.0.2');
    const id = await creerEtablissement({ ips: adresse, solde: 10 });
    await setAuthLock(porteeEtablissement(id), 30);
    const espion = doublerFetch(() => ({ json: {} }));
    const r = await appeler(completion, { method: 'POST', ip: adresse, body: { provider: 'mistral', messages: question } });
    expect(r.status).toBe(503);
    expect(r.json.error.code).toBe('ERR_NO_API_KEY');
    expect(espion).not.toHaveBeenCalled();
  });
});

describe('Alerte « IP gourmande » sur la clé interne', () => {
  it('une seule notification par IP et par jour au-delà du seuil, sans blocage', async () => {
    const adresse = ip('192.0.2');
    const id = await creerEtablissement({ ips: adresse, solde: 10, name: 'Collège Gourmand' });
    await setAuthLock(porteeEtablissement(id), 30);
    doublerFetch(() => ({ json: { content: [{ text: 'ok' }], usage: { input_tokens: 8, output_tokens: 7 } } }));
    for (let i = 0; i < 2; i++) {
      const r = await appeler(completion, { method: 'POST', ip: adresse, body: { provider: 'anthropic', messages: question } });
      expect(r.status).toBe(200);
    }
    expect(notifications).toEqual(['Usage intensif de la clé interne — Collège Gourmand']);
  });
});
