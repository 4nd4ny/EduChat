// UC-05 — Tests fonctionnels : « Gérer son identité » (GET/PUT /api/me).
// Lecture de l'identité et des rôles relus en base, personnalisation du nom
// d'affichage, bascule du consentement à la sauvegarde des conversations.
import { describe, it, expect, beforeEach } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerCompte, creerEtablissement, creerTuteur } from '../../helpers/db';

import me from '../../../src/pages/api/me';
import { issueToken } from '../../../src/server/token';

beforeEach(async () => {
  await viderBase();
});

describe('Scénario nominal : lire son identité', () => {
  it('rend l’adresse, le nom et les rôles lus en base', async () => {
    const jeton = await creerCompte('ada@ecole.ch', { name: 'Ada', teacher: true });
    const r = await appeler(me, { token: jeton });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({
      email: 'ada@ecole.ch',
      name: 'Ada',
      isPromptagogue: true,
      isTeacher: true,
      ecoles: [],
      ecoleActive: null,
      isAdmin: false,
      isSuper: false,
      gereTuteurs: false,
    });
  });

  it('les rôles sont relus en base : un rôle retiré après l’émission du jeton disparaît', async () => {
    const jeton = await creerCompte('b@ecole.ch', { name: 'B' });
    (await base()).prepare('UPDATE users SET is_promptagogue = 0 WHERE email = ?').run('b@ecole.ch');
    const r = await appeler(me, { token: jeton });
    expect(r.json.isPromptagogue).toBe(false);
  });

  it('le nom en base prime sur celui porté par le jeton', async () => {
    await creerCompte('c@ecole.ch', { name: 'Nom en base' });
    const r = await appeler(me, { token: issueToken('Nom du jeton', 'c@ecole.ch') });
    expect(r.json.name).toBe('Nom en base');
  });

  it('le super-administrateur est reconnu par SECRET_ADMIN_EMAILS', async () => {
    const jeton = await creerCompte('super@educh.at');
    const r = await appeler(me, { token: jeton });
    expect(r.json.isAdmin).toBe(true);
    expect(r.json.isSuper).toBe(true);
    expect(r.json.gereTuteurs).toBe(true);
  });
});

describe('Scénario alternatif : compte rattaché à plusieurs écoles', () => {
  it('liste les écoles (principale d’abord) et résout l’école active', async () => {
    const a = await creerEtablissement({ name: 'Collège A' });
    const b = await creerEtablissement({ name: 'Collège B' });
    const jeton = await creerCompte('prof@ecole.ch', { etablissementId: a, schoolAdmin: true, teacher: true });
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?, ?, 0, ?)')
      .run('prof@ecole.ch', b, Date.now() - 1e6);

    const r = await appeler(me, { token: jeton });
    expect(r.json.ecoles).toEqual([
      { id: a, name: 'Collège A', isAdmin: true, principale: true },
      { id: b, name: 'Collège B', isAdmin: false, principale: false },
    ]);
    expect(r.json.ecoleActive).toBe(a);
    expect(r.json.isAdmin).toBe(true);
    expect(r.json.isSuper).toBe(false);

    // Le navigateur choisit l'école B : il y est membre, sans rang d'admin.
    const rB = await appeler(me, { token: jeton, headers: { 'x-educhat-ecole': String(b) } });
    expect(rB.json.ecoleActive).toBe(b);
    expect(rB.json.isAdmin).toBe(false);
    // Enseignant, mais B n'est pas son école principale : pas de gestion des tuteurs.
    expect(rB.json.gereTuteurs).toBe(false);
  });

  it('une école annoncée dont le lien n’existe pas est corrigée par le serveur', async () => {
    const a = await creerEtablissement({ name: 'Collège A' });
    const autre = await creerEtablissement({ name: 'Autre collège' });
    const jeton = await creerCompte('e@ecole.ch', { etablissementId: a });
    const r = await appeler(me, { token: jeton, headers: { 'x-educhat-ecole': String(autre) } });
    expect(r.json.ecoleActive).toBe(a);
  });

  it('un enseignant de son école principale gère les tuteurs sans être administrateur', async () => {
    const a = await creerEtablissement();
    const jeton = await creerCompte('ens@ecole.ch', { etablissementId: a, teacher: true });
    const r = await appeler(me, { token: jeton });
    expect(r.json.isAdmin).toBe(false);
    expect(r.json.gereTuteurs).toBe(true);
  });
});

