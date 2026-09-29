// UC-14 — Tests unitaires : limitation de débit par IP et par périmètre
// (src/server/access.ts, isRateLimited — fichier DATA_DIR/rate_limit.json).
import fs from 'fs';
import path from 'path';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { isRateLimited } from '../../../src/server/access';

const FICHIER = () => path.join(process.env.DATA_DIR!, 'rate_limit.json');

afterEach(() => { vi.useRealTimers(); });

describe('isRateLimited', () => {
  it('laisse passer jusqu’au plafond, refuse au-delà', async () => {
    for (let i = 0; i < 3; i++) expect(await isRateLimited('203.0.113.1', 3, 'essai')).toBe(false);
    expect(await isRateLimited('203.0.113.1', 3, 'essai')).toBe(true);
  });

  it('compte séparément chaque IP et chaque périmètre', async () => {
    for (let i = 0; i < 2; i++) await isRateLimited('203.0.113.2', 2, 'a');
    expect(await isRateLimited('203.0.113.2', 2, 'a')).toBe(true);
    expect(await isRateLimited('203.0.113.3', 2, 'a')).toBe(false);
    expect(await isRateLimited('203.0.113.2', 2, 'b')).toBe(false);
  });

  it('rouvre la fenêtre après une minute et purge les entrées expirées', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T08:00:00Z'));
    await isRateLimited('203.0.113.4', 1, 'c');
    expect(await isRateLimited('203.0.113.4', 1, 'c')).toBe(true);
    vi.setSystemTime(new Date('2026-09-28T08:01:01Z'));
    expect(await isRateLimited('203.0.113.4', 1, 'c')).toBe(false);
    const data = JSON.parse(fs.readFileSync(FICHIER(), 'utf8'));
    expect(data['c|203.0.113.4'].count).toBe(1);
  });

  it('un fichier corrompu est réinitialisé sans bloquer', async () => {
    fs.writeFileSync(FICHIER(), '{corrompu');
    expect(await isRateLimited('203.0.113.5', 1, 'd')).toBe(false);
    expect(JSON.parse(fs.readFileSync(FICHIER(), 'utf8'))['d|203.0.113.5'].count).toBe(1);
  });
});
