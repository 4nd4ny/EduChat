// UC-15 — Tests fonctionnels : suivre l'état de la séance depuis la console
// enseignante (vraie route /api/session-status, relue après un déploiement
// par /api/session-settings).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerEtablissement, creerCompte, creerTuteur } from '../../helpers/db';
import statut from '../../../src/pages/api/session-status';
import reglages from '../../../src/pages/api/session-settings';
import { setAuthLock, getAuthLockExpiry } from '../../../src/server/access';

const LUNDI_10H = new Date('2026-09-28T08:00:00Z'); // 10:00 à Zurich
const LUNDI_18H = new Date('2026-09-28T16:00:00Z');
const LUNDI_8_12 = JSON.stringify([{ day: 1, start: '08:00', end: '12:00' }]);

let n = 0;
const ipMaison = () => `203.0.113.${++n}`;
let m = 0;
async function ecole(o: { name?: string; hours?: string } = {}) {
  const ip = `198.51.100.${++m}`;
  const id = await creerEtablissement({ name: o.name ?? `École ${m}`, ips: ip, hours: o.hours });
  return { id, ip, cle: `etab:${id}` };
}

beforeEach(async () => { await viderBase(); });
afterEach(() => { vi.useRealTimers(); });

describe('Scénario nominal : l’enseignant suit sa salle', () => {
  it('salle ouverte et tuteur déployé : tout est visible, sur place', async () => {
    const a = await ecole({ name: 'Collège A' });
    await creerTuteur({ name: 'Socrate' });
    await setAuthLock(a.cle, 40);
    await appeler(reglages, { method: 'PUT', ip: a.ip, body: { promptName: 'Socrate', webSearch: false, providers: ['mistral'] } });
    const echeance = await getAuthLockExpiry(a.cle);

    const r = await appeler(statut, { method: 'GET', ip: a.ip });
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.json).toEqual({
      ip: a.ip,
      etablissement: { name: 'Collège A', hasOwnHours: false },
      ecole: { id: a.id, name: 'Collège A' },
      surPlace: true,
      open: true,
      salleOuvrable: true,
      lockExpiresAt: echeance,
      withinSchedule: false,
      maxUnlockMinutes: 600,
      schoolProviders: [], // aucune clé serveur en test
      settings: { promptName: 'Socrate', webSearch: false, providers: ['mistral'], providersRestricted: true, expiresAt: echeance },
    });
  });

  it('salle fermée, aucune séance : ouvrable mais fermée', async () => {
    const a = await ecole();
    const r = (await appeler(statut, { method: 'GET', ip: a.ip })).json;
    expect(r).toMatchObject({ open: false, salleOuvrable: true, lockExpiresAt: null, settings: null, surPlace: true });
  });
});

describe('Scénarios alternatifs', () => {
  it('A1 — depuis chez soi, avec un compte enseignant : l’école de travail est connue, la salle non', async () => {
    const a = await ecole({ name: 'Collège A' });
    await setAuthLock(a.cle, 30);
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: a.id });
    await appeler(reglages, { method: 'PUT', ip: ipMaison(), token: jeton, body: {} });
    const ip = ipMaison();
    const r = (await appeler(statut, { method: 'GET', ip, token: jeton })).json;
    expect(r.ip).toBe(ip);
    expect(r.etablissement).toBeNull();
    expect(r.ecole).toEqual({ id: a.id, name: 'Collège A' });
    expect(r.surPlace).toBe(false);
    // Fait sur le LIEU : ouvert là-bas, mais pas ici.
    expect(r.open).toBe(false);
    expect(r.salleOuvrable).toBe(false);
    expect(r.lockExpiresAt).toBeNull();
    expect(r.settings).not.toBeNull();
  });

  it('A2 — visiteur anonyme hors école : rien', async () => {
    const r = (await appeler(statut, { method: 'GET', ip: ipMaison() })).json;
    expect(r).toMatchObject({ etablissement: null, ecole: null, surPlace: false, open: false, salleOuvrable: false, settings: null });
  });

  it('A3 — horaires propres de l’école : open et withinSchedule suivent le créneau', async () => {
    const a = await ecole({ hours: LUNDI_8_12 });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(LUNDI_10H);
    let r = (await appeler(statut, { method: 'GET', ip: a.ip })).json;
    expect(r).toMatchObject({ withinSchedule: true, open: true, etablissement: { hasOwnHours: true } });
    vi.setSystemTime(LUNDI_18H);
    r = (await appeler(statut, { method: 'GET', ip: a.ip })).json;
    expect(r).toMatchObject({ withinSchedule: false, open: false });
  });

  it('A4 — enseignant dans la salle d’une autre école : deux écoles distinctes dans la réponse', async () => {
    const a = await ecole({ name: 'Collège A' });
    const b = await ecole({ name: 'Collège B' });
    await setAuthLock(b.cle, 30);
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: a.id });
    const r = (await appeler(statut, { method: 'GET', ip: b.ip, token: jeton })).json;
    expect(r.etablissement.name).toBe('Collège B');
    expect(r.ecole).toEqual({ id: a.id, name: 'Collège A' });
    expect(r.surPlace).toBe(false);
    expect(r.open).toBe(true); // la salle B est ouverte
  });

  it('A5 — élève simplement rattaché (sans titre) : l’école de travail retombe sur la salle', async () => {
    const a = await ecole();
    const b = await ecole();
    const jeton = await creerCompte('eleve@ecole.ch', { teacher: true });
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,0,?)')
      .run('eleve@ecole.ch', b.id, Date.now());
    const r = (await appeler(statut, { method: 'GET', ip: a.ip, token: jeton })).json;
    expect(r.ecole.id).toBe(a.id);
    const r2 = (await appeler(statut, { method: 'GET', ip: ipMaison(), token: jeton })).json;
    expect(r2.ecole).toBeNull();
  });
});