describe('Scénario nominal : personnaliser son nom', () => {
  it('enregistre le nom (rogné à 80 caractères) et le reporte sur ses tuteurs', async () => {
    const jeton = await creerCompte('auteur@ecole.ch', { name: 'Ancien' });
    await creerTuteur({ name: 'Tuteur-1', authorEmail: 'auteur@ecole.ch' });
    const long = '  ' + 'N'.repeat(100) + '  ';
    const r = await appeler(me, { method: 'PUT', token: jeton, body: { name: long } });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true });
    const db = await base();
    expect((db.prepare('SELECT name FROM users WHERE email=?').get('auteur@ecole.ch') as any).name).toBe('N'.repeat(80));
    expect((db.prepare('SELECT author_name FROM prompts WHERE name=?').get('Tuteur-1') as any).author_name).toBe('N'.repeat(80));
    expect((await appeler(me, { token: jeton })).json.name).toBe('N'.repeat(80));
  });

  it('un nom vide ramène au nom dérivé de l’adresse', async () => {
    const jeton = await creerCompte('marie.curie@ecole.ch', { name: 'Marie' });
    await appeler(me, { method: 'PUT', token: jeton, body: { name: '   ' } });
    const u = (await base()).prepare('SELECT name FROM users WHERE email=?').get('marie.curie@ecole.ch') as any;
    expect(u.name).toBe('marie.curie');
  });
});

describe('Scénario nominal : consentement à la sauvegarde', () => {
  it('donne puis retire le consentement', async () => {
    const jeton = await creerCompte('s@ecole.ch');
    const db = await base();
    await appeler(me, { method: 'PUT', token: jeton, body: { syncOptin: true } });
    expect((db.prepare('SELECT sync_optin FROM users WHERE email=?').get('s@ecole.ch') as any).sync_optin).toBe(1);
    await appeler(me, { method: 'PUT', token: jeton, body: { syncOptin: false } });
    expect((db.prepare('SELECT sync_optin FROM users WHERE email=?').get('s@ecole.ch') as any).sync_optin).toBe(0);
  });

  it('nom et consentement peuvent changer dans la même requête', async () => {
    const jeton = await creerCompte('t@ecole.ch');
    await appeler(me, { method: 'PUT', token: jeton, body: { syncOptin: true, name: 'Théo' } });
    const u = (await base()).prepare('SELECT name, sync_optin FROM users WHERE email=?').get('t@ecole.ch') as any;
    expect(u).toEqual({ name: 'Théo', sync_optin: 1 });
  });
});

describe('Scénarios d’erreur', () => {
  it('refuse sans jeton ou avec un jeton falsifié', async () => {
    expect((await appeler(me, {})).status).toBe(401);
    const r = await appeler(me, { token: 'abc.def' });
    expect(r.status).toBe(401);
    expect(r.json.error.code).toBe('ERR_AUTH_REQUIRED');
  });

  it('refuse une modification sans champ exploitable', async () => {
    const jeton = await creerCompte('u@ecole.ch');
    for (const body of [{}, { syncOptin: 'oui' }, { name: 42 }, undefined]) {
      const r = await appeler(me, { method: 'PUT', token: jeton, body });
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('ERR_PROFILE_INVALID');
    }
  });

  it('refuse les méthodes autres que GET et PUT', async () => {
    const r = await appeler(me, { method: 'DELETE' });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toEqual(['GET', 'PUT']);
  });

  it('un jeton valide dont le compte n’existe pas en base : identité du jeton, aucun rôle', async () => {
    // Comportement voulu (voir data.ts) : /api/me tolère un compte disparu.
    const r = await appeler(me, { token: issueToken('Fantôme', 'fantome@ecole.ch') });
    expect(r.status).toBe(200);
    expect(r.json.name).toBe('Fantôme');
    expect(r.json.isPromptagogue).toBe(false);
    // Et une modification n'écrit rien (verified_at IS NOT NULL), mais répond ok.
    const w = await appeler(me, { method: 'PUT', token: issueToken('Fantôme', 'fantome@ecole.ch'), body: { syncOptin: true } });
    expect(w.status).toBe(200);
    expect((await base()).prepare('SELECT 1 FROM users WHERE email=?').get('fantome@ecole.ch')).toBeUndefined();
  });
});
