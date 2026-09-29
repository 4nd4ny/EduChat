// UC-09 — Tests fonctionnels : « Rédiger, tester et soumettre un tuteur
// (atelier du promptagogue) ». Enchaîne les vraies routes POST /api/prompts,
// GET /api/drafts/[token] et PATCH /api/prompts/[name] ; seules les
// notifications à l'administration sont doublées pour être lues.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerCompte, creerEtablissement, creerTuteur } from '../../helpers/db';

const notifications: Array<{ sujet: string; texte: string }> = [];
vi.mock('../../../src/server/mail', () => ({
  notifyAdmin: vi.fn((sujet: string, texte: string) => { notifications.push({ sujet, texte }); }),
  sendVerificationCode: vi.fn(async () => {}),
  sendEmailChangeCode: vi.fn(async () => {}),
  sendEmailChangeWarning: vi.fn(() => {}),
}));

import deposer from '../../../src/pages/api/prompts/index';
import tuteur from '../../../src/pages/api/prompts/[name]/index';
import brouillon from '../../../src/pages/api/drafts/[token]';

// Chaque test a sa propre adresse IP : les limiteurs de débit sont par IP.
let n = 0;
const ipNeuve = () => `198.51.100.${++n}`;

const CORPS = 'Tu es Socrate. Pose des questions, ne donne jamais la réponse à l’élève.';
const CORPS_2 = 'Tu es Socrate, version revue. Une seule question à la fois, jamais la réponse.';

beforeEach(async () => {
  await viderBase();
  notifications.length = 0;
});

async function deposerTuteur(body: Record<string, unknown>, opts: { token?: string; ip?: string; headers?: Record<string, string> } = {}) {
  return appeler(deposer, { method: 'POST', body: { body: CORPS, ...body }, ip: opts.ip ?? ipNeuve(), token: opts.token, headers: opts.headers });
}

async function patcher(nom: string, body: Record<string, unknown>, token?: string) {
  return appeler(tuteur, { method: 'PATCH', query: { name: nom }, body, token, ip: ipNeuve() });
}

async function ligne(nom: string) {
  return (await base()).prepare('SELECT * FROM prompts WHERE name = ?').get(nom) as any;
}

describe('Scénario nominal : rédiger, tester, corriger puis soumettre (auteur identifié)', () => {
  it('crée un brouillon signé, versionné et joignable par son URL secrète', async () => {
    const jeton = await creerCompte('auteur@ecole.ch', { name: 'Auteur' });
    const r = await deposerTuteur({ name: 'Socrate', description: 'Maïeutique', language: 'fr', webSearch: true }, { token: jeton });
    expect(r.status).toBe(201);
    expect(r.json).toEqual({ name: 'Socrate', shareToken: expect.stringMatching(/^[a-f0-9]{32}$/), status: 'draft' });

    const row = await ligne('Socrate');
    expect(row).toMatchObject({
      author_email: 'auteur@ecole.ch', author_name: 'Auteur', version: 1, status: 'draft',
      web_search: 1, size_bytes: Buffer.byteLength(CORPS), etablissement_id: null, archived: 0, publie: 0,
    });
    const versions = (await base()).prepare('SELECT version, body FROM prompt_versions WHERE prompt_id = ?').all(row.id);
    expect(versions).toEqual([{ version: 1, body: CORPS }]);

    // « Tester » : la page /p/essai/[token] relit le brouillon par son URL secrète.
    const essai = await appeler(brouillon, { query: { token: r.json.shareToken } });
    expect(essai.status).toBe(200);
    expect(essai.json.prompt).toMatchObject({ name: 'Socrate', body: CORPS, status: 'draft', description: 'Maïeutique', webSearch: true });
    expect(essai.json.shareToken).toBe(r.json.shareToken);
  });

  it('chaque modification du texte crée une nouvelle version ; la description seule, non', async () => {
    const jeton = await creerCompte('auteur@ecole.ch');
    await deposerTuteur({ name: 'Socrate' }, { token: jeton });

    const r1 = await patcher('Socrate', { action: 'edit', body: CORPS_2 }, jeton);
    expect(r1.status).toBe(200);
    expect(r1.json).toEqual({ ok: true, version: 2 });

    const r2 = await patcher('Socrate', { action: 'edit', description: 'Nouvelle description' }, jeton);
    expect(r2.json).toEqual({ ok: true, version: 2 });

    const row = await ligne('Socrate');
    expect(row.body).toBe(CORPS_2);
    expect(row.description).toBe('Nouvelle description');
    const versions = (await base()).prepare('SELECT version, body FROM prompt_versions WHERE prompt_id = ? ORDER BY version').all(row.id);
    expect(versions).toEqual([{ version: 1, body: CORPS }, { version: 2, body: CORPS_2 }]);
    // Un brouillon modifié ne déclenche aucune alerte de traduction.
    expect(notifications).toHaveLength(0);
  });

  it('l’action par défaut est « edit »', async () => {
    const jeton = await creerCompte('auteur@ecole.ch');
    await deposerTuteur({ name: 'Socrate' }, { token: jeton });
    const r = await patcher('Socrate', { body: CORPS_2 }, jeton);
    expect(r.json).toEqual({ ok: true, version: 2 });
  });

  it('soumettre fait passer le brouillon « en attente » et prévient l’administration', async () => {
    const jeton = await creerCompte('auteur@ecole.ch', { name: 'Auteur' });
    await deposerTuteur({ name: 'Socrate', description: 'Maïeutique' }, { token: jeton });
    const r = await patcher('Socrate', { action: 'submit' }, jeton);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, status: 'pending' });
    expect((await ligne('Socrate')).status).toBe('pending');
    expect(notifications).toHaveLength(1);
    expect(notifications[0].sujet).toBe('Prompt à modérer : Socrate');
    expect(notifications[0].texte).toContain('Auteur <auteur@ecole.ch>');
  });
});

