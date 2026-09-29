// UC-08 — Tests fonctionnels : « Synchroniser son profil entre navigateurs »,
// côté route (GET/PUT/DELETE /api/profile) : consentement, fusion, pierres
// tombales, bornes et droits.
import { describe, it, expect, beforeEach } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerCompte } from '../../helpers/db';

import profil from '../../../src/pages/api/profile';
import { issueToken } from '../../../src/server/token';

// Le limiteur « profile » admet 10 appels par minute et par IP.
let n = 0;
const ipNeuve = () => `203.0.113.${100 + (++n % 150)}`;

beforeEach(async () => { await viderBase(); });

const conv = (nom: string, t: number) => ({ name: nom, createdAt: t, lastMessage: t, messages: [{ role: 'user', content: nom }] });
const profilDe = (conversations: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ educhatProfile: 1, exportedAt: Date.now(), conversations, favorites: [], ratings: {}, totalTokens: 0, ...extra });

const lire = (jeton: string) => appeler(profil, { token: jeton, ip: ipNeuve() });
const pousser = (jeton: string, profile: unknown) => appeler(profil, { method: 'PUT', token: jeton, body: { profile }, ip: ipNeuve() });
const effacer = (jeton: string, body?: unknown) => appeler(profil, { method: 'DELETE', token: jeton, body, ip: ipNeuve() });
const stocke = async (email: string) => {
  const row = (await base()).prepare('SELECT data FROM profiles WHERE email=?').get(email) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : undefined;
};

describe('Scénario nominal : premier envoi puis relecture', () => {
  it('stocke le profil et le rend avec sa date', async () => {
    const jeton = await creerCompte('ada@ecole.ch', { syncOptin: true });
    expect((await lire(jeton)).json).toEqual({ profile: null, deletedConversations: [] });
    const p = await pousser(jeton, profilDe({ c1: conv('Maths', 10) }, { favorites: ['Socrate'], totalTokens: 50 }));
    expect(p.status).toBe(200);
    expect(p.json).toEqual({ ok: true, updatedAt: expect.any(Number) });
    const r = await lire(jeton);
    expect(r.json.profile.conversations.c1.name).toBe('Maths');
    expect(r.json.profile.favorites).toEqual(['Socrate']);
    expect(r.json.updatedAt).toBe(p.json.updatedAt);
    expect(r.json.deletedConversations).toEqual([]);
  });
});

describe('Scénario nominal : fusion, jamais écrasement', () => {
  it('réunit les conversations des deux côtés ; la plus récente gagne', async () => {
    const jeton = await creerCompte('ada@ecole.ch', { syncOptin: true });
    await pousser(jeton, profilDe({ a: conv('A v1', 10), b: conv('B serveur', 50) }, { favorites: ['X'], ratings: { X: 1, Y: 2 } }));
    // Un navigateur qui ne connaît que « a » (plus récente) et « c ».
    await pousser(jeton, profilDe({ a: conv('A v2', 20), b: conv('B ancienne', 5), c: conv('C', 30) }, { favorites: ['Z'], ratings: { X: 5 } }));
    const s = await stocke('ada@ecole.ch');
    expect(Object.keys(s.conversations).sort()).toEqual(['a', 'b', 'c']);
    expect(s.conversations.a.name).toBe('A v2');
    expect(s.conversations.b.name).toBe('B serveur');
    expect(s.favorites.sort()).toEqual(['X', 'Z']);
    expect(s.ratings).toEqual({ X: 5, Y: 2 });
  });

  it('à égalité de date, la version reçue gagne', async () => {
    const jeton = await creerCompte('ada@ecole.ch', { syncOptin: true });
    await pousser(jeton, profilDe({ a: conv('Avant', 10) }));
    await pousser(jeton, profilDe({ a: conv('Après', 10) }));
    expect((await stocke('ada@ecole.ch')).conversations.a.name).toBe('Après');
  });

  it('le compteur de jetons est pris tel quel du dernier envoi (pas de maximum côté serveur)', async () => {
    // Voir « Anomalies constatées » : une sauvegarde automatique depuis un
    // navigateur au compteur plus bas fait baisser le compteur déclaré.
    const jeton = await creerCompte('ada@ecole.ch', { syncOptin: true });
    await pousser(jeton, profilDe({}, { totalTokens: 5000 }));
    await pousser(jeton, profilDe({}, { totalTokens: 12 }));
    expect((await stocke('ada@ecole.ch')).totalTokens).toBe(12);
  });

  it('un profil serveur illisible est remplacé par le profil reçu', async () => {
    const jeton = await creerCompte('ada@ecole.ch', { syncOptin: true });
    (await base()).prepare('INSERT INTO profiles (email, data, updated_at) VALUES (?, ?, 1)').run('ada@ecole.ch', '{corrompu');
    expect((await lire(jeton)).json).toEqual({ profile: null, deletedConversations: [] });
    await pousser(jeton, profilDe({ a: conv('A', 1) }));
    expect(Object.keys((await stocke('ada@ecole.ch')).conversations)).toEqual(['a']);
  });
});

