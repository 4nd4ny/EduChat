// UC-15 — Tests fonctionnels : « Déployer une séance sur la classe ».
// Vraie route /api/session-settings (PUT par l'enseignant, GET hérité par les
// élèves). La salle est ouverte en amont par setAuthLock, exactement ce que
// fait /api/auth (UC-14). Aucune clé de fournisseur n'est configurée ici :
// l'« univers » des cases est vide (voir fournisseurs-cles.test.ts).
import { describe, it, expect, beforeEach } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerEtablissement, creerCompte, creerTuteur } from '../../helpers/db';
import reglages from '../../../src/pages/api/session-settings';
import { setAuthLock, getAuthLockExpiry } from '../../../src/server/access';
import { seanceActive, seanceAutoriseFournisseur } from '../../../src/server/seance';

const PLAFOND_MS = 600 * 60_000; // SECRET_MAX_UNLOCK_MINUTES par défaut

// Adresses neuves par test : PUT est limité à 10 / min / IP.
let n = 0;
const ipMaison = () => `203.0.113.${++n}`;
let m = 0;
async function ecole(o: { name?: string; catalogueOuvert?: boolean } = {}) {
  const ip = `198.51.100.${++m}`;
  const id = await creerEtablissement({ name: o.name ?? `École ${m}`, ips: ip, catalogueOuvert: o.catalogueOuvert });
  return { id, ip, cle: `etab:${id}` };
}
const ligne = async (id: number) =>
  (await base()).prepare('SELECT * FROM session_settings WHERE etablissement_id = ?').get(id) as any;

beforeEach(async () => { await viderBase(); });

describe('Scénario nominal : l’enseignant déploie un tuteur sur sa salle ouverte', () => {
  it('sans compte, dans la salle ouverte : la séance vise l’école de l’IP et expire avec le verrou', async () => {
    const a = await ecole();
    await creerTuteur({ name: 'Socrate' });
    await setAuthLock(a.cle, 50);
    const echeance = await getAuthLockExpiry(a.cle);

    const r = await appeler(reglages, { method: 'PUT', ip: a.ip, body: { promptName: 'Socrate', webSearch: true } });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, expiresAt: echeance });
    const l = await ligne(a.id);
    expect(l.set_by_email).toBeNull();
    expect(l.web_search).toBe(1);
    expect(l.providers).toBe('');

    // Chaque élève de la salle hérite du tuteur (GET public, sans jeton).
    const g = await appeler(reglages, { method: 'GET', ip: a.ip });
    expect(g.json).toEqual({
      settings: { promptName: 'Socrate', webSearch: true, expiresAt: echeance, providers: [], providersRestricted: false },
    });
  });

  it('avec un compte enseignant depuis la salle : l’auteur de la séance est retenu', async () => {
    const a = await ecole();
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: a.id });
    await setAuthLock(a.cle, 30);
    const r = await appeler(reglages, { method: 'PUT', ip: a.ip, token: jeton, body: { promptName: '' } });
    expect(r.status).toBe(200);
    const l = await ligne(a.id);
    expect(l.set_by_email).toBe('prof@ecole.ch');
    expect(l.default_prompt_id).toBeNull();
    expect(l.web_search).toBe(0);
    // Sans tuteur imposé, les élèves voient promptName null (retour au catalogue).
    expect((await appeler(reglages, { method: 'GET', ip: a.ip })).json.settings.promptName).toBeNull();
  });
});