describe('Scénario alternatif : proposition anonyme pilotée par l’URL secrète', () => {
  it('crée un brouillon sans auteur, modifiable et soumis grâce au seul share_token', async () => {
    const r = await deposerTuteur({ name: 'Hypatie' });
    expect(r.status).toBe(201);
    const shareToken = r.json.shareToken;
    const row = await ligne('Hypatie');
    expect(row.author_email).toBeNull();
    expect(row.author_name).toBe('');

    expect((await patcher('Hypatie', { action: 'edit', body: CORPS_2, shareToken })).json).toEqual({ ok: true, version: 2 });
    expect((await patcher('Hypatie', { action: 'submit', shareToken })).json.status).toBe('pending');
    expect(notifications[0].texte).toContain('ANONYME');
  });

  it('sans l’URL secrète (ou avec une autre), personne ne peut modifier ni soumettre', async () => {
    await deposerTuteur({ name: 'Hypatie' });
    const intrus = await creerCompte('intrus@ailleurs.ch');
    for (const [corps, jeton] of [
      [{ action: 'edit', body: CORPS_2 }, undefined],
      [{ action: 'edit', body: CORPS_2, shareToken: 'b'.repeat(32) }, undefined],
      [{ action: 'submit' }, intrus],
    ] as const) {
      const r = await patcher('Hypatie', corps as any, jeton);
      expect(r.status).toBe(403);
      expect(r.json.error.code).toBe('ERR_FORBIDDEN');
    }
  });

  it('un compte non auteur n’est pas « auteur » d’une proposition anonyme même signé', async () => {
    await deposerTuteur({ name: 'Hypatie' });
    const autre = await creerCompte('autre@ecole.ch');
    const r = await patcher('Hypatie', { action: 'submit' }, autre);
    expect(r.status).toBe(403);
  });
});

describe('Scénario alternatif : rattachement du dépôt à une école', () => {
  it('l’école principale d’un enseignant l’emporte, même déposé depuis chez lui', async () => {
    const id = await creerEtablissement({ ips: '192.0.2.10' });
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: id });
    await deposerTuteur({ name: 'Socrate' }, { token: jeton, ip: ipNeuve() });
    expect((await ligne('Socrate')).etablissement_id).toBe(id);
  });

  it('une proposition anonyme déposée depuis le réseau d’une école lui est rattachée', async () => {
    const id = await creerEtablissement({ ips: '192.0.2.11' });
    await deposerTuteur({ name: 'Hypatie' }, { ip: '192.0.2.11' });
    expect((await ligne('Hypatie')).etablissement_id).toBe(id);
  });

  it('hors école et sans titre, le tuteur rejoint le catalogue de la plateforme (NULL)', async () => {
    const id = await creerEtablissement({ ips: '192.0.2.12' });
    const jeton = await creerCompte('passant@ecole.ch', { teacher: true });
    // Simple lien ramassé par IP : aucun titre, et l'on dépose depuis chez soi.
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,0,0)')
      .run('passant@ecole.ch', id);
    await deposerTuteur({ name: 'Socrate' }, { token: jeton, ip: ipNeuve() });
    expect((await ligne('Socrate')).etablissement_id).toBeNull();
  });

  it('le promptagogue non enseignant rattaché par l’administration garde son école principale', async () => {
    const id = await creerEtablissement();
    const jeton = await creerCompte('promptagogue@ecole.ch', { etablissementId: id });
    await deposerTuteur({ name: 'Socrate' }, { token: jeton });
    expect((await ligne('Socrate')).etablissement_id).toBe(id);
  });

  it('un enseignant de deux écoles rattache son tuteur à l’école choisie (en-tête)', async () => {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    const jeton = await creerCompte('prof@ecole.ch', { teacher: true, etablissementId: a });
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,1,0)')
      .run('prof@ecole.ch', b);
    await deposerTuteur({ name: 'Socrate' }, { token: jeton, headers: { 'x-educhat-ecole': String(b) } });
    expect((await ligne('Socrate')).etablissement_id).toBe(b);
  });

  it('le rattachement ne se reçoit jamais du client', async () => {
    const id = await creerEtablissement();
    await deposerTuteur({ name: 'Hypatie', etablissementId: id, etablissement_id: id });
    expect((await ligne('Hypatie')).etablissement_id).toBeNull();
  });
});

