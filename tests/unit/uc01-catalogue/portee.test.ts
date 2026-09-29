// UC-01 — Tests unitaires : la PORTÉE de lecture du catalogue
// (src/server/prompts.ts : porteeDepuisIp, porteeDeLEcole, porteeAppelant,
// parametresPortee, estVisible) et l'école qu'un compte emporte avec lui
// (src/server/appartenance.ts : ecoleEnseignante).
import { describe, it, expect, beforeEach } from 'vitest';
import { viderBase, creerEtablissement, creerCompte } from '../../helpers/db';
import {
  porteeDepuisIp, porteeDeLEcole, porteeAppelant, parametresPortee, estVisible,
} from '../../../src/server/prompts';
import { ecoleEnseignante, lierCompte } from '../../../src/server/appartenance';
import type { PromptRow } from '../../../src/server/db';

beforeEach(async () => { await viderBase(); });

/** Requête minimale : seuls les en-têtes (jeton, école annoncée) et le corps comptent. */
function requete(token?: string, ecole?: number): any {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (ecole !== undefined) headers['x-educhat-ecole'] = String(ecole);
  return { headers, body: undefined };
}

/** Ligne de tuteur fabriquée en mémoire pour estVisible (fonction pure). */
function ligne(o: Partial<PromptRow> = {}): PromptRow {
  return {
    id: 1, name: 'Socrate', author_email: null, author_name: 'EduChat', language: 'fr',
    description: '', body: '', version: 1, status: 'published', share_token: null, web_search: 0,
    created_at: 0, updated_at: 0, usage_count: 0, tokens_total: 0, rating_sum: 0, rating_count: 0,
    size_bytes: 0, inspired_by: null, archived: 0, etablissement_id: null, publie: 0, ...o,
  };
}

describe('porteeDepuisIp', () => {
  it('hors établissement : aucune école, publics externes visibles', async () => {
    await creerEtablissement({ ips: '198.51.100.1' });
    expect(porteeDepuisIp('203.0.113.9')).toEqual({ etablissementId: null, publicsExternes: true });
  });
  it('sur le réseau d’une école au catalogue fermé (défaut) : publics externes masqués', async () => {
    const id = await creerEtablissement({ ips: '198.51.100.1' });
    expect(porteeDepuisIp('198.51.100.1')).toEqual({ etablissementId: id, publicsExternes: false });
  });
  it('sur le réseau d’une école au catalogue ouvert : publics externes visibles', async () => {
    const id = await creerEtablissement({ ips: '198.51.100.2', catalogueOuvert: true });
    expect(porteeDepuisIp('198.51.100.2')).toEqual({ etablissementId: id, publicsExternes: true });
  });
});

describe('porteeDeLEcole', () => {
  it('lit catalogue_ouvert de l’école désignée', async () => {
    const fermee = await creerEtablissement();
    const ouverte = await creerEtablissement({ catalogueOuvert: true });
    expect(porteeDeLEcole(fermee)).toEqual({ etablissementId: fermee, publicsExternes: false });
    expect(porteeDeLEcole(ouverte)).toEqual({ etablissementId: ouverte, publicsExternes: true });
  });
  it('une école inexistante garde son identifiant mais ne voit pas le dehors', () => {
    expect(porteeDeLEcole(9999)).toEqual({ etablissementId: 9999, publicsExternes: false });
  });
});

describe('ecoleEnseignante', () => {
  it('null sans jeton', () => {
    expect(ecoleEnseignante(requete())).toBeNull();
  });
  it('l’école principale d’un enseignant rattaché par une administration', async () => {
    const id = await creerEtablissement();
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: id });
    expect(ecoleEnseignante(requete(jeton))).toBe(id);
  });
  it('l’école d’un administrateur d’école, même sans is_teacher', async () => {
    const id = await creerEtablissement();
    const jeton = await creerCompte('dir@ecole.ch', { etablissementId: id, schoolAdmin: true });
    expect(ecoleEnseignante(requete(jeton))).toBe(id);
  });
  it('null pour un simple membre rattaché par l’IP, même « enseignant » déclaré', async () => {
    const id = await creerEtablissement();
    const jeton = await creerCompte('eleve@ecole.ch', { teacher: true });
    lierCompte('eleve@ecole.ch', id);
    expect(ecoleEnseignante(requete(jeton))).toBeNull();
  });
  it('une école annoncée dont on n’est pas membre est ignorée', async () => {
    const mienne = await creerEtablissement();
    const autre = await creerEtablissement();
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: mienne });
    expect(ecoleEnseignante(requete(jeton, autre))).toBe(mienne);
  });
});

