// UC-20 — Tests fonctionnels (1/2) : porte-monnaie SANS PayPal configuré —
// l'environnement de test par défaut, et l'état réel du site à ce jour.
// Recharges et ajustements manuels du site, taux de contribution, lecture
// par l'école et par la personne ; toutes les routes de paiement répondent 503.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerEtablissement, creerCompte } from '../../helpers/db';

vi.mock('../../../src/server/mail', () => ({
  notifyAdmin: vi.fn(),
  sendVerificationCode: vi.fn(async () => {}),
  sendEmailChangeCode: vi.fn(async () => {}),
  sendEmailChangeWarning: vi.fn(),
}));

import credits from '../../../src/pages/api/admin/credits';
import meCredits from '../../../src/pages/api/me/credits';
import recharge from '../../../src/pages/api/paypal/recharge';
import webhook from '../../../src/pages/api/paypal/webhook';

let n = 0;
const ipNeuve = () => `198.51.100.${++n}`;

let ecoleA: number, ecoleB: number;
let jetonSuper: string, jetonDirA: string, jetonProfA: string, jetonPerso: string;

beforeEach(async () => {
  await viderBase();
  ecoleA = await creerEtablissement({ name: 'Collège A', contributionPct: 5 });
  ecoleB = await creerEtablissement({ name: 'Collège B' });
  jetonSuper = await creerCompte('super@educh.at');
  jetonDirA = await creerCompte('dir@a.ch', { etablissementId: ecoleA, schoolAdmin: true, teacher: true });
  jetonProfA = await creerCompte('prof@a.ch', { etablissementId: ecoleA, teacher: true });
  jetonPerso = await creerCompte('perso@x.ch');
});

const poster = (token: string, body: Record<string, unknown>) =>
  appeler(credits, { method: 'POST', token, body, ip: ipNeuve() });

describe('Scénario nominal : le site recharge une école, qui lit son porte-monnaie', () => {
  it('recharge 100 → contribution retenue (5 %), 95 crédités, registre à deux lignes', async () => {
    const r = await poster(jetonSuper, { etablissementId: ecoleA, montant: 100, genre: 'recharge', detail: 'Virement juillet' });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, solde: 95, commission: 5, credite: 95, pct: 5 });

    const lu = await appeler(credits, { method: 'GET', token: jetonDirA, ip: ipNeuve() });
    expect(lu.status).toBe(200);
    expect(lu.json).toMatchObject({ contributionMin: 3.5, contributionMax: 10, fraisPaypalPct: 3.5, paypalActif: false });
    expect(lu.json.comptes).toEqual([expect.objectContaining({ etablissementId: ecoleA, solde: 95, contributionPct: 5, aSec: false })]);
    expect(lu.json.mouvements.map((m: any) => [m.genre, m.montant, m.detail, m.par]).sort()).toEqual([
      ['ajustement', -5, 'Contribution aux frais (5 %)', 'super@educh.at'],
      ['recharge', 100, 'Virement juillet', 'super@educh.at'],
    ]);
  });

  it('le site voit toutes les écoles (celles à sec comprises), sans historique', async () => {
    const r = await appeler(credits, { method: 'GET', token: jetonSuper, ip: ipNeuve() });
    expect(r.json.comptes.map((c: any) => [c.etablissement, c.aSec])).toEqual([['Collège A', true], ['Collège B', true]]);
    expect(r.json.mouvements).toEqual([]);
  });
});

