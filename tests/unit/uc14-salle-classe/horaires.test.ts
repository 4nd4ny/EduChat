// UC-14 — Tests unitaires : plages horaires et droit de dépenser les clés du
// serveur (src/server/etablissements.ts : isValidClock, parseHours,
// isWithinSchedule ; src/server/access.ts : isAccessAllowed, mayUseServerKeys).
//
// Fuseau : SET_TIME_ZONE=Europe/Zurich (tests/setup.ts). Le lundi 28 septembre
// 2026 est à l'heure d'été (UTC+2) : 10:00 à Zurich = 08:00Z.
// Seule l'horloge (Date) est simulée : les verrous de fichier gardent leurs
// vrais minuteurs.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { viderBase, creerEtablissement } from '../../helpers/db';
import { poserEnv } from '../../helpers/env';
import { isValidClock, parseHours, isWithinSchedule } from '../../../src/server/etablissements';

const LUNDI_10H = new Date('2026-09-28T08:00:00Z');
const LUNDI_18H = new Date('2026-09-28T16:00:00Z');
const DIMANCHE_10H = new Date('2026-09-27T08:00:00Z');
const LUNDI_8_12 = JSON.stringify([{ day: 1, start: '08:00', end: '12:00' }]);

function horloge(d: Date) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(d);
}

afterEach(() => { vi.useRealTimers(); });

describe('isValidClock', () => {
  it('accepte HH:MM de 00:00 à 23:59', () => {
    expect(isValidClock('00:00')).toBe(true);
    expect(isValidClock('23:59')).toBe(true);
  });
  it('refuse les heures hors bornes et les formes approximatives', () => {
    for (const v of ['24:00', '12:60', '8:00', '08:0', '0800', '', 'ab:cd']) expect(isValidClock(v)).toBe(false);
  });
});

describe('parseHours', () => {
  it('rend les créneaux valides', () => {
    expect(parseHours(LUNDI_8_12)).toEqual([{ day: 1, start: '08:00', end: '12:00' }]);
  });
  it('écarte les créneaux au jour, à l’heure ou à l’ordre invalide', () => {
    const brut = JSON.stringify([
      { day: 7, start: '08:00', end: '12:00' },
      { day: 1.5, start: '08:00', end: '12:00' },
      { day: 2, start: '25:00', end: '26:00' },
      { day: 3, start: '14:00', end: '10:00' },
      { day: 4, start: '10:00', end: '10:00' },
      null,
      { day: 0, start: '09:00', end: '11:00' },
    ]);
    expect(parseHours(brut)).toEqual([{ day: 0, start: '09:00', end: '11:00' }]);
  });
  it('rend une liste vide pour une chaîne vide, un JSON invalide ou un non-tableau', () => {
    expect(parseHours('')).toEqual([]);
    expect(parseHours('{pas du json')).toEqual([]);
    expect(parseHours('{"day":1}')).toEqual([]);
  });
});

describe('isWithinSchedule', () => {
  it('vrai dans le créneau du jour, bornes incluses', () => {
    const slots = parseHours(LUNDI_8_12);
    horloge(LUNDI_10H);
    expect(isWithinSchedule(slots)).toBe(true);
    horloge(new Date('2026-09-28T10:00:00Z')); // 12:00 locale : borne de fin incluse
    expect(isWithinSchedule(slots)).toBe(true);
    horloge(new Date('2026-09-28T06:00:00Z')); // 08:00 locale : borne de début incluse
    expect(isWithinSchedule(slots)).toBe(true);
  });
  it('faux hors de l’heure ou un autre jour', () => {
    const slots = parseHours(LUNDI_8_12);
    horloge(LUNDI_18H);
    expect(isWithinSchedule(slots)).toBe(false);
    horloge(DIMANCHE_10H);
    expect(isWithinSchedule(slots)).toBe(false);
  });
  it('faux sans aucun créneau', () => {
    horloge(LUNDI_10H);
    expect(isWithinSchedule([])).toBe(false);
  });
  it('le dimanche se note 0', () => {
    horloge(DIMANCHE_10H);
    expect(isWithinSchedule([{ day: 0, start: '09:00', end: '11:00' }])).toBe(true);
  });
});

