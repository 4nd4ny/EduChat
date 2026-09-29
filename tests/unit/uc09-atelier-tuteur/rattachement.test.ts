// UC-09 — Tests unitaires : ce qui décide de l'école à laquelle un tuteur
// déposé est RATTACHÉ (src/server/appartenance.ts) — ecoleEnseignante,
// ecolePrincipale, choixEcole et ecoleActivePourCompte.
import { describe, it, expect, beforeEach } from 'vitest';
import { viderBase, base, creerCompte, creerEtablissement } from '../../helpers/db';
import {
  ecoleEnseignante, ecolePrincipale, choixEcole, ecoleActivePourCompte, ENTETE_ECOLE,
} from '../../../src/server/appartenance';

beforeEach(async () => { await viderBase(); });

/** Requête minimale : seuls les en-têtes et le corps sont lus par ces fonctions. */
function requete(token?: string, headers: Record<string, string> = {}, body: unknown = {}): any {
  return { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body };
}

async function lier(email: string, etab: number, admin = false) {
  (await base()).prepare('INSERT OR REPLACE INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,?,?)')
    .run(email, etab, admin ? 1 : 0, Date.now());
}

describe('choixEcole', () => {
  it('lit l’en-tête d’abord, puis le champ ecoleActiveId du corps', () => {
    expect(choixEcole(requete(undefined, { [ENTETE_ECOLE]: '7' }, { ecoleActiveId: 9 }))).toBe(7);
    expect(choixEcole(requete(undefined, {}, { ecoleActiveId: 9 }))).toBe(9);
  });
  it('ignore une valeur non entière, nulle ou négative', () => {
    for (const v of ['abc', '0', '-3', '1.5']) expect(choixEcole(requete(undefined, { [ENTETE_ECOLE]: v }))).toBeNull();
    expect(choixEcole(requete())).toBeNull();
  });
  it('n’interprète pas « etablissementId » comme un choix d’école', () => {
    expect(choixEcole(requete(undefined, {}, { etablissementId: 4 }))).toBeNull();
  });
});

describe('ecolePrincipale', () => {
  it('rend users.etablissement_id, insensible à la casse de l’adresse', async () => {
    const id = await creerEtablissement();
    await creerCompte('prof@ecole.ch', { etablissementId: id });
    expect(ecolePrincipale('Prof@Ecole.ch')).toBe(id);
    expect(ecolePrincipale('inconnu@ecole.ch')).toBeNull();
  });
});

describe('ecoleActivePourCompte', () => {
  it('honore le choix annoncé seulement si le lien existe en base', async () => {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    await creerCompte('prof@ecole.ch', { etablissementId: a });
    expect(ecoleActivePourCompte('prof@ecole.ch', b)).toBe(a); // non membre de B : repli sur la principale
    await lier('prof@ecole.ch', b);
    expect(ecoleActivePourCompte('prof@ecole.ch', b)).toBe(b);
  });
  it('sans principale, retombe sur le plus ancien lien ; sans lien, null', async () => {
    const a = await creerEtablissement({ name: 'A' });
    await creerCompte('eleve@ecole.ch');
    expect(ecoleActivePourCompte('eleve@ecole.ch', null)).toBeNull();
    await lier('eleve@ecole.ch', a);
    expect(ecoleActivePourCompte('eleve@ecole.ch', null)).toBe(a);
  });
});

describe('ecoleEnseignante (le titre exigé pour rattacher un tuteur à l’école du compte)', () => {
  it('null sans jeton', () => {
    expect(ecoleEnseignante(requete())).toBeNull();
  });
  it('rend l’école d’un enseignant dont c’est l’école principale', async () => {
    const id = await creerEtablissement();
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: id });
    expect(ecoleEnseignante(requete(jeton))).toBe(id);
  });
  it('rend l’école d’un administrateur d’école, même non enseignant', async () => {
    const id = await creerEtablissement();
    const jeton = await creerCompte('admin@ecole.ch', { schoolAdmin: true, etablissementId: id });
    expect(ecoleEnseignante(requete(jeton))).toBe(id);
  });
  it('refuse le simple membre (lien ramassé par IP), même s’il s’est déclaré enseignant', async () => {
    const id = await creerEtablissement();
    const jeton = await creerCompte('eleve@ecole.ch', { teacher: true });
    await lier('eleve@ecole.ch', id);
    expect(ecoleEnseignante(requete(jeton))).toBeNull();
  });
  it('suit l’école choisie par l’en-tête si le compte y a un titre', async () => {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: a });
    await lier('prof@ecole.ch', b, true); // administrateur de B
    expect(ecoleEnseignante(requete(jeton, { [ENTETE_ECOLE]: String(b) }))).toBe(b);
    expect(ecoleEnseignante(requete(jeton))).toBe(a);
  });
});