describe('porteeAppelant', () => {
  it('visiteur anonyme : la portée de son IP', async () => {
    const id = await creerEtablissement({ ips: '198.51.100.3' });
    expect(porteeAppelant(requete(), '198.51.100.3')).toEqual({ etablissementId: id, publicsExternes: false });
    expect(porteeAppelant(requete(), '203.0.113.1')).toEqual({ etablissementId: null, publicsExternes: true });
  });
  it('enseignant chez lui : l’école du compte ET les publics du monde (union)', async () => {
    const id = await creerEtablissement({ ips: '198.51.100.4' });
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: id });
    expect(porteeAppelant(requete(jeton), '203.0.113.2')).toEqual({ etablissementId: id, publicsExternes: true });
  });
  it('enseignant d’une école A sur le réseau fermé d’une école B : école A, dehors masqué par B', async () => {
    const a = await creerEtablissement();
    await creerEtablissement({ ips: '198.51.100.5' });
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: a });
    expect(porteeAppelant(requete(jeton), '198.51.100.5')).toEqual({ etablissementId: a, publicsExternes: false });
  });
  it('compte sans titre d’enseignement : on retombe sur l’IP', async () => {
    const id = await creerEtablissement({ ips: '198.51.100.6' });
    const jeton = await creerCompte('simple@ecole.ch');
    expect(porteeAppelant(requete(jeton), '198.51.100.6').etablissementId).toBe(id);
  });
});

describe('parametresPortee', () => {
  it('traduit la portée en paramètres nommés de CLAUSE_VISIBLE', () => {
    expect(parametresPortee({ etablissementId: 3, publicsExternes: true })).toEqual({ etab: 3, externes: 1 });
    expect(parametresPortee({ etablissementId: null, publicsExternes: false })).toEqual({ etab: null, externes: 0 });
  });
});

describe('estVisible (même règle que CLAUSE_VISIBLE, sur une ligne lue)', () => {
  const dehors = { etablissementId: null, publicsExternes: true };
  const ecole1Fermee = { etablissementId: 1, publicsExternes: false };
  const ecole1Ouverte = { etablissementId: 1, publicsExternes: true };

  it('un tuteur de la plateforme publié est visible de tous', () => {
    for (const p of [dehors, ecole1Fermee, ecole1Ouverte]) expect(estVisible(ligne(), p)).toBe(true);
  });
  it('brouillon, en attente, dépublié ou archivé : invisible partout', () => {
    for (const status of ['draft', 'pending', 'retired'] as const) {
      expect(estVisible(ligne({ status }), dehors)).toBe(false);
    }
    expect(estVisible(ligne({ archived: 1 }), dehors)).toBe(false);
  });
  it('un tuteur réservé est visible de son école, même non partagé', () => {
    expect(estVisible(ligne({ etablissement_id: 1 }), ecole1Fermee)).toBe(true);
  });
  it('un tuteur réservé d’une autre école est invisible s’il n’est pas partagé', () => {
    expect(estVisible(ligne({ etablissement_id: 2 }), dehors)).toBe(false);
    expect(estVisible(ligne({ etablissement_id: 2 }), ecole1Ouverte)).toBe(false);
  });
  it('un tuteur partagé d’une autre école n’est visible que si le dehors l’est', () => {
    const partage = ligne({ etablissement_id: 2, publie: 1 });
    expect(estVisible(partage, dehors)).toBe(true);
    expect(estVisible(partage, ecole1Ouverte)).toBe(true);
    expect(estVisible(partage, ecole1Fermee)).toBe(false);
  });
});
