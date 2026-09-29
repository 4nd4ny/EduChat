// UC-15 — Tests unitaires : l'école pour laquelle un compte peut poser une
// séance (src/server/appartenance.ts : choixEcole, ecoleActivePourCompte,
// ecoleEnseignante, estEnseignantDe).
import { describe, it, expect, beforeEach } from 'vitest';
import { viderBase, base, creerEtablissement, creerCompte } from '../../helpers/db';
import {
  choixEcole, ecoleActivePourCompte, ecoleEnseignante, estEnseignantDe,
} from '../../../src/server/appartenance';

const req = (jeton?: string, headers: Record<string, string> = {}, body?: unknown) =>
  ({ headers: { ...(jeton ? { authorization: `Bearer ${jeton}` } : {}), ...headers }, body }) as any;

beforeEach(async () => { await viderBase(); });

describe('choixEcole', () => {
  it('lit l’en-tête x-educhat-ecole, puis le champ ecoleActiveId du corps', () => {
    expect(choixEcole(req(undefined, { 'x-educhat-ecole': '7' }))).toBe(7);
    expect(choixEcole(req(undefined, {}, { ecoleActiveId: 9 }))).toBe(9);
    expect(choixEcole(req(undefined, { 'x-educhat-ecole': '7' }, { ecoleActiveId: 9 }))).toBe(7);
  });
  it('ignore une valeur non entière ou non positive', () => {
    for (const v of ['abc', '0', '-3', '1.5']) expect(choixEcole(req(undefined, { 'x-educhat-ecole': v }))).toBeNull();
    expect(choixEcole(req())).toBeNull();
  });
});

describe('ecoleActivePourCompte', () => {
  it('le choix annoncé n’est retenu que si le lien existe', async () => {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: a });
    expect(ecoleActivePourCompte('prof@ecole.ch', b)).toBe(a); // non membre de B → principale
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,0,?)')
      .run('prof@ecole.ch', b, Date.now());
    expect(ecoleActivePourCompte('prof@ecole.ch', b)).toBe(b);
  });
  it('sans principale, retombe sur le plus ancien lien ; sans lien, null', async () => {
    const a = await creerEtablissement();
    await creerCompte('eleve@ecole.ch');
    expect(ecoleActivePourCompte('eleve@ecole.ch', null)).toBeNull();
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,0,?)')
      .run('eleve@ecole.ch', a, Date.now());
    expect(ecoleActivePourCompte('eleve@ecole.ch', null)).toBe(a);
  });
});

describe('estEnseignantDe / ecoleEnseignante', () => {
  it('enseignant = is_teacher ET école principale', async () => {
    const a = await creerEtablissement();
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: a });
    expect(estEnseignantDe('prof@ecole.ch', a)).toBe(true);
    expect(ecoleEnseignante(req(jeton))).toBe(a);
  });

  it('administrateur de l’école (lien is_admin) sans être enseignant : titre suffisant', async () => {
    const a = await creerEtablissement();
    const jeton = await creerCompte('dir@ecole.ch', { etablissementId: a, schoolAdmin: true });
    expect(estEnseignantDe('dir@ecole.ch', a)).toBe(false);
    expect(ecoleEnseignante(req(jeton))).toBe(a);
  });

  it('élève rattaché par IP (simple lien), même avec la case enseignant cochée : aucun titre', async () => {
    const a = await creerEtablissement();
    const jeton = await creerCompte('eleve@ecole.ch', { teacher: true });
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,0,?)')
      .run('eleve@ecole.ch', a, Date.now());
    expect(ecoleEnseignante(req(jeton))).toBeNull();
  });

  it('sans jeton ou avec un jeton invalide : null', async () => {
    expect(ecoleEnseignante(req())).toBeNull();
    expect(ecoleEnseignante(req('faux.jeton'))).toBeNull();
  });

  it('l’école choisie sans titre n’est pas remplacée par celle où l’on enseigne : null', async () => {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: a });
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,0,?)')
      .run('prof@ecole.ch', b, Date.now());
    expect(ecoleEnseignante(req(jeton, { 'x-educhat-ecole': String(b) }))).toBeNull();
    expect(ecoleEnseignante(req(jeton, { 'x-educhat-ecole': String(a) }))).toBe(a);
  });
});
