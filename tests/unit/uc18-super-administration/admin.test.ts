// UC-18 — Tests unitaires : les niveaux d'administration (src/server/admin.ts).
// Super-administrateur (SECRET_ADMIN_EMAILS = super@educh.at en test) contre
// administrateur d'école (rang porté par le lien, sur l'école active).
import { describe, it, expect, beforeEach } from 'vitest';
import { viderBase, creerEtablissement, creerCompte, base } from '../../helpers/db';
import { isAdminEmail } from '../../../src/server/token';
import {
  requireAdmin, requireSuperAdmin, requireGestionTuteurs, porteeEcoleActive,
  tuteurDeLEcole, dansLaPortee, monthStartUtc,
} from '../../../src/server/admin';

beforeEach(async () => { await viderBase(); });

/** Requête minimale : jeton et école annoncée. */
function requete(token?: string, ecole?: number): any {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (ecole !== undefined) headers['x-educhat-ecole'] = String(ecole);
  return { headers, body: undefined };
}

async function lien(email: string, etablissementId: number, isAdmin: boolean) {
  (await base()).prepare('INSERT OR REPLACE INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,?,?)')
    .run(email, etablissementId, isAdmin ? 1 : 0, Date.now());
}

describe('isAdminEmail', () => {
  it('ne reconnaît que les adresses de SECRET_ADMIN_EMAILS, sans égard à la casse', () => {
    expect(isAdminEmail('super@educh.at')).toBe(true);
    expect(isAdminEmail('SUPER@Educh.AT')).toBe(true);
    expect(isAdminEmail('dir@ecole.ch')).toBe(false);
  });
});

describe('requireAdmin', () => {
  it('sans jeton, ou jeton falsifié : null', async () => {
    expect(requireAdmin(requete())).toBeNull();
    expect(requireAdmin(requete('faux.jeton'))).toBeNull();
  });
  it('le super d’abord, même rattaché à une école où il n’est pas admin', async () => {
    const a = await creerEtablissement();
    const t = await creerCompte('super@educh.at', { etablissementId: a });
    const scope = requireAdmin(requete(t, a));
    expect(scope?.niveau).toBe('super');
  });
  it('le super n’a pas besoin d’exister en base', async () => {
    const { issueToken } = await import('../../../src/server/token');
    expect(requireAdmin(requete(issueToken('super', 'super@educh.at')))?.niveau).toBe('super');
  });
  it('administrateur d’école : portée « ecole » sur l’école active', async () => {
    const a = await creerEtablissement();
    const t = await creerCompte('dir@a.ch', { etablissementId: a, schoolAdmin: true });
    expect(requireAdmin(requete(t))).toMatchObject({ niveau: 'ecole', etablissementId: a });
  });
  it('rang lu sur l’école ACTIVE : admin de A, membre de B, B active → null', async () => {
    const a = await creerEtablissement(); const b = await creerEtablissement();
    const t = await creerCompte('dir@a.ch', { etablissementId: a, schoolAdmin: true });
    await lien('dir@a.ch', b, false);
    expect(requireAdmin(requete(t, b))).toBeNull();
    expect(requireAdmin(requete(t, a))).toMatchObject({ niveau: 'ecole', etablissementId: a });
  });
  it('une école annoncée non liée ne donne jamais sa portée', async () => {
    const a = await creerEtablissement(); const b = await creerEtablissement();
    const t = await creerCompte('dir@a.ch', { etablissementId: a, schoolAdmin: true });
    expect(requireAdmin(requete(t, b))).toMatchObject({ niveau: 'ecole', etablissementId: a });
  });
  it('le miroir users.is_school_admin seul ne suffit pas', async () => {
    const a = await creerEtablissement();
    const t = await creerCompte('faux@a.ch', { etablissementId: a });
    (await base()).prepare('UPDATE users SET is_school_admin = 1 WHERE email = ?').run('faux@a.ch');
    expect(requireAdmin(requete(t))).toBeNull();
  });
  it('enseignant ou compte sans école : null', async () => {
    const a = await creerEtablissement();
    expect(requireAdmin(requete(await creerCompte('prof@a.ch', { teacher: true, etablissementId: a })))).toBeNull();
    expect(requireAdmin(requete(await creerCompte('seul@x.ch')))).toBeNull();
  });
});

