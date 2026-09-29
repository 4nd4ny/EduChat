// UC-03 — Tests fonctionnels : « Commenter un tuteur et modérer les
// commentaires ». Dépôt anonyme puis modération par la vraie route
// /api/prompts/[name]/comments (GET/POST/PATCH), et file de modération de
// /api/admin/comments. Seul l'envoi des courriels est doublé.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerTuteur, creerEtablissement, creerCompte } from '../../helpers/db';

const notifications: string[] = [];
vi.mock('../../../src/server/mail', () => ({
  notifyAdmin: vi.fn((sujet: string) => { notifications.push(sujet); }),
  sendVerificationCode: vi.fn(async () => {}),
  sendEmailChangeCode: vi.fn(async () => {}),
  sendEmailChangeWarning: vi.fn(),
}));

import commentaires from '../../../src/pages/api/prompts/[name]/comments';
import fileAdmin from '../../../src/pages/api/admin/comments';

// Chaque dépôt vient d'une IP neuve : le limiteur « comment » est par IP.
let n = 0;
const ipNeuve = () => `203.0.113.${++n}`;

beforeEach(async () => {
  await viderBase();
  notifications.length = 0;
});

type Qui = { token?: string; ip?: string; headers?: Record<string, string> };

const deposer = (name: string, body: unknown, qui: Qui = {}) =>
  appeler(commentaires, { method: 'POST', query: { name }, body: { body }, ip: qui.ip ?? ipNeuve(), token: qui.token });
const lire = (name: string, qui: Qui = {}) =>
  appeler(commentaires, { method: 'GET', query: { name }, ip: qui.ip ?? ipNeuve(), token: qui.token, headers: qui.headers });
const moderer = (name: string, id: unknown, action: string, qui: Qui = {}) =>
  appeler(commentaires, { method: 'PATCH', query: { name }, body: { id, action }, ip: qui.ip ?? ipNeuve(), token: qui.token });
const file = (qui: Qui = {}, query: Record<string, string> = {}) =>
  appeler(fileAdmin, { method: 'GET', query, token: qui.token, ip: qui.ip ?? ipNeuve() });

describe('Scénario nominal : dépôt anonyme puis modération par l’auteur du tuteur', () => {
  it('le commentaire naît en attente, invisible du public, puis paraît une fois approuvé', async () => {
    await creerTuteur({ name: 'Socrate', authorEmail: 'auteur@ecole.ch' });
    const auteur = await creerCompte('auteur@ecole.ch');

    const d = await deposer('Socrate', '  Très utile pour mes révisions !  ');
    expect(d.status).toBe(201);
    expect(d.json).toMatchObject({ ok: true, status: 'pending' });
    const id = d.json.id;

    // Public : rien encore, et pas de statut exposé.
    const pub = await lire('Socrate');
    expect(pub.json).toEqual({ moderator: false, comments: [] });

    // L'auteur voit la file, avec les statuts.
    const vue = await lire('Socrate', { token: auteur });
    expect(vue.json.moderator).toBe(true);
    expect(vue.json.comments).toEqual([
      expect.objectContaining({ id, body: 'Très utile pour mes révisions !', status: 'pending' }),
    ]);

    const ok = await moderer('Socrate', id, 'approve', { token: auteur });
    expect(ok.status).toBe(200);
    expect(ok.json).toEqual({ ok: true, status: 'approved' });

    const apres = await lire('Socrate');
    expect(apres.json.comments).toHaveLength(1);
    expect(apres.json.comments[0]).toEqual({ id, body: 'Très utile pour mes révisions !', createdAt: expect.any(Number) });

    const ligne = (await base()).prepare('SELECT * FROM comments WHERE id = ?').get(id) as any;
    expect(ligne.moderated_by).toBe('auteur@ecole.ch');
    expect(ligne.moderated_at).toBeGreaterThan(0);
  });

  it('masquer retire le commentaire du public sans le supprimer', async () => {
    await creerTuteur({ name: 'Socrate', authorEmail: 'auteur@ecole.ch' });
    const auteur = await creerCompte('auteur@ecole.ch');
    const id = (await deposer('Socrate', 'Commentaire à masquer')).json.id;
    await moderer('Socrate', id, 'approve', { token: auteur });
    const r = await moderer('Socrate', id, 'hide', { token: auteur });
    expect(r.json.status).toBe('hidden');
    expect((await lire('Socrate')).json.comments).toEqual([]);
    expect((await base()).prepare('SELECT status FROM comments WHERE id = ?').get(id)).toEqual({ status: 'hidden' });
  });

  it('aucune identité n’est stockée avec le commentaire (ni compte, ni IP)', async () => {
    await creerTuteur({ name: 'Socrate' });
    const jeton = await creerCompte('curieux@ecole.ch');
    await deposer('Socrate', 'Un avis signé ?', { token: jeton, ip: '203.0.113.250' });
    const colonnes = ((await base()).prepare('PRAGMA table_info(comments)').all() as any[]).map(c => c.name);
    expect(colonnes).toEqual(['id', 'prompt_id', 'body', 'status', 'created_at', 'moderated_at', 'moderated_by']);
    const ligne = JSON.stringify((await base()).prepare('SELECT * FROM comments').get());
    expect(ligne).not.toContain('curieux');
    expect(ligne).not.toContain('203.0.113.250');
  });

  it('l’administration est prévenue, au plus une fois par fiche et par heure', async () => {
    await creerTuteur({ name: 'Socrate' });
    await creerTuteur({ name: 'Platon' });
    await deposer('Socrate', 'Premier commentaire');
    await deposer('Socrate', 'Deuxième commentaire');
    await deposer('Platon', 'Sur une autre fiche');
    expect(notifications).toEqual(['Nouveau commentaire sur « Socrate »', 'Nouveau commentaire sur « Platon »']);
  });
});