describe('isAccessAllowed — horaires globaux SECRET_ALLOWED_HOURS', () => {
  afterEach(() => { poserEnv({ SECRET_ALLOWED_HOURS: undefined }); });

  it('suit les plages du serveur', async () => {
    poserEnv({ SECRET_ALLOWED_HOURS: LUNDI_8_12 });
    const { isAccessAllowed } = await import('../../../src/server/access');
    horloge(LUNDI_10H);
    expect(isAccessAllowed()).toBe(true);
    horloge(LUNDI_18H);
    expect(isAccessAllowed()).toBe(false);
  });
  it('sans plage configurée, jamais ouvert', async () => {
    poserEnv({ SECRET_ALLOWED_HOURS: undefined });
    const { isAccessAllowed } = await import('../../../src/server/access');
    horloge(LUNDI_10H);
    expect(isAccessAllowed()).toBe(false);
  });
  it('un JSON invalide ferme l’accès au lieu de lever', async () => {
    poserEnv({ SECRET_ALLOWED_HOURS: '[{oups' });
    const { isAccessAllowed } = await import('../../../src/server/access');
    horloge(LUNDI_10H);
    expect(isAccessAllowed()).toBe(false);
  });
});

describe('mayUseServerKeys', () => {
  beforeEach(async () => { await viderBase(); });
  afterEach(() => { poserEnv({ SECRET_ALLOWED_HOURS: undefined, SECRET_ALLOWED_IPS: undefined }); });

  it('hors de toute école : faux, même avec une salle ouverte ailleurs', async () => {
    const acces = await import('../../../src/server/access');
    const id = await creerEtablissement({ ips: '198.51.100.20' });
    await acces.setAuthLock(`etab:${id}`, 30);
    expect(await acces.mayUseServerKeys('203.0.113.20')).toBe(false);
    expect(await acces.mayUseServerKeys('198.51.100.20')).toBe(true);
  });

  it('école avec horaires propres : ils priment sur les horaires globaux', async () => {
    poserEnv({ SECRET_ALLOWED_HOURS: JSON.stringify([{ day: 1, start: '14:00', end: '20:00' }]) });
    const acces = await import('../../../src/server/access');
    const { creerEtablissement: creer } = await import('../../helpers/db');
    await creer({ ips: '198.51.100.21', hours: LUNDI_8_12 });
    horloge(LUNDI_10H);
    expect(await acces.mayUseServerKeys('198.51.100.21')).toBe(true);
    horloge(LUNDI_18H);
    expect(await acces.mayUseServerKeys('198.51.100.21')).toBe(false);
  });

  it('école sans horaires propres : horaires globaux du serveur', async () => {
    poserEnv({ SECRET_ALLOWED_HOURS: LUNDI_8_12 });
    const acces = await import('../../../src/server/access');
    const { creerEtablissement: creer } = await import('../../helpers/db');
    await creer({ ips: '198.51.100.22' });
    horloge(LUNDI_10H);
    expect(await acces.mayUseServerKeys('198.51.100.22')).toBe(true);
    horloge(LUNDI_18H);
    expect(await acces.mayUseServerKeys('198.51.100.22')).toBe(false);
  });

  it('la salle ouverte prime sur l’horaire (cours hors plage)', async () => {
    const acces = await import('../../../src/server/access');
    const id = await creerEtablissement({ ips: '198.51.100.23', hours: LUNDI_8_12 });
    horloge(LUNDI_18H);
    expect(await acces.mayUseServerKeys('198.51.100.23')).toBe(false);
    await acces.setAuthLock(`etab:${id}`, 30);
    expect(await acces.mayUseServerKeys('198.51.100.23')).toBe(true);
  });

  it('adresse d’amorçage : horaires globaux, ou salle d’amorçage ouverte', async () => {
    poserEnv({ SECRET_ALLOWED_IPS: '192.0.2.60', SECRET_ALLOWED_HOURS: LUNDI_8_12 });
    const acces = await import('../../../src/server/access');
    horloge(LUNDI_10H);
    expect(await acces.mayUseServerKeys('192.0.2.60')).toBe(true);
    horloge(LUNDI_18H);
    expect(await acces.mayUseServerKeys('192.0.2.60')).toBe(false);
    await acces.setAuthLock('amorcage', 30);
    expect(await acces.mayUseServerKeys('192.0.2.60')).toBe(true);
  });
});
