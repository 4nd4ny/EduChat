// UC-22 — Tests unitaires : compteurs publics et présence anonyme
// (src/server/stats.ts). Le module garde en mémoire un cache de 5 s et la date
// de la dernière purge : chaque test le recharge (poserEnv + import dynamique)
// et pilote l'horloge (Date simulée seulement).
import crypto from 'crypto';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { poserEnv } from '../../helpers/env';

const ENV = ['SECRET_FREE_PROVIDER', 'SECRET_OPENROUTER_API_KEY', 'SECRET_FREE_DAILY_USD', 'SECRET_FREE_PRICE_PER_MTOK'];
const T0 = new Date('2026-09-29T10:00:00Z').getTime();
const MIN = 60_000;

async function charger(env: Record<string, string> = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  poserEnv(env);
  const db = await import('../../helpers/db');
  await db.viderBase();
  const stats = await import('../../../src/server/stats');
  return { ...db, ...stats, db: await db.base() };
}

afterEach(() => {
  vi.useRealTimers();
  poserEnv(Object.fromEntries(ENV.map(k => [k, undefined])));
});

const empreinte = (source: string) =>
  crypto.createHmac('sha256', process.env.SECRET_TOKEN_KEY!).update(source).digest('hex').slice(0, 16);

describe('touchPresence — présence anonyme', () => {
  it('ne stocke qu’une empreinte HMAC de 16 caractères, jamais l’identifiant ni l’IP', async () => {
    const m = await charger();
    m.touchPresence('0f3c2a1b-aaaa-bbbb', '198.51.100.7');
    const lignes = m.db.prepare('SELECT * FROM presence').all() as any[];
    expect(lignes).toEqual([{ id: empreinte('0f3c2a1b-aaaa-bbbb'), last_seen: T0 }]);
    expect(lignes[0].id).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(lignes)).not.toContain('198.51.100.7');
  });

  it('un même navigateur ne compte qu’une fois ; sa dernière activité est mise à jour', async () => {
    const m = await charger();
    m.touchPresence('abcdef12', '198.51.100.1');
    vi.setSystemTime(T0 + MIN);
    m.touchPresence('abcdef12', '198.51.100.2'); // autre IP, même navigateur
    expect(m.db.prepare('SELECT last_seen FROM presence').all()).toEqual([{ last_seen: T0 + MIN }]);
  });

  it('sans identifiant de navigateur, l’empreinte porte sur l’IP', async () => {
    const m = await charger();
    m.touchPresence('', '198.51.100.9');
    m.touchPresence('', '198.51.100.9');
    m.touchPresence('', '198.51.100.10');
    const ids = (m.db.prepare('SELECT id FROM presence ORDER BY id').all() as any[]).map(r => r.id);
    expect(ids.sort()).toEqual([empreinte('ip:198.51.100.9'), empreinte('ip:198.51.100.10')].sort());
  });
});

describe('getSiteStats — agrégats', () => {
  it('compte les comptes VÉRIFIÉS, les tuteurs publiés non archivés et les jetons sans double compte', async () => {
    const m = await charger();
    await m.creerCompte('a@exemple.ch');
    await m.creerCompte('b@exemple.ch');
    m.db.prepare('INSERT INTO users (email, name, created_at) VALUES (?,?,?)').run('non.verifie@exemple.ch', 'n', T0);
    const publie = await m.creerTuteur({ name: 'Socrate' });
    await m.creerTuteur({ name: 'Archivé', archived: true });
    await m.creerTuteur({ name: 'Brouillon', status: 'draft' });
    await m.creerTuteur({ name: 'En attente', status: 'pending' });
    m.db.prepare('UPDATE prompts SET tokens_total = ? WHERE id = ?').run(1000, publie);
    const journal = m.db.prepare('INSERT INTO usage_log (ts, provider, tokens, prompt_id) VALUES (?, ?, ?, ?)');
    journal.run(T0, 'mistral', 250, null);      // chat libre : compté
    journal.run(T0, 'mistral', 999, publie);     // déjà dans tokens_total du tuteur : pas recompté

    const s = m.getSiteStats();
    expect(s).toEqual({ accounts: 2, prompts: 1, tokens: 1250, online: 0, freeCreditsUsd: null, freeBudgetUsd: null });
  });

  it('« en ligne » = activité des 5 dernières minutes', async () => {
    const m = await charger();
    const ins = m.db.prepare('INSERT INTO presence (id, last_seen) VALUES (?, ?)');
    ins.run('recent', T0 - 4 * MIN);
    ins.run('ancien', T0 - 6 * MIN);
    expect(m.getSiteStats().online).toBe(1);
  });

  it('les chiffres sont gardés 5 secondes, puis recalculés', async () => {
    const m = await charger();
    expect(m.getSiteStats().accounts).toBe(0);
    await m.creerCompte('a@exemple.ch');
    vi.setSystemTime(T0 + 4_000);
    expect(m.getSiteStats().accounts).toBe(0);
    vi.setSystemTime(T0 + 5_001);
    expect(m.getSiteStats().accounts).toBe(1);
  });
});