describe('Scénarios alternatifs : les autres modérateurs', () => {
  it('le super-administrateur modère tout, y compris un tuteur anonyme de la plateforme', async () => {
    await creerTuteur({ name: 'Anonyme' });
    const sup = await creerCompte('super@educh.at');
    const id = (await deposer('Anonyme', 'Avis sur un tuteur anonyme')).json.id;
    expect((await lire('Anonyme', { token: sup })).json.moderator).toBe(true);
    expect((await moderer('Anonyme', id, 'approve', { token: sup })).status).toBe(200);
  });

  it('l’école propriétaire modère : son administrateur comme ses enseignants', async () => {
    const a = await creerEtablissement({ ips: '198.51.100.41' });
    await creerTuteur({ name: 'Maison', etablissementId: a });
    const dir = await creerCompte('dir@a.ch', { etablissementId: a, schoolAdmin: true });
    const prof = await creerCompte('prof@a.ch', { teacher: true, etablissementId: a });
    // Tuteur réservé : les élèves le commentent depuis le réseau de l'école.
    const id1 = (await deposer('Maison', 'Premier avis', { ip: '198.51.100.41' })).json.id;
    const id2 = (await deposer('Maison', 'Second avis', { ip: '198.51.100.41' })).json.id;
    expect((await moderer('Maison', id1, 'approve', { token: dir })).status).toBe(200);
    expect((await moderer('Maison', id2, 'hide', { token: prof })).status).toBe(200);
    // L'enseignant de l'école voit la file même depuis chez lui.
    expect((await lire('Maison', { token: prof })).json.comments).toHaveLength(2);
  });

  it('un enseignant d’une autre école n’est pas modérateur', async () => {
    const a = await creerEtablissement();
    const b = await creerEtablissement();
    await creerTuteur({ name: 'Maison', etablissementId: a, publie: true });
    const profB = await creerCompte('prof@b.ch', { teacher: true, etablissementId: b });
    const id = (await deposer('Maison', 'Un avis')).json.id;
    expect((await lire('Maison', { token: profB })).json.moderator).toBe(false);
    const r = await moderer('Maison', id, 'approve', { token: profB });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ERR_FORBIDDEN');
  });

  it('un modérateur garde l’accès à un tuteur non publié (lecture), mais on n’y dépose rien', async () => {
    await creerTuteur({ name: 'Brouillon', status: 'draft', authorEmail: 'auteur@ecole.ch' });
    const auteur = await creerCompte('auteur@ecole.ch');
    expect((await lire('Brouillon', { token: auteur })).status).toBe(200);
    const r = await deposer('Brouillon', 'Commentaire sur un brouillon', { token: auteur });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ERR_STATUS');
  });

  it('les commentaires d’un tuteur réservé se lisent depuis le réseau de son école', async () => {
    const a = await creerEtablissement({ ips: '198.51.100.40' });
    await creerTuteur({ name: 'Maison', etablissementId: a });
    expect((await deposer('Maison', 'Depuis la classe', { ip: '198.51.100.40' })).status).toBe(201);
    expect((await lire('Maison', { ip: '198.51.100.40' })).status).toBe(200);
  });
});

