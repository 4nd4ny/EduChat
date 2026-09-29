// UC-14 — Tests fonctionnels : entrée par l'adresse de l'école dans ses
// horaires, anti-usurpation de l'IP, serveur sans mot de passe configuré.
// Chaque bloc pose sa configuration (poserEnv) puis recharge la route /api/auth.
import bcrypt from 'bcrypt';
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { appeler, type ApiHandler } from '../../helpers/api';
import { poserEnv } from '../../helpers/env';

const LUNDI_10H = new Date('2026-09-28T08:00:00Z'); // 10:00 à Zurich (heure d'été)
const LUNDI_18H = new Date('2026-09-28T16:00:00Z');
const LUNDI_8_12 = JSON.stringify([{ day: 1, start: '08:00', end: '12:00' }]);
const MOT_DE_PASSE = 'Craie-verte';
const HASH = bcrypt.hashSync(MOT_DE_PASSE, 4);

let auth: ApiHandler;
let acces: typeof import('../../../src/server/access');
let db: typeof import('../../helpers/db');

async function charger(vars: Record<string, string | undefined>) {
  poserEnv(vars);
  auth = (await import('../../../src/pages/api/auth')).default;
  acces = await import('../../../src/server/access');
  db = await import('../../helpers/db');
  await db.viderBase();
}
function horloge(d: Date) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(d);
}

const TOUT = {
  SECRET_PASSWD: undefined, SECRET_ALLOWED_IPS: undefined, SECRET_ALLOWED_HOURS: undefined,
  SECRET_PROXY_TOKEN: undefined, TRUSTED_PROXY_IPS: undefined,
};
afterEach(() => { vi.useRealTimers(); });
afterAll(() => { poserEnv(TOUT); });

describe('Scénario alternatif : poste d’école reconnu par SECRET_ALLOWED_IPS dans les horaires', () => {
  beforeAll(async () => {
    await charger({ ...TOUT, SECRET_PASSWD: HASH, SECRET_ALLOWED_IPS: '192.0.2.10, 192.0.2.11', SECRET_ALLOWED_HOURS: LUNDI_8_12 });
  });

  it('entre sans mot de passe et pose un verrou de courtoisie de 30 minutes sur la salle d’amorçage', async () => {
    horloge(LUNDI_10H);
    const r = await appeler(auth, { method: 'GET', ip: '192.0.2.10' });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ success: true, message: 'Connexion autorisée via IP' });
    const echeance = await acces.getAuthLockExpiry('amorcage');
    expect(echeance).toBe(LUNDI_10H.getTime() + 30 * 60_000);
    // L'autre adresse de la même école en profite (portée d'amorçage unique).
    const r2 = await appeler(auth, { method: 'GET', ip: '192.0.2.11' });
    expect(r2.json.message).toBe('Autologin activé via verrou');
  });

  it('hors des horaires : il faut le mot de passe', async () => {
    horloge(new Date('2026-09-28T20:00:00Z'));
    const r = await appeler(auth, { method: 'GET', ip: '192.0.2.10' });
    expect(r.json).toEqual({ authorized: false });
    const ouvre = await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}30` }, ip: '192.0.2.10' });
    expect(ouvre.status).toBe(200);
    expect(ouvre.json.message).toBe('Connexion autorisée');
    expect(await acces.checkAuthLock('amorcage')).toBe(true);
  });

  it('une adresse inconnue n’entre jamais par les horaires', async () => {
    horloge(LUNDI_10H);
    expect((await appeler(auth, { method: 'GET', ip: '203.0.113.200' })).json).toEqual({ authorized: false });
  });
});

describe('Anomalie : une école en base n’entre jamais par ses horaires sur /api/auth', () => {
  beforeAll(async () => { await charger({ ...TOUT, SECRET_PASSWD: HASH }); });

  it('dans ses propres horaires, GET répond { authorized: false } alors que mayUseServerKeys dit oui', async () => {
    await db.creerEtablissement({ ips: '198.51.100.50', hours: LUNDI_8_12 });
    horloge(LUNDI_10H);
    expect(await acces.mayUseServerKeys('198.51.100.50')).toBe(true);
    const r = await appeler(auth, { method: 'GET', ip: '198.51.100.50' });
    // Comportement actuel : la branche « IP + horaires » ne regarde que
    // SECRET_ALLOWED_IPS et SECRET_ALLOWED_HOURS.
    expect(r.json).toEqual({ authorized: false });
  });
});

describe('Anti-usurpation : SECRET_PROXY_TOKEN configuré', () => {
  beforeAll(async () => { await charger({ ...TOUT, SECRET_PASSWD: HASH, SECRET_PROXY_TOKEN: 'secret-du-proxy' }); });

  it('un X-Real-IP forgé sans le jeton du proxy est ramené au socket : aucune salle à ouvrir', async () => {
    const id = await db.creerEtablissement({ ips: '198.51.100.60' });
    const r = await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}30` }, ip: '198.51.100.60' });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ERR_NO_ETABLISSEMENT');
    expect(await acces.checkAuthLock(`etab:${id}`)).toBe(false);
  });

  it('la même requête portée par le proxy (jeton correct) ouvre la salle', async () => {
    const id = await db.creerEtablissement({ ips: '198.51.100.61' });
    const r = await appeler(auth, {
      method: 'POST', body: { password: `${MOT_DE_PASSE}30` }, ip: '198.51.100.61',
      headers: { 'x-proxy-token': 'secret-du-proxy' },
    });
    expect(r.status).toBe(200);
    expect(await acces.checkAuthLock(`etab:${id}`)).toBe(true);
  });
});