describe('Scénarios alternatifs', () => {
  it('A1 — préparer de chez soi : un enseignant vise SON école, échéance = plafond', async () => {
    const a = await ecole();
    await creerTuteur({ name: 'Hypatie' });
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: a.id });
    const avant = Date.now();
    const r = await appeler(reglages, { method: 'PUT', ip: ipMaison(), token: jeton, body: { promptName: 'Hypatie' } });
    expect(r.status).toBe(200);
    expect(r.json.expiresAt).toBeGreaterThanOrEqual(avant + PLAFOND_MS);
    expect(r.json.expiresAt).toBeLessThanOrEqual(Date.now() + PLAFOND_MS);
    // La maison n'a pas de salle : le GET n'y voit rien ; la salle de l'école, si.
    expect((await appeler(reglages, { method: 'GET', ip: ipMaison() })).json).toEqual({ settings: null });
    expect((await appeler(reglages, { method: 'GET', ip: a.ip })).json.settings.promptName).toBe('Hypatie');
  });

  it('A1 — de chez soi, si la salle de l’école est déjà ouverte, la séance s’aligne sur son verrou', async () => {
    const a = await ecole();
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: a.id });
    await setAuthLock(a.cle, 25);
    const r = await appeler(reglages, { method: 'PUT', ip: ipMaison(), token: jeton, body: {} });
    expect(r.json.expiresAt).toBe(await getAuthLockExpiry(a.cle));
  });

  it('A2 — administrateur d’école (sans rôle enseignant) : autorisé pour son école', async () => {
    const a = await ecole();
    const jeton = await creerCompte('dir@ecole.ch', { etablissementId: a.id, schoolAdmin: true });
    const r = await appeler(reglages, { method: 'PUT', ip: ipMaison(), token: jeton, body: {} });
    expect(r.status).toBe(200);
    expect((await ligne(a.id)).set_by_email).toBe('dir@ecole.ch');
  });

  it('A3 — enseignant itinérant : dans la salle ouverte d’une autre école, la cible reste SON école', async () => {
    const a = await ecole({ name: 'Collège A' });
    const b = await ecole({ name: 'Collège B' });
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: a.id });
    await setAuthLock(b.cle, 30);
    const r = await appeler(reglages, { method: 'PUT', ip: b.ip, token: jeton, body: {} });
    expect(r.status).toBe(200);
    expect(await ligne(a.id)).toBeTruthy();
    expect(await ligne(b.id)).toBeUndefined();
    // Échéance : celle de l'école CIBLE (A, fermée) → plafond, pas le verrou de B.
    expect(r.json.expiresAt).toBeGreaterThan(await getAuthLockExpiry(b.cle));
  });

  it('A4 — tuteur réservé à l’école : déployable sur elle', async () => {
    const a = await ecole();
    await creerTuteur({ name: 'Maison', etablissementId: a.id });
    await setAuthLock(a.cle, 30);
    const r = await appeler(reglages, { method: 'PUT', ip: a.ip, body: { promptName: 'Maison' } });
    expect(r.status).toBe(200);
  });

  it('A5 — fournisseurs : liste blanche scolaire, doublons et inconnus ignorés', async () => {
    const a = await ecole();
    await setAuthLock(a.cle, 30);
    const r = await appeler(reglages, {
      method: 'PUT', ip: a.ip, body: { providers: ['mistral', ' mistral ', 'grok', 'openrouter', 'inconnu', 'anthropic'] },
    });
    expect(r.status).toBe(200);
    expect((await ligne(a.id)).providers).toBe('mistral,anthropic');
    const g = (await appeler(reglages, { method: 'GET', ip: a.ip })).json.settings;
    expect(g.providers).toEqual(['mistral', 'anthropic']);
    expect(g.providersRestricted).toBe(true);
    // La complétion lira la même règle.
    expect(seanceAutoriseFournisseur(seanceActive(a.id), 'openai')).toBe(false);
    expect(seanceAutoriseFournisseur(seanceActive(a.id), 'mistral')).toBe(true);
  });

  it('A5 — tout décoché : jeton « aucun », restreint et vide (plus rien sur la clé de l’école)', async () => {
    const a = await ecole();
    await setAuthLock(a.cle, 30);
    await appeler(reglages, { method: 'PUT', ip: a.ip, body: { providers: [] } });
    expect((await ligne(a.id)).providers).toBe('aucun');
    const g = (await appeler(reglages, { method: 'GET', ip: a.ip })).json.settings;
    expect(g).toMatchObject({ providers: [], providersRestricted: true });
    expect(seanceAutoriseFournisseur(seanceActive(a.id), 'mistral')).toBe(false);
  });

  it('A6 — sans champ providers, la restriction de la séance EN COURS est reconduite', async () => {
    const a = await ecole();
    await setAuthLock(a.cle, 30);
    await appeler(reglages, { method: 'PUT', ip: a.ip, body: { providers: ['openai'] } });
    await appeler(reglages, { method: 'PUT', ip: a.ip, body: { promptName: '', webSearch: true } });
    expect((await ligne(a.id)).providers).toBe('openai');
    await appeler(reglages, { method: 'PUT', ip: a.ip, body: { providers: [] } });
    await appeler(reglages, { method: 'PUT', ip: a.ip, body: {} });
    expect((await ligne(a.id)).providers).toBe('aucun');
  });

  it('A6 — une restriction dont plus rien ne survit reste une restriction (« aucun »)', async () => {
    const a = await ecole();
    await setAuthLock(a.cle, 30);
    (await base()).prepare(`INSERT INTO session_settings (etablissement_id, default_prompt_id, web_search, providers, set_by_email, expires_at)
      VALUES (?, NULL, 1, 'grok', NULL, ?)`).run(a.id, Date.now() + 60_000);
    await appeler(reglages, { method: 'PUT', ip: a.ip, body: {} });
    expect((await ligne(a.id)).providers).toBe('aucun');
  });

  it('A6 — une séance expirée n’est pas reconduite : on repart sans restriction', async () => {
    const a = await ecole();
    await setAuthLock(a.cle, 30);
    (await base()).prepare(`INSERT INTO session_settings (etablissement_id, default_prompt_id, web_search, providers, set_by_email, expires_at)
      VALUES (?, NULL, 1, 'mistral', NULL, ?)`).run(a.id, Date.now() - 1);
    await appeler(reglages, { method: 'PUT', ip: a.ip, body: {} });
    expect((await ligne(a.id)).providers).toBe('');
  });

  it('A7 — GET : pas d’école, pas de séance, ou séance expirée → settings null', async () => {
    const a = await ecole();
    expect((await appeler(reglages, { method: 'GET', ip: ipMaison() })).json).toEqual({ settings: null });
    expect((await appeler(reglages, { method: 'GET', ip: a.ip })).json).toEqual({ settings: null });
    (await base()).prepare(`INSERT INTO session_settings (etablissement_id, default_prompt_id, web_search, providers, set_by_email, expires_at)
      VALUES (?, NULL, 1, '', NULL, ?)`).run(a.id, Date.now() - 1);
    expect((await appeler(reglages, { method: 'GET', ip: a.ip })).json).toEqual({ settings: null });
  });

  it('A8 — tuteur devenu invisible après le déploiement (archivé) : promptName null, la séance demeure', async () => {
    const a = await ecole();
    const id = await creerTuteur({ name: 'Euclide' });
    await setAuthLock(a.cle, 30);
    await appeler(reglages, { method: 'PUT', ip: a.ip, body: { promptName: 'Euclide', webSearch: true } });
    (await base()).prepare('UPDATE prompts SET archived = 1 WHERE id = ?').run(id);
    const g = (await appeler(reglages, { method: 'GET', ip: a.ip })).json.settings;
    expect(g.promptName).toBeNull();
    expect(g.webSearch).toBe(true);
  });
});

