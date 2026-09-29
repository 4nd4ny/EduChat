// UC-06 — Tests fonctionnels : « Exercer ses droits RGPD : consulter,
// exporter, effacer ses données ». Enchaîne les vraies routes /api/me/data,
// /api/me/export, et les routes d'effacement en libre-service qu'appelle la
// page « Mes données » (/api/profile DELETE, /api/keys DELETE et PUT optin).
import { describe, it, expect, beforeEach } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerCompte, creerTuteur } from '../../helpers/db';

import data from '../../../src/pages/api/me/data';
import exporter from '../../../src/pages/api/me/export';
import profil from '../../../src/pages/api/profile';
import cles from '../../../src/pages/api/keys';
import me from '../../../src/pages/api/me';
import { issueToken } from '../../../src/server/token';

let n = 0;
const ipNeuve = () => `198.51.100.${++n}`;

beforeEach(async () => { await viderBase(); });

const conversation = (nom: string, t: number) => ({ name: nom, createdAt: t, lastMessage: t, messages: [{ role: 'user', content: `contenu ${nom}` }] });

/** Compte avec profil synchronisé (2 conversations), un tuteur et une clé mémorisée. */
async function compteGarni(email = 'ada@ecole.ch') {
  const jeton = await creerCompte(email, { name: 'Ada', syncOptin: true });
  await creerTuteur({ name: 'Tuteur d’Ada', authorEmail: email, body: 'Corps du tuteur' });
  const put = await appeler(profil, {
    method: 'PUT', token: jeton, ip: ipNeuve(),
    body: { profile: { educhatProfile: 1, totalTokens: 42, conversations: { c1: conversation('Maths', 100), c2: conversation('Histoire', 200) } } },
  });
  expect(put.status).toBe(200);
  const cle = await appeler(cles, { method: 'PUT', token: jeton, ip: ipNeuve(), body: { optin: true, provider: 'openai', apiKey: 'sk-ada-secrete' } });
  expect(cle.status).toBe(200);
  return jeton;
}

describe('Scénario nominal : consulter ses données', () => {
  it('rend tout ce que le serveur conserve, sans contenu de message ni secret', async () => {
    const jeton = await compteGarni();
    const r = await appeler(data, { token: jeton, ip: ipNeuve() });
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.json.identite).toMatchObject({ email: 'ada@ecole.ch', name: 'Ada', syncOptin: true, keysOptin: true });
    expect(r.json.consommation.declaredTokens).toBe(42);
    expect(r.json.conversations.map((c: any) => c.id)).toEqual(['c2', 'c1']);
    expect(r.json.prompts.map((p: any) => p.name)).toEqual(['Tuteur d’Ada']);
    expect(r.json.keys).toEqual([{ provider: 'openai', updatedAt: expect.any(Number), readable: true }]);
    expect(r.json.porteMonnaie).toMatchObject({ ouvert: false, mouvements: [] });
    const texte = JSON.stringify(r.json);
    expect(texte).not.toContain('contenu Maths');
    expect(texte).not.toContain('sk-ada-secrete');
  });
});

describe('Scénario nominal : exporter ses données', () => {
  it('rend un fichier JSON téléchargeable, contenu compris', async () => {
    const jeton = await compteGarni();
    const r = await appeler(exporter, { token: jeton, ip: ipNeuve() });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(r.headers['content-disposition']).toBe('attachment; filename="educhat-mes-donnees.json"');
    expect(r.headers['cache-control']).toBe('private, no-store');
    const x = JSON.parse(r.text);
    expect(x.educhatAccountExport).toBe(1);
    expect(x.profilSynchronise.conversations.c1.messages[0].content).toBe('contenu Maths');
    expect(x.tuteurs[0].body).toBe('Corps du tuteur');
    expect(x.clesMemorisees).toHaveLength(1);
    expect(r.text).not.toContain('sk-ada-secrete');
  });
});

