// UC-18 — Tests fonctionnels : la gestion des comptes par /api/admin/users.
// Le super voit et règle tout le monde (rattachement compris) ; un
// administrateur d'école ne voit et ne règle que les comptes dont son école
// est l'école PRINCIPALE, et jamais un super-administrateur. Aucune
// suppression de compte n'existe.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerCompte, creerEtablissement, creerTuteur } from '../../helpers/db';

vi.mock('../../../src/server/mail', () => ({
  notifyAdmin: vi.fn(),
  sendVerificationCode: vi.fn(async () => {}),
  sendEmailChangeCode: vi.fn(async () => {}),
  sendEmailChangeWarning: vi.fn(),
}));

import users from '../../../src/pages/api/admin/users';
import { estAdminDe, estMembre } from '../../../src/server/appartenance';

const user = async (email: string) => (await base()).prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
const liens = async (email: string) =>
  (await base()).prepare('SELECT etablissement_id AS id, is_admin AS admin FROM user_etablissements WHERE email = ? ORDER BY etablissement_id')
    .all(email) as Array<{ id: number; admin: number }>;

let a: number;
let b: number;
let sup: string;
let dir: string; // administrateur de A

beforeEach(async () => {
  await viderBase();
  a = await creerEtablissement({ name: 'Collège A' });
  b = await creerEtablissement({ name: 'Collège B' });
  sup = await creerCompte('super@educh.at');
  dir = await creerCompte('dir@a.ch', { teacher: true, etablissementId: a, schoolAdmin: true });
  await creerCompte('prof@a.ch', { teacher: true, etablissementId: a });
  await creerCompte('prof@b.ch', { teacher: true, etablissementId: b });
  await creerCompte('libre@x.ch');
});

const poster = (token: string, body: Record<string, unknown>) => appeler(users, { method: 'POST', token, body });

describe('Scénario nominal : le super rattache un enseignant et le nomme administrateur', () => {
  it('liste complète, drapeau isSuper, nombre de tuteurs, sans les colonnes de majorité', async () => {
    await creerTuteur({ name: 'Socrate', authorEmail: 'prof@a.ch' });
    const r = await appeler(users, { token: sup });
    expect(r.status).toBe(200);
    const emails = r.json.users.map((u: any) => u.email);
    expect(emails).toEqual(expect.arrayContaining(['super@educh.at', 'dir@a.ch', 'prof@a.ch', 'prof@b.ch', 'libre@x.ch']));
    const profA = r.json.users.find((u: any) => u.email === 'prof@a.ch');
    expect(profA).toMatchObject({ isTeacher: 1, etablissementId: a, etablissementName: 'Collège A', promptCount: 1, isSuper: false });
    expect(r.json.users.find((u: any) => u.email === 'super@educh.at').isSuper).toBe(true);
    expect(profA).not.toHaveProperty('adultVerifiedAt');
    // Les enseignants d'abord.
    expect(r.json.users[r.json.users.length - 1].isTeacher).toBe(0);
  });

  it('rattache, nomme administrateur, puis promeut enseignant', async () => {
    let r = await poster(sup, { email: 'Libre@X.ch', etablissementId: b });
    expect(r.status).toBe(200);
    expect((await user('libre@x.ch')).etablissement_id).toBe(b);
    expect(await liens('libre@x.ch')).toEqual([{ id: b, admin: 0 }]);
    r = await poster(sup, { email: 'libre@x.ch', isSchoolAdmin: true, isTeacher: true });
    expect(r.status).toBe(200);
    expect(estAdminDe('libre@x.ch', b)).toBe(true);
    expect(await user('libre@x.ch')).toMatchObject({ is_teacher: 1, is_school_admin: 1 });
  });
});

describe('Scénarios alternatifs (super)', () => {
  it('déplacer un administrateur de A vers B emporte le lien et le rang de A', async () => {
    const r = await poster(sup, { email: 'dir@a.ch', etablissementId: b });
    expect(r.status).toBe(200);
    expect(await liens('dir@a.ch')).toEqual([{ id: b, admin: 0 }]);
    expect(await user('dir@a.ch')).toMatchObject({ etablissement_id: b, is_school_admin: 0 });
  });
  it('déplacer ET nommer dans la même requête : le rang va à l’école d’arrivée', async () => {
    await poster(sup, { email: 'prof@a.ch', etablissementId: b, isSchoolAdmin: true });
    expect(await liens('prof@a.ch')).toEqual([{ id: b, admin: 1 }]);
  });
  it('détacher (etablissementId: null) retire l’école principale et son lien, pas les autres', async () => {
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,0,?)')
      .run('prof@a.ch', b, Date.now()); // lien d'IP vers B
    await poster(sup, { email: 'prof@a.ch', etablissementId: null });
    expect((await user('prof@a.ch')).etablissement_id).toBeNull();
    expect(await liens('prof@a.ch')).toEqual([{ id: b, admin: 0 }]);
  });
  it('retirer les deux rôles neutralise le compte sans le supprimer', async () => {
    await poster(sup, { email: 'prof@b.ch', isTeacher: false, isPromptagogue: false });
    expect(await user('prof@b.ch')).toMatchObject({ is_teacher: 0, is_promptagogue: 0 });
  });
});

