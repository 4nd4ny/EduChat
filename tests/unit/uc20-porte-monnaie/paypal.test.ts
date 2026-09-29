// UC-20 — Tests unitaires : la recharge par PayPal (src/server/paypal.ts).
// PayPal est remplacé par une doublure du fetch global (fauxPaypal.ts) ; la
// configuration étant lue au chargement du module, on la pose puis on
// recharge les modules (tests/helpers/env.ts).
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { poserEnv } from '../../helpers/env';
import { viderBase, creerEtablissement, creerCompte, base } from '../../helpers/db';
import { installerFauxPaypal, ENV_PAYPAL, evenementCapture, evenementRemboursement, type FauxPaypal } from './fauxPaypal';

type ModPaypal = typeof import('../../../src/server/paypal');
type ModPM = typeof import('../../../src/server/porteMonnaie');

async function charger(env: Record<string, string | undefined>): Promise<{ pp: ModPaypal; pm: ModPM }> {
  poserEnv(env);
  return {
    pp: await import('../../../src/server/paypal'),
    pm: await import('../../../src/server/porteMonnaie'),
  };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('configuration', () => {
  it('éteint sans identifiants, ou s’il en manque un seul (webhook compris)', async () => {
    expect((await charger({ ...ENV_PAYPAL, SECRET_PAYPAL_CLIENT_ID: undefined })).pp.paypalActif()).toBe(false);
    expect((await charger({ ...ENV_PAYPAL, SECRET_PAYPAL_WEBHOOK_ID: undefined })).pp.paypalActif()).toBe(false);
    expect((await charger(ENV_PAYPAL)).pp.paypalActif()).toBe(true);
  });

  it('bac à sable par défaut, production seulement avec SECRET_PAYPAL_ENV=live', async () => {
    expect((await charger(ENV_PAYPAL)).pp.paypalEnvironnement()).toBe('sandbox');
    const { pp } = await charger({ ...ENV_PAYPAL, SECRET_PAYPAL_ENV: 'live' });
    expect(pp.paypalEnvironnement()).toBe('live');
    await viderBase();
    const id = await creerEtablissement();
    const f = installerFauxPaypal();
    await pp.creerRecharge({ genre: 'ecole', id }, 20, 'x');
    expect(f.espion.mock.calls.every(c => String(c[0]).startsWith('https://api-m.paypal.com/'))).toBe(true);
  });
});

describe('avec PayPal allumé (bac à sable doublé)', () => {
  let pp: ModPaypal, pm: ModPM, f: FauxPaypal, ecole: number;

  beforeAll(async () => { ({ pp, pm } = await charger(ENV_PAYPAL)); });
  beforeEach(async () => {
    await viderBase();
    f = installerFauxPaypal();
    ecole = await creerEtablissement({ contributionPct: 5 });
    await creerCompte('p@x.ch');
  });

  const intention = async (orderId: string) =>
    (await base()).prepare('SELECT * FROM recharges WHERE order_id = ?').get(orderId) as any;

  describe('creerRecharge', () => {
    it('école : commande en CHF, montant tronqué au centime, repère etab:ID, intention écrite AVANT', async () => {
      const r = await pp.creerRecharge(pm.titulaireEcole(ecole), 10.999, 'dir@a.ch');
      expect(r.orderId).toBe('ORDER-1');
      expect(r.approbation).toContain('checkoutnow?token=ORDER-1');
      expect(f.commandes[0].intent).toBe('CAPTURE');
      expect(f.commandes[0].purchase_units[0]).toMatchObject({ amount: { currency_code: 'CHF', value: '10.99' }, custom_id: `etab:${ecole}` });
      expect(await intention('ORDER-1')).toMatchObject({ etablissement_id: ecole, titulaire_email: null, montant: 10.99, devise: 'CHF', etat: 'attente', par: 'dir@a.ch' });
    });
    it('personne : sentinelle 0 + adresse dans l’intention, AUCUNE adresse envoyée à PayPal', async () => {
      await pp.creerRecharge(pm.titulaireCompte('p@x.ch'), 20, 'p@x.ch');
      expect(f.commandes[0].purchase_units[0].custom_id).toBe('compte');
      expect(JSON.stringify(f.commandes[0])).not.toContain('p@x.ch');
      expect(await intention('ORDER-1')).toMatchObject({ etablissement_id: 0, titulaire_email: 'p@x.ch', montant: 20 });
    });
    it('montant hors limites : refusé sans appeler PayPal', async () => {
      for (const m of [0, -5, 0.001, 100_000.01, NaN]) {
        await expect(pp.creerRecharge(pm.titulaireEcole(ecole), m, 'x')).rejects.toThrow('Montant hors limites');
      }
      expect(f.espion).not.toHaveBeenCalled();
    });
    it('panne PayPal : l’erreur remonte et aucune intention n’est écrite', async () => {
      f.panneCommande = true;
      await expect(pp.creerRecharge(pm.titulaireEcole(ecole), 20, 'x')).rejects.toThrow(/HTTP 500/);
      expect((await base()).prepare('SELECT COUNT(*) AS n FROM recharges').get()).toEqual({ n: 0 });
    });
  });

  describe('verifierSignature', () => {
    it('renvoie le corps brut tel quel, avec les en-têtes et l’identifiant du webhook', async () => {
      const brut = '{"id":"WH-1",  "event_type":"X"}';
      const ok = await pp.verifierSignature({
        'paypal-transmission-id': 'T1', 'paypal-transmission-time': '2026-07-01T00:00:00Z',
        'paypal-cert-url': 'https://api.paypal.com/cert', 'paypal-auth-algo': 'SHA256withRSA', 'paypal-transmission-sig': 'SIG',
      }, brut);
      expect(ok).toBe(true);
      expect(f.verifications[0]).toContain(`"webhook_event":${brut}}`); // octet pour octet
      expect(JSON.parse(f.verifications[0])).toMatchObject({ transmission_id: 'T1', transmission_sig: 'SIG', webhook_id: 'WH-TEST' });
    });
    it('FAILURE ou erreur HTTP : faux, jamais d’exception', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      f.signature = 'FAILURE';
      expect(await pp.verifierSignature({}, '{}')).toBe(false);
      f.signature = 'HTTP500';
      expect(await pp.verifierSignature({}, '{}')).toBe(false);
    });
  });

  describe('traiterEvenement — paiement reçu', () => {
    it('crédite le montant RELU chez PayPal, puis retient la contribution', async () => {
      const { orderId } = await pp.creerRecharge(pm.titulaireEcole(ecole), 100, 'dir@a.ch');
      f.captures.set('CAP-1', { value: '100.00', currency_code: 'CHF', status: 'COMPLETED' });
      const v = await pp.traiterEvenement(evenementCapture('CAP-1', orderId));
      expect(v).toEqual({ creditee: true, raison: 'Solde 95.00 CHF.', montant: 100 });
      expect(pm.soldeDe(pm.titulaireEcole(ecole))).toBe(95);
      const m = pm.mouvements(pm.titulaireEcole(ecole));
      expect(m.map(x => [x.genre, x.montant, x.par]).sort()).toEqual([['ajustement', -5, 'paypal'], ['recharge', 100, 'paypal']]);
      expect(m.find(x => x.genre === 'ajustement')!.detail).toBe('Contribution aux frais (5 %) — CAP-1');
      expect(await intention(orderId)).toMatchObject({ etat: 'creditee', capture_id: 'CAP-1' });
    });
    it('une personne est créditée d’après l’intention, au plancher de 3,5 % (ou au forfait)', async () => {
      const { orderId } = await pp.creerRecharge(pm.titulaireCompte('p@x.ch'), 10, 'p@x.ch');
      f.captures.set('CAP-P', { value: '10.00', currency_code: 'CHF', status: 'COMPLETED' });
      await pp.traiterEvenement(evenementCapture('CAP-P', orderId));
      expect(pm.soldeDe(pm.titulaireCompte('p@x.ch'))).toBe(9.5);
      expect(pm.mouvements(pm.titulaireCompte('p@x.ch')).some(x => x.detail.startsWith('Contribution aux frais (forfait 0.50 CHF)'))).toBe(true);
    });
    it('rejouée : l’index UNIQUE refuse le doublon', async () => {
      const { orderId } = await pp.creerRecharge(pm.titulaireEcole(ecole), 50, 'x');
      f.captures.set('CAP-2', { value: '50.00', currency_code: 'CHF', status: 'COMPLETED' });
      await pp.traiterEvenement(evenementCapture('CAP-2', orderId));
      const v = await pp.traiterEvenement(evenementCapture('CAP-2', orderId));
      expect(v).toEqual({ creditee: false, raison: 'Déjà créditée (idempotence).' });
      expect(pm.soldeDe(pm.titulaireEcole(ecole))).toBe(47.5);
    });
    it('refuse : sans identifiant, sans intention, capture non aboutie, devise différente', async () => {
      expect((await pp.traiterEvenement({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: {} })).raison).toBe('Notification sans identifiant.');
      expect((await pp.traiterEvenement(evenementCapture('CAP-X', 'ORDER-INCONNU'))).raison).toBe('Aucune intention pour la commande ORDER-INCONNU.');
      const { orderId } = await pp.creerRecharge(pm.titulaireEcole(ecole), 50, 'x');
      f.captures.set('CAP-3', { value: '50.00', currency_code: 'CHF', status: 'PENDING' });
      expect((await pp.traiterEvenement(evenementCapture('CAP-3', orderId))).raison).toBe('Capture non aboutie (PENDING).');
      f.captures.set('CAP-4', { value: '50.00', currency_code: 'USD', status: 'COMPLETED' });
      expect((await pp.traiterEvenement(evenementCapture('CAP-4', orderId))).raison).toBe('Devise USD ≠ CHF : rien n\'est crédité.');
      expect(pm.soldeDe(pm.titulaireEcole(ecole))).toBe(0);
    });
    it('ANOMALIE : un titulaire disparu est confondu avec un doublon — l’argent reçu n’est crédité nulle part', async () => {
      const { orderId } = await pp.creerRecharge(pm.titulaireCompte('p@x.ch'), 20, 'p@x.ch');
      (await base()).prepare('DELETE FROM users WHERE email = ?').run('p@x.ch');
      f.captures.set('CAP-5', { value: '20.00', currency_code: 'CHF', status: 'COMPLETED' });
      const v = await pp.traiterEvenement(evenementCapture('CAP-5', orderId));
      expect(v).toEqual({ creditee: false, raison: 'Déjà créditée (idempotence).' });
      expect((await intention(orderId)).etat).toBe('attente');
    });
  });

  describe('traiterEvenement — remboursement, annulation, litige', () => {
    async function crediter(orderMontant: number, cap: string) {
      const { orderId } = await pp.creerRecharge(pm.titulaireEcole(ecole), orderMontant, 'x');
      f.captures.set(cap, { value: orderMontant.toFixed(2), currency_code: 'CHF', status: 'COMPLETED' });
      await pp.traiterEvenement(evenementCapture(cap, orderId));
      return orderId;
    }
    it('reprend le montant de la recharge (le solde peut passer sous zéro), une seule fois', async () => {
      const orderId = await crediter(100, 'CAP-R');
      pm.bouger(pm.titulaireEcole(ecole), 'consommation', -50);
      const v = await pp.traiterEvenement(evenementRemboursement('CAP-R'));
      expect(v).toEqual({ creditee: false, raison: 'Repris. Solde -55.00 CHF.' });
      expect(await intention(orderId)).toMatchObject({ etat: 'reprise' });
      expect((await pp.traiterEvenement(evenementRemboursement('CAP-R'))).raison).toBe('Reprise déjà enregistrée.');
      expect(pm.soldeDe(pm.titulaireEcole(ecole))).toBe(-55);
    });
    it('litige : la capture se lit dans disputed_transactions', async () => {
      await crediter(20, 'CAP-D');
      const v = await pp.traiterEvenement({ event_type: 'CUSTOMER.DISPUTE.CREATED',
        resource: { id: 'PP-D-1', disputed_transactions: [{ seller_transaction_id: 'CAP-D' }] } });
      expect(v.raison).toMatch(/^Repris/);
    });
    it('capture inconnue, type ignoré', async () => {
      expect((await pp.traiterEvenement(evenementRemboursement('CAP-?', 'PAYMENT.CAPTURE.REVERSED'))).raison).toBe('Aucune recharge connue pour CAP-?.');
      expect((await pp.traiterEvenement({ event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: 'O' } })).raison)
        .toBe('Événement ignoré (CHECKOUT.ORDER.APPROVED).');
    });
  });

  describe('rembourser', () => {
    async function crediter(t: ReturnType<ModPM['titulaireEcole']> | ReturnType<ModPM['titulaireCompte']>, montant: number, cap: string) {
      const { orderId } = await pp.creerRecharge(t, montant, 'x');
      f.captures.set(cap, { value: montant.toFixed(2), currency_code: 'CHF', status: 'COMPLETED' });
      await pp.traiterEvenement(evenementCapture(cap, orderId));
      (await base()).prepare('UPDATE recharges SET credite_at = ? WHERE capture_id = ?').run(Number(cap.replace(/\D/g, '')), cap);
    }
    it('rend le solde moins 3,5 % de frais, capture par capture de la plus récente à la plus ancienne', async () => {
      await crediter(pm.titulaireEcole(ecole), 100, 'CAP-1');  // crédite 95
      await crediter(pm.titulaireEcole(ecole), 20, 'CAP-2');   // crédite 19
      const r = await pp.rembourser(pm.titulaireEcole(ecole), 'dir@a.ch');
      // Solde 114 → 110.01 à rendre (114 × 0.965), 3.99 de frais.
      expect(r).toEqual({ rembourse: 110.01, devise: 'CHF', detail: 'CAP-2:20.00 · CAP-1:90.01' });
      expect(f.remboursements).toEqual([
        { capture: 'CAP-2', value: '20.00', currency_code: 'CHF' }, { capture: 'CAP-1', value: '90.01', currency_code: 'CHF' }]);
      expect(pm.soldeDe(pm.titulaireEcole(ecole))).toBe(0);
    });
    it('ce que PayPal refuse de rendre revient au porte-monnaie', async () => {
      await crediter(pm.titulaireEcole(ecole), 100, 'CAP-1');
      f.refusRemboursement.add('CAP-1');
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const r = await pp.rembourser(pm.titulaireEcole(ecole), 'dir@a.ch');
      expect(r).toEqual({ rembourse: 0, devise: 'CHF', detail: 'aucune capture remboursable' });
      expect(pm.soldeDe(pm.titulaireEcole(ecole))).toBe(91.67); // 95 − 95 + 91.67 : les frais restent acquis
    });
    it('une personne ne pioche que dans SES captures', async () => {
      await crediter(pm.titulaireEcole(ecole), 100, 'CAP-1');
      await crediter(pm.titulaireCompte('p@x.ch'), 50, 'CAP-2'); // crédite 48.25
      const r = await pp.rembourser(pm.titulaireCompte('p@x.ch'), 'p@x.ch');
      expect(f.remboursements.map(x => x.capture)).toEqual(['CAP-2']);
      expect(r.rembourse).toBe(46.56);
      expect(pm.soldeDe(pm.titulaireEcole(ecole))).toBe(95);
    });
    it('rien à rembourser : solde nul ou négatif', async () => {
      await expect(pp.rembourser(pm.titulaireEcole(ecole), 'x')).rejects.toThrow('Aucun crédit à rembourser.');
      pm.bouger(pm.titulaireEcole(ecole), 'ajustement', 0.01);
      await expect(pp.rembourser(pm.titulaireEcole(ecole), 'x')).rejects.toThrow('Montant trop faible après frais.');
    });
  });
});