describe('Scénario nominal : effacer ses données en libre-service', () => {
  it('efface une sélection de conversations, puis tout le profil, et la page le reflète', async () => {
    const jeton = await compteGarni();
    const sel = await appeler(profil, { method: 'DELETE', token: jeton, ip: ipNeuve(), body: { conversations: ['c1'] } });
    expect(sel.json).toEqual({ ok: true, deleted: 1 });
    let d = (await appeler(data, { token: jeton, ip: ipNeuve() })).json;
    expect(d.conversations.map((c: any) => c.id)).toEqual(['c2']);
    expect(d.deletedConversations).toBe(1);

    const tout = await appeler(profil, { method: 'DELETE', token: jeton, ip: ipNeuve() });
    expect(tout.json).toEqual({ ok: true, syncDisabled: true });
    d = (await appeler(data, { token: jeton, ip: ipNeuve() })).json;
    expect(d.conversations).toEqual([]);
    expect(d.deletedConversations).toBe(2);      // pierres tombales c1 et c2
    expect(d.identite.syncOptin).toBe(false);    // consentement retiré
    expect(d.consommation.profileUpdatedAt).toBeNull();
    // Le tuteur publié, lui, n'est pas effacé.
    expect(d.prompts).toHaveLength(1);
  });

  it('oublie une clé, ou retire le consentement et toutes les clés', async () => {
    const jeton = await compteGarni();
    await appeler(cles, { method: 'PUT', token: jeton, ip: ipNeuve(), body: { provider: 'mistral', apiKey: 'cle-m' } });
    const une = await appeler(cles, { method: 'DELETE', token: jeton, ip: ipNeuve(), query: { provider: 'openai' } });
    expect(une.json.providers).toEqual(['mistral']);
    const retrait = await appeler(cles, { method: 'PUT', token: jeton, ip: ipNeuve(), body: { optin: false } });
    expect(retrait.json).toMatchObject({ ok: true, optin: false, providers: [] });
    const d = (await appeler(data, { token: jeton, ip: ipNeuve() })).json;
    expect(d.keys).toEqual([]);
    expect(d.identite.keysOptin).toBe(false);
  });

  it('après un effacement total, le consentement peut être redonné depuis la page', async () => {
    const jeton = await compteGarni();
    await appeler(profil, { method: 'DELETE', token: jeton, ip: ipNeuve() });
    expect((await appeler(me, { method: 'PUT', token: jeton, body: { syncOptin: true } })).status).toBe(200);
    const d = (await appeler(data, { token: jeton, ip: ipNeuve() })).json;
    expect(d.identite.syncOptin).toBe(true);
  });
});

describe('Scénarios d’erreur et droits', () => {
  it('refuse sans jeton, ou pour un compte absent ou non vérifié', async () => {
    (await base()).prepare('INSERT INTO users (email, name, verified_at) VALUES (?, ?, NULL)').run('nv@ecole.ch', 'nv');
    for (const route of [data, exporter]) {
      expect((await appeler(route, { ip: ipNeuve() })).status).toBe(401);
      const absent = await appeler(route, { token: issueToken('X', 'absent@ecole.ch'), ip: ipNeuve() });
      expect(absent.status).toBe(401);
      expect(absent.json.error.code).toBe('ERR_AUTH_REQUIRED');
      expect((await appeler(route, { token: issueToken('nv', 'nv@ecole.ch'), ip: ipNeuve() })).status).toBe(401);
    }
  });

  it('chacun ne voit que ses données', async () => {
    await compteGarni('ada@ecole.ch');
    const autre = await creerCompte('bob@ecole.ch');
    const r = await appeler(data, { token: autre, ip: ipNeuve() });
    expect(r.json.identite.email).toBe('bob@ecole.ch');
    expect(r.json.conversations).toEqual([]);
    expect(r.json.prompts).toEqual([]);
    expect(r.json.keys).toEqual([]);
  });

  it('limite la consultation à 20 et l’export à 5 appels par minute et par IP', async () => {
    const jeton = await creerCompte('a@ecole.ch');
    const ipD = ipNeuve();
    for (let i = 0; i < 20; i++) expect((await appeler(data, { token: jeton, ip: ipD })).status).toBe(200);
    const d = await appeler(data, { token: jeton, ip: ipD });
    expect(d.status).toBe(429);
    expect(d.json.error.code).toBe('ERR_RATE_LIMIT');
    const ipE = ipNeuve();
    for (let i = 0; i < 5; i++) expect((await appeler(exporter, { token: jeton, ip: ipE })).status).toBe(200);
    expect((await appeler(exporter, { token: jeton, ip: ipE })).status).toBe(429);
  });

  it('refuse les méthodes autres que GET', async () => {
    for (const route of [data, exporter]) {
      const r = await appeler(route, { method: 'POST' });
      expect(r.status).toBe(405);
      expect(r.headers.allow).toEqual(['GET']);
    }
  });
});