describe('Anti-usurpation : TRUSTED_PROXY_IPS configuré', () => {
  beforeAll(async () => { await charger({ ...TOUT, SECRET_PASSWD: HASH, TRUSTED_PROXY_IPS: '10.0.0.1' }); });

  it('le socket de test (10.99.99.99) n’est pas un proxy listé : X-Real-IP ignoré', async () => {
    await db.creerEtablissement({ ips: '198.51.100.70' });
    const r = await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}30` }, ip: '198.51.100.70' });
    expect(r.status).toBe(403);
  });
});

describe('Serveur sans SECRET_PASSWD', () => {
  beforeAll(async () => { await charger({ ...TOUT }); });

  it('aucun mot de passe n’ouvre la salle : 401', async () => {
    const id = await db.creerEtablissement({ ips: '198.51.100.80' });
    const r = await appeler(auth, { method: 'POST', body: { password: 'nimporte30' }, ip: '198.51.100.80' });
    expect(r.status).toBe(401);
    expect(await acces.checkAuthLock(`etab:${id}`)).toBe(false);
  });
});

// Garde-fou : horaires globaux présents mais on est hors plage pour une IP
// d'amorçage → le verrou de courtoisie n'est PAS posé.
describe('Pas de verrou de courtoisie hors horaires', () => {
  beforeAll(async () => { await charger({ ...TOUT, SECRET_ALLOWED_IPS: '192.0.2.20', SECRET_ALLOWED_HOURS: LUNDI_8_12 }); });
  beforeEach(() => { horloge(LUNDI_18H); });

  it('GET hors plage ne pose rien', async () => {
    await appeler(auth, { method: 'GET', ip: '192.0.2.20' });
    expect(await acces.checkAuthLock('amorcage')).toBe(false);
  });
});

describe('Anomalie : un mot de passe de salle qui finit par des chiffres est inutilisable', () => {
  beforeAll(async () => { await charger({ ...TOUT, SECRET_PASSWD: bcrypt.hashSync('Salle2024', 4) }); });

  it('les chiffres finaux sont tous lus comme la durée : le mot de passe comparé devient « Salle »', async () => {
    const id = await db.creerEtablissement({ ips: '198.51.100.90' });
    for (const saisie of ['Salle202430', 'Salle2024']) {
      const r = await appeler(auth, { method: 'POST', body: { password: saisie }, ip: '198.51.100.90' });
      expect(r.status).toBe(401);
    }
    expect(await acces.checkAuthLock(`etab:${id}`)).toBe(false);
  });
});
