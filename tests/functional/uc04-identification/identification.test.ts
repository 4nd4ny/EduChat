// UC-04 — Tests fonctionnels : « Créer un compte ou se reconnecter par un code
// reçu par email ». Enchaîne les vraies routes /api/verify/request puis
// /api/verify/confirm ; seul l'envoi du courriel est doublé pour capturer le
// code et le lien.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerEtablissement, creerCompte } from '../../helpers/db';

const envois: Array<{ email: string; code: string; lien: string }> = [];
const notifications: string[] = [];
vi.mock('../../../src/server/mail', () => ({
  sendVerificationCode: vi.fn(async (email: string, _name: string, code: string, lien: string) => {
    envois.push({ email, code, lien });
  }),
  notifyAdmin: vi.fn((sujet: string) => { notifications.push(sujet); }),
}));

import demander from '../../../src/pages/api/verify/request';
import confirmer from '../../../src/pages/api/verify/confirm';
import { verifyToken } from '../../../src/server/token';

// Chaque test a sa propre adresse IP : les limiteurs de débit sont par IP.
let n = 0;
const ipNeuve = () => `203.0.113.${++n}`;

beforeEach(async () => {
  await viderBase();
  envois.length = 0;
  notifications.length = 0;
});

async function demanderCode(email: string, extra: Record<string, unknown> = {}, ip = ipNeuve()) {
  const r = await appeler(demander, { method: 'POST', body: { email, ...extra }, ip });
  expect(r.status).toBe(200);
  expect(r.json).toEqual({ ok: true });
  return envois[envois.length - 1];
}

describe('Scénario nominal : inscription par code recopié', () => {
  it('crée un compte promptagogue et renvoie un jeton valide', async () => {
    const envoi = await demanderCode('Marie.Curie@Ecole.ch');
    expect(envoi.email).toBe('marie.curie@ecole.ch');
    expect(envoi.code).toMatch(/^\d{3}-\d{3}$/);

    const r = await appeler(confirmer, {
      method: 'POST', ip: ipNeuve(),
      body: { email: 'marie.curie@ecole.ch', code: envoi.code.replace('-', ' ') },
    });
    expect(r.status).toBe(200);
    expect(r.json.email).toBe('marie.curie@ecole.ch');
    expect(r.json.name).toBe('marie.curie'); // nom dérivé de la partie locale
    expect(verifyToken(r.json.token)?.email).toBe('marie.curie@ecole.ch');

    const user = (await base()).prepare('SELECT * FROM users WHERE email = ?').get('marie.curie@ecole.ch') as any;
    expect(user.is_promptagogue).toBe(1);
    expect(user.verified_at).toBeGreaterThan(0);
    expect(notifications.some(s => s.startsWith('Nouveau compte'))).toBe(true);
  });

  it('le code est à usage unique', async () => {
    const envoi = await demanderCode('a@ecole.ch');
    const body = { email: 'a@ecole.ch', code: envoi.code };
    expect((await appeler(confirmer, { method: 'POST', body, ip: ipNeuve() })).status).toBe(200);
    const rejeu = await appeler(confirmer, { method: 'POST', body, ip: ipNeuve() });
    expect(rejeu.status).toBe(400);
    expect(rejeu.json.error.code).toBe('ERR_CODE_EXPIRED');
  });
});

describe('Scénario alternatif : confirmation par le lien du courriel', () => {
  it('le lien ouvre le compte et transporte les choix (sync, enseignant)', async () => {
    const envoi = await demanderCode('prof@ecole.ch', { syncOptin: false, isTeacher: true });
    const r = await appeler(confirmer, { method: 'POST', body: { lien: envoi.lien }, ip: ipNeuve() });
    expect(r.status).toBe(200);
    expect(r.json.sync).toBe(false);
    expect(r.json.teacher).toBe(true);
    const user = (await base()).prepare('SELECT is_teacher, sync_optin FROM users WHERE email=?').get('prof@ecole.ch') as any;
    expect(user).toEqual({ is_teacher: 1, sync_optin: 0 });
  });

  it('un lien rejoué, périmé par un nouvel envoi ou falsifié répond toujours la même erreur', async () => {
    const premier = await demanderCode('b@ecole.ch');
    const second = await demanderCode('b@ecole.ch');
    const perime = await appeler(confirmer, { method: 'POST', body: { lien: premier.lien }, ip: ipNeuve() });
    const falsifie = await appeler(confirmer, { method: 'POST', body: { lien: second.lien + 'x' }, ip: ipNeuve() });
    expect((await appeler(confirmer, { method: 'POST', body: { lien: second.lien }, ip: ipNeuve() })).status).toBe(200);
    const rejoue = await appeler(confirmer, { method: 'POST', body: { lien: second.lien }, ip: ipNeuve() });
    for (const r of [perime, falsifie, rejoue]) {
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('ERR_LIEN_INVALIDE');
    }
  });
});

