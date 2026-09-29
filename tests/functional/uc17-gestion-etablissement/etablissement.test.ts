// UC-17 — Tests fonctionnels : « Administrer son établissement ».
// L'administrateur d'une école lit et règle SON école par les vraies routes :
// /api/etablissement (GET/PUT), l'action « catalogue » de
// /api/admin/etablissements, l'action « contribution » de /api/admin/credits
// et la vue d'école de /api/admin/tarifs. L'école active est annoncée par
// l'en-tête x-educhat-ecole et revérifiée par le serveur.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerCompte, creerEtablissement } from '../../helpers/db';

vi.mock('../../../src/server/mail', () => ({
  notifyAdmin: vi.fn(),
  sendVerificationCode: vi.fn(async () => {}),
  sendEmailChangeCode: vi.fn(async () => {}),
  sendEmailChangeWarning: vi.fn(),
}));

import etablissement from '../../../src/pages/api/etablissement';
import adminEtablissements from '../../../src/pages/api/admin/etablissements';
import credits from '../../../src/pages/api/admin/credits';
import tarifs from '../../../src/pages/api/admin/tarifs';

// Chaque appel a sa propre IP : le PUT est limité à 10 par minute et par IP.
let n = 0;
const ipNeuve = () => `198.51.100.${(++n % 250) + 1}`;
const ecole = (id: number) => ({ 'x-educhat-ecole': String(id) });

const ligneEtab = async (id: number) =>
  (await base()).prepare('SELECT * FROM etablissements WHERE id = ?').get(id) as any;

const HORAIRES = [{ day: 1, start: '08:00', end: '17:00' }, { day: 3, start: '08:00', end: '12:00' }];

let a: number;
let b: number;
let dir: string;   // administrateur de A (école principale)
let prof: string;  // enseignant rattaché à A, sans rang

beforeEach(async () => {
  await viderBase();
  a = await creerEtablissement({ name: 'Collège A', ips: '192.0.2.10', quotaEleve: 1000, quotaMensuel: 50000 });
  b = await creerEtablissement({ name: 'Collège B', ips: '192.0.2.20' });
  dir = await creerCompte('dir@a.ch', { teacher: true, etablissementId: a, schoolAdmin: true });
  prof = await creerCompte('prof@a.ch', { teacher: true, etablissementId: a });
});

describe('Scénario nominal : l’administrateur lit puis règle son école', () => {
  it('GET rend les réglages, la consommation du mois et le rang tranché en base', async () => {
    (await base()).prepare(`INSERT INTO usage_log (ts, etablissement_id, provider, tokens, used_server_key)
      VALUES (?, ?, 'mistral', 1234, 1)`).run(Date.now(), a);
    const r = await appeler(etablissement, { token: dir, headers: ecole(a), ip: ipNeuve() });
    expect(r.status).toBe(200);
    expect(r.json.isAdmin).toBe(true);
    expect(r.json.etablissement).toEqual({
      name: 'Collège A', ips: '192.0.2.10', respire: false, hours: [],
      quotaPerStudentDaily: 1000, tokenQuotaMonthly: 50000, atelierPromptagogue: false,
    });
    expect(r.json.usage.monthTokens).toBe(1234);
    // Aucune clé serveur en test : la ligne consommée reste, marquée « non servie ».
    expect(r.json.usage.byProvider).toEqual([{ provider: 'mistral', requests: 1, tokens: 1234, servi: false }]);
  });

  it('PUT enregistre horaires, quotas et atelier, relus par le GET suivant', async () => {
    const put = await appeler(etablissement, {
      method: 'PUT', token: dir, headers: ecole(a), ip: ipNeuve(),
      body: { hours: HORAIRES, quotaPerStudentDaily: 20000, tokenQuotaMonthly: 3000000, atelierPromptagogue: true },
    });
    expect(put.status).toBe(200);
    expect(put.json).toEqual({ ok: true });
    const r = await appeler(etablissement, { token: dir, headers: ecole(a), ip: ipNeuve() });
    expect(r.json.etablissement.hours).toEqual(HORAIRES);
    expect(r.json.etablissement.quotaPerStudentDaily).toBe(20000);
    expect(r.json.etablissement.tokenQuotaMonthly).toBe(3000000);
    expect(r.json.etablissement.atelierPromptagogue).toBe(true);
  });

  it('PUT ne touche ni aux IP, ni à RESPIRE, ni au fournisseur, ni à la facturation', async () => {
    await appeler(etablissement, {
      method: 'PUT', token: dir, headers: ecole(a), ip: ipNeuve(),
      body: { hours: [], ips: '6.6.6.6', respire: true, activeProvider: 'anthropic', billingEmail: 'x@y.z', name: 'Pirate' },
    });
    const e = await ligneEtab(a);
    expect([e.name, e.ips, e.respire, e.active_provider, e.billing_email]).toEqual(['Collège A', '192.0.2.10', 0, '', '']);
  });
});