describe('Droits et scénarios d’erreur', () => {
  it('ni salle ouverte ni compte : 403 ERR_FORBIDDEN', async () => {
    const a = await ecole();
    const r = await appeler(reglages, { method: 'PUT', ip: a.ip, body: { promptName: '' } });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ERR_FORBIDDEN');
  });

  it('la salle ouverte d’une AUTRE école n’autorise rien ici', async () => {
    const a = await ecole();
    const b = await ecole();
    await setAuthLock(b.cle, 30);
    expect((await appeler(reglages, { method: 'PUT', ip: a.ip, body: {} })).status).toBe(403);
  });

  it('élève rattaché par IP avec la case « enseignant » cochée : 403 hors salle ouverte', async () => {
    const a = await ecole();
    const jeton = await creerCompte('eleve@ecole.ch', { teacher: true });
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,0,?)')
      .run('eleve@ecole.ch', a.id, Date.now());
    const r = await appeler(reglages, { method: 'PUT', ip: a.ip, token: jeton, body: {} });
    expect(r.status).toBe(403);
    expect(await ligne(a.id)).toBeUndefined();
  });

  it('enseignant qui annonce une école où il n’a pas de titre : 403', async () => {
    const a = await ecole();
    const b = await ecole();
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: a.id });
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,0,?)')
      .run('prof@ecole.ch', b.id, Date.now());
    const r = await appeler(reglages, { method: 'PUT', ip: ipMaison(), token: jeton, headers: { 'x-educhat-ecole': String(b.id) }, body: {} });
    expect(r.status).toBe(403);
  });

  it('tuteur inconnu, non publié, ou réservé à une autre école : 404 ERR_PROMPT_UNKNOWN', async () => {
    const a = await ecole();
    const b = await ecole();
    await creerTuteur({ name: 'Brouillon', status: 'draft' });
    await creerTuteur({ name: 'Voisin', etablissementId: b.id, publie: false });
    await setAuthLock(a.cle, 30);
    for (const promptName of ['Inexistant', 'Brouillon', 'Voisin']) {
      const r = await appeler(reglages, { method: 'PUT', ip: a.ip, body: { promptName } });
      expect(r.status).toBe(404);
      expect(r.json.error.code).toBe('ERR_PROMPT_UNKNOWN');
    }
    expect(await ligne(a.id)).toBeUndefined();
  });

  it('tuteur public d’une autre école : visible seulement si le catalogue de l’école est ouvert', async () => {
    const fermee = await ecole();
    const ouverte = await ecole({ catalogueOuvert: true });
    const b = await ecole();
    await creerTuteur({ name: 'Partage', etablissementId: b.id, publie: true });
    await setAuthLock(fermee.cle, 30);
    await setAuthLock(ouverte.cle, 30);
    expect((await appeler(reglages, { method: 'PUT', ip: fermee.ip, body: { promptName: 'Partage' } })).status).toBe(404);
    expect((await appeler(reglages, { method: 'PUT', ip: ouverte.ip, body: { promptName: 'Partage' } })).status).toBe(200);
  });

  it('plus de 10 écritures par minute depuis une IP : 429 ERR_RATE_LIMIT', async () => {
    const a = await ecole();
    await setAuthLock(a.cle, 30);
    for (let i = 0; i < 10; i++) expect((await appeler(reglages, { method: 'PUT', ip: a.ip, body: {} })).status).toBe(200);
    const r = await appeler(reglages, { method: 'PUT', ip: a.ip, body: {} });
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe('ERR_RATE_LIMIT');
  });

  it('méthode autre que GET/PUT : 405', async () => {
    const r = await appeler(reglages, { method: 'POST', ip: ipMaison(), body: {} });
    expect(r.status).toBe(405);
    expect(r.json.error.code).toBe('ERR_METHOD_NOT_ALLOWED');
    expect(r.headers.allow).toEqual(['GET', 'PUT']);
  });

  it('le nom du tuteur est tronqué à 64 caractères', async () => {
    const a = await ecole();
    const nom = 'T'.repeat(64);
    await creerTuteur({ name: nom });
    await setAuthLock(a.cle, 30);
    const r = await appeler(reglages, { method: 'PUT', ip: a.ip, body: { promptName: nom + 'suite-ignorée' } });
    expect(r.status).toBe(200);
  });
});
