// UC-14 — Tests fonctionnels : « Ouvrir et refermer la salle de classe ».
// Enchaîne la vraie route /api/auth (ouverture par mot de passe suffixé d'une
// durée, fermeture anticipée, état en GET) et vérifie l'effet réel sur le
// verrou de l'école (checkAuthLock, mayUseServerKeys).
//
// SECRET_PASSWD est figé au chargement de src/utils/env.ts : on le pose (deux
// hachés bcrypt, comme en production) puis on charge la route dynamiquement.
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { appeler, type ApiHandler } from '../../helpers/api';
import { poserEnv } from '../../helpers/env';

const MOT_DE_PASSE = 'Craie-verte';
const SECOND_MOT_DE_PASSE = 'Tableau-noir';
const PLAFOND = 120;

let auth: ApiHandler;
let acces: typeof import('../../../src/server/access');
let db: typeof import('../../helpers/db');

// Chaque test a ses propres adresses : failed_attempts.json est par IP.
let n = 0;
const ipNeuve = () => `203.0.113.${++n}`;
let m = 0;
/** Crée une école sur une adresse neuve ; renvoie son id, son IP et sa clé de salle. */
async function ecole(nom = 'Collège de test') {
  const ip = `198.51.100.${++m}`;
  const id = await db.creerEtablissement({ name: nom, ips: ip });
  return { id, ip, cle: `etab:${id}` };
}

const DATA = () => process.env.DATA_DIR!;
function tentatives(ip: string): { count: number; lockUntil: number } | undefined {
  try { return JSON.parse(fs.readFileSync(path.join(DATA(), 'failed_attempts.json'), 'utf8'))[ip]; }
  catch { return undefined; }
}
/**
 * La route compte les échecs SANS attendre l'écriture (handleFailedAttempt
 * n'est pas attendu) : on patiente jusqu'à ce que le fichier reflète l'état voulu.
 */
async function attendre(cond: () => boolean, delai = 5000) {
  const fin = Date.now() + delai;
  while (!cond()) {
    if (Date.now() > fin) throw new Error('condition jamais atteinte');
    await new Promise(r => setTimeout(r, 20));
  }
}
async function echouer(ip: string, attendu: (t: { count: number; lockUntil: number } | undefined) => boolean) {
  const r = await appeler(auth, { method: 'POST', body: { password: 'mauvais30' }, ip });
  expect(r.status).toBe(401);
  await attendre(() => attendu(tentatives(ip)));
}

beforeAll(async () => {
  poserEnv({
    SECRET_PASSWD: `${bcrypt.hashSync(MOT_DE_PASSE, 4)}, ${bcrypt.hashSync(SECOND_MOT_DE_PASSE, 4)}`,
    SECRET_MAX_UNLOCK_MINUTES: String(PLAFOND),
  });
  auth = (await import('../../../src/pages/api/auth')).default;
  acces = await import('../../../src/server/access');
  db = await import('../../helpers/db');
});
afterAll(() => { poserEnv({ SECRET_PASSWD: undefined, SECRET_MAX_UNLOCK_MINUTES: undefined }); });
beforeEach(async () => { await db.viderBase(); });
afterEach(() => { vi.useRealTimers(); });

