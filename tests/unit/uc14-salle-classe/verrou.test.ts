// UC-14 — Tests unitaires : portée d'une salle et verrou par école
// (src/server/access.ts : salleDepuisIp, porteeEtablissement, setAuthLock,
// clearAuthLock, checkAuthLock, getAuthLockExpiry).
//
// Le verrou vit dans DATA_DIR/auth_lock.json (format v2 :
// { version: 2, salles: { <clé>: <échéance ms> } }).
import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { viderBase, creerEtablissement } from '../../helpers/db';
import { poserEnv } from '../../helpers/env';
import {
  salleDepuisIp, porteeEtablissement, setAuthLock, clearAuthLock, checkAuthLock, getAuthLockExpiry,
} from '../../../src/server/access';

const FICHIER = () => path.join(process.env.DATA_DIR!, 'auth_lock.json');
const lireFichier = () => JSON.parse(fs.readFileSync(FICHIER(), 'utf8'));

beforeEach(async () => {
  await viderBase();
  fs.rmSync(FICHIER(), { force: true });
});
afterEach(() => { vi.useRealTimers(); });

describe('salleDepuisIp', () => {
  it('rend la portée « etab:<id> » d’une école enregistrée, avec sa ligne', async () => {
    const id = await creerEtablissement({ name: 'Collège A', ips: '198.51.100.1, 198.51.100.2' });
    const portee = await salleDepuisIp('198.51.100.2');
    expect(portee?.cle).toBe(`etab:${id}`);
    expect(portee?.cle).toBe(porteeEtablissement(id));
    expect(portee?.etablissement?.name).toBe('Collège A');
  });

  it('rend null pour une adresse qui n’appartient à aucune école', async () => {
    await creerEtablissement({ ips: '198.51.100.1' });
    expect(await salleDepuisIp('203.0.113.99')).toBeNull();
    expect(await salleDepuisIp('unknown')).toBeNull();
  });

  it('rend la portée d’amorçage pour une adresse SECRET_ALLOWED_IPS absente de la base', async () => {
    poserEnv({ SECRET_ALLOWED_IPS: '192.0.2.50' });
    try {
      const acces = await import('../../../src/server/access');
      expect(await acces.salleDepuisIp('192.0.2.50')).toEqual({ cle: 'amorcage', etablissement: null });
    } finally {
      poserEnv({ SECRET_ALLOWED_IPS: undefined });
    }
  });

  it('une école enregistrée l’emporte sur l’amorçage pour la même adresse', async () => {
    poserEnv({ SECRET_ALLOWED_IPS: '192.0.2.51' });
    try {
      const { creerEtablissement: creer } = await import('../../helpers/db');
      const id = await creer({ ips: '192.0.2.51' });
      const acces = await import('../../../src/server/access');
      expect((await acces.salleDepuisIp('192.0.2.51'))?.cle).toBe(`etab:${id}`);
    } finally {
      poserEnv({ SECRET_ALLOWED_IPS: undefined });
    }
  });
});

