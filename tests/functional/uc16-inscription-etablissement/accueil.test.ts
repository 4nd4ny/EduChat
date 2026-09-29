// UC-16 — Tests fonctionnels : « accueillir ses élèves » — l'accueil public
// d'une école (GET /api/etablissement/accueil, sans jeton, résolu par l'IP),
// sa variante « bref » (ligne de profils de l'accueil du site), et GET /api/ip.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerEtablissement, creerCompte, creerTuteur } from '../../helpers/db';
import { poserEnv } from '../../helpers/env';
import accueil from '../../../src/pages/api/etablissement/accueil';
import ip from '../../../src/pages/api/ip';

let n = 0;
const ipMaison = () => `203.0.113.${++n}`;
let m = 0;
async function ecole(o: { name?: string; atelier?: boolean; catalogueOuvert?: boolean } = {}) {
  const adresse = `198.51.100.${++m}`;
  const id = await creerEtablissement({ name: o.name ?? `École ${m}`, ips: adresse, atelier: o.atelier, catalogueOuvert: o.catalogueOuvert });
  return { id, ip: adresse };
}

beforeEach(async () => { await viderBase(); });

describe('Scénario nominal : un élève ouvre la page de son école depuis la classe', () => {
  it('voit le nom de l’école et SES tuteurs visibles — ni ceux de la plateforme, ni ceux des autres', async () => {
    const a = await ecole({ name: 'Collège A' });
    const b = await ecole({ name: 'Collège B' });
    await creerTuteur({ name: 'Maison publique', etablissementId: a.id, publie: true, usage: 5 });
    await creerTuteur({ name: 'Maison réservée', etablissementId: a.id, publie: false, usage: 1 });
    await creerTuteur({ name: 'Maison archivée', etablissementId: a.id, archived: true });
    await creerTuteur({ name: 'Maison brouillon', etablissementId: a.id, status: 'draft' });
    await creerTuteur({ name: 'Plateforme' });
    await creerTuteur({ name: 'Chez B', etablissementId: b.id, publie: true });

    const r = await appeler(accueil, { method: 'GET', ip: a.ip, query: { locale: 'fr' } });
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.json.ecole).toEqual({ name: 'Collège A' });
    expect(r.json.tuteurs.map((t: any) => t.name).sort()).toEqual(['Maison publique', 'Maison réservée']);
    // Aucun réglage ni chiffre de gestion ne sort d'ici.
    expect(Object.keys(r.json).sort()).toEqual(['ecole', 'tuteurs']);
    expect(r.json.tuteurs[0]).not.toHaveProperty('shareToken');
  });
});

describe('Scénarios alternatifs', () => {
  it('A1 — hors de tout réseau scolaire : ecole null (la page bascule sur l’inscription)', async () => {
    await ecole();
    const r = await appeler(accueil, { method: 'GET', ip: ipMaison() });
    expect(r.json).toEqual({ ecole: null, atelierPromptagogue: false, tuteurs: [] });
  });

  it('A2 — un enseignant chez lui, avec son jeton, retrouve la page de SON école', async () => {
    const a = await ecole({ name: 'Collège A' });
    await creerTuteur({ name: 'Réservé A', etablissementId: a.id, publie: false });
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: a.id });
    const r = await appeler(accueil, { method: 'GET', ip: ipMaison(), token: jeton });
    expect(r.json.ecole).toEqual({ name: 'Collège A' });
    expect(r.json.tuteurs.map((t: any) => t.name)).toEqual(['Réservé A']);
  });

  it('A2 — un élève simplement rattaché, chez lui : pas d’école (le lien ne suffit pas)', async () => {
    const a = await ecole();
    const jeton = await creerCompte('eleve@ecole.ch', { teacher: true });
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,0,?)')
      .run('eleve@ecole.ch', a.id, Date.now());
    expect((await appeler(accueil, { method: 'GET', ip: ipMaison(), token: jeton })).json.ecole).toBeNull();
  });

  it('A3 — « bref » : l’école et l’atelier du RÉSEAU, jamais de liste', async () => {
    const a = await ecole({ name: 'Collège A', atelier: true });
    await creerTuteur({ name: 'Maison', etablissementId: a.id, publie: true });
    const r = await appeler(accueil, { method: 'GET', ip: a.ip, query: { bref: '1' } });
    expect(r.json).toEqual({ ecole: { name: 'Collège A' }, atelierPromptagogue: true, tuteurs: [] });
    const b = await ecole();
    expect((await appeler(accueil, { method: 'GET', ip: b.ip, query: { bref: '1' } })).json.atelierPromptagogue).toBe(false);
  });

  it('A3 — « bref » ignore l’appartenance : l’enseignant chez lui n’y a pas d’école', async () => {
    const a = await ecole({ atelier: true });
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: a.id });
    const r = await appeler(accueil, { method: 'GET', ip: ipMaison(), token: jeton, query: { bref: '1' } });
    expect(r.json).toEqual({ ecole: null, atelierPromptagogue: false, tuteurs: [] });
  });
});

describe('Erreurs', () => {
  it('méthode autre que GET : 405', async () => {
    const r = await appeler(accueil, { method: 'POST', ip: ipMaison() });
    expect(r.status).toBe(405);
    expect(r.json.error.code).toBe('ERR_METHOD_NOT_ALLOWED');
  });
});

describe('GET /api/ip', () => {
  it('rend l’adresse constatée et si elle est revendiquée par une école', async () => {
    const a = await ecole();
    expect((await appeler(ip, { method: 'GET', ip: a.ip })).json).toEqual({ ip: a.ip, isIpAllowed: false, revendiquee: true });
    const libre = ipMaison();
    expect((await appeler(ip, { method: 'GET', ip: libre })).json).toEqual({ ip: libre, isIpAllowed: false, revendiquee: false });
  });

  it('n’honore jamais X-Forwarded-For ; un X-Real-IP invalide retombe sur le socket', async () => {
    const r = await appeler(ip, { method: 'GET', headers: { 'x-forwarded-for': '198.51.100.1', 'x-real-ip': 'faux' } });
    expect(r.json.ip).toBe('10.99.99.99');
  });

  describe('avec SECRET_ALLOWED_IPS', () => {
    afterAll(() => { poserEnv({ SECRET_ALLOWED_IPS: undefined }); });
    it('isIpAllowed vaut vrai pour une adresse d’amorçage', async () => {
      poserEnv({ SECRET_ALLOWED_IPS: '192.0.2.40' });
      const route = (await import('../../../src/pages/api/ip')).default;
      expect((await appeler(route, { method: 'GET', ip: '192.0.2.40' })).json)
        .toEqual({ ip: '192.0.2.40', isIpAllowed: true, revendiquee: false });
    });
  });
});