describe('Scénario alternatif : proposer une variante (inspired_by)', () => {
  it('rattache la variante à son tuteur source', async () => {
    const source = await creerTuteur({ name: 'Socrate' });
    await deposerTuteur({ name: 'Socrate bis', inspiredBy: 'Socrate' });
    expect((await ligne('Socrate bis')).inspired_by).toBe(source);
  });
  it('ignore silencieusement une source inconnue', async () => {
    const r = await deposerTuteur({ name: 'Orphelin', inspiredBy: 'Inexistant' });
    expect(r.status).toBe(201);
    expect((await ligne('Orphelin')).inspired_by).toBeNull();
  });
});

describe('Scénario alternatif : correction par un collègue de l’école propriétaire', () => {
  it('un enseignant de l’école modifie le tuteur d’un collègue ; celui d’une autre école, non', async () => {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    await creerTuteur({ name: 'Socrate', status: 'draft', authorEmail: 'collegue@a.ch', etablissementId: a });
    const profA = await creerCompte('prof@a.ch', { teacher: true, etablissementId: a });
    const profB = await creerCompte('prof@b.ch', { teacher: true, etablissementId: b });
    expect((await patcher('Socrate', { action: 'edit', body: CORPS_2 }, profA)).status).toBe(200);
    expect((await patcher('Socrate', { action: 'edit', body: CORPS }, profB)).status).toBe(403);
  });

  it('un tuteur de la plateforme (rattachement NULL) n’appartient à aucune école', async () => {
    const a = await creerEtablissement();
    await creerTuteur({ name: 'Socrate', status: 'draft', authorEmail: 'auteur@x.ch' });
    const profA = await creerCompte('prof@a.ch', { teacher: true, etablissementId: a });
    expect((await patcher('Socrate', { action: 'edit', body: CORPS_2 }, profA)).status).toBe(403);
  });
});

describe('Scénario alternatif : retoucher un tuteur déjà publié', () => {
  it('la nouvelle version périme ses traductions et l’administration est prévenue', async () => {
    const jeton = await creerCompte('auteur@ecole.ch');
    await creerTuteur({ name: 'Socrate', status: 'published', authorEmail: 'auteur@ecole.ch' });
    const r = await patcher('Socrate', { action: 'edit', body: CORPS_2 }, jeton);
    expect(r.json).toEqual({ ok: true, version: 2 });
    expect(notifications.map(x => x.sujet)).toEqual(['Traductions à revérifier : Socrate']);
    expect((await ligne('Socrate')).status).toBe('published'); // pas de nouvelle modération
  });

  // Anomalie corrigée : l'URL secrète n'est une clé d'auteur que tant que le
  // tuteur est un brouillon. Elle a circulé auprès des testeurs ; une fois le
  // tuteur publié, elle ne sert plus qu'à le LIRE depuis l'atelier.
  it('l’URL secrète d’une proposition anonyme ne permet plus de réécrire le tuteur une fois publié', async () => {
    const r = await deposerTuteur({ name: 'Hypatie' });
    (await base()).prepare("UPDATE prompts SET status = 'published' WHERE name = 'Hypatie'").run();
    const essai = await appeler(brouillon, { query: { token: r.json.shareToken } });
    expect(essai.status).toBe(200);
    expect(essai.json.prompt.status).toBe('published');
    const edit = await patcher('Hypatie', { action: 'edit', body: CORPS_2, shareToken: r.json.shareToken });
    expect(edit.status).toBe(403);
    expect(edit.json.error.code).toBe('ERR_FORBIDDEN');
    const row = await ligne('Hypatie');
    expect(row.status).toBe('published');
    expect(row.body).toBe(CORPS);
    expect(row.version).toBe(1);
    expect(notifications).toEqual([]);
  });

  it('ni un tuteur soumis ni un tuteur dépublié ne se réécrivent par l’URL secrète', async () => {
    for (const statut of ['pending', 'retired']) {
      await viderBase();
      const r = await deposerTuteur({ name: 'Hypatie' });
      (await base()).prepare('UPDATE prompts SET status = ? WHERE name = ?').run(statut, 'Hypatie');
      const edit = await patcher('Hypatie', { action: 'edit', body: CORPS_2, shareToken: r.json.shareToken });
      expect(edit.status).toBe(403);
      expect((await ligne('Hypatie')).body).toBe(CORPS);
    }
  });

  it('l’auteur identifié garde, lui, la main sur son tuteur publié par son jeton', async () => {
    const jeton = await creerCompte('auteur@ecole.ch');
    const r = await deposerTuteur({ name: 'Socrate' }, { token: jeton });
    (await base()).prepare("UPDATE prompts SET status = 'published' WHERE name = 'Socrate'").run();
    expect((await patcher('Socrate', { action: 'edit', body: CORPS_2, shareToken: r.json.shareToken })).status).toBe(403);
    expect((await patcher('Socrate', { action: 'edit', body: CORPS_2 }, jeton)).json).toEqual({ ok: true, version: 2 });
  });
});

