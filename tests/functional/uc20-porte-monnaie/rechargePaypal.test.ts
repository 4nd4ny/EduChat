// UC-20 — Tests fonctionnels (2/2) : recharge et remboursement PAR PAYPAL, de
// bout en bout. PayPal est allumé par l'environnement (identifiants fictifs de
// bac à sable) et remplacé par une doublure du fetch global : ouverture de la
// commande par la vraie route, notification signée reçue par le vrai webhook
// (corps brut), montant redemandé à « PayPal », crédit au registre.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { appeler, type ApiHandler } from '../../helpers/api';
import { poserEnv } from '../../helpers/env';
import { viderBase, base, creerEtablissement, creerCompte } from '../../helpers/db';
import {
  installerFauxPaypal, ENV_PAYPAL, evenementCapture, evenementRemboursement, rembourserDepuisPaypal, type FauxPaypal,
} from '../../unit/uc20-porte-monnaie/fauxPaypal';

vi.mock('../../../src/server/mail', () => ({
  notifyAdmin: vi.fn(),
  sendVerificationCode: vi.fn(async () => {}),
  sendEmailChangeCode: vi.fn(async () => {}),
  sendEmailChangeWarning: vi.fn(),
}));

let credits: ApiHandler, meCredits: ApiHandler, recharge: ApiHandler, webhook: ApiHandler;

beforeAll(async () => {
  // La configuration PayPal est lue au chargement : on la pose, puis on charge les routes.
  poserEnv(ENV_PAYPAL);
  credits = (await import('../../../src/pages/api/admin/credits')).default;
  meCredits = (await import('../../../src/pages/api/me/credits')).default;
  recharge = (await import('../../../src/pages/api/paypal/recharge')).default;
  webhook = (await import('../../../src/pages/api/paypal/webhook')).default;
});

let n = 0;
const ipNeuve = () => `192.0.2.${++n}`;

let f: FauxPaypal;
let ecoleA: number, ecoleB: number;
let jetonSuper: string, jetonDirA: string, jetonPerso: string;

beforeEach(async () => {
  await viderBase();
  f = installerFauxPaypal();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  ecoleA = await creerEtablissement({ name: 'Collège A', contributionPct: 5 });
  ecoleB = await creerEtablissement({ name: 'Collège B' });
  jetonSuper = await creerCompte('super@educh.at');
  jetonDirA = await creerCompte('dir@a.ch', { etablissementId: ecoleA, schoolAdmin: true, teacher: true });
  jetonPerso = await creerCompte('perso@x.ch');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const ENTETES_SIGNATURE = {
  'paypal-transmission-id': 'T-1', 'paypal-transmission-time': '2026-07-15T10:00:00Z',
  'paypal-cert-url': 'https://api.sandbox.paypal.com/cert', 'paypal-auth-algo': 'SHA256withRSA',
  'paypal-transmission-sig': 'SIGNATURE',
};
const notifier = (evenement: unknown, brut = JSON.stringify(evenement)) =>
  appeler(webhook, { method: 'POST', rawBody: brut, headers: ENTETES_SIGNATURE, ip: ipNeuve() });

const soldeEcole = async (id: number) =>
  ((await base()).prepare('SELECT solde FROM etablissements WHERE id = ?').get(id) as any).solde;
const soldePerso = async (email: string) =>
  ((await base()).prepare('SELECT solde FROM users WHERE email = ?').get(email) as any).solde;

describe('Scénario nominal : une école recharge par PayPal', () => {
  it('commande → approbation → notification signée → crédit du montant relu, contribution retenue', async () => {
    const etat = await appeler(recharge, { method: 'GET', token: jetonDirA, ip: ipNeuve() });
    expect(etat.json).toEqual({ actif: true, environnement: 'sandbox', devise: 'CHF' });

    const r = await appeler(recharge, { method: 'POST', token: jetonDirA, body: { montant: 200 }, ip: ipNeuve() });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, orderId: 'ORDER-1', approbation: expect.stringContaining('token=ORDER-1') });

    // Le payeur approuve chez PayPal ; PayPal capture 200 CHF et notifie.
    f.captures.set('CAP-A', { value: '200.00', currency_code: 'CHF', status: 'COMPLETED' });
    const w = await notifier(evenementCapture('CAP-A', 'ORDER-1', '99999.00')); // montant annoncé forgé
    expect(w.status).toBe(200);
    expect(w.json).toEqual({ ok: true });
    // Le corps brut a été renvoyé tel quel à la vérification de signature.
    expect(f.verifications[0]).toContain(JSON.stringify(evenementCapture('CAP-A', 'ORDER-1', '99999.00')));

    expect(await soldeEcole(ecoleA)).toBe(190);
    const lu = await appeler(credits, { method: 'GET', token: jetonDirA, ip: ipNeuve() });
    expect(lu.json.paypalActif).toBe(true);
    expect(lu.json.comptes[0].solde).toBe(190);
    expect(lu.json.mouvements.map((m: any) => m.detail).sort()).toEqual(['Contribution aux frais (5 %) — CAP-A', 'PayPal CAP-A']);
  });

  it('une notification rejouée ne crédite pas deux fois (200 pour PayPal)', async () => {
    await appeler(recharge, { method: 'POST', token: jetonDirA, body: { montant: 50 }, ip: ipNeuve() });
    f.captures.set('CAP-B', { value: '50.00', currency_code: 'CHF', status: 'COMPLETED' });
    expect((await notifier(evenementCapture('CAP-B', 'ORDER-1'))).status).toBe(200);
    expect((await notifier(evenementCapture('CAP-B', 'ORDER-1'))).status).toBe(200);
    expect(await soldeEcole(ecoleA)).toBe(47.5);
  });
});