describe('Scénario alternatif : enseignant rattaché, en lecture seule', () => {
  it('lit son école avec isAdmin=false mais ne peut pas l’enregistrer', async () => {
    const r = await appeler(etablissement, { token: prof, headers: ecole(a), ip: ipNeuve() });
    expect(r.status).toBe(200);
    expect(r.json.isAdmin).toBe(false);
    const put = await appeler(etablissement, {
      method: 'PUT', token: prof, headers: ecole(a), ip: ipNeuve(), body: { hours: HORAIRES },
    });
    expect(put.status).toBe(403);
    expect(put.json.error.code).toBe('ERR_NOT_SCHOOL_ADMIN');
    expect((await ligneEtab(a)).hours).toBe('');
  });
});

describe('Scénario alternatif : compte multi-écoles et école active', () => {
  it('l’administrateur de deux écoles règle celle que désigne l’en-tête, et elle seule', async () => {
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,1,?)')
      .run('dir@a.ch', b, Date.now());
    const lu = await appeler(etablissement, { token: dir, headers: ecole(b), ip: ipNeuve() });
    expect(lu.json.etablissement.name).toBe('Collège B');
    await appeler(etablissement, {
      method: 'PUT', token: dir, headers: ecole(b), ip: ipNeuve(),
      body: { hours: HORAIRES, quotaPerStudentDaily: 5 },
    });
    expect((await ligneEtab(b)).quota_per_student_daily).toBe(5);
    expect((await ligneEtab(a)).quota_per_student_daily).toBe(1000);
  });

  it('une école annoncée mais non liée est ignorée : retour à l’école principale', async () => {
    const r = await appeler(etablissement, { token: dir, headers: ecole(b), ip: ipNeuve() });
    expect(r.status).toBe(200);
    expect(r.json.etablissement.name).toBe('Collège A');
    await appeler(etablissement, { method: 'PUT', token: dir, headers: ecole(b), ip: ipNeuve(), body: { quotaPerStudentDaily: 7 } });
    expect((await ligneEtab(a)).quota_per_student_daily).toBe(7);
    expect((await ligneEtab(b)).quota_per_student_daily).toBe(0);
  });

  it('administrateur de A mais simple membre de B : B active → aucun accès', async () => {
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,0,?)')
      .run('dir@a.ch', b, Date.now());
    const r = await appeler(etablissement, { token: dir, headers: ecole(b), ip: ipNeuve() });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ERR_NO_ETABLISSEMENT');
  });
});

describe('Droits', () => {
  it('sans jeton : 401', async () => {
    const r = await appeler(etablissement, { ip: ipNeuve() });
    expect(r.status).toBe(401);
    expect(r.json.error.code).toBe('ERR_AUTH_REQUIRED');
  });
  it('compte sans école : 403', async () => {
    const t = await creerCompte('seul@x.ch', { teacher: true });
    const r = await appeler(etablissement, { token: t, ip: ipNeuve() });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ERR_NO_ETABLISSEMENT');
  });
  it('case « enseignant » + lien gagné par l’IP de l’école : 403 (ni lecture ni écriture)', async () => {
    const t = await creerCompte('eleve@a.ch', { teacher: true });
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,0,?)')
      .run('eleve@a.ch', a, Date.now());
    const r = await appeler(etablissement, { token: t, headers: ecole(a), ip: ipNeuve() });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ERR_NO_ETABLISSEMENT');
  });
  it('venir de l’IP de l’école ne remplace pas le jeton', async () => {
    const r = await appeler(etablissement, { ip: '192.0.2.10' });
    expect(r.status).toBe(401);
  });
});

