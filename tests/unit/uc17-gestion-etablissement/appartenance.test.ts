// UC-17 — Tests unitaires : l'appartenance multi-écoles
// (src/server/appartenance.ts). C'est elle qui décide QUELLE école un compte
// administre ou consulte : l'école active annoncée par le navigateur n'est
// jamais crue sans avoir été revérifiée en base.
import { describe, it, expect, beforeEach } from 'vitest';
import { viderBase, creerEtablissement, creerCompte, base } from '../../helpers/db';
import { issueToken } from '../../../src/server/token';
import {
  ENTETE_ECOLE, ecolePrincipale, listerEcoles, estMembre, estAdminDe, estEnseignantDe,
  listerMembres, lierCompte, definirAdminEcole, delierCompte, choixEcole,
  ecoleActivePourCompte, ecoleActive, ecoleEnseignante,
} from '../../../src/server/appartenance';

beforeEach(async () => { await viderBase(); });

/** Requête minimale : seuls les en-têtes et le corps sont lus par ce module. */
function requete(o: { ecole?: string | string[]; body?: unknown; email?: string } = {}): any {
  const headers: Record<string, unknown> = {};
  if (o.ecole !== undefined) headers[ENTETE_ECOLE] = o.ecole;
  if (o.email) headers.authorization = `Bearer ${issueToken(o.email.split('@')[0], o.email)}`;
  return { headers, body: o.body };
}

/** Pose un lien d'appartenance avec un horodatage choisi. */
async function lien(email: string, etablissementId: number, isAdmin = false, createdAt = Date.now()) {
  (await base()).prepare('INSERT OR REPLACE INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,?,?)')
    .run(email, etablissementId, isAdmin ? 1 : 0, createdAt);
}

const ligneUser = async (email: string) =>
  (await base()).prepare('SELECT * FROM users WHERE email = ?').get(email) as any;

describe('choixEcole — la PROPOSITION du navigateur', () => {
  it('lit l’en-tête x-educhat-ecole', () => {
    expect(choixEcole(requete({ ecole: '7' }))).toBe(7);
  });
  it('ne lit que le premier en-tête s’il est répété', () => {
    expect(choixEcole(requete({ ecole: ['3', '9'] }))).toBe(3);
  });
  it('à défaut d’en-tête, lit ecoleActiveId dans le corps — jamais etablissementId', () => {
    expect(choixEcole(requete({ body: { ecoleActiveId: 5 } }))).toBe(5);
    expect(choixEcole(requete({ body: { etablissementId: 5 } }))).toBeNull();
  });
  it('l’en-tête l’emporte sur le corps', () => {
    expect(choixEcole(requete({ ecole: '2', body: { ecoleActiveId: 5 } }))).toBe(2);
  });
  it('rejette les valeurs non entières, nulles ou négatives, et un corps chaîne', () => {
    for (const v of ['abc', '0', '-3', '1.5', '']) expect(choixEcole(requete({ ecole: v }))).toBeNull();
    expect(choixEcole(requete({ body: 'ecoleActiveId=4' }))).toBeNull();
    expect(choixEcole(requete())).toBeNull();
  });
});

describe('ecoleActivePourCompte — l’école active REVÉRIFIÉE', () => {
  it('retient le choix annoncé s’il est lié au compte', async () => {
    const a = await creerEtablissement(); const b = await creerEtablissement();
    await creerCompte('prof@ecole.ch', { etablissementId: a });
    await lien('prof@ecole.ch', b);
    expect(ecoleActivePourCompte('prof@ecole.ch', b)).toBe(b);
  });
  it('ignore un choix non lié et retombe sur l’école principale', async () => {
    const a = await creerEtablissement(); const autre = await creerEtablissement();
    await creerCompte('prof@ecole.ch', { etablissementId: a });
    expect(ecoleActivePourCompte('prof@ecole.ch', autre)).toBe(a);
    expect(ecoleActivePourCompte('PROF@ecole.ch', null)).toBe(a);
  });
  it('sans école principale liée, retombe sur le plus ancien lien', async () => {
    const a = await creerEtablissement(); const b = await creerEtablissement();
    await creerCompte('itinerant@ecole.ch');
    await lien('itinerant@ecole.ch', b, false, 2000);
    await lien('itinerant@ecole.ch', a, false, 1000);
    expect(ecoleActivePourCompte('itinerant@ecole.ch', null)).toBe(a);
  });
  it('une école principale dont le lien a disparu n’est plus active', async () => {
    const a = await creerEtablissement();
    await creerCompte('ancien@ecole.ch', { etablissementId: a });
    (await base()).prepare('DELETE FROM user_etablissements').run();
    expect(ecoleActivePourCompte('ancien@ecole.ch', a)).toBeNull();
  });
  it('ecoleActive lit le jeton et l’en-tête ; null sans jeton', async () => {
    const a = await creerEtablissement(); const b = await creerEtablissement();
    await creerCompte('prof@ecole.ch', { etablissementId: a });
    await lien('prof@ecole.ch', b);
    expect(ecoleActive(requete({ email: 'prof@ecole.ch', ecole: String(b) }))).toBe(b);
    expect(ecoleActive(requete({ ecole: String(b) }))).toBeNull();
  });
});