describe('Scénarios alternatifs', () => {
  it('A1 — le site ouvre une recharge pour l’école qu’il désigne', async () => {
    const r = await appeler(recharge, { method: 'POST', token: jetonSuper, body: { montant: 10, etablissementId: ecoleB }, ip: ipNeuve() });
    expect(r.status).toBe(200);
    const i = (await base()).prepare('SELECT etablissement_id, par FROM recharges').get();
    expect(i).toEqual({ etablissement_id: ecoleB, par: 'super@educh.at' });
  });

  it('A2 — une personne recharge son porte-monnaie, le lit, puis se fait rembourser', async () => {
    const r = await appeler(meCredits, { method: 'POST', token: jetonPerso, body: { montant: 20 }, ip: ipNeuve() });
    expect(r.json).toMatchObject({ ok: true, orderId: 'ORDER-1' });
    f.captures.set('CAP-P', { value: '20.00', currency_code: 'CHF', status: 'COMPLETED' });
    await notifier(evenementCapture('CAP-P', 'ORDER-1'));

    const lu = await appeler(meCredits, { method: 'GET', token: jetonPerso, ip: ipNeuve() });
    expect(lu.json).toMatchObject({ ouvert: true, solde: 19.3, paypalActif: true, aSec: false });
    expect(lu.json.mouvements).toHaveLength(2);

    const rb = await appeler(meCredits, { method: 'POST', token: jetonPerso, body: { action: 'rembourser' }, ip: ipNeuve() });
    expect(rb.status).toBe(200);
    // 19.30 × (1 − 3,5 %) = 18.6245 → 18.62 rendus, vers la capture d'origine.
    expect(rb.json).toEqual({ ok: true, rembourse: 18.62, devise: 'CHF', detail: 'CAP-P:18.62' });
    expect(f.remboursements).toEqual([{ capture: 'CAP-P', value: '18.62', currency_code: 'CHF' }]);
    expect(await soldePerso('perso@x.ch')).toBe(0);
  });

  it('A3 — l’administrateur d’école demande le remboursement du crédit de SON école', async () => {
    await appeler(recharge, { method: 'POST', token: jetonDirA, body: { montant: 100 }, ip: ipNeuve() });
    f.captures.set('CAP-E', { value: '100.00', currency_code: 'CHF', status: 'COMPLETED' });
    await notifier(evenementCapture('CAP-E', 'ORDER-1'));
    const r = await appeler(credits, { method: 'POST', token: jetonDirA, body: { action: 'rembourser' }, ip: ipNeuve() });
    expect(r.json).toMatchObject({ ok: true, rembourse: 91.67 });
    expect(await soldeEcole(ecoleA)).toBe(0);
  });

  it('A4 — remboursement contesté (litige, annulation) : le solde est repris et peut passer sous zéro', async () => {
    await appeler(recharge, { method: 'POST', token: jetonDirA, body: { montant: 100 }, ip: ipNeuve() });
    f.captures.set('CAP-L', { value: '100.00', currency_code: 'CHF', status: 'COMPLETED' });
    await notifier(evenementCapture('CAP-L', 'ORDER-1'));
    (await base()).prepare('UPDATE etablissements SET solde = 10 WHERE id = ?').run(ecoleA); // l'école a consommé
    expect((await notifier(evenementRemboursement('CAP-L', 'PAYMENT.CAPTURE.REVERSED'))).status).toBe(200);
    expect(await soldeEcole(ecoleA)).toBe(-90);
    expect(((await base()).prepare('SELECT etat FROM recharges').get() as any).etat).toBe('reprise');
  });

  it('corrigé — un remboursement DEMANDÉ puis notifié par PayPal ne débite pas une seconde fois', async () => {
    // rembourser() vide le solde ; la notification PAYMENT.CAPTURE.REFUNDED que
    // PayPal envoie ensuite pour ce même remboursement est reconnue (trace au
    // registre sous l'id du remboursement, repère custom_id) et acquittée.
    await appeler(meCredits, { method: 'POST', token: jetonPerso, body: { montant: 20 }, ip: ipNeuve() });
    f.captures.set('CAP-X', { value: '20.00', currency_code: 'CHF', status: 'COMPLETED' });
    await notifier(evenementCapture('CAP-X', 'ORDER-1'));
    await appeler(meCredits, { method: 'POST', token: jetonPerso, body: { action: 'rembourser' }, ip: ipNeuve() });
    expect(await soldePerso('perso@x.ch')).toBe(0);
    expect((await notifier(evenementRemboursement('CAP-X'))).status).toBe(200);
    expect(await soldePerso('perso@x.ch')).toBe(0);
    expect((await notifier(evenementRemboursement('CAP-X'))).status).toBe(200); // rejouée : toujours rien
    expect(await soldePerso('perso@x.ch')).toBe(0);
  });

  it('A5 — remboursement partiel fait depuis PayPal : seul le montant remboursé est repris', async () => {
    await appeler(recharge, { method: 'POST', token: jetonDirA, body: { montant: 100 }, ip: ipNeuve() });
    f.captures.set('CAP-Q', { value: '100.00', currency_code: 'CHF', status: 'COMPLETED' });
    await notifier(evenementCapture('CAP-Q', 'ORDER-1'));
    rembourserDepuisPaypal(f, 'CAP-Q', '25.00');
    expect((await notifier(evenementRemboursement('CAP-Q'))).status).toBe(200);
    expect(await soldeEcole(ecoleA)).toBe(70);
  });
});

