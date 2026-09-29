// UC-10 — Tests unitaires : les gardes de modération des tuteurs
// (src/server/admin.ts) — requireAdmin, requireSuperAdmin,
// requireGestionTuteurs, porteeEcoleActive, tuteurDeLEcole — et les tests
// d'appartenance sur lesquels elles reposent (src/server/appartenance.ts).
import { describe, it, expect, beforeEach } from 'vitest';
import { viderBase, base, creerCompte, creerEtablissement } from '../../helpers/db';
import {
  requireAdmin, requireSuperAdmin, requireGestionTuteurs, porteeEcoleActive, tuteurDeLEcole, PORTEE_ECOLE,
} from '../../../src/server/admin';
import { estAdminDe, estEnseignantDe, estMembre } from '../../../src/server/appartenance';

beforeEach(async () => { await viderBase(); });

function requete(token?: string, ecole?: number): any {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (ecole !== undefined) headers['x-educhat-ecole'] = String(ecole);
  return { headers, body: {} };
}

async function lier(email: string, etab: number, admin = false) {
  (await base()).prepare('INSERT OR REPLACE INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,?,?)')
    .run(email, etab, admin ? 1 : 0, Date.now());
}

describe('estMembre / estAdminDe / estEnseignantDe', () => {
  it('distinguent le lien, le rang d’administrateur et le titre d’enseignant', async () => {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    await creerCompte('prof@a.ch', { teacher: true, etablissementId: a });
    await creerCompte('admin@a.ch', { schoolAdmin: true, etablissementId: a });
    await creerCompte('eleve@a.ch', { teacher: true });
    await lier('eleve@a.ch', a);

    expect(estMembre('prof@a.ch', a)).toBe(true);
    expect(estMembre('prof@a.ch', b)).toBe(false);
    expect(estAdminDe('admin@a.ch', a)).toBe(true);
    expect(estAdminDe('prof@a.ch', a)).toBe(false);
    expect(estEnseignantDe('Prof@A.ch', a)).toBe(true);
    // Le lien ramassé par IP + la case « enseignant » ne font pas un enseignant de l'école.
    expect(estEnseignantDe('eleve@a.ch', a)).toBe(false);
    expect(estEnseignantDe('admin@a.ch', a)).toBe(false); // admin non enseignant
  });
});

describe('requireAdmin / requireSuperAdmin', () => {
  it('null sans jeton ou pour un compte sans rang', async () => {
    const jeton = await creerCompte('simple@x.ch');
    expect(requireAdmin(requete())).toBeNull();
    expect(requireAdmin(requete(jeton))).toBeNull();
  });
  it('le super-administrateur vient de SECRET_ADMIN_EMAILS, même rattaché à une école', async () => {
    const a = await creerEtablissement();
    const jeton = await creerCompte('super@educh.at', { etablissementId: a });
    expect(requireAdmin(requete(jeton))?.niveau).toBe('super');
    expect(requireSuperAdmin(requete(jeton))?.niveau).toBe('super');
  });
  it('l’administrateur d’école n’administre que son école active', async () => {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    const jeton = await creerCompte('admin@a.ch', { schoolAdmin: true, etablissementId: a });
    await lier('admin@a.ch', b, false); // simple membre de B
    expect(requireAdmin(requete(jeton))).toMatchObject({ niveau: 'ecole', etablissementId: a });
    expect(requireAdmin(requete(jeton, b))).toBeNull();
    expect(requireSuperAdmin(requete(jeton))).toBeNull();
  });
  it('un choix d’école dont le compte n’est pas membre est ignoré', async () => {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    const jeton = await creerCompte('admin@a.ch', { schoolAdmin: true, etablissementId: a });
    expect(requireAdmin(requete(jeton, b))).toMatchObject({ niveau: 'ecole', etablissementId: a });
  });
});

describe('requireGestionTuteurs', () => {
  it('rend la portée d’administration telle quelle', async () => {
    const a = await creerEtablissement();
    const sup = await creerCompte('super@educh.at');
    const adm = await creerCompte('admin@a.ch', { schoolAdmin: true, etablissementId: a });
    expect(requireGestionTuteurs(requete(sup))?.niveau).toBe('super');
    expect(requireGestionTuteurs(requete(adm))).toMatchObject({ niveau: 'ecole', etablissementId: a });
  });
  it('ajoute l’enseignant de l’école principale, pas le simple membre ni le compte sans école', async () => {
    const a = await creerEtablissement();
    const prof = await creerCompte('prof@a.ch', { teacher: true, etablissementId: a });
    const eleve = await creerCompte('eleve@a.ch', { teacher: true });
    await lier('eleve@a.ch', a);
    const seul = await creerCompte('seul@x.ch', { teacher: true });
    expect(requireGestionTuteurs(requete(prof))).toMatchObject({ niveau: 'enseignant', etablissementId: a });
    expect(requireGestionTuteurs(requete(eleve))).toBeNull();
    expect(requireGestionTuteurs(requete(seul))).toBeNull();
    expect(requireGestionTuteurs(requete())).toBeNull();
  });
});

describe('porteeEcoleActive (drapeau ?portee=ecole)', () => {
  it('vaut « ecole »', () => { expect(PORTEE_ECOLE).toBe('ecole'); });
  it('ne touche pas les portées déjà bornées', async () => {
    const a = await creerEtablissement();
    const jeton = await creerCompte('prof@a.ch', { teacher: true, etablissementId: a });
    const portee = requireGestionTuteurs(requete(jeton))!;
    expect(porteeEcoleActive(requete(jeton), portee)).toBe(portee);
  });
  it('ramène le super à son école active, ou à rien sans école', async () => {
    const a = await creerEtablissement();
    const sansEcole = await creerCompte('super@educh.at');
    const p1 = requireGestionTuteurs(requete(sansEcole))!;
    expect(porteeEcoleActive(requete(sansEcole), p1)).toBeNull();

    await lier('super@educh.at', a, false);
    const p2 = requireGestionTuteurs(requete(sansEcole))!;
    expect(porteeEcoleActive(requete(sansEcole), p2)).toMatchObject({ niveau: 'ecole', etablissementId: a });
  });
});

describe('tuteurDeLEcole', () => {
  const auth = { name: 'x', email: 'x@x.ch', iat: 0, exp: 0 } as any;
  it('le super répond de tout, y compris du catalogue de la plateforme', () => {
    expect(tuteurDeLEcole({ niveau: 'super', auth }, null)).toBe(true);
    expect(tuteurDeLEcole({ niveau: 'super', auth }, 3)).toBe(true);
  });
  it('une école ne répond que de ses tuteurs, JAMAIS du rattachement NULL', () => {
    for (const niveau of ['ecole', 'enseignant'] as const) {
      expect(tuteurDeLEcole({ niveau, auth, etablissementId: 3 }, 3)).toBe(true);
      expect(tuteurDeLEcole({ niveau, auth, etablissementId: 3 }, 4)).toBe(false);
      expect(tuteurDeLEcole({ niveau, auth, etablissementId: 3 }, null)).toBe(false);
    }
  });
});