describe('estMembre, estAdminDe, estEnseignantDe', () => {
  it('le rang d’administrateur se lit lien par lien', async () => {
    const a = await creerEtablissement(); const b = await creerEtablissement();
    await creerCompte('dir@ecole.ch', { etablissementId: a, schoolAdmin: true });
    await lien('dir@ecole.ch', b);
    expect(estMembre('dir@ecole.ch', b)).toBe(true);
    expect(estAdminDe('Dir@Ecole.ch', a)).toBe(true);
    expect(estAdminDe('dir@ecole.ch', b)).toBe(false);
  });
  it('enseignant = case « enseignant » ET école PRINCIPALE — le lien d’IP ne suffit pas', async () => {
    const a = await creerEtablissement(); const b = await creerEtablissement();
    await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: a });
    lierCompte('prof@ecole.ch', b); // reconnu par l'IP de b
    expect(estEnseignantDe('prof@ecole.ch', a)).toBe(true);
    expect(estEnseignantDe('prof@ecole.ch', b)).toBe(false);
    await creerCompte('eleve@ecole.ch', { teacher: true }); // case cochée, sans rattachement
    lierCompte('eleve@ecole.ch', a);
    expect(estEnseignantDe('eleve@ecole.ch', a)).toBe(false);
  });
});

describe('listerEcoles et listerMembres', () => {
  it('la principale d’abord, puis par ancienneté du lien ; les écoles effacées disparaissent', async () => {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    const c = await creerEtablissement({ name: 'C' });
    await creerCompte('prof@ecole.ch', { etablissementId: c });
    await lien('prof@ecole.ch', b, true, 1000);
    await lien('prof@ecole.ch', a, false, 2000);
    await lien('prof@ecole.ch', 9999, false, 500); // établissement inexistant
    expect(listerEcoles('prof@ecole.ch').map(e => [e.name, e.isAdmin, e.principale])).toEqual([
      ['C', false, true], ['B', true, false], ['A', false, false],
    ]);
  });
  it('listerMembres rend les comptes rattachés et leur rang', async () => {
    const a = await creerEtablissement();
    await lien('b@ecole.ch', a, true, 2);
    await lien('a@ecole.ch', a, false, 1);
    expect(listerMembres(a).map(m => [m.email, m.isAdmin])).toEqual([['a@ecole.ch', false], ['b@ecole.ch', true]]);
  });
  it('ecolePrincipale rend users.etablissement_id ou null', async () => {
    const a = await creerEtablissement();
    await creerCompte('p@ecole.ch', { etablissementId: a });
    expect(ecolePrincipale('P@ecole.ch')).toBe(a);
    expect(ecolePrincipale('inconnu@ecole.ch')).toBeNull();
  });
});

describe('definirAdminEcole et delierCompte — le rang et son miroir', () => {
  it('donner le rang crée le lien s’il manque et allume le miroir users.is_school_admin', async () => {
    const a = await creerEtablissement();
    await creerCompte('prof@ecole.ch');
    definirAdminEcole('Prof@Ecole.ch', a, true);
    expect(estAdminDe('prof@ecole.ch', a)).toBe(true);
    expect((await ligneUser('prof@ecole.ch')).is_school_admin).toBe(1);
  });
  it('promouvoir un lien existant le garde, retirer le rang laisse le lien', async () => {
    const a = await creerEtablissement();
    await creerCompte('prof@ecole.ch', { etablissementId: a });
    definirAdminEcole('prof@ecole.ch', a, true);
    definirAdminEcole('prof@ecole.ch', a, false);
    expect(estMembre('prof@ecole.ch', a)).toBe(true);
    expect(estAdminDe('prof@ecole.ch', a)).toBe(false);
    expect((await ligneUser('prof@ecole.ch')).is_school_admin).toBe(0);
  });
  it('le miroir reste allumé tant qu’une AUTRE école est administrée', async () => {
    const a = await creerEtablissement(); const b = await creerEtablissement();
    await creerCompte('dir@ecole.ch');
    definirAdminEcole('dir@ecole.ch', a, true);
    definirAdminEcole('dir@ecole.ch', b, true);
    delierCompte('dir@ecole.ch', a);
    expect(estMembre('dir@ecole.ch', a)).toBe(false);
    expect((await ligneUser('dir@ecole.ch')).is_school_admin).toBe(1);
    delierCompte('dir@ecole.ch', b);
    expect((await ligneUser('dir@ecole.ch')).is_school_admin).toBe(0);
  });
});

describe('ecoleEnseignante — l’école du COMPTE pour enseigner', () => {
  it('rend l’école active à l’administrateur et à l’enseignant rattaché', async () => {
    const a = await creerEtablissement(); const b = await creerEtablissement();
    await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: a });
    await creerCompte('dir@ecole.ch', { etablissementId: b, schoolAdmin: true });
    expect(ecoleEnseignante(requete({ email: 'prof@ecole.ch' }))).toBe(a);
    expect(ecoleEnseignante(requete({ email: 'dir@ecole.ch' }))).toBe(b);
  });
  it('refuse le simple membre (lien d’IP), le compte sans école et la requête non signée', async () => {
    const a = await creerEtablissement();
    await creerCompte('eleve@ecole.ch', { teacher: true });
    lierCompte('eleve@ecole.ch', a);
    await creerCompte('seul@ecole.ch', { teacher: true });
    expect(ecoleEnseignante(requete({ email: 'eleve@ecole.ch' }))).toBeNull();
    expect(ecoleEnseignante(requete({ email: 'seul@ecole.ch' }))).toBeNull();
    expect(ecoleEnseignante(requete())).toBeNull();
  });
});