describe('Scénario alternatif : l’administrateur d’école', () => {
  it('ne voit que les comptes de son école principale, avec le rang lu sur SON lien', async () => {
    // prof@a.ch administre B par ailleurs : le miroir dit 1, mais pas pour A.
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,1,?)')
      .run('prof@a.ch', b, Date.now());
    (await base()).prepare('UPDATE users SET is_school_admin = 1 WHERE email = ?').run('prof@a.ch');
    const r = await appeler(users, { token: dir });
    expect(r.status).toBe(200);
    expect(r.json.users.map((u: any) => u.email).sort()).toEqual(['dir@a.ch', 'prof@a.ch']);
    expect(r.json.users.find((u: any) => u.email === 'prof@a.ch').isSchoolAdmin).toBe(0);
    expect(r.json.users.find((u: any) => u.email === 'dir@a.ch').isSchoolAdmin).toBe(1);
  });
  it('nomme puis révoque un collègue administrateur de SON école', async () => {
    expect((await poster(dir, { email: 'prof@a.ch', isSchoolAdmin: true })).status).toBe(200);
    expect(estAdminDe('prof@a.ch', a)).toBe(true);
    expect((await poster(dir, { email: 'prof@a.ch', isSchoolAdmin: false })).status).toBe(200);
    expect(estAdminDe('prof@a.ch', a)).toBe(false);
    expect(estMembre('prof@a.ch', a)).toBe(true);
  });
  it('règle les rôles enseignant et promptagogue de ses comptes', async () => {
    await poster(dir, { email: 'prof@a.ch', isTeacher: false, isPromptagogue: false });
    expect(await user('prof@a.ch')).toMatchObject({ is_teacher: 0, is_promptagogue: 0 });
  });
});

describe('Scénarios d’erreur', () => {
  it('adresse vide : 400 ; compte inconnu : 404', async () => {
    let r = await poster(sup, { email: '  ' });
    expect([r.status, r.json.error.code]).toEqual([400, 'ERR_EMAIL_INVALID']);
    r = await poster(sup, { email: 'fantome@x.ch', isTeacher: true });
    expect([r.status, r.json.error.code]).toEqual([404, 'ERR_USER_UNKNOWN']);
  });
  it('école illisible : 400 ; école inexistante : 404 — et rien n’est écrit', async () => {
    let r = await poster(sup, { email: 'prof@a.ch', etablissementId: 'abc', isTeacher: false });
    expect([r.status, r.json.error.code]).toEqual([400, 'ERR_ETABLISSEMENT_INVALID']);
    r = await poster(sup, { email: 'prof@a.ch', etablissementId: 9999, isTeacher: false });
    expect([r.status, r.json.error.code]).toEqual([404, 'ERR_ETABLISSEMENT_UNKNOWN']);
    expect(await user('prof@a.ch')).toMatchObject({ etablissement_id: a, is_teacher: 1 });
  });
  it('nommer administrateur un compte sans école : 409 ERR_NO_ETABLISSEMENT', async () => {
    const r = await poster(sup, { email: 'libre@x.ch', isSchoolAdmin: true });
    expect([r.status, r.json.error.code]).toEqual([409, 'ERR_NO_ETABLISSEMENT']);
  });
  it('le rang d’un super ne se touche pas : 409 ERR_SUPER_IMMUTABLE', async () => {
    const r = await poster(sup, { email: 'super@educh.at', isSchoolAdmin: false });
    expect([r.status, r.json.error.code]).toEqual([409, 'ERR_SUPER_IMMUTABLE']);
  });
  it('rien à mettre à jour (champ de majorité ignoré compris) : 400 ERR_NOTHING_TO_UPDATE', async () => {
    const r = await poster(sup, { email: 'prof@a.ch', adultVerifiedBy: 'super@educh.at' });
    expect([r.status, r.json.error.code]).toEqual([400, 'ERR_NOTHING_TO_UPDATE']);
    expect((await user('prof@a.ch')).adult_verified_by ?? null).toBeNull();
  });
  it('pas de suppression : DELETE → 405 avec Allow', async () => {
    const r = await appeler(users, { method: 'DELETE', token: sup, body: { email: 'prof@a.ch' } });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toEqual(['GET', 'POST']);
    expect(await user('prof@a.ch')).toBeDefined();
  });
});

describe('Droits', () => {
  it('sans jeton, enseignant ou promptagogue : 403 ERR_FORBIDDEN', async () => {
    const prof = await creerCompte('prof2@a.ch', { teacher: true, etablissementId: a });
    for (const token of [undefined, prof, await creerCompte('p@x.ch')]) {
      const r = await appeler(users, { token });
      expect([r.status, r.json.error.code]).toEqual([403, 'ERR_FORBIDDEN']);
    }
  });
  it('l’administrateur d’école ne rattache personne : 403 ERR_SUPER_ONLY, sans écriture partielle', async () => {
    const r = await poster(dir, { email: 'prof@a.ch', etablissementId: b, isTeacher: false });
    expect([r.status, r.json.error.code]).toEqual([403, 'ERR_SUPER_ONLY']);
    expect(await user('prof@a.ch')).toMatchObject({ etablissement_id: a, is_teacher: 1 });
  });
  it('hors de sa portée : compte d’une autre école, compte rattaché par la seule IP, super → 403', async () => {
    await creerCompte('ip@a.ch', { teacher: true });
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,0,?)')
      .run('ip@a.ch', a, Date.now());
    for (const email of ['prof@b.ch', 'ip@a.ch', 'super@educh.at', 'libre@x.ch']) {
      const r = await poster(dir, { email, isSchoolAdmin: true });
      expect([r.status, r.json.error.code]).toEqual([403, 'ERR_FORBIDDEN']);
    }
    expect(estAdminDe('ip@a.ch', a)).toBe(false);
  });
  it('l’école active annoncée compte : administrateur de A, simple membre de B, B active → 403', async () => {
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,0,?)')
      .run('dir@a.ch', b, Date.now());
    const r = await appeler(users, { token: dir, headers: { 'x-educhat-ecole': String(b) } });
    expect(r.status).toBe(403);
  });
});