describe('Scénarios alternatifs', () => {
  it('A1 — petite recharge : le forfait de 0.50 l’emporte et le libellé le dit', async () => {
    await poster(jetonSuper, { action: 'contribution', etablissementId: ecoleB, pct: 3.5 });
    const r = await poster(jetonSuper, { etablissementId: ecoleB, montant: 10 });
    // 3,5 % de 10 = 0.35 < 0.50 : le forfait joue (soit 5 %).
    expect(r.json).toMatchObject({ commission: 0.5, credite: 9.5, pct: 3.5, solde: 9.5 });
    const m = (await base()).prepare("SELECT detail FROM credit_mouvements WHERE genre = 'ajustement'").get() as any;
    expect(m.detail).toBe('Contribution aux frais (forfait 0.50 CHF)');
  });

  it('A2 — ajustement manuel dans les deux sens ; une recharge négative est prise en valeur absolue', async () => {
    expect((await poster(jetonSuper, { etablissementId: ecoleA, montant: -20, genre: 'recharge' })).json.solde).toBe(19);
    const moins = await poster(jetonSuper, { etablissementId: ecoleA, montant: -4.5, genre: 'ajustement', detail: 'Erreur de saisie' });
    expect(moins.json).toEqual({ ok: true, solde: 14.5 });
    expect((await poster(jetonSuper, { etablissementId: ecoleA, montant: 0.5, genre: 'ajustement' })).json.solde).toBe(15);
  });

  it('A3 — l’école règle SON taux, borné entre 3,5 et 10 %', async () => {
    const r = await poster(jetonDirA, { action: 'contribution', pct: 2 });
    expect(r.json).toEqual({ ok: true, pct: 3.5 });
    expect((await poster(jetonDirA, { action: 'contribution', etablissementId: ecoleA, pct: 8 })).json.pct).toBe(8);
    expect((await poster(jetonSuper, { action: 'contribution', etablissementId: ecoleB, pct: 50 })).json.pct).toBe(10);
    const e = (await base()).prepare('SELECT id, contribution_pct AS p FROM etablissements ORDER BY id').all();
    expect(e).toEqual([{ id: ecoleA, p: 8 }, { id: ecoleB, p: 10 }]);
  });

  it('A4 — la personne lit son porte-monnaie : solde, bornes, forfait, sans cache partagé', async () => {
    (await base()).prepare('UPDATE users SET solde = 12 WHERE email = ?').run('perso@x.ch');
    const r = await appeler(meCredits, { method: 'GET', token: jetonPerso, ip: ipNeuve() });
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.json).toMatchObject({ ouvert: false, solde: 12, devise: 'CHF', contributionPct: 3.5, commissionPlancher: 0.5,
      paypalActif: false, fraisPaypalPct: 3.5, montantMin: 5, montantMax: 1000, commissionMin: 0.5, mouvements: [] });
  });

  it('A5 — l’interface demande d’abord si PayPal existe : non', async () => {
    const r = await appeler(recharge, { method: 'GET', token: jetonDirA, ip: ipNeuve() });
    expect(r.json).toEqual({ actif: false, environnement: null, devise: 'CHF' });
  });
});