describe('Scénarios d’erreur', () => {
  it('tuteur inconnu : 404', async () => {
    const r = await lire('Inconnu');
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe('ERR_PROMPT_UNKNOWN');
  });

  it('pour le public, brouillon, dépublié, archivé ou réservé ailleurs : 404 en lecture comme en dépôt', async () => {
    const b = await creerEtablissement();
    await creerTuteur({ name: 'Brouillon', status: 'draft' });
    await creerTuteur({ name: 'Retire', status: 'retired' });
    await creerTuteur({ name: 'Archive', archived: true });
    await creerTuteur({ name: 'Reserve', etablissementId: b });
    for (const name of ['Brouillon', 'Retire', 'Archive', 'Reserve']) {
      expect((await lire(name)).status).toBe(404);
      expect((await deposer(name, 'Un commentaire')).status).toBe(404);
    }
    expect((await base()).prepare('SELECT COUNT(*) AS n FROM comments').get()).toEqual({ n: 0 });
  });

  it('commentaire trop court (après rognage) ou trop long : 400', async () => {
    await creerTuteur({ name: 'Socrate' });
    for (const body of ['', '  ab  ', 'x'.repeat(2001), undefined]) {
      const r = await deposer('Socrate', body);
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('ERR_COMMENT_INVALID');
    }
    expect((await deposer('Socrate', 'x'.repeat(2000))).status).toBe(201);
    expect((await deposer('Socrate', 'abc')).status).toBe(201);
  });

  it('au-delà de 5 dépôts par minute depuis une IP : 429', async () => {
    await creerTuteur({ name: 'Socrate' });
    const ip = ipNeuve();
    for (let i = 0; i < 5; i++) expect((await deposer('Socrate', `Avis numéro ${i}`, { ip })).status).toBe(201);
    const r = await deposer('Socrate', 'Un de trop', { ip });
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe('ERR_RATE_LIMIT');
  });

  it('modération : anonyme ou non-modérateur 403, action inconnue 400, commentaire d’une autre fiche 404', async () => {
    await creerTuteur({ name: 'Socrate', authorEmail: 'auteur@ecole.ch' });
    await creerTuteur({ name: 'Platon' });
    const auteur = await creerCompte('auteur@ecole.ch');
    const autre = await creerCompte('autre@ecole.ch');
    const id = (await deposer('Socrate', 'À modérer')).json.id;
    const surPlaton = (await deposer('Platon', 'Sur Platon')).json.id;

    expect((await moderer('Socrate', id, 'approve')).status).toBe(403);
    expect((await moderer('Socrate', id, 'approve', { token: autre })).status).toBe(403);
    const inconnue = await moderer('Socrate', id, 'delete', { token: auteur });
    expect(inconnue.status).toBe(400);
    expect(inconnue.json.error.code).toBe('ERR_ACTION_UNKNOWN');
    for (const mauvais of [surPlaton, 99999, 'abc']) {
      const r = await moderer('Socrate', mauvais, 'approve', { token: auteur });
      expect(r.status).toBe(404);
      expect(r.json.error.code).toBe('ERR_COMMENT_UNKNOWN');
    }
    // Le commentaire de Platon n'a pas bougé.
    expect((await base()).prepare('SELECT status FROM comments WHERE id = ?').get(surPlaton)).toEqual({ status: 'pending' });
  });

  it('méthode non prévue : 405', async () => {
    await creerTuteur({ name: 'Socrate' });
    const r = await appeler(commentaires, { method: 'DELETE', query: { name: 'Socrate' }, ip: ipNeuve() });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toEqual(['GET', 'POST', 'PATCH']);
  });
});