describe('Scénarios d’erreur', () => {
  it('créneau invalide : 400 ERR_HOURS_INVALID et rien n’est écrit', async () => {
    for (const slot of [
      { day: 7, start: '08:00', end: '09:00' },
      { day: 1, start: '10:00', end: '09:00' },
      { day: 1, start: '8:00', end: '09:00' },
      { day: 1, start: '08:00', end: '24:00' },
    ]) {
      const r = await appeler(etablissement, {
        method: 'PUT', token: dir, headers: ecole(a), ip: ipNeuve(),
        body: { hours: [slot], quotaPerStudentDaily: 1 },
      });
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('ERR_HOURS_INVALID');
    }
    expect((await ligneEtab(a)).quota_per_student_daily).toBe(1000);
  });

  it('quotas bornés : négatif → 0, illisible → 0, excessif → plafond', async () => {
    await appeler(etablissement, {
      method: 'PUT', token: dir, headers: ecole(a), ip: ipNeuve(),
      body: { quotaPerStudentDaily: 1e12, tokenQuotaMonthly: -5 },
    });
    let e = await ligneEtab(a);
    expect([e.quota_per_student_daily, e.token_quota_monthly]).toEqual([10_000_000, 0]);
    await appeler(etablissement, {
      method: 'PUT', token: dir, headers: ecole(a), ip: ipNeuve(),
      body: { quotaPerStudentDaily: 'beaucoup', tokenQuotaMonthly: 1e15 },
    });
    e = await ligneEtab(a);
    expect([e.quota_per_student_daily, e.token_quota_monthly]).toEqual([0, 10_000_000_000]);
  });

  it('au-delà de 30 créneaux, les suivants sont ignorés', async () => {
    const hours = Array.from({ length: 35 }, (_, i) => ({ day: i % 7, start: '08:00', end: `${String(9 + (i % 10)).padStart(2, '0')}:00` }));
    await appeler(etablissement, { method: 'PUT', token: dir, headers: ecole(a), ip: ipNeuve(), body: { hours } });
    expect(JSON.parse((await ligneEtab(a)).hours)).toHaveLength(30);
  });

  it('plus de 10 enregistrements par minute depuis une IP : 429', async () => {
    const ip = '198.51.100.251';
    for (let i = 0; i < 10; i++) {
      const r = await appeler(etablissement, { method: 'PUT', token: dir, headers: ecole(a), ip, body: {} });
      expect(r.status).toBe(200);
    }
    const r = await appeler(etablissement, { method: 'PUT', token: dir, headers: ecole(a), ip, body: {} });
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe('ERR_RATE_LIMIT');
  });

  it('méthode non autorisée : 405 avec Allow', async () => {
    const r = await appeler(etablissement, { method: 'DELETE', token: dir, headers: ecole(a), ip: ipNeuve() });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toEqual(['GET', 'PUT']);
  });
});

describe('Règle : l’atelier ne bouge que si le corps en parle', () => {
  it('un PUT sans atelierPromptagogue le laisse ouvert', async () => {
    (await base()).prepare('UPDATE etablissements SET atelier_promptagogue = 1 WHERE id = ?').run(a);
    await appeler(etablissement, { method: 'PUT', token: dir, headers: ecole(a), ip: ipNeuve(), body: { hours: HORAIRES } });
    expect((await ligneEtab(a)).atelier_promptagogue).toBe(1);
    await appeler(etablissement, { method: 'PUT', token: dir, headers: ecole(a), ip: ipNeuve(), body: { atelierPromptagogue: false } });
    expect((await ligneEtab(a)).atelier_promptagogue).toBe(0);
  });

  it('corrigé : un PUT partiel ne touche plus horaires et quotas absents du corps', async () => {
    // Avant correction (voir la fiche UC-17), seuls l'atelier bénéficiait de la
    // règle « présence du champ » : horaires et quotas absents étaient lus comme
    // [] et 0 et rendaient l'école illimitée.
    await appeler(etablissement, {
      method: 'PUT', token: dir, headers: ecole(a), ip: ipNeuve(),
      body: { hours: HORAIRES, quotaPerStudentDaily: 20000, tokenQuotaMonthly: 3000000 },
    });
    await appeler(etablissement, { method: 'PUT', token: dir, headers: ecole(a), ip: ipNeuve(), body: { atelierPromptagogue: true } });
    const e = await ligneEtab(a);
    expect(e.atelier_promptagogue).toBe(1);
    expect(JSON.parse(e.hours)).toEqual(HORAIRES);
    expect([e.quota_per_student_daily, e.token_quota_monthly]).toEqual([20000, 3000000]);
  });

  it('non-régression : chaque champ présent s’écrit seul, et une valeur vide EXPLICITE lève bien la limite', async () => {
    await appeler(etablissement, {
      method: 'PUT', token: dir, headers: ecole(a), ip: ipNeuve(),
      body: { hours: HORAIRES, quotaPerStudentDaily: 20000, tokenQuotaMonthly: 3000000 },
    });
    await appeler(etablissement, { method: 'PUT', token: dir, headers: ecole(a), ip: ipNeuve(), body: { tokenQuotaMonthly: 0 } });
    let e = await ligneEtab(a);
    expect([e.quota_per_student_daily, e.token_quota_monthly]).toEqual([20000, 0]);
    expect(JSON.parse(e.hours)).toEqual(HORAIRES);
    await appeler(etablissement, { method: 'PUT', token: dir, headers: ecole(a), ip: ipNeuve(), body: { hours: [] } });
    e = await ligneEtab(a);
    expect(JSON.parse(e.hours)).toEqual([]);
    expect(e.quota_per_student_daily).toBe(20000);
  });

  it('non-régression : un corps vide ne modifie rien', async () => {
    await appeler(etablissement, {
      method: 'PUT', token: dir, headers: ecole(a), ip: ipNeuve(),
      body: { hours: HORAIRES, quotaPerStudentDaily: 20000, tokenQuotaMonthly: 3000000, atelierPromptagogue: true },
    });
    const avant = await ligneEtab(a);
    const r = await appeler(etablissement, { method: 'PUT', token: dir, headers: ecole(a), ip: ipNeuve(), body: {} });
    expect(r.status).toBe(200);
    expect(await ligneEtab(a)).toEqual(avant);
  });
});

