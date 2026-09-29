// UC-02 — Tests fonctionnels : « Noter un tuteur ». La fiche publique envoie
// POST /api/prompts/[name]/rate { stars } ; la note est anonyme, sans compte,
// et le dédoublonnage est laissé au navigateur (src/utils/favorites.ts).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerTuteur, creerEtablissement, creerCompte } from '../../helpers/db';

// La fiche (relue pour vérifier la moyenne) importe mail.ts : aucun envoi réel.
vi.mock('../../../src/server/mail', () => ({
  notifyAdmin: vi.fn(),
  sendVerificationCode: vi.fn(async () => {}),
  sendEmailChangeCode: vi.fn(async () => {}),
  sendEmailChangeWarning: vi.fn(),
}));

import noter from '../../../src/pages/api/prompts/[name]/rate';
import fiche from '../../../src/pages/api/prompts/[name]/index';

// Chaque test a sa propre adresse IP : le limiteur « rate » est par IP.
let n = 0;
const ipNeuve = () => `203.0.113.${++n}`;

beforeEach(async () => { await viderBase(); });

const note = (name: string, stars: unknown, o: { ip?: string; token?: string } = {}) =>
  appeler(noter, { method: 'POST', query: { name }, body: { stars }, ip: o.ip ?? ipNeuve(), token: o.token });

async function compteurs(name: string) {
  return (await base()).prepare('SELECT rating_sum AS somme, rating_count AS nombre FROM prompts WHERE name = ?').get(name);
}

describe('Scénario nominal : un visiteur note un tuteur', () => {
  it('la note est comptée et la nouvelle moyenne renvoyée', async () => {
    await creerTuteur({ name: 'Socrate' });
    const r = await note('Socrate', 4);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ratingAvg: 4, ratingCount: 1 });
    expect(await compteurs('Socrate')).toEqual({ somme: 4, nombre: 1 });
  });

  it('la moyenne s’arrondit au dixième et la fiche la reflète', async () => {
    await creerTuteur({ name: 'Socrate', ratingSum: 9, ratingCount: 2 });
    const r = await note('Socrate', 5);
    expect(r.json).toEqual({ ratingAvg: 4.7, ratingCount: 3 });
    const f = await appeler(fiche, { method: 'GET', query: { name: 'Socrate' }, ip: ipNeuve() });
    expect(f.json.prompt).toMatchObject({ ratingAvg: 4.7, ratingCount: 3 });
  });

  it('aucun dédoublonnage serveur : une même IP (le NAT d’une école) peut noter plusieurs fois', async () => {
    await creerTuteur({ name: 'Socrate' });
    const ip = ipNeuve();
    await note('Socrate', 5, { ip });
    await note('Socrate', 1, { ip });
    expect(await compteurs('Socrate')).toEqual({ somme: 6, nombre: 2 });
  });

  it('la note se convertit en nombre : « 3 » (chaîne) est acceptée', async () => {
    await creerTuteur({ name: 'Socrate' });
    const r = await note('Socrate', '3');
    expect(r.status).toBe(200);
    expect(r.json.ratingAvg).toBe(3);
  });

  it('comportement actuel (voir « Anomalies ») : true et [5] passent la validation', async () => {
    // Number(true) === 1 et Number([5]) === 5 : la validation ne regarde que
    // le résultat de la conversion, pas le type reçu.
    await creerTuteur({ name: 'Socrate' });
    expect((await note('Socrate', true)).status).toBe(200);
    expect((await note('Socrate', [5])).status).toBe(200);
    expect(await compteurs('Socrate')).toEqual({ somme: 6, nombre: 2 });
  });
});

describe('Scénarios alternatifs : la portée de l’appelant', () => {
  it('un tuteur réservé se note depuis le réseau de son école', async () => {
    const a = await creerEtablissement({ ips: '198.51.100.30' });
    await creerTuteur({ name: 'Maison', etablissementId: a });
    const r = await note('Maison', 5, { ip: '198.51.100.30' });
    expect(r.status).toBe(200);
  });

  it('un enseignant identifié note un tuteur réservé de son école depuis chez lui', async () => {
    const a = await creerEtablissement();
    await creerTuteur({ name: 'Maison', etablissementId: a });
    const jeton = await creerCompte('prof@a.ch', { teacher: true, etablissementId: a });
    expect((await note('Maison', 2, { token: jeton })).status).toBe(200);
  });

  it('un tuteur partagé d’une autre école se note depuis hors école', async () => {
    const b = await creerEtablissement();
    await creerTuteur({ name: 'Partage', etablissementId: b, publie: true });
    expect((await note('Partage', 4)).status).toBe(200);
  });
});

describe('Scénarios d’erreur', () => {
  it('refuse une note hors de 1 à 5 ou non entière, sans rien compter', async () => {
    await creerTuteur({ name: 'Socrate' });
    for (const stars of [0, 6, 2.5, -1, 'abc', null, undefined]) {
      const r = await note('Socrate', stars);
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('ERR_RATING_INVALID');
    }
    expect(await compteurs('Socrate')).toEqual({ somme: 0, nombre: 0 });
  });

  it('tuteur inconnu, brouillon, dépublié, archivé ou réservé ailleurs : 404 indistinct', async () => {
    const b = await creerEtablissement();
    await creerTuteur({ name: 'Brouillon', status: 'draft' });
    await creerTuteur({ name: 'Attente', status: 'pending' });
    await creerTuteur({ name: 'Retire', status: 'retired' });
    await creerTuteur({ name: 'Archive', archived: true });
    await creerTuteur({ name: 'Reserve', etablissementId: b });
    for (const name of ['Inconnu', 'Brouillon', 'Attente', 'Retire', 'Archive', 'Reserve']) {
      const r = await note(name, 5);
      expect(r.status).toBe(404);
      expect(r.json.error.code).toBe('ERR_PROMPT_UNKNOWN');
    }
    expect(await compteurs('Reserve')).toEqual({ somme: 0, nombre: 0 });
  });

  it('au-delà de 10 notes par minute depuis une IP : 429, la note n’est pas comptée', async () => {
    await creerTuteur({ name: 'Socrate' });
    const ip = ipNeuve();
    for (let i = 0; i < 10; i++) expect((await note('Socrate', 5, { ip })).status).toBe(200);
    const r = await note('Socrate', 5, { ip });
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe('ERR_RATE_LIMIT');
    expect(await compteurs('Socrate')).toEqual({ somme: 50, nombre: 10 });
    // Une autre IP n'est pas concernée.
    expect((await note('Socrate', 5)).status).toBe(200);
  });

  it('le limiteur passe avant la validation : les requêtes invalides consomment aussi le crédit', async () => {
    await creerTuteur({ name: 'Socrate' });
    const ip = ipNeuve();
    for (let i = 0; i < 10; i++) expect((await note('Socrate', 99, { ip })).status).toBe(400);
    expect((await note('Socrate', 5, { ip })).status).toBe(429);
  });

  it('refuse les méthodes autres que POST', async () => {
    const r = await appeler(noter, { method: 'GET', query: { name: 'Socrate' }, ip: ipNeuve() });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toEqual(['POST']);
  });
});