describe('Scénarios d’erreur au dépôt', () => {
  it('nom invalide, réservé ou déjà pris', async () => {
    await creerTuteur({ name: 'Socrate' });
    for (const [nom, statut, code] of [
      ['S', 400, 'ERR_NAME_INVALID'],
      ['essai', 400, 'ERR_NAME_INVALID'],
      ['So/crate', 400, 'ERR_NAME_INVALID'],
      ['Socrate', 409, 'ERR_NAME_TAKEN'],
    ] as const) {
      const r = await deposerTuteur({ name: nom });
      expect(r.status).toBe(statut);
      expect(r.json.error.code).toBe(code);
    }
  });

  it('corps trop court (< 40 octets) ou trop long (> 256 Ko)', async () => {
    const court = await deposerTuteur({ name: 'Court', body: 'Trop court.' });
    expect(court.status).toBe(400);
    expect(court.json.error.code).toBe('ERR_BODY_TOO_SHORT');
    const long = await deposerTuteur({ name: 'Long', body: 'x'.repeat(256 * 1024 + 1) });
    expect(long.status).toBe(413);
    expect(long.json.error.code).toBe('ERR_BODY_TOO_LARGE');
  });

  it('quota de 1 Mo par auteur identifié — les tuteurs archivés n’y comptent plus', async () => {
    const jeton = await creerCompte('auteur@ecole.ch');
    const id = await creerTuteur({ name: 'Gros', authorEmail: 'auteur@ecole.ch' });
    const db = await base();
    db.prepare('UPDATE prompts SET size_bytes = ? WHERE id = ?').run(1024 * 1024 - 10, id);
    const r = await deposerTuteur({ name: 'Socrate' }, { token: jeton });
    expect(r.status).toBe(413);
    expect(r.json.error.code).toBe('ERR_QUOTA_USER');

    db.prepare('UPDATE prompts SET archived = 1 WHERE id = ?').run(id);
    expect((await deposerTuteur({ name: 'Socrate' }, { token: jeton })).status).toBe(201);
  });

  it('l’anonyme n’est soumis à aucun quota d’auteur', async () => {
    const id = await creerTuteur({ name: 'Gros' });
    (await base()).prepare('UPDATE prompts SET size_bytes = ? WHERE id = ?').run(10 * 1024 * 1024, id);
    expect((await deposerTuteur({ name: 'Hypatie' })).status).toBe(201);
  });

  it('une langue inconnue retombe sur le français ; la description est tronquée à 500 caractères', async () => {
    await deposerTuteur({ name: 'Socrate', language: 'es', description: 'd'.repeat(800) });
    const row = await ligne('Socrate');
    expect(row.language).toBe('fr');
    expect(row.description).toHaveLength(500);
  });

  it('plus de 10 dépôts par minute depuis une IP : 429', async () => {
    const ip = ipNeuve();
    for (let i = 0; i < 10; i++) {
      const r = await deposerTuteur({ name: `Tuteur ${i}` }, { ip });
      expect(r.status).toBe(201);
    }
    const r = await deposerTuteur({ name: 'Tuteur 10' }, { ip });
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe('ERR_RATE_LIMIT');
  });

  it('méthode non autorisée', async () => {
    const r = await appeler(deposer, { method: 'PUT', ip: ipNeuve() });
    expect(r.status).toBe(405);
    expect(r.json.error.code).toBe('ERR_METHOD_NOT_ALLOWED');
  });
});