describe('File de modération de l’administration (GET /api/admin/comments)', () => {
  async function paysage() {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    await creerTuteur({ name: 'Plateforme' });
    await creerTuteur({ name: 'Maison A', etablissementId: a, publie: true });
    await creerTuteur({ name: 'Maison B', etablissementId: b, publie: true });
    const ids: Record<string, number> = {};
    for (const nom of ['Plateforme', 'Maison A', 'Maison B']) {
      ids[nom] = (await deposer(nom, `Avis sur ${nom}`)).json.id;
    }
    return { a, b, ids };
  }
  const tuteursDe = (r: { json: any }) => (r.json.comments as any[]).map(c => c.promptName).sort();

  it('refuse l’anonyme et le compte sans rang : 403', async () => {
    expect((await file()).status).toBe(403);
    const simple = await creerCompte('simple@ecole.ch');
    const r = await file({ token: simple });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ERR_FORBIDDEN');
  });

  it('le super voit tout : en attente d’abord, puis l’historique modéré avec son total', async () => {
    const { ids } = await paysage();
    const sup = await creerCompte('super@educh.at');
    await moderer('Plateforme', ids.Plateforme, 'approve', { token: sup });
    const r = await file({ token: sup });
    expect(r.status).toBe(200);
    expect(r.json.moderatedTotal).toBe(1);
    expect(r.json.comments.map((c: any) => c.status)).toEqual(['pending', 'pending', 'approved']);
    expect(r.json.comments[2]).toMatchObject({
      promptName: 'Plateforme', moderatedBy: 'super@educh.at', body: 'Avis sur Plateforme',
    });
  });

  it('l’administrateur d’école voit ses tuteurs et ceux de la plateforme', async () => {
    const { a } = await paysage();
    const dir = await creerCompte('dir@a.ch', { etablissementId: a, schoolAdmin: true });
    expect(tuteursDe(await file({ token: dir }))).toEqual(['Maison A', 'Plateforme']);
  });

  it('l’enseignant ne voit que les tuteurs de son école', async () => {
    const { a } = await paysage();
    const prof = await creerCompte('prof@a.ch', { teacher: true, etablissementId: a });
    expect(tuteursDe(await file({ token: prof }))).toEqual(['Maison A']);
  });

  it('?portee=ecole ramène le super à son école active ; sans école, une file vide', async () => {
    const { b } = await paysage();
    const supB = await creerCompte('super@educh.at', { etablissementId: b });
    expect(tuteursDe(await file({ token: supB }, { portee: 'ecole' }))).toEqual(['Maison B', 'Plateforme']);
    await viderBase();
    const seul = await creerCompte('super@educh.at');
    const r = await file({ token: seul }, { portee: 'ecole' });
    expect(r.json).toEqual({ comments: [], moderatedTotal: 0 });
  });

  it('refuse une autre méthode que GET (405), mais la garde passe avant', async () => {
    const sup = await creerCompte('super@educh.at');
    const r = await appeler(fileAdmin, { method: 'POST', token: sup, ip: ipNeuve() });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toEqual(['GET']);
    expect((await appeler(fileAdmin, { method: 'POST', ip: ipNeuve() })).status).toBe(403);
  });

  it('comportement actuel (voir « Anomalies ») : l’administrateur d’école reçoit les commentaires de la plateforme mais ne peut pas les modérer', async () => {
    // /api/admin/comments sert à l'administrateur d'école la file de ses
    // tuteurs ET de ceux de la plateforme (etablissement_id IS NULL) ; la route
    // de modération, elle, écarte la plateforme (tuteurDeLEcole) : 403.
    const { a, ids } = await paysage();
    const dir = await creerCompte('dir@a.ch', { etablissementId: a, schoolAdmin: true });
    expect(tuteursDe(await file({ token: dir }))).toContain('Plateforme');
    const r = await moderer('Plateforme', ids.Plateforme, 'approve', { token: dir });
    expect(r.status).toBe(403);
    expect((await lire('Plateforme', { token: dir })).json.moderator).toBe(false);
  });
});