describe('setAuthLock / checkAuthLock / getAuthLockExpiry', () => {
  it('ouvre une salle pour la durée demandée et écrit le format v2', async () => {
    const avant = Date.now();
    await setAuthLock('etab:1', 30);
    expect(await checkAuthLock('etab:1')).toBe(true);
    const echeance = await getAuthLockExpiry('etab:1');
    expect(echeance).toBeGreaterThanOrEqual(avant + 30 * 60_000);
    expect(echeance).toBeLessThanOrEqual(Date.now() + 30 * 60_000);
    expect(lireFichier()).toEqual({ version: 2, salles: { 'etab:1': echeance } });
  });

  it('une salle ouverte n’ouvre pas celle des autres écoles', async () => {
    await setAuthLock('etab:1', 30);
    expect(await checkAuthLock('etab:2')).toBe(false);
    expect(await getAuthLockExpiry('etab:2')).toBe(0);
  });

  it('un appelant sans salle (null) est toujours « fermé »', async () => {
    await setAuthLock('etab:1', 30);
    expect(await checkAuthLock(null)).toBe(false);
    expect(await getAuthLockExpiry(null)).toBe(0);
  });

  it('plusieurs écoles peuvent être ouvertes en même temps', async () => {
    await setAuthLock('etab:1', 30);
    await setAuthLock('etab:2', 60);
    await setAuthLock('amorcage', 10);
    expect(await checkAuthLock('etab:1')).toBe(true);
    expect(await checkAuthLock('etab:2')).toBe(true);
    expect(await checkAuthLock('amorcage')).toBe(true);
  });

  it('les écritures concurrentes de deux écoles ne s’écrasent pas (verrou de fichier)', async () => {
    await Promise.all([setAuthLock('etab:1', 30), setAuthLock('etab:2', 30), setAuthLock('etab:3', 30)]);
    expect(Object.keys(lireFichier().salles).sort()).toEqual(['etab:1', 'etab:2', 'etab:3']);
  });

  it('une durée nulle, négative ou non numérique n’ouvre rien', async () => {
    await setAuthLock('etab:1', 0);
    expect(await checkAuthLock('etab:1')).toBe(false);
    await setAuthLock('etab:2', -5);
    expect(await checkAuthLock('etab:2')).toBe(false);
    await setAuthLock('etab:3', Number.NaN);
    expect(await checkAuthLock('etab:3')).toBe(false);
  });

  it('la durée est tronquée à la minute entière', async () => {
    const avant = Date.now();
    await setAuthLock('etab:1', 2.9);
    const echeance = await getAuthLockExpiry('etab:1');
    expect(echeance - avant).toBeGreaterThanOrEqual(2 * 60_000);
    expect(echeance - avant).toBeLessThan(3 * 60_000);
  });

  it('la salle se referme d’elle-même à l’échéance', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T08:00:00Z'));
    await setAuthLock('etab:1', 45);
    vi.setSystemTime(new Date('2026-09-28T08:44:00Z'));
    expect(await checkAuthLock('etab:1')).toBe(true);
    vi.setSystemTime(new Date('2026-09-28T08:45:00Z'));
    expect(await checkAuthLock('etab:1')).toBe(false);
  });

  it('une écriture purge les échéances dépassées ; une lecture ne touche pas au fichier', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T08:00:00Z'));
    await setAuthLock('etab:1', 5);
    vi.setSystemTime(new Date('2026-09-28T08:10:00Z'));
    await checkAuthLock('etab:1');
    expect(Object.keys(lireFichier().salles)).toEqual(['etab:1']); // lecture : rien purgé
    await setAuthLock('etab:2', 5);
    expect(Object.keys(lireFichier().salles)).toEqual(['etab:2']); // écriture : purge
  });
});

describe('clearAuthLock', () => {
  it('referme une salle avant terme sans toucher aux autres', async () => {
    await setAuthLock('etab:1', 30);
    await setAuthLock('etab:2', 30);
    await clearAuthLock('etab:1');
    expect(await checkAuthLock('etab:1')).toBe(false);
    expect(await checkAuthLock('etab:2')).toBe(true);
  });

  it('est idempotent, y compris sans fichier existant', async () => {
    await clearAuthLock('etab:9');
    await clearAuthLock('etab:9');
    expect(lireFichier()).toEqual({ version: 2, salles: {} });
  });
});

describe('lecture défensive du fichier de verrou', () => {
  it('l’ancien format { timestamp } est tenu pour FERMÉ', async () => {
    fs.writeFileSync(FICHIER(), JSON.stringify({ timestamp: Date.now() + 3_600_000 }));
    expect(await checkAuthLock('etab:1')).toBe(false);
    expect(await checkAuthLock('amorcage')).toBe(false);
  });

  it('la première écriture remplace l’ancien format sans rien en reprendre', async () => {
    fs.writeFileSync(FICHIER(), JSON.stringify({ timestamp: Date.now() + 3_600_000 }));
    await setAuthLock('etab:1', 10);
    const doc = lireFichier();
    expect(doc.version).toBe(2);
    expect(doc.timestamp).toBeUndefined();
    expect(Object.keys(doc.salles)).toEqual(['etab:1']);
  });

  it('un fichier tronqué ou illisible vaut fermé, sans lever', async () => {
    fs.writeFileSync(FICHIER(), '{"version":2,"salles":{"etab:1":');
    expect(await checkAuthLock('etab:1')).toBe(false);
    fs.writeFileSync(FICHIER(), 'null');
    expect(await checkAuthLock('etab:1')).toBe(false);
  });

  it('une échéance non numérique est écartée', async () => {
    fs.writeFileSync(FICHIER(), JSON.stringify({ version: 2, salles: { 'etab:1': 'demain', 'etab:2': Date.now() + 60_000 } }));
    expect(await checkAuthLock('etab:1')).toBe(false);
    expect(await checkAuthLock('etab:2')).toBe(true);
  });

  it('un « salles » absent ou mal typé vaut fermé', async () => {
    fs.writeFileSync(FICHIER(), JSON.stringify({ version: 2 }));
    expect(await checkAuthLock('etab:1')).toBe(false);
  });
});