describe('requireSuperAdmin', () => {
  it('rend la portée du super, null pour un administrateur d’école', async () => {
    const a = await creerEtablissement();
    const dir = await creerCompte('dir@a.ch', { etablissementId: a, schoolAdmin: true });
    const sup = await creerCompte('super@educh.at');
    expect(requireSuperAdmin(requete(sup))?.niveau).toBe('super');
    expect(requireSuperAdmin(requete(dir))).toBeNull();
  });
});

describe('requireGestionTuteurs et porteeEcoleActive', () => {
  it('trois portées : super, ecole, enseignant ; rien pour le simple membre', async () => {
    const a = await creerEtablissement();
    const sup = await creerCompte('super@educh.at');
    const dir = await creerCompte('dir@a.ch', { etablissementId: a, schoolAdmin: true });
    const prof = await creerCompte('prof@a.ch', { teacher: true, etablissementId: a });
    const membre = await creerCompte('eleve@a.ch', { teacher: true });
    await lien('eleve@a.ch', a, false);
    expect(requireGestionTuteurs(requete(sup))?.niveau).toBe('super');
    expect(requireGestionTuteurs(requete(dir))).toMatchObject({ niveau: 'ecole', etablissementId: a });
    expect(requireGestionTuteurs(requete(prof))).toMatchObject({ niveau: 'enseignant', etablissementId: a });
    expect(requireGestionTuteurs(requete(membre))).toBeNull();
  });
  it('porteeEcoleActive ramène le super à l’école active, ou à rien', async () => {
    const a = await creerEtablissement();
    const supLie = await creerCompte('super@educh.at', { etablissementId: a });
    const portee = requireGestionTuteurs(requete(supLie))!;
    expect(porteeEcoleActive(requete(supLie), portee)).toMatchObject({ niveau: 'ecole', etablissementId: a });
    (await base()).prepare('DELETE FROM user_etablissements').run();
    expect(porteeEcoleActive(requete(supLie), portee)).toBeNull();
  });
  it('porteeEcoleActive laisse inchangées les portées déjà bornées', async () => {
    const a = await creerEtablissement();
    const dir = await creerCompte('dir@a.ch', { etablissementId: a, schoolAdmin: true });
    const p = requireGestionTuteurs(requete(dir))!;
    expect(porteeEcoleActive(requete(dir), p)).toBe(p);
  });
});

describe('tuteurDeLEcole', () => {
  const auth = { name: 'x', email: 'x@a.ch', iat: 0, exp: 0 } as any;
  it('le super répond de tout ; une école de ses seuls tuteurs, jamais de la plateforme (NULL)', () => {
    expect(tuteurDeLEcole({ niveau: 'super', auth }, null)).toBe(true);
    expect(tuteurDeLEcole({ niveau: 'ecole', auth, etablissementId: 3 }, 3)).toBe(true);
    expect(tuteurDeLEcole({ niveau: 'ecole', auth, etablissementId: 3 }, 4)).toBe(false);
    expect(tuteurDeLEcole({ niveau: 'enseignant', auth, etablissementId: 3 }, null)).toBe(false);
  });
});

describe('dansLaPortee', () => {
  const auth = { name: 'x', email: 'x@a.ch', iat: 0, exp: 0 } as any;
  it('le super répond de tous les comptes, super-administrateurs compris', async () => {
    expect(dansLaPortee({ niveau: 'super', auth }, 'quiconque@x.ch')).toBe(true);
    expect(dansLaPortee({ niveau: 'super', auth }, 'super@educh.at')).toBe(true);
  });
  it('une école : les seuls comptes dont elle est l’école PRINCIPALE, jamais un super', async () => {
    const a = await creerEtablissement(); const b = await creerEtablissement();
    await creerCompte('prof@a.ch', { etablissementId: a });
    await creerCompte('prof@b.ch', { etablissementId: b });
    await creerCompte('ip@a.ch');
    await lien('ip@a.ch', a, false); // rattaché par l'IP seulement
    await creerCompte('super@educh.at', { etablissementId: a });
    const ecole = { niveau: 'ecole' as const, auth, etablissementId: a };
    expect(dansLaPortee(ecole, 'prof@a.ch')).toBe(true);
    expect(dansLaPortee(ecole, 'prof@b.ch')).toBe(false);
    expect(dansLaPortee(ecole, 'ip@a.ch')).toBe(false);
    expect(dansLaPortee(ecole, 'super@educh.at')).toBe(false);
  });
});

describe('monthStartUtc', () => {
  it('rend le 1er du mois à 00:00 UTC', () => {
    expect(monthStartUtc(2026, 2)).toBe(Date.UTC(2026, 1, 1));
    const now = new Date();
    expect(monthStartUtc()).toBe(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });
});
