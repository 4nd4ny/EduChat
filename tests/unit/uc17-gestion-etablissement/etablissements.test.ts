// UC-17 — Tests unitaires : le module des établissements
// (src/server/etablissements.ts) tel que l'administration d'une école le
// sollicite — validation des horaires, créneau courant, consommation du mois,
// quota quotidien d'un élève et relevé par fournisseur.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { viderBase, creerEtablissement, base } from '../../helpers/db';
import { poserEnv } from '../../helpers/env';
import {
  isValidClock, parseHours, isWithinSchedule, getEtablissementById,
  monthUsage, studentDayUsage, monthUsageByProvider, consommationDuMois,
} from '../../../src/server/etablissements';

beforeEach(async () => { await viderBase(); });

/** Écrit une ligne de journal d'usage (ce que font /api/completion, /api/speak…). */
async function journaliser(o: {
  etablissementId: number; tokens: number; provider?: string; ts?: number;
  clientId?: string; serverKey?: boolean;
}) {
  (await base()).prepare(`INSERT INTO usage_log (ts, ip, etablissement_id, provider, tokens, used_server_key, client_id)
    VALUES (?, '', ?, ?, ?, ?, ?)`)
    .run(o.ts ?? Date.now(), o.etablissementId, o.provider ?? 'mistral', o.tokens,
      o.serverKey === false ? 0 : 1, o.clientId ?? '');
}

describe('isValidClock', () => {
  it('accepte une heure d’horloge HH:MM valide', () => {
    for (const h of ['00:00', '08:30', '23:59']) expect(isValidClock(h)).toBe(true);
  });
  it('refuse les heures hors bornes et les formats approximatifs', () => {
    for (const h of ['24:00', '12:60', '8:00', '08h00', '0800', '', '08:00:00', 'ab:cd']) {
      expect(isValidClock(h)).toBe(false);
    }
  });
});

describe('parseHours', () => {
  it('relit les créneaux enregistrés', () => {
    const json = JSON.stringify([{ day: 1, start: '08:00', end: '17:00' }, { day: 3, start: '08:00', end: '12:00' }]);
    expect(parseHours(json)).toEqual([{ day: 1, start: '08:00', end: '17:00' }, { day: 3, start: '08:00', end: '12:00' }]);
  });
  it('écarte les créneaux invalides sans rejeter les autres', () => {
    const json = JSON.stringify([
      { day: 7, start: '08:00', end: '09:00' },   // jour hors 0-6
      { day: 1.5, start: '08:00', end: '09:00' }, // jour non entier
      { day: 2, start: '10:00', end: '09:00' },   // début après la fin
      { day: 2, start: '10:00', end: '10:00' },   // créneau vide
      { day: 2, start: '25:00', end: '26:00' },   // heure impossible
      null,
      { day: 0, start: '09:00', end: '11:00' },   // seul valide
    ]);
    expect(parseHours(json)).toEqual([{ day: 0, start: '09:00', end: '11:00' }]);
  });
  it('rend une liste vide pour une valeur vide, illisible ou qui n’est pas un tableau', () => {
    expect(parseHours('')).toEqual([]);
    expect(parseHours('pas du json')).toEqual([]);
    expect(parseHours('{"day":1}')).toEqual([]);
  });
});

describe('isWithinSchedule (fuseau SET_TIME_ZONE = Europe/Zurich)', () => {
  // Lundi 28 septembre 2026, 08:00 UTC = 10:00 à Zurich (heure d'été).
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-28T08:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('aucun créneau : jamais dans l’horaire', () => {
    expect(isWithinSchedule([])).toBe(false);
  });
  it('dans le créneau du jour, en heure LOCALE', () => {
    expect(isWithinSchedule([{ day: 1, start: '09:00', end: '11:00' }])).toBe(true);
    // 08:00-09:00 local ne contient pas 10:00 local, même si 08:00 UTC y tombe.
    expect(isWithinSchedule([{ day: 1, start: '08:00', end: '09:00' }])).toBe(false);
  });
  it('les bornes sont incluses', () => {
    expect(isWithinSchedule([{ day: 1, start: '10:00', end: '12:00' }])).toBe(true);
    expect(isWithinSchedule([{ day: 1, start: '08:00', end: '10:00' }])).toBe(true);
  });
  it('un créneau d’un autre jour ne compte pas (0 = dimanche)', () => {
    expect(isWithinSchedule([{ day: 0, start: '00:00', end: '23:59' }])).toBe(false);
    expect(isWithinSchedule([{ day: 2, start: '00:00', end: '23:59' }])).toBe(false);
  });
});