describe('Scénarios d’erreur et droits', () => {
  it('sans rang d’administration : 403 sur /api/admin/credits et /api/paypal/recharge', async () => {
    for (const token of [undefined, jetonProfA, jetonPerso]) {
      expect((await appeler(credits, { method: 'GET', token, ip: ipNeuve() })).status).toBe(403);
      expect((await appeler(recharge, { method: 'GET', token, ip: ipNeuve() })).status).toBe(403);
    }
  });

  it('une école ne peut ni se créditer ni s’ajuster : 403 ERR_SUPER_ONLY', async () => {
    for (const genre of ['recharge', 'ajustement']) {
      const r = await poster(jetonDirA, { etablissementId: ecoleA, montant: 1000, genre });
      expect([r.status, r.json.error.code]).toEqual([403, 'ERR_SUPER_ONLY']);
    }
    expect(((await base()).prepare('SELECT solde FROM etablissements WHERE id = ?').get(ecoleA) as any).solde).toBe(0);
  });

  it('une école ne règle ni ne rembourse le porte-monnaie d’une autre : 403', async () => {
    for (const action of ['contribution', 'rembourser']) {
      const r = await poster(jetonDirA, { action, etablissementId: ecoleB, pct: 5 });
      expect([r.status, r.json.error.code]).toEqual([403, 'ERR_FORBIDDEN']);
    }
  });

  it('saisies invalides : école absente, montant nul ou non numérique, taux non numérique', async () => {
    expect((await poster(jetonSuper, { montant: 10 })).json.error.code).toBe('ERR_SCHOOL_UNKNOWN');
    for (const montant of [0, 'abc', null]) {
      const r = await poster(jetonSuper, { etablissementId: ecoleA, montant });
      expect([r.status, r.json.error.code]).toEqual([400, 'ERR_AMOUNT_INVALID']);
    }
    const t = await poster(jetonDirA, { action: 'contribution', pct: 'beaucoup' });
    expect([t.status, t.json.error.code]).toEqual([400, 'ERR_AMOUNT_INVALID']);
    // Le site sans école cible pour le taux : 403 (cible = 0).
    expect((await poster(jetonSuper, { action: 'contribution', pct: 5 })).status).toBe(403);
  });

  it('recharge ou ajustement manuel d’une école inexistante : 404 ERR_SCHOOL_UNKNOWN, rien n’est écrit', async () => {
    for (const genre of ['recharge', 'ajustement']) {
      const r = await poster(jetonSuper, { etablissementId: 9999, montant: 50, genre });
      expect([r.status, r.json.error.code]).toEqual([404, 'ERR_SCHOOL_UNKNOWN']);
    }
    expect((await base()).prepare('SELECT COUNT(*) AS n FROM credit_mouvements').get()).toEqual({ n: 0 });
  });

  it('PayPal éteint : recharge et remboursement répondent 503 ERR_PAYPAL_OFF, webhook 503', async () => {
    const a = await poster(jetonDirA, { action: 'rembourser' });
    const b = await appeler(recharge, { method: 'POST', token: jetonDirA, body: { montant: 50 }, ip: ipNeuve() });
    const c = await appeler(meCredits, { method: 'POST', token: jetonPerso, body: { montant: 20 }, ip: ipNeuve() });
    const d = await appeler(meCredits, { method: 'POST', token: jetonPerso, body: { action: 'rembourser' }, ip: ipNeuve() });
    for (const r of [a, b, c, d]) expect([r.status, r.json.error.code]).toEqual([503, 'ERR_PAYPAL_OFF']);
    const w = await appeler(webhook, { method: 'POST', rawBody: '{"event_type":"PAYMENT.CAPTURE.COMPLETED"}', ip: ipNeuve() });
    expect(w.status).toBe(503);
  });

  it('/api/me/credits : jeton absent ou compte effacé → 401 ; plus de 20 appels/min/IP → 429', async () => {
    expect((await appeler(meCredits, { method: 'GET', ip: ipNeuve() })).status).toBe(401);
    (await base()).prepare('DELETE FROM users WHERE email = ?').run('perso@x.ch');
    const efface = await appeler(meCredits, { method: 'GET', token: jetonPerso, ip: ipNeuve() });
    expect([efface.status, efface.json.error.code]).toEqual([401, 'ERR_AUTH_REQUIRED']);

    const ip = ipNeuve();
    for (let i = 0; i < 20; i++) expect((await appeler(meCredits, { method: 'GET', token: jetonDirA, ip })).status).toBe(200);
    const r = await appeler(meCredits, { method: 'GET', token: jetonDirA, ip });
    expect([r.status, r.json.error.code]).toEqual([429, 'ERR_RATE_LIMIT']);
  });

  it('méthodes non autorisées : 405', async () => {
    const a = await appeler(credits, { method: 'PUT', token: jetonSuper, ip: ipNeuve() });
    const b = await appeler(meCredits, { method: 'DELETE', token: jetonPerso, ip: ipNeuve() });
    const c = await appeler(recharge, { method: 'PUT', token: jetonSuper, ip: ipNeuve() });
    for (const r of [a, b, c]) { expect(r.status).toBe(405); expect(r.headers.allow).toEqual(['GET', 'POST']); }
    const w = await appeler(webhook, { method: 'GET', ip: ipNeuve() });
    expect(w.status).toBe(405);
    expect(w.headers.allow).toEqual(['POST']);
  });
});
