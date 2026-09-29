// UC-03 — Tests unitaires : QUI modère les commentaires d'un tuteur
// (src/server/admin.ts : requireAdmin, requireGestionTuteurs,
// porteeEcoleActive, tuteurDeLEcole). La route de modération combine ces
// gardes avec « auteur du tuteur » et « super-administrateur ».
import { describe, it, expect, beforeEach } from 'vitest';
import { viderBase, creerCompte, creerEtablissement } from '../../helpers/db';
import {
  requireAdmin, requireGestionTuteurs, porteeEcoleActive, tuteurDeLEcole, PORTEE_ECOLE,
} from '../../../src/server/admin';
import { lierCompte } from '../../../src/server/appartenance';
import type { TokenPayload } from '../../../src/server/token';

beforeEach(async () => { await viderBase(); });

function requete(token?: string, ecole?: number): any {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (ecole !== undefined) headers['x-educhat-ecole'] = String(ecole);
  return { headers, body: undefined, query: {} };
}

const auth: TokenPayload = { name: 'x', email: 'x@y.ch', exp: 0 };

describe('requireAdmin', () => {
  it('null sans jeton, ou pour un compte sans école administrée', async () => {
    expect(requireAdmin(requete())).toBeNull();
    const jeton = await creerCompte('simple@ecole.ch');
    expect(requireAdmin(requete(jeton))).toBeNull();
  });
  it('« super » pour une adresse de SECRET_ADMIN_EMAILS, même rattachée à une école', async () => {
    const id = await creerEtablissement();
    const jeton = await creerCompte('super@educh.at', { etablissementId: id });
    expect(requireAdmin(requete(jeton))?.niveau).toBe('super');
  });
  it('« ecole » pour l’administrateur de l’école active', async () => {
    const id = await creerEtablissement();
    const jeton = await creerCompte('dir@ecole.ch', { etablissementId: id, schoolAdmin: true });
    expect(requireAdmin(requete(jeton))).toMatchObject({ niveau: 'ecole', etablissementId: id });
  });
  it('un enseignant non administrateur n’est pas administrateur', async () => {
    const id = await creerEtablissement();
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: id });
    expect(requireAdmin(requete(jeton))).toBeNull();
  });
});

describe('requireGestionTuteurs', () => {
  it('garde la portée d’administration quand elle existe', async () => {
    const id = await creerEtablissement();
    const jeton = await creerCompte('dir@ecole.ch', { etablissementId: id, schoolAdmin: true });
    expect(requireGestionTuteurs(requete(jeton))).toMatchObject({ niveau: 'ecole', etablissementId: id });
  });
  it('« enseignant » pour un enseignant rattaché par une administration', async () => {
    const id = await creerEtablissement();
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: id });
    expect(requireGestionTuteurs(requete(jeton))).toMatchObject({ niveau: 'enseignant', etablissementId: id });
  });
  it('null pour un membre rattaché par l’IP, même « enseignant » déclaré', async () => {
    const id = await creerEtablissement();
    const jeton = await creerCompte('eleve@ecole.ch', { teacher: true });
    lierCompte('eleve@ecole.ch', id);
    expect(requireGestionTuteurs(requete(jeton))).toBeNull();
  });
  it('null pour un compte sans école', async () => {
    const jeton = await creerCompte('seul@ecole.ch', { teacher: true });
    expect(requireGestionTuteurs(requete(jeton))).toBeNull();
  });
});

describe('tuteurDeLEcole', () => {
  it('le super répond de tout, plateforme comprise', () => {
    expect(tuteurDeLEcole({ niveau: 'super', auth }, null)).toBe(true);
    expect(tuteurDeLEcole({ niveau: 'super', auth }, 7)).toBe(true);
  });
  it('une école ne répond que de SES tuteurs, jamais de ceux de la plateforme (NULL)', () => {
    for (const niveau of ['ecole', 'enseignant'] as const) {
      expect(tuteurDeLEcole({ niveau, auth, etablissementId: 3 }, 3)).toBe(true);
      expect(tuteurDeLEcole({ niveau, auth, etablissementId: 3 }, 4)).toBe(false);
      expect(tuteurDeLEcole({ niveau, auth, etablissementId: 3 }, null)).toBe(false);
    }
  });
});

describe('porteeEcoleActive (drapeau ?portee=ecole)', () => {
  it('vaut « ecole »', () => { expect(PORTEE_ECOLE).toBe('ecole'); });
  it('ne change pas une portée d’école ou d’enseignant', () => {
    const p = { niveau: 'enseignant' as const, auth, etablissementId: 2 };
    expect(porteeEcoleActive(requete(), p)).toBe(p);
  });
  it('ramène le super à l’administration de son école active', async () => {
    const id = await creerEtablissement();
    const jeton = await creerCompte('super@educh.at', { etablissementId: id });
    const p = requireGestionTuteurs(requete(jeton))!;
    expect(porteeEcoleActive(requete(jeton), p)).toMatchObject({ niveau: 'ecole', etablissementId: id });
  });
  it('un super sans école active n’a rien à modérer ici : null', async () => {
    const jeton = await creerCompte('super@educh.at');
    const p = requireGestionTuteurs(requete(jeton))!;
    expect(porteeEcoleActive(requete(jeton), p)).toBeNull();
  });
});