describe('Scénarios d’erreur', () => {
  it('refuse une adresse au format invalide', async () => {
    const r = await appeler(demander, { method: 'POST', body: { email: 'pas-une-adresse' }, ip: ipNeuve() });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('ERR_EMAIL_INVALID');
  });

  it('refuse un code mal formé, puis un code faux, et bloque après 5 essais', async () => {
    const envoi = await demanderCode('c@ecole.ch');
    const mal = await appeler(confirmer, { method: 'POST', body: { email: 'c@ecole.ch', code: '12' }, ip: ipNeuve() });
    expect(mal.json.error.code).toBe('ERR_CODE_INVALID');
    const faux = envoi.code === '000-000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const r = await appeler(confirmer, { method: 'POST', body: { email: 'c@ecole.ch', code: faux }, ip: ipNeuve() });
      expect(r.status).toBe(401);
      expect(r.json.error.code).toBe('ERR_CODE_WRONG');
    }
    // Même le bon code est désormais refusé.
    const bloque = await appeler(confirmer, { method: 'POST', body: { email: 'c@ecole.ch', code: envoi.code }, ip: ipNeuve() });
    expect(bloque.status).toBe(429);
    expect(bloque.json.error.code).toBe('ERR_TOO_MANY_ATTEMPTS');
  });

  it('plus de 3 envois par heure pour une adresse : réponse identique, mais aucun code envoyé', async () => {
    for (let i = 0; i < 3; i++) await demanderCode('d@ecole.ch');
    const r = await appeler(demander, { method: 'POST', body: { email: 'd@ecole.ch' }, ip: ipNeuve() });
    expect(r.json).toEqual({ ok: true });
    expect(envois.filter(e => e.email === 'd@ecole.ch')).toHaveLength(3);
  });

  it('au-delà de 5 demandes par minute depuis une IP : réponse identique, aucun envoi', async () => {
    const ip = ipNeuve();
    for (let i = 0; i < 5; i++) await demanderCode(`e${i}@ecole.ch`, {}, ip);
    const r = await appeler(demander, { method: 'POST', body: { email: 'e9@ecole.ch' }, ip });
    expect(r.json).toEqual({ ok: true });
    expect(envois.some(e => e.email === 'e9@ecole.ch')).toBe(false);
  });

  it('refuse les méthodes autres que POST', async () => {
    expect((await appeler(demander, { method: 'GET' })).status).toBe(405);
    expect((await appeler(confirmer, { method: 'GET' })).status).toBe(405);
  });
});

describe('Règles métier sur un compte existant', () => {
  it('une re-vérification ne rétablit pas un rôle retiré et ne renomme pas le compte', async () => {
    await creerCompte('f@ecole.ch', { name: 'Nom choisi', promptagogue: false });
    const envoi = await demanderCode('f@ecole.ch', { isTeacher: true });
    const r = await appeler(confirmer, { method: 'POST', body: { email: 'f@ecole.ch', code: envoi.code, isTeacher: true }, ip: ipNeuve() });
    expect(r.status).toBe(200);
    const user = (await base()).prepare('SELECT * FROM users WHERE email=?').get('f@ecole.ch') as any;
    expect(user.name).toBe('Nom choisi');
    expect(user.is_promptagogue).toBe(0);
    expect(user.is_teacher).toBe(0);
    expect(notifications.some(s => s.startsWith('Demande de rôle enseignant'))).toBe(true);
  });

  it('vérifier depuis le réseau d’une école y rattache le compte, sans droit d’administration', async () => {
    const id = await creerEtablissement({ name: 'Collège du Lac', ips: '198.51.100.7' });
    const envoi = await demanderCode('g@ecole.ch');
    const r = await appeler(confirmer, { method: 'POST', body: { email: 'g@ecole.ch', code: envoi.code }, ip: '198.51.100.7' });
    expect(r.json.ecole).toEqual({ id, name: 'Collège du Lac', nouvelle: true });
    const lien = (await base()).prepare('SELECT is_admin FROM user_etablissements WHERE email=?').get('g@ecole.ch') as any;
    expect(lien.is_admin).toBe(0);
    // Deuxième passage : déjà rattaché, rien de nouveau.
    const envoi2 = await demanderCode('g@ecole.ch');
    const r2 = await appeler(confirmer, { method: 'POST', body: { email: 'g@ecole.ch', code: envoi2.code }, ip: '198.51.100.7' });
    expect(r2.json.ecole.nouvelle).toBe(false);
  });
});
