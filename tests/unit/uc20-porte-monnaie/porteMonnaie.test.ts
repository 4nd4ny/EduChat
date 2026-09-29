// UC-20 — Tests unitaires : le porte-monnaie d'une école ou d'une personne
// (src/server/porteMonnaie.ts).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { viderBase, creerEtablissement, creerCompte, base } from '../../helpers/db';
import {
  titulaireEcole, titulaireCompte, contributionDe, reglerContribution, coutAuTarif, commissionRecharge,
  detailCommission, partParticipation, soldeDe, aDuCredit, aUnPorteMonnaie, bouger, decompter, tarifDuModele,
  mouvements, etatDuCompte, etatDesComptes, CONTRIBUTION_MIN, CONTRIBUTION_MAX, COMMISSION_MIN, DETAIL_COMMISSION,
  type TarifApplique,
} from '../../../src/server/porteMonnaie';

beforeEach(async () => { await viderBase(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const tarif = (entree: number, sortie: number, repli = ''): TarifApplique =>
  ({ provider: 'anthropic', modele: 'claude-haiku', entree, sortie, repli, at: Date.now() });

async function prixModele(provider: string, modele: string, entree: number, sortie: number, devise = 'CHF') {
  (await base()).prepare(`INSERT INTO tarifs_modeles (provider, modele, prix_entree_mtok, prix_sortie_mtok, devise, source, updated_at)
    VALUES (?, ?, ?, ?, ?, '', ?)`).run(provider, modele, entree, sortie, devise, Date.now());
}

describe('titulaires et sentinelle etablissement_id = 0', () => {
  it('une école écrit son id sans adresse ; une personne écrit 0 et son adresse', async () => {
    const id = await creerEtablissement();
    await creerCompte('eleve@x.ch');
    bouger(titulaireEcole(id), 'recharge', 10);
    bouger(titulaireCompte('eleve@x.ch'), 'recharge', 5);
    const lignes = (await base()).prepare('SELECT etablissement_id, titulaire_email, montant FROM credit_mouvements ORDER BY id').all();
    expect(lignes).toEqual([
      { etablissement_id: id, titulaire_email: null, montant: 10 },
      { etablissement_id: 0, titulaire_email: 'eleve@x.ch', montant: 5 },
    ]);
  });

  it('mouvements() d’une école ignore les lignes personnelles, et inversement', async () => {
    const id = await creerEtablissement();
    await creerCompte('p@x.ch');
    bouger(titulaireEcole(id), 'recharge', 10, 'école');
    bouger(titulaireCompte('p@x.ch'), 'recharge', 5, 'perso');
    expect(mouvements(titulaireEcole(id)).map(m => m.detail)).toEqual(['école']);
    expect(mouvements(titulaireCompte('p@x.ch')).map(m => m.detail)).toEqual(['perso']);
  });

  it('mouvements() : du plus récent au plus ancien, borné par la limite', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const id = await creerEtablissement();
    for (let i = 1; i <= 3; i++) { vi.setSystemTime(1_000_000 * i); bouger(titulaireEcole(id), 'recharge', i, `m${i}`); }
    expect(mouvements(titulaireEcole(id), 2).map(m => [m.detail, m.solde])).toEqual([['m3', 6], ['m2', 3]]);
  });
});

describe('contribution', () => {
  it('une personne paie toujours le plancher (3,5 %)', () => {
    expect(contributionDe(titulaireCompte('p@x.ch'))).toBe(CONTRIBUTION_MIN);
  });
  it('une école : son choix borné entre 3,5 et 10, sinon le réglage du serveur', async () => {
    const choisi = await creerEtablissement({ contributionPct: 6 });
    const bas = await creerEtablissement({ contributionPct: 1 });
    const haut = await creerEtablissement({ contributionPct: 40 });
    const defaut = await creerEtablissement();
    expect(contributionDe(titulaireEcole(choisi))).toBe(6);
    expect(contributionDe(titulaireEcole(bas))).toBe(3.5);
    expect(contributionDe(titulaireEcole(haut))).toBe(10);
    expect(contributionDe(titulaireEcole(defaut))).toBe(10);
  });
  it('reglerContribution borne et écrit le taux', async () => {
    const id = await creerEtablissement();
    expect(reglerContribution(id, 2)).toBe(CONTRIBUTION_MIN);
    expect(reglerContribution(id, 99)).toBe(CONTRIBUTION_MAX);
    expect(reglerContribution(id, 7.5)).toBe(7.5);
    expect(contributionDe(titulaireEcole(id))).toBe(7.5);
  });
});

describe('commissionRecharge / detailCommission', () => {
  it('pourcentage quand il dépasse le forfait', async () => {
    const id = await creerEtablissement({ contributionPct: 5 });
    expect(commissionRecharge(titulaireEcole(id), 100)).toEqual({ commission: 5, credite: 95, pct: 5, plancher: false });
  });
  it('forfait de 0.50 sur une petite recharge, et il est dit', () => {
    const c = commissionRecharge(titulaireCompte('p@x.ch'), 10);
    expect(c).toEqual({ commission: COMMISSION_MIN, credite: 9.5, pct: 3.5, plancher: true });
    expect(detailCommission(c, 'CHF')).toBe('Contribution aux frais (forfait 0.50 CHF)');
    expect(detailCommission({ pct: 5, commission: 5, plancher: false }, 'CHF')).toBe('Contribution aux frais (5 %)');
    expect(detailCommission(c, 'CHF').startsWith(DETAIL_COMMISSION)).toBe(true);
  });
  it('la commission monte au centime, le crédit descend', async () => {
    const id = await creerEtablissement({ contributionPct: 5 });
    expect(commissionRecharge(titulaireEcole(id), 33.33)).toMatchObject({ commission: 1.67, credite: 31.66 });
  });
  it('partParticipation isole la part d’un taux dans un coût (arrondi vers le haut)', () => {
    expect(partParticipation(1.1, 10)).toBe(0.1);
    expect(partParticipation(1, 10)).toBe(0.10);
  });
});

describe('coutAuTarif', () => {
  it('entrée et sortie à leur propre prix, arrondi vers le haut au centime', () => {
    expect(coutAuTarif({ entree: 1, sortie: 5 }, 1_000_000, 1_000_000)).toBe(6);
    expect(coutAuTarif({ entree: 1, sortie: 5 }, 1000, 1000)).toBe(0.01); // 0.006 → 0.01
    expect(coutAuTarif({ entree: 3, sortie: 3 }, 1_000_000, 0)).toBe(3);   // pas de 3.01 par bruit flottant
  });
  it('le taux optionnel ne sert qu’aux simulations', () => {
    expect(coutAuTarif({ entree: 10, sortie: 10 }, 1_000_000, 0, 10)).toBe(11);
  });
});

describe('aDuCredit / soldeDe / aUnPorteMonnaie', () => {
  it('strictement positif : 0 et négatif ferment l’accès', async () => {
    const zero = await creerEtablissement({ solde: 0 });
    const un = await creerEtablissement({ solde: 0.01 });
    const neg = await creerEtablissement({ solde: -2 });
    expect([aDuCredit(titulaireEcole(zero)), aDuCredit(titulaireEcole(un)), aDuCredit(titulaireEcole(neg))])
      .toEqual([false, true, false]);
  });
  it('RESPIRE : toujours ouvert, même à zéro ; une personne n’a jamais d’exonération', async () => {
    const r = await creerEtablissement({ respire: true, solde: 0 });
    await creerCompte('p@x.ch', { solde: 0 });
    expect(aDuCredit(titulaireEcole(r))).toBe(true);
    expect(aDuCredit(titulaireCompte('p@x.ch'))).toBe(false);
  });
  it('titulaire inconnu : pas de crédit, solde 0', () => {
    expect(aDuCredit(titulaireEcole(999))).toBe(false);
    expect(aDuCredit(titulaireCompte('inconnu@x.ch'))).toBe(false);
    expect(soldeDe(titulaireCompte('inconnu@x.ch'))).toBe(0);
  });
  it('aUnPorteMonnaie : vrai dès le premier mouvement, et le reste', async () => {
    await creerCompte('p@x.ch');
    expect(aUnPorteMonnaie('p@x.ch')).toBe(false);
    bouger(titulaireCompte('p@x.ch'), 'recharge', 5);
    bouger(titulaireCompte('p@x.ch'), 'ajustement', -5);
    expect(aUnPorteMonnaie('p@x.ch')).toBe(true);
  });
});

describe('bouger — registre et solde dans la même transaction', () => {
  it('un crédit descend au centime, un débit monte', async () => {
    const id = await creerEtablissement();
    expect(bouger(titulaireEcole(id), 'recharge', 10.129)).toBe(10.12);
    expect(bouger(titulaireEcole(id), 'consommation', -0.001)).toBe(10.11);
    expect(soldeDe(titulaireEcole(id))).toBe(10.11);
    expect(mouvements(titulaireEcole(id)).map(m => m.montant).sort()).toEqual([-0.01, 10.12]);
  });
  it('le mouvement porte le solde APRÈS, le détail borné à 200 caractères et son auteur', async () => {
    await creerCompte('p@x.ch', { solde: 3 });
    bouger(titulaireCompte('p@x.ch'), 'ajustement', 2, 'd'.repeat(300), 'super@educh.at');
    const [m] = mouvements(titulaireCompte('p@x.ch'));
    expect(m).toMatchObject({ solde: 5, genre: 'ajustement', par: 'super@educh.at' });
    expect(m.detail.length).toBe(200);
  });
  it('un titulaire introuvable lève, et rien n’est écrit', async () => {
    expect(() => bouger(titulaireEcole(404), 'recharge', 10)).toThrow(/introuvable/);
    expect(() => bouger(titulaireCompte('fantome@x.ch'), 'recharge', 10)).toThrow(/introuvable/);
    expect((await base()).prepare('SELECT COUNT(*) AS n FROM credit_mouvements').get()).toEqual({ n: 0 });
  });
  it('paypal_id UNIQUE : un second mouvement de même identifiant échoue en bloc, solde compris', async () => {
    const id = await creerEtablissement();
    await creerCompte('p@x.ch');
    bouger(titulaireEcole(id), 'recharge', 10, 'PayPal', 'paypal', 'CAP-1');
    expect(() => bouger(titulaireEcole(id), 'recharge', 10, 'PayPal', 'paypal', 'CAP-1')).toThrow();
    // L'index est commun aux deux titulaires.
    expect(() => bouger(titulaireCompte('p@x.ch'), 'recharge', 10, 'PayPal', 'paypal', 'CAP-1')).toThrow();
    expect(soldeDe(titulaireEcole(id))).toBe(10);
    expect(soldeDe(titulaireCompte('p@x.ch'))).toBe(0);
  });
});

describe('decompter — un appel, au prix coûtant', () => {
  it('prélève le coût arrondi PAR APPEL et rend le montant débité', async () => {
    const id = await creerEtablissement({ solde: 1 });
    for (let i = 0; i < 3; i++) expect(decompter(titulaireEcole(id), tarif(1, 5), 1000, 1000)).toBe(0.01);
    // Trois appels à 0.006 coûtent 0.03, pas 0.018 → 0.02.
    expect(soldeDe(titulaireEcole(id))).toBe(0.97);
    expect(mouvements(titulaireEcole(id))[0]).toMatchObject({ genre: 'consommation', montant: -0.01, detail: 'anthropic · claude-haiku' });
  });
  it('ne refuse jamais : le solde peut passer sous zéro', async () => {
    await creerCompte('p@x.ch', { solde: 0.01 });
    expect(decompter(titulaireCompte('p@x.ch'), tarif(10, 10), 1_000_000, 0)).toBe(10);
    expect(soldeDe(titulaireCompte('p@x.ch'))).toBe(-9.99);
  });
  it('RESPIRE et école inconnue : rien n’est décompté', async () => {
    const r = await creerEtablissement({ respire: true });
    expect(decompter(titulaireEcole(r), tarif(1, 5), 1_000_000, 1_000_000)).toBe(0);
    expect(decompter(titulaireEcole(999), tarif(1, 5), 1_000_000, 1_000_000)).toBe(0);
    expect(mouvements(titulaireEcole(r))).toEqual([]);
  });
  it('un compte introuvable lève (ce n’est pas une gratuité)', () => {
    expect(() => decompter(titulaireCompte('fantome@x.ch'), tarif(1, 1), 10_000, 0)).toThrow(/introuvable/);
  });
  it('un coût nul sur un appel réel est crié au journal d’erreurs, sans mouvement', async () => {
    const id = await creerEtablissement({ solde: 5 });
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(decompter(titulaireEcole(id), tarif(0, 0, 'Aucun tarif connu'), 100, 100)).toBe(0);
    expect(erreur).toHaveBeenCalledWith(expect.stringContaining('CONSOMMATION DÉCOMPTÉE À ZÉRO'));
    expect(mouvements(titulaireEcole(id))).toEqual([]);
  });
  it('le repli se lit sur la ligne du registre', async () => {
    const id = await creerEtablissement({ solde: 5 });
    decompter(titulaireEcole(id), tarif(1, 1, 'prix du barreau le plus cher'), 10_000, 0);
    expect(mouvements(titulaireEcole(id))[0].detail).toBe('anthropic · claude-haiku · prix du barreau le plus cher');
  });
});

describe('tarifDuModele — quatre niveaux de repli', () => {
  it('1. le prix relevé du modèle, dans la devise de facturation', async () => {
    await prixModele('anthropic', 'claude-haiku', 1, 5);
    expect(tarifDuModele('anthropic', 'claude-haiku')).toMatchObject({ entree: 1, sortie: 5, repli: '' });
  });
  it('une ligne dans une autre devise est traitée comme absente', async () => {
    await prixModele('anthropic', 'claude-haiku', 1, 5, 'USD');
    expect(tarifDuModele('anthropic', 'claude-haiku')).toMatchObject({ entree: 0, sortie: 0 });
  });
  it('2. à défaut, le barreau le plus cher (en sortie) du même fournisseur', async () => {
    await prixModele('anthropic', 'claude-haiku', 1, 5);
    await prixModele('anthropic', 'claude-opus', 15, 75);
    await prixModele('anthropic', 'claude-sonnet', 3, 15);
    const t = tarifDuModele('anthropic', 'claude-nouveau');
    expect(t).toMatchObject({ entree: 15, sortie: 75 });
    expect(t.repli).toBe('Aucun tarif relevé pour « claude-nouveau » : prix du barreau le plus cher (claude-opus).');
  });
  it('3. puis le prix unique du fournisseur (table tarifs)', async () => {
    const db = await base();
    db.prepare('INSERT INTO tarifs (provider, prix_mtok, updated_at) VALUES (?, ?, ?)').run('mistral', 2, 0);
    expect(tarifDuModele('mistral', 'mistral-x')).toMatchObject({ entree: 2, sortie: 2, repli: expect.stringContaining('prix unique') });
    // Les anciennes colonnes tarifs.prix_entree_mtok / prix_sortie_mtok, que
    // plus aucun écran n'écrit, ne priment plus sur le prix unique (UC-21, anomalie 5).
    db.prepare('UPDATE tarifs SET prix_entree_mtok = 1, prix_sortie_mtok = 4 WHERE provider = ?').run('mistral');
    expect(tarifDuModele('mistral', 'mistral-x')).toMatchObject({ entree: 2, sortie: 2 });
  });
  it('4. sinon zéro, et il est dit', () => {
    const t = tarifDuModele('openai', 'gpt-x');
    expect(t).toMatchObject({ entree: 0, sortie: 0, provider: 'openai', modele: 'gpt-x' });
    expect(t.repli).toContain('rien n\'a été décompté');
    expect(t.at).toBeGreaterThan(0);
  });
});

describe('etatDuCompte / etatDesComptes', () => {
  it('une personne : solde, dépense des 30 jours, autonomie, taux et forfait', async () => {
    await creerCompte('p@x.ch');
    expect(etatDuCompte('p@x.ch')).toMatchObject({ ouvert: false, solde: 0, jours: null, aSec: true, contributionPct: 3.5, commissionPlancher: 0.5, devise: 'CHF' });
    bouger(titulaireCompte('p@x.ch'), 'recharge', 60);
    bouger(titulaireCompte('p@x.ch'), 'consommation', -30);
    expect(etatDuCompte('p@x.ch')).toMatchObject({ ouvert: true, solde: 30, depense30: 30, jours: 30, aSec: false });
  });
  it('les écoles : autonomie, recharge conseillée pour 3 mois, à sec hors RESPIRE', async () => {
    const a = await creerEtablissement({ name: 'A', billingEmail: 'c@a.ch' });
    const r = await creerEtablissement({ name: 'R', respire: true });
    bouger(titulaireEcole(a), 'recharge', 50);
    bouger(titulaireEcole(a), 'consommation', -30);
    const [ea, er] = etatDesComptes(null);
    expect(ea).toMatchObject({ etablissement: 'A', solde: 20, depense30: 30, jours: 20, recharge: 70, aSec: false, contributionPct: 10, billingEmail: 'c@a.ch' });
    expect(er).toMatchObject({ etablissement: 'R', respire: true, aSec: false, jours: null, recharge: 0 });
    expect(etatDesComptes(a)).toHaveLength(1);
  });
});