describe('Scénario alternatif : effacement et pierres tombales', () => {
  it('une conversation effacée ne revient jamais, même renvoyée avec une date future', async () => {
    const jeton = await creerCompte('ada@ecole.ch', { syncOptin: true });
    await pousser(jeton, profilDe({ a: conv('A', 1), b: conv('B', 2) }));
    const d = await effacer(jeton, { conversations: ['a'] });
    expect(d.json).toEqual({ ok: true, deleted: 1 });
    expect(Object.keys((await stocke('ada@ecole.ch')).conversations)).toEqual(['b']);
    // Un navigateur resté hors ligne renvoie « a », horloge en avance.
    await pousser(jeton, profilDe({ a: conv('A ressuscitée', Date.now() + 1e9) }));
    expect(Object.keys((await stocke('ada@ecole.ch')).conversations)).toEqual(['b']);
    // La liste des effacées voyage avec le profil.
    expect((await lire(jeton)).json.deletedConversations).toEqual(['a']);
  });

  it('les identifiants sont bornés (64 caractères, 500 au plus) et les vides ignorés', async () => {
    const jeton = await creerCompte('ada@ecole.ch', { syncOptin: true });
    const ids = ['x'.repeat(100), '', null, ...Array.from({ length: 600 }, (_, i) => `id${i}`)];
    const d = await effacer(jeton, { conversations: ids });
    expect(d.json.deleted).toBe(500);
    const tombes = (await base()).prepare('SELECT conversation_id FROM profile_deletions WHERE email=?').all('ada@ecole.ch') as any[];
    expect(tombes).toHaveLength(500);
    expect(tombes.some(t => t.conversation_id === 'x'.repeat(64))).toBe(true);
  });

  it('une sélection sans identifiant exploitable est refusée', async () => {
    const jeton = await creerCompte('ada@ecole.ch', { syncOptin: true });
    const d = await effacer(jeton, { conversations: ['', null] });
    expect(d.status).toBe(400);
    expect(d.json.error.code).toBe('ERR_PROFILE_INVALID');
  });

  it('effacement total : pierre tombale sur chaque conversation, profil supprimé, sauvegarde coupée', async () => {
    const jeton = await creerCompte('ada@ecole.ch', { syncOptin: true });
    await pousser(jeton, profilDe({ a: conv('A', 1), b: conv('B', 2) }));
    await effacer(jeton, { conversations: ['vieille'] });
    const d = await effacer(jeton);
    expect(d.json).toEqual({ ok: true, syncDisabled: true });
    const db = await base();
    expect(await stocke('ada@ecole.ch')).toBeUndefined();
    expect((db.prepare('SELECT sync_optin FROM users WHERE email=?').get('ada@ecole.ch') as any).sync_optin).toBe(0);
    expect((await lire(jeton)).json.deletedConversations.sort()).toEqual(['a', 'b', 'vieille']);
    // La sauvegarde automatique suivante est refusée.
    const p = await pousser(jeton, profilDe({ a: conv('A', 3) }));
    expect(p.status).toBe(403);
    expect(p.json.error.code).toBe('ERR_SYNC_OPTOUT');
  });

  it('une sélection VIDE déclenche l’effacement total (anomalie)', async () => {
    // Comportement ACTUEL — voir « Anomalies constatées ». Le client
    // (deleteServerConversations) se garde d'envoyer une liste vide, mais la
    // route traite { conversations: [] } comme un DELETE sans corps.
    const jeton = await creerCompte('ada@ecole.ch', { syncOptin: true });
    await pousser(jeton, profilDe({ a: conv('A', 1) }));
    const d = await effacer(jeton, { conversations: [] });
    expect(d.json).toEqual({ ok: true, syncDisabled: true });
    expect(await stocke('ada@ecole.ch')).toBeUndefined();
  });
});

describe('Scénarios d’erreur et droits', () => {
  it('sans consentement, rien n’est stocké', async () => {
    const jeton = await creerCompte('ada@ecole.ch', { syncOptin: false });
    const r = await pousser(jeton, profilDe({ a: conv('A', 1) }));
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ERR_SYNC_OPTOUT');
    expect(await stocke('ada@ecole.ch')).toBeUndefined();
    // Un jeton sans compte en base est traité de même.
    expect((await pousser(issueToken('X', 'absent@ecole.ch'), profilDe({}))).status).toBe(403);
  });

  it('refuse un profil sans numéro de format', async () => {
    const jeton = await creerCompte('ada@ecole.ch', { syncOptin: true });
    for (const profile of [undefined, 'texte', { conversations: {} }, { educhatProfile: '1' }]) {
      const r = await pousser(jeton, profile);
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('ERR_PROFILE_INVALID');
    }
  });

  it('refuse un profil de plus d’1 Mo une fois fusionné', async () => {
    const jeton = await creerCompte('ada@ecole.ch', { syncOptin: true });
    const r = await pousser(jeton, profilDe({ gros: { ...conv('Gros', 1), messages: [{ role: 'user', content: 'x'.repeat(1024 * 1024) }] } }));
    expect(r.status).toBe(413);
    expect(r.json.error.code).toBe('ERR_PROFILE_TOO_LARGE');
  });

  it('chacun ne lit et n’efface que son profil', async () => {
    const a = await creerCompte('a@ecole.ch', { syncOptin: true });
    const b = await creerCompte('b@ecole.ch', { syncOptin: true });
    await pousser(a, profilDe({ secret: conv('Secret de A', 1) }));
    expect((await lire(b)).json.profile).toBeNull();
    await effacer(b);
    expect(Object.keys((await stocke('a@ecole.ch')).conversations)).toEqual(['secret']);
  });

  it('401 sans jeton ; 429 au-delà de 10 appels par minute et par IP ; 405', async () => {
    expect((await appeler(profil, { ip: ipNeuve() })).status).toBe(401);
    const jeton = await creerCompte('ada@ecole.ch');
    const ip = '203.0.113.99';
    for (let i = 0; i < 10; i++) expect((await appeler(profil, { token: jeton, ip })).status).toBe(200);
    const r = await appeler(profil, { token: jeton, ip });
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe('ERR_RATE_LIMIT');
    const m = await appeler(profil, { method: 'POST', token: jeton, ip: ipNeuve() });
    expect(m.status).toBe(405);
    expect(m.headers.allow).toEqual(['GET', 'PUT', 'DELETE']);
  });
});