describe('Catalogue ouvert (POST /api/admin/etablissements, action « catalogue »)', () => {
  it('l’administrateur ouvre le catalogue de SON école, quel que soit l’id envoyé', async () => {
    const r = await appeler(adminEtablissements, {
      method: 'POST', token: dir, headers: ecole(a), body: { action: 'catalogue', id: b, catalogueOuvert: true },
    });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, id: a });
    expect((await ligneEtab(a)).catalogue_ouvert).toBe(1);
    expect((await ligneEtab(b)).catalogue_ouvert).toBe(0);
    await appeler(adminEtablissements, { method: 'POST', token: dir, headers: ecole(a), body: { action: 'catalogue', catalogueOuvert: false } });
    expect((await ligneEtab(a)).catalogue_ouvert).toBe(0);
  });
  it('l’enseignant sans rang est refusé', async () => {
    const r = await appeler(adminEtablissements, {
      method: 'POST', token: prof, headers: ecole(a), body: { action: 'catalogue', catalogueOuvert: true },
    });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ERR_FORBIDDEN');
  });
  it('l’administrateur d’école ne lit que sa ligne et ne peut rien régler d’autre', async () => {
    const lu = await appeler(adminEtablissements, { token: dir, headers: ecole(a) });
    expect(lu.json.etablissements.map((e: any) => e.id)).toEqual([a]);
    const r = await appeler(adminEtablissements, {
      method: 'POST', token: dir, headers: ecole(a), body: { id: a, name: 'Collège A', respire: true },
    });
    expect(r.status).toBe(403);
    expect((await ligneEtab(a)).respire).toBe(0);
  });
});

describe('Contribution aux frais (POST /api/admin/credits, action « contribution »)', () => {
  it('l’administrateur choisit un taux, borné entre 3.5 et 10 %', async () => {
    let r = await appeler(credits, { method: 'POST', token: dir, headers: ecole(a), body: { action: 'contribution', pct: 7 } });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, pct: 7 });
    r = await appeler(credits, { method: 'POST', token: dir, headers: ecole(a), body: { action: 'contribution', pct: 25 } });
    expect(r.json.pct).toBe(10);
    r = await appeler(credits, { method: 'POST', token: dir, headers: ecole(a), body: { action: 'contribution', pct: 1 } });
    expect(r.json.pct).toBe(3.5);
    expect((await ligneEtab(a)).contribution_pct).toBe(3.5);
  });
  it('taux illisible : 400 ; école d’autrui ou enseignant sans rang : 403', async () => {
    const illisible = await appeler(credits, { method: 'POST', token: dir, headers: ecole(a), body: { action: 'contribution', pct: 'cinq' } });
    expect(illisible.status).toBe(400);
    expect(illisible.json.error.code).toBe('ERR_AMOUNT_INVALID');
    const autrui = await appeler(credits, { method: 'POST', token: dir, headers: ecole(a), body: { action: 'contribution', pct: 5, etablissementId: b } });
    expect(autrui.status).toBe(403);
    expect((await ligneEtab(b)).contribution_pct).toBe(-1);
    const ens = await appeler(credits, { method: 'POST', token: prof, headers: ecole(a), body: { action: 'contribution', pct: 5 } });
    expect(ens.status).toBe(403);
  });
});

describe('Tarif de l’école (GET /api/admin/tarifs?portee=ecole)', () => {
  it('rend le fournisseur actif réglé par le site, sans échelle tant que la sonde n’a rien relevé', async () => {
    (await base()).prepare("UPDATE etablissements SET active_provider = 'mistral' WHERE id = ?").run(a);
    const r = await appeler(tarifs, { token: dir, headers: ecole(a), query: { portee: 'ecole' } });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ providerActif: 'mistral', echelle: null });
    const site = await appeler(tarifs, { token: dir, headers: ecole(a) });
    expect(site.status).toBe(403);
    expect(site.json.error.code).toBe('ERR_SUPER_ONLY');
  });
});