describe('Scénario nominal : ouvrir la salle depuis le réseau de l’école', () => {
  it('le mot de passe suffixé de la durée ouvre la salle de CETTE école pour cette durée', async () => {
    const a = await ecole('Collège A');
    const avant = Date.now();
    const r = await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}45` }, ip: a.ip });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ success: true, message: 'Connexion autorisée' });

    const echeance = await acces.getAuthLockExpiry(a.cle);
    expect(echeance).toBeGreaterThanOrEqual(avant + 45 * 60_000);
    expect(echeance).toBeLessThanOrEqual(Date.now() + 45 * 60_000);
    // Les élèves de CE réseau peuvent désormais dépenser la clé de l'école.
    expect(await acces.mayUseServerKeys(a.ip)).toBe(true);
  });

  it('chacun des mots de passe de SECRET_PASSWD est accepté', async () => {
    const a = await ecole();
    const r = await appeler(auth, { method: 'POST', body: { password: `${SECOND_MOT_DE_PASSE}10` }, ip: a.ip });
    expect(r.status).toBe(200);
    expect(await acces.checkAuthLock(a.cle)).toBe(true);
  });

  it('l’ouverture ne profite qu’à cette école, ni aux autres écoles, ni à Internet', async () => {
    const a = await ecole('Collège A');
    const b = await ecole('Collège B');
    await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}30` }, ip: a.ip });
    expect(await acces.checkAuthLock(b.cle)).toBe(false);
    expect(await acces.mayUseServerKeys(b.ip)).toBe(false);
    expect(await acces.mayUseServerKeys(ipNeuve())).toBe(false);
  });

  it('une fois la salle ouverte, tout poste du réseau entre sans mot de passe (GET)', async () => {
    const a = await ecole();
    await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}30` }, ip: a.ip });
    const r = await appeler(auth, { method: 'GET', ip: a.ip });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ success: true, message: 'Autologin activé via verrou' });
  });

  it('la salle se referme d’elle-même à l’échéance', async () => {
    const a = await ecole();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T08:00:00Z'));
    await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}20` }, ip: a.ip });
    vi.setSystemTime(new Date('2026-09-28T08:19:00Z'));
    expect((await appeler(auth, { method: 'GET', ip: a.ip })).json.success).toBe(true);
    vi.setSystemTime(new Date('2026-09-28T08:21:00Z'));
    expect((await appeler(auth, { method: 'GET', ip: a.ip })).json).toEqual({ authorized: false });
  });

  it('le mot de passe saisi n’est jamais journalisé', async () => {
    const a = await ecole();
    await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}15` }, ip: a.ip });
    await appeler(auth, { method: 'POST', body: { password: 'Craie-vertE15' }, ip: ipNeuve() });
    const journal = path.join(DATA(), 'auth_log.txt');
    await attendre(() => fs.existsSync(journal) && fs.readFileSync(journal, 'utf8').split('\n').length > 2);
    const texte = fs.readFileSync(journal, 'utf8');
    expect(texte).toContain('duree=15min');
    expect(texte).not.toContain(MOT_DE_PASSE);
    expect(texte).not.toContain('Craie-vertE');
  });
});

describe('Scénarios alternatifs', () => {
  it('A1 — une durée démesurée est ramenée au plafond SECRET_MAX_UNLOCK_MINUTES', async () => {
    const a = await ecole();
    const r = await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}99999` }, ip: a.ip });
    expect(r.status).toBe(200);
    const minutes = (await acces.getAuthLockExpiry(a.cle) - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(PLAFOND - 1);
    expect(minutes).toBeLessThanOrEqual(PLAFOND);
  });

  it('A2 — rouvrir remplace l’échéance précédente (y compris pour la raccourcir)', async () => {
    const a = await ecole();
    await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}90` }, ip: a.ip });
    const premiere = await acces.getAuthLockExpiry(a.cle);
    // Salle ouverte : le POST suivant court-circuite (auto-login) et ne change rien.
    const r = await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}5` }, ip: a.ip });
    expect(r.json.message).toBe('Autologin activé via verrou');
    expect(await acces.getAuthLockExpiry(a.cle)).toBe(premiere);
  });

  it('A3 — fermeture anticipée : referme SA salle, pas celle des autres écoles', async () => {
    const a = await ecole('Collège A');
    const b = await ecole('Collège B');
    await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}60` }, ip: a.ip });
    await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}60` }, ip: b.ip });

    // La durée éventuellement suffixée est ignorée à la fermeture.
    const r = await appeler(auth, { method: 'POST', body: { action: 'close', password: `${MOT_DE_PASSE}60` }, ip: a.ip });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ success: true, message: 'Accès fermé' });
    expect(await acces.checkAuthLock(a.cle)).toBe(false);
    expect(await acces.mayUseServerKeys(a.ip)).toBe(false);
    expect(await acces.checkAuthLock(b.cle)).toBe(true);
    // Le poste de la salle A ne rentre plus sans mot de passe.
    expect((await appeler(auth, { method: 'GET', ip: a.ip })).json).toEqual({ authorized: false });
  });

  it('A3 — refermer une salle déjà fermée réussit (idempotent)', async () => {
    const a = await ecole();
    const r = await appeler(auth, { method: 'POST', body: { action: 'close', password: MOT_DE_PASSE }, ip: a.ip });
    expect(r.status).toBe(200);
    expect(await acces.checkAuthLock(a.cle)).toBe(false);
  });

  it('A4 — GET hors salle ouverte : { authorized: false }', async () => {
    const a = await ecole();
    expect((await appeler(auth, { method: 'GET', ip: a.ip })).json).toEqual({ authorized: false });
    expect((await appeler(auth, { method: 'GET', ip: ipNeuve() })).json).toEqual({ authorized: false });
  });
});