describe('Scénarios d’erreur sur l’URL secrète', () => {
  it('jeton inconnu, mal formé ou tuteur archivé : 404', async () => {
    await creerTuteur({ name: 'Refusé', status: 'draft', shareToken: 'c'.repeat(32), archived: true });
    for (const token of ['d'.repeat(32), 'pas-un-jeton', 'c'.repeat(32)]) {
      const r = await appeler(brouillon, { query: { token } });
      expect(r.status).toBe(404);
      expect(r.json.error.code).toBe('ERR_PROMPT_UNKNOWN');
    }
  });
  it('méthode non autorisée', async () => {
    expect((await appeler(brouillon, { method: 'POST', query: { token: 'c'.repeat(32) } })).status).toBe(405);
  });
});

describe('Scénarios d’erreur à la modification et à la soumission', () => {
  it('corps trop court, trop long, ou dépassant le quota de l’auteur', async () => {
    const jeton = await creerCompte('auteur@ecole.ch');
    await deposerTuteur({ name: 'Socrate' }, { token: jeton });
    expect((await patcher('Socrate', { action: 'edit', body: 'court' }, jeton)).json.error.code).toBe('ERR_BODY_TOO_SHORT');
    expect((await patcher('Socrate', { action: 'edit', body: 'x'.repeat(256 * 1024 + 1) }, jeton)).json.error.code).toBe('ERR_BODY_TOO_LARGE');

    const autre = await creerTuteur({ name: 'Gros', authorEmail: 'auteur@ecole.ch' });
    (await base()).prepare('UPDATE prompts SET size_bytes = ? WHERE id = ?').run(1024 * 1024 - 50, autre);
    const r = await patcher('Socrate', { action: 'edit', body: CORPS_2 }, jeton);
    expect(r.status).toBe(413);
    expect(r.json.error.code).toBe('ERR_QUOTA_USER');
  });

  it('on ne soumet qu’un brouillon', async () => {
    const jeton = await creerCompte('auteur@ecole.ch');
    await deposerTuteur({ name: 'Socrate' }, { token: jeton });
    await patcher('Socrate', { action: 'submit' }, jeton);
    const r = await patcher('Socrate', { action: 'submit' }, jeton);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ERR_STATUS');
  });

  it('tuteur inconnu, action inconnue, suppression désactivée', async () => {
    const jeton = await creerCompte('auteur@ecole.ch');
    await deposerTuteur({ name: 'Socrate' }, { token: jeton });
    expect((await patcher('Inconnu', { action: 'edit' }, jeton)).status).toBe(404);
    const action = await patcher('Socrate', { action: 'effacer' }, jeton);
    expect(action.status).toBe(400);
    expect(action.json.error.code).toBe('ERR_ACTION_UNKNOWN');
    const suppr = await appeler(tuteur, { method: 'DELETE', query: { name: 'Socrate' }, token: jeton, ip: ipNeuve() });
    expect(suppr.status).toBe(403);
    expect(suppr.json.error.code).toBe('ERR_DELETE_DISABLED');
    expect(await ligne('Socrate')).toBeTruthy();
  });

  it('un tuteur archivé est figé', async () => {
    const jeton = await creerCompte('auteur@ecole.ch');
    await creerTuteur({ name: 'Socrate', status: 'draft', authorEmail: 'auteur@ecole.ch', archived: true });
    const r = await patcher('Socrate', { action: 'edit', body: CORPS_2 }, jeton);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ERR_ARCHIVED');
  });

  it('plus de 20 écritures par minute depuis une IP : 429', async () => {
    const jeton = await creerCompte('auteur@ecole.ch');
    await deposerTuteur({ name: 'Socrate' }, { token: jeton });
    const ip = ipNeuve();
    for (let i = 0; i < 20; i++) {
      const r = await appeler(tuteur, { method: 'PATCH', query: { name: 'Socrate' }, body: { description: `v${i}` }, token: jeton, ip });
      expect(r.status).toBe(200);
    }
    const r = await appeler(tuteur, { method: 'PATCH', query: { name: 'Socrate' }, body: { description: 'x' }, token: jeton, ip });
    expect(r.status).toBe(429);
  });
});