describe('getEtablissementById', () => {
  it('rend la ligne ou null', async () => {
    const id = await creerEtablissement({ name: 'Collège A' });
    expect(getEtablissementById(id)?.name).toBe('Collège A');
    expect(getEtablissementById(id + 999)).toBeNull();
  });
});

describe('monthUsage et studentDayUsage', () => {
  it('monthUsage additionne le mois courant de l’école, et d’elle seule', async () => {
    const a = await creerEtablissement();
    const b = await creerEtablissement();
    await journaliser({ etablissementId: a, tokens: 100 });
    await journaliser({ etablissementId: a, tokens: 50, serverKey: false }); // compté aussi : le total ne filtre pas la clé
    await journaliser({ etablissementId: b, tokens: 999 });
    await journaliser({ etablissementId: a, tokens: 7777, ts: Date.UTC(2000, 0, 15) }); // mois ancien
    expect(monthUsage(a)).toBe(150);
    expect(monthUsage(b)).toBe(999);
  });
  it('studentDayUsage compte le jour UTC d’un navigateur, et zéro sans identifiant', async () => {
    const a = await creerEtablissement();
    await journaliser({ etablissementId: a, tokens: 30, clientId: 'eleve-1' });
    await journaliser({ etablissementId: a, tokens: 12, clientId: 'eleve-1' });
    await journaliser({ etablissementId: a, tokens: 500, clientId: 'eleve-2' });
    await journaliser({ etablissementId: a, tokens: 900, clientId: 'eleve-1', ts: Date.now() - 3 * 86_400_000 });
    expect(studentDayUsage(a, 'eleve-1')).toBe(42);
    expect(studentDayUsage(a, 'eleve-2')).toBe(500);
    expect(studentDayUsage(a, '')).toBe(0);
  });
});

describe('monthUsageByProvider et consommationDuMois', () => {
  it('le détail par fournisseur ne retient que la clé serveur, trié par volume', async () => {
    const a = await creerEtablissement();
    await journaliser({ etablissementId: a, tokens: 10, provider: 'mistral' });
    await journaliser({ etablissementId: a, tokens: 20, provider: 'mistral' });
    await journaliser({ etablissementId: a, tokens: 100, provider: 'anthropic' });
    await journaliser({ etablissementId: a, tokens: 5000, provider: 'openai', serverKey: false });
    expect(monthUsageByProvider(a)).toEqual([
      { provider: 'anthropic', requests: 1, tokens: 100 },
      { provider: 'mistral', requests: 2, tokens: 30 },
    ]);
  });

  it('sans aucune clé serveur, seules les consommations réelles figurent, marquées « non servi »', async () => {
    const a = await creerEtablissement();
    await journaliser({ etablissementId: a, tokens: 40, provider: 'mistral' });
    expect(consommationDuMois(a)).toEqual([{ provider: 'mistral', requests: 1, tokens: 40, servi: false }]);
  });

  it('avec des clés serveur : les fournisseurs servis d’abord (zéro compris), puis les autres', async () => {
    poserEnv({ SECRET_MISTRAL_API_KEY: 'cle-factice', SECRET_ANTHROPIC_API_KEY: 'cle-factice' });
    try {
      const { consommationDuMois: conso } = await import('../../../src/server/etablissements');
      const a = await creerEtablissement();
      await journaliser({ etablissementId: a, tokens: 300, provider: 'anthropic' });
      await journaliser({ etablissementId: a, tokens: 900, provider: 'grok' }); // écarté : jamais servi à une école
      expect(conso(a)).toEqual([
        { provider: 'anthropic', requests: 1, tokens: 300, servi: true },
        { provider: 'mistral', requests: 0, tokens: 0, servi: true },
        { provider: 'grok', requests: 1, tokens: 900, servi: false },
      ]);
    } finally {
      poserEnv({ SECRET_MISTRAL_API_KEY: undefined, SECRET_ANTHROPIC_API_KEY: undefined });
    }
  });
});