describe('Scénarios d’erreur', () => {
  it('bon mot de passe hors du réseau d’une école : 403 ERR_NO_ETABLISSEMENT, sans compter d’échec', async () => {
    const ip = ipNeuve();
    const r = await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}30` }, ip });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ERR_NO_ETABLISSEMENT');
    await new Promise(res => setTimeout(res, 100));
    expect(tentatives(ip)).toBeUndefined();
  });

  it('un jeton d’enseignant n’ouvre rien : sans mot de passe, la route refuse', async () => {
    const a = await ecole();
    const jeton = await db.creerCompte('prof@ecole.ch', { teacher: true, etablissementId: a.id, schoolAdmin: true });
    const r = await appeler(auth, { method: 'POST', body: {}, token: jeton, ip: a.ip });
    // Comportement actuel : 500 « Erreur du formulaire de connexion » (voir Anomalies).
    expect(r.status).toBe(500);
    expect(r.json.success).toBe(false);
    expect(await acces.checkAuthLock(a.cle)).toBe(false);
  });

  it('mauvais mot de passe : 401, compté pour l’IP appelante', async () => {
    const a = await ecole();
    const r = await appeler(auth, { method: 'POST', body: { password: 'faux45' }, ip: a.ip });
    expect(r.status).toBe(401);
    expect(r.json).toEqual({ success: false, message: 'Mot de passe incorrect' });
    await attendre(() => tentatives(a.ip)?.count === 1);
    expect(await acces.checkAuthLock(a.cle)).toBe(false);
  });

  it('5 échecs verrouillent l’IP 15 minutes, même avec le bon mot de passe, puis le compteur repart', async () => {
    const a = await ecole();
    for (let i = 1; i <= 4; i++) await echouer(a.ip, t => t?.count === i);
    await echouer(a.ip, t => (t?.lockUntil ?? 0) > 0);
    expect(tentatives(a.ip)!.count).toBe(0);
    const verrou = tentatives(a.ip)!.lockUntil;
    expect(verrou - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(verrou - Date.now()).toBeLessThanOrEqual(15 * 60_000);

    const bloque = await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}30` }, ip: a.ip });
    expect(bloque.status).toBe(429);
    expect(bloque.json.success).toBe(false);
    expect(await acces.checkAuthLock(a.cle)).toBe(false);
    // Le GET aussi est refusé tant que dure le verrouillage.
    expect((await appeler(auth, { method: 'GET', ip: a.ip })).status).toBe(429);
    // Une autre adresse n'est pas concernée.
    const b = await ecole();
    expect((await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}30` }, ip: b.ip })).status).toBe(200);

    // 16 minutes plus tard, le bon mot de passe passe de nouveau.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 16 * 60_000);
    const r = await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}30` }, ip: a.ip });
    expect(r.status).toBe(200);
  });

  it('fermeture avec un mauvais mot de passe : 401, la salle reste ouverte, l’échec est compté', async () => {
    const a = await ecole();
    await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}30` }, ip: a.ip });
    const r = await appeler(auth, { method: 'POST', body: { action: 'close', password: 'devine' }, ip: a.ip });
    expect(r.status).toBe(401);
    expect(await acces.checkAuthLock(a.cle)).toBe(true);
    await attendre(() => tentatives(a.ip)?.count === 1);
  });

  it('fermeture sans mot de passe : 401 (un élève ne peut pas couper la classe)', async () => {
    const a = await ecole();
    await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}30` }, ip: a.ip });
    const r = await appeler(auth, { method: 'POST', body: { action: 'close' }, ip: a.ip });
    expect(r.status).toBe(401);
    expect(await acces.checkAuthLock(a.cle)).toBe(true);
  });

  it('fermeture hors réseau scolaire : 403 ERR_NO_ETABLISSEMENT', async () => {
    const r = await appeler(auth, { method: 'POST', body: { action: 'close', password: MOT_DE_PASSE }, ip: ipNeuve() });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ERR_NO_ETABLISSEMENT');
  });

  it('méthode autre que GET/POST hors salle ouverte : 405', async () => {
    const r = await appeler(auth, { method: 'DELETE', ip: ipNeuve() });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toEqual(['POST', 'GET']);
  });

  it('adresse X-Real-IP invalide : ramenée au socket, qui n’est d’aucune école', async () => {
    await ecole();
    const r = await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}30` }, headers: { 'x-real-ip': 'n-importe-quoi' } });
    expect(r.status).toBe(403);
  });
});

describe('Comportements actuels discutables (voir « Anomalies constatées »)', () => {
  it('sans suffixe de durée : « Connexion autorisée » répondu, mais la salle n’est PAS ouverte', async () => {
    const a = await ecole();
    const r = await appeler(auth, { method: 'POST', body: { password: MOT_DE_PASSE }, ip: a.ip });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ success: true, message: 'Connexion autorisée' });
    // Durée 0 → échéance = maintenant → salle fermée.
    expect(await acces.checkAuthLock(a.cle)).toBe(false);
    expect(await acces.mayUseServerKeys(a.ip)).toBe(false);
  });

  it('la fermeture ignore le verrouillage de l’IP : le mot de passe reste testable sans limite', async () => {
    const a = await ecole();
    for (let i = 1; i <= 4; i++) await echouer(a.ip, t => t?.count === i);
    await echouer(a.ip, t => (t?.lockUntil ?? 0) > 0);
    // L'ouverture est bloquée (429)…
    expect((await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}30` }, ip: a.ip })).status).toBe(429);
    // …mais la branche « close » répond encore 401 / 200 selon le mot de passe.
    expect((await appeler(auth, { method: 'POST', body: { action: 'close', password: 'faux' }, ip: a.ip })).status).toBe(401);
    expect((await appeler(auth, { method: 'POST', body: { action: 'close', password: MOT_DE_PASSE }, ip: a.ip })).status).toBe(200);
  });

  it('salle ouverte : toute requête du réseau répond succès, quelle que soit la méthode ou le mot de passe', async () => {
    const a = await ecole();
    await appeler(auth, { method: 'POST', body: { password: `${MOT_DE_PASSE}30` }, ip: a.ip });
    expect((await appeler(auth, { method: 'POST', body: { password: 'faux' }, ip: a.ip })).json.success).toBe(true);
    expect((await appeler(auth, { method: 'DELETE', ip: a.ip })).status).toBe(200);
  });
});