describe('purge des présences (minimisation)', () => {
  it('au-delà de 15 minutes, l’empreinte est effacée à la lecture des compteurs', async () => {
    const m = await charger();
    const ins = m.db.prepare('INSERT INTO presence (id, last_seen) VALUES (?, ?)');
    ins.run('perime', T0 - 16 * MIN);
    ins.run('garde', T0 - 10 * MIN);
    m.getSiteStats();
    expect(m.db.prepare('SELECT id FROM presence').all()).toEqual([{ id: 'garde' }]);
  });

  it('la purge tourne au plus une fois par minute, depuis l’activité comme depuis la lecture', async () => {
    const m = await charger();
    m.touchPresence('abcdef12', '198.51.100.1'); // première purge
    m.db.prepare('INSERT INTO presence (id, last_seen) VALUES (?, ?)').run('perime', T0 - 20 * MIN);
    vi.setSystemTime(T0 + 30_000);
    m.touchPresence('abcdef12', '198.51.100.1');
    expect(m.db.prepare("SELECT COUNT(*) AS n FROM presence WHERE id='perime'").get()).toEqual({ n: 1 });
    vi.setSystemTime(T0 + 61_000);
    m.touchPresence('abcdef12', '198.51.100.1');
    expect(m.db.prepare("SELECT COUNT(*) AS n FROM presence WHERE id='perime'").get()).toEqual({ n: 0 });
  });
});

describe('crédits gratuits du jour', () => {
  const REPLI = { SECRET_FREE_PROVIDER: 'openrouter', SECRET_OPENROUTER_API_KEY: 'k' };

  it('sans repli gratuit servi : null (on n’annonce pas un budget qui ne répond pas)', async () => {
    const m = await charger({ SECRET_FREE_PROVIDER: 'openrouter' }); // pas de clé
    expect(m.getSiteStats()).toMatchObject({ freeCreditsUsd: null, freeBudgetUsd: null });
  });

  it('budget par défaut 1 USD, intact sans consommation', async () => {
    const m = await charger(REPLI);
    expect(m.getSiteStats()).toMatchObject({ freeCreditsUsd: 1, freeBudgetUsd: 1 });
  });

  it('seul le filet PAYANT du jour, journalisé sans IP, entame le budget', async () => {
    const m = await charger({ ...REPLI, SECRET_FREE_DAILY_USD: '2', SECRET_FREE_PRICE_PER_MTOK: '1' });
    const j = m.db.prepare('INSERT INTO usage_log (ts, ip, provider, model, tokens, used_server_key) VALUES (?, ?, ?, ?, ?, ?)');
    j.run(T0, '', 'openrouter', 'google/gemma:free', 5_000_000, 1);        // gratuit : 0
    j.run(T0, '', 'openrouter', 'mistralai/mistral-small', 500_000, 1);    // 0,50 USD
    j.run(T0 - 86_400_000, '', 'openrouter', 'payant-hier', 900_000, 1);   // hier : ignoré
    j.run(T0, '192.0.2.1', 'mistral', 'clé-école', 900_000, 1);             // clé interne d'école : ignorée
    j.run(T0, '', 'mistral', 'clé-perso', 900_000, 0);                      // clé personnelle : ignorée
    expect(m.getSiteStats()).toMatchObject({ freeCreditsUsd: 1.5, freeBudgetUsd: 2 });
  });

  it('le reste ne descend jamais sous zéro', async () => {
    const m = await charger({ ...REPLI, SECRET_FREE_PRICE_PER_MTOK: '10' });
    m.db.prepare('INSERT INTO usage_log (ts, ip, provider, model, tokens, used_server_key) VALUES (?, \'\', ?, ?, ?, 1)')
      .run(T0, 'openrouter', 'payant', 1_000_000);
    expect(m.getSiteStats().freeCreditsUsd).toBe(0);
  });
});