describe('Erreurs', () => {
  it('méthode autre que GET : 405', async () => {
    const r = await appeler(statut, { method: 'POST', ip: ipMaison() });
    expect(r.status).toBe(405);
    expect(r.json.error.code).toBe('ERR_METHOD_NOT_ALLOWED');
  });
});

describe('Anomalie corrigée : la console voit le tuteur comme le voient les élèves', () => {
  it('un tuteur archivé après le déploiement n’est plus nommé, ni par la console ni chez les élèves', async () => {
    const a = await ecole();
    const id = await creerTuteur({ name: 'Euclide' });
    await setAuthLock(a.cle, 30);
    await appeler(reglages, { method: 'PUT', ip: a.ip, body: { promptName: 'Euclide' } });
    (await base()).prepare('UPDATE prompts SET archived = 1 WHERE id = ?').run(id);
    expect((await appeler(reglages, { method: 'GET', ip: a.ip })).json.settings.promptName).toBeNull();
    // session-status applique désormais CLAUSE_VISIBLE, comme session-settings.
    const r = await appeler(statut, { method: 'GET', ip: a.ip });
    expect(r.json.settings).not.toBeNull();
    expect(r.json.settings.promptName).toBeNull();
  });

  it('un tuteur réservé par une AUTRE école après le déploiement n’est plus nommé', async () => {
    const a = await ecole();
    const b = await ecole();
    const id = await creerTuteur({ name: 'Hypatie' });
    await setAuthLock(a.cle, 30);
    await appeler(reglages, { method: 'PUT', ip: a.ip, body: { promptName: 'Hypatie' } });
    // L'école B reprend le tuteur pour elle seule (catalogue non publié).
    (await base()).prepare('UPDATE prompts SET etablissement_id = ?, publie = 0 WHERE id = ?').run(b.id, id);
    expect((await appeler(reglages, { method: 'GET', ip: a.ip })).json.settings.promptName).toBeNull();
    expect((await appeler(statut, { method: 'GET', ip: a.ip })).json.settings.promptName).toBeNull();
  });

  it('non-régression : un tuteur réservé à l’école de la séance reste nommé', async () => {
    const a = await ecole();
    const id = await creerTuteur({ name: 'Archimède' });
    (await base()).prepare('UPDATE prompts SET etablissement_id = ? WHERE id = ?').run(a.id, id);
    await setAuthLock(a.cle, 30);
    await appeler(reglages, { method: 'PUT', ip: a.ip, body: { promptName: 'Archimède' } });
    expect((await appeler(reglages, { method: 'GET', ip: a.ip })).json.settings.promptName).toBe('Archimède');
    expect((await appeler(statut, { method: 'GET', ip: a.ip })).json.settings.promptName).toBe('Archimède');
  });
});