describe('Scénarios d’erreur', () => {
  it('signature refusée : 400, rien n’est crédité', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await appeler(recharge, { method: 'POST', token: jetonDirA, body: { montant: 50 }, ip: ipNeuve() });
    f.captures.set('CAP-S', { value: '50.00', currency_code: 'CHF', status: 'COMPLETED' });
    f.signature = 'FAILURE';
    expect((await notifier(evenementCapture('CAP-S', 'ORDER-1'))).status).toBe(400);
    f.signature = 'HTTP500';
    expect((await notifier(evenementCapture('CAP-S', 'ORDER-1'))).status).toBe(400);
    expect(await soldeEcole(ecoleA)).toBe(0);
  });

  it('corps illisible (400), trop volumineux (413), capture introuvable chez PayPal (500, PayPal réessaiera)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await notifier(null, '{pas du json')).status).toBe(400);
    expect((await notifier(null, 'x'.repeat(300 * 1024))).status).toBe(413);
    await appeler(recharge, { method: 'POST', token: jetonDirA, body: { montant: 50 }, ip: ipNeuve() });
    expect((await notifier(evenementCapture('CAP-FANTOME', 'ORDER-1'))).status).toBe(500);
  });

  it('paiement reçu pour un compte effacé entre-temps : 500 (PayPal réessaiera), intention « orpheline », administration alertée', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { notifyAdmin } = await import('../../../src/server/mail');
    (notifyAdmin as any).mockClear();
    await appeler(meCredits, { method: 'POST', token: jetonPerso, body: { montant: 20 }, ip: ipNeuve() });
    (await base()).prepare('DELETE FROM users WHERE email = ?').run('perso@x.ch');
    f.captures.set('CAP-O', { value: '20.00', currency_code: 'CHF', status: 'COMPLETED' });
    expect((await notifier(evenementCapture('CAP-O', 'ORDER-1'))).status).toBe(500);
    expect(((await base()).prepare('SELECT etat FROM recharges').get() as any).etat).toBe('orpheline');
    expect(notifyAdmin).toHaveBeenCalledTimes(1);
  });

  it('devise différente ou capture non aboutie : compris (200) mais rien n’est crédité', async () => {
    await appeler(recharge, { method: 'POST', token: jetonDirA, body: { montant: 50 }, ip: ipNeuve() });
    f.captures.set('CAP-U', { value: '50.00', currency_code: 'USD', status: 'COMPLETED' });
    f.captures.set('CAP-W', { value: '50.00', currency_code: 'CHF', status: 'PENDING' });
    expect((await notifier(evenementCapture('CAP-U', 'ORDER-1'))).status).toBe(200);
    expect((await notifier(evenementCapture('CAP-W', 'ORDER-1'))).status).toBe(200);
    expect(await soldeEcole(ecoleA)).toBe(0);
  });

  it('une école ne recharge que la sienne ; le site doit nommer une école', async () => {
    const autre = await appeler(recharge, { method: 'POST', token: jetonDirA, body: { montant: 50, etablissementId: ecoleB }, ip: ipNeuve() });
    expect([autre.status, autre.json.error.code]).toEqual([403, 'ERR_FORBIDDEN']);
    const sansEcole = await appeler(recharge, { method: 'POST', token: jetonSuper, body: { montant: 50 }, ip: ipNeuve() });
    expect(sansEcole.status).toBe(403);
    expect(f.commandes).toEqual([]);
  });

  it('bornes des montants : école 10 à 100 000, personne 5 à 1 000', async () => {
    for (const montant of [9.99, 100_000.01, 'dix']) {
      const r = await appeler(recharge, { method: 'POST', token: jetonDirA, body: { montant }, ip: ipNeuve() });
      expect([r.status, r.json.error.code]).toEqual([400, 'ERR_AMOUNT_INVALID']);
    }
    for (const montant of [4.99, 1000.01, undefined]) {
      const r = await appeler(meCredits, { method: 'POST', token: jetonPerso, body: { montant }, ip: ipNeuve() });
      expect([r.status, r.json.error.code]).toEqual([400, 'ERR_AMOUNT_INVALID']);
    }
    expect(f.commandes).toEqual([]);
  });

  it('PayPal en panne à la création de la commande : 502 ERR_PAYPAL_UPSTREAM', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    f.panneCommande = true;
    const a = await appeler(recharge, { method: 'POST', token: jetonDirA, body: { montant: 50 }, ip: ipNeuve() });
    const b = await appeler(meCredits, { method: 'POST', token: jetonPerso, body: { montant: 50 }, ip: ipNeuve() });
    for (const r of [a, b]) expect([r.status, r.json.error.code]).toEqual([502, 'ERR_PAYPAL_UPSTREAM']);
  });

  it('remboursement sans crédit : 502 ERR_REFUND_FAILED', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = await appeler(meCredits, { method: 'POST', token: jetonPerso, body: { action: 'rembourser' }, ip: ipNeuve() });
    const b = await appeler(credits, { method: 'POST', token: jetonDirA, body: { action: 'rembourser' }, ip: ipNeuve() });
    for (const r of [a, b]) expect([r.status, r.json.error.code]).toEqual([502, 'ERR_REFUND_FAILED']);
  });
});
