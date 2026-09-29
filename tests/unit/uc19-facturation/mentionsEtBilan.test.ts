// UC-19 — Tests unitaires : mentions administratives (mentionsDe,
// reglerMentions), bilan de la contribution (bilanParticipation) et replis
// observés (repliObserves) — src/server/facturation.ts.
import { describe, it, expect, beforeEach } from 'vitest';
import { viderBase, creerEtablissement, base } from '../../helpers/db';
import { journaliser, JUILLET } from './journal';
import {
  mentionsDe, reglerMentions, facturesDuMois, emettre, bilanParticipation, repliObserves, reglerTarif,
} from '../../../src/server/facturation';

beforeEach(async () => { await viderBase(); });

async function poserAdresseProfil(id: number, adresse: string) {
  (await base()).prepare('UPDATE etablissements SET billing_address = ? WHERE id = ?').run(adresse, id);
}

describe('mentionsDe', () => {
  it('sans saisie : reprend l’adresse du profil et le dit (adresseParDefaut)', async () => {
    const id = await creerEtablissement();
    await poserAdresseProfil(id, 'Rue du Collège 1\n1000 Lausanne');
    expect(mentionsDe(id, '2026-07')).toEqual({
      adresse: 'Rue du Collège 1\n1000 Lausanne', reference: '', note: '',
      adresseParDefaut: true, updatedAt: null, par: '',
    });
  });

  it('école inconnue : mentions vides', () => {
    expect(mentionsDe(4242, '2026-07')).toMatchObject({ adresse: '', adresseParDefaut: true });
  });
});

describe('reglerMentions', () => {
  it('écrit les trois champs, rognés, avec l’auteur et la date', async () => {
    const id = await creerEtablissement();
    const m = reglerMentions(id, '2026-07', { adresse: '  Intendance  ', reference: ' BC-42 ', note: 'Merci' }, 'admin@ecole.ch');
    expect(m).toMatchObject({ adresse: 'Intendance', reference: 'BC-42', note: 'Merci', adresseParDefaut: false, par: 'admin@ecole.ch' });
    expect(m.updatedAt).toBeGreaterThan(0);
  });

  it('un champ absent du patch est conservé', async () => {
    const id = await creerEtablissement();
    reglerMentions(id, '2026-07', { adresse: 'A', reference: 'R' }, 'x@e.ch');
    const m = reglerMentions(id, '2026-07', { note: 'N' }, 'y@e.ch');
    expect(m).toMatchObject({ adresse: 'A', reference: 'R', note: 'N', par: 'y@e.ch' });
  });

  it('une adresse vidée retombe sur celle du profil, sans toucher le profil', async () => {
    const id = await creerEtablissement();
    await poserAdresseProfil(id, 'Profil');
    reglerMentions(id, '2026-07', { adresse: 'Propre' }, 'x@e.ch');
    const m = reglerMentions(id, '2026-07', { adresse: '   ' }, 'x@e.ch');
    expect(m.adresse).toBe('Profil');
    expect(m.adresseParDefaut).toBe(true);
    const e = (await base()).prepare('SELECT billing_address FROM etablissements WHERE id = ?').get(id) as any;
    expect(e.billing_address).toBe('Profil');
  });

  it('borne les longueurs : adresse 500, référence 120, note 500, auteur 200', async () => {
    const id = await creerEtablissement();
    const m = reglerMentions(id, '2026-07',
      { adresse: 'a'.repeat(900), reference: 'r'.repeat(900), note: 'n'.repeat(900) }, 'p'.repeat(900));
    expect([m.adresse.length, m.reference.length, m.note.length, m.par.length]).toEqual([500, 120, 500, 200]);
  });

  it('les mentions sont propres à un mois', async () => {
    const id = await creerEtablissement();
    reglerMentions(id, '2026-07', { reference: 'JUILLET' }, 'x@e.ch');
    expect(mentionsDe(id, '2026-08').reference).toBe('');
  });

  it('n’entrent dans aucun calcul et survivent à une réémission', async () => {
    const id = await creerEtablissement();
    await journaliser({ ts: JUILLET, etablissementId: id, montant: 4.2, tokensIn: 10 });
    const avant = facturesDuMois(2026, 7, id)[0];
    emettre(id, 2026, 7);
    reglerMentions(id, '2026-07', { adresse: '999', reference: '1000000', note: 'total: 0' }, 'x@e.ch');
    const apres = emettre(id, 2026, 7)!;
    expect(apres.total).toBe(avant.total);
    expect(apres.mentions).toMatchObject({ adresse: '999', reference: '1000000', note: 'total: 0' });
  });
});

describe('bilanParticipation', () => {
  async function mouvement(etab: number, email: string | null, genre: string, montant: number, detail: string, ts = JUILLET) {
    (await base()).prepare(`INSERT INTO credit_mouvements (etablissement_id, titulaire_email, ts, genre, montant, solde, detail, par)
      VALUES (?, ?, ?, ?, ?, 0, ?, '')`).run(etab, email, ts, genre, montant, detail);
  }

  it('relit la contribution au registre (en-tête DETAIL_COMMISSION), écoles et personnes', async () => {
    const id = await creerEtablissement();
    await mouvement(id, null, 'recharge', 100, 'Recharge PayPal');
    await mouvement(id, null, 'ajustement', -5, 'Contribution aux frais (5 %)');
    await mouvement(0, 'p@x.ch', 'recharge', 100, 'Recharge PayPal');
    await mouvement(0, 'p@x.ch', 'ajustement', -3, 'Contribution aux frais (forfait 3.00 CHF)');
    // Hors du compte : un autre ajustement, une consommation, un autre mois.
    await mouvement(id, null, 'ajustement', -7, 'Correction manuelle');
    await mouvement(id, null, 'consommation', -2, 'anthropic · claude');
    await mouvement(id, null, 'ajustement', -50, 'Contribution aux frais (5 %)', Date.UTC(2026, 7, 2));
    const b = bilanParticipation(2026, 7);
    expect(b).toMatchObject({ devise: 'CHF', collectee: 8, pct: 4 });
  });

  it('taux nul quand rien n’a été versé', () => {
    expect(bilanParticipation(2026, 7)).toMatchObject({ pct: 0, collectee: 0, demo: 0, respire: 0, jetonsOfferts: 0 });
  });

  it('valorise ce qui a été offert (démo publique, écoles RESPIRE) au prix unique du fournisseur', async () => {
    const respire = await creerEtablissement({ respire: true });
    const payante = await creerEtablissement();
    reglerTarif('anthropic', 2);
    await journaliser({ ts: JUILLET, etablissementId: null, ip: '', tokens: 1_000_000 });
    await journaliser({ ts: JUILLET, etablissementId: respire, tokens: 2_000_000 });
    await journaliser({ ts: JUILLET, etablissementId: payante, tokens: 5_000_000 });
    expect(bilanParticipation(2026, 7)).toMatchObject({ demo: 2, respire: 4, jetonsOfferts: 3_000_000 });
  });

  it('valorise l’offert aux prix FIGÉS sur chaque ligne, entrée et sortie, sans prix unique', async () => {
    // Anomalie corrigée (UC-19, n° 2) : le bilan n'appliquait que le prix unique
    // du fournisseur au total des jetons — sans lui, l'offert valait 0.
    const respire = await creerEtablissement({ respire: true });
    await journaliser({ ts: JUILLET, etablissementId: respire, tokensIn: 1_000_000, tokensOut: 1_000_000, prixEntree: 1, prixSortie: 5 });
    expect(bilanParticipation(2026, 7)).toMatchObject({ respire: 6, jetonsOfferts: 2_000_000 });
  });

  it('prix figés et prix unique cohabitent : chaque ligne à son prix, l’ancienne au prix unique', async () => {
    const respire = await creerEtablissement({ respire: true });
    reglerTarif('anthropic', 10);
    await journaliser({ ts: JUILLET, etablissementId: respire, tokensIn: 1_000_000, prixEntree: 2, prixSortie: 4 }); // 2.00
    await journaliser({ ts: JUILLET, etablissementId: respire, tokens: 100_000, tarifAt: 0 });                      // 1.00
    expect(bilanParticipation(2026, 7).respire).toBe(3);
  });

  it('la consommation d’un porte-monnaie PERSONNEL (payée) n’est pas comptée comme démo offerte', async () => {
    // Anomalie corrigée (UC-19, n° 3) : /api/completion journalise un payeur
    // personnel avec ip '', établissement NULL — et le MONTANT prélevé, qui le
    // distingue de la démonstration (montant 0).
    reglerTarif('anthropic', 1);
    await journaliser({ ts: JUILLET, etablissementId: null, ip: '', tokens: 1_000_000, montant: 3 });
    await journaliser({ ts: JUILLET, etablissementId: null, ip: '', tokens: 2_000_000, montant: 0 });
    expect(bilanParticipation(2026, 7)).toMatchObject({ demo: 2, jetonsOfferts: 2_000_000 });
  });
});

describe('repliObserves', () => {
  it('liste les replis des 30 derniers jours, argent prélevé ou école identifiée', async () => {
    const id = await creerEtablissement({ respire: true });
    const now = Date.now();
    await journaliser({ ts: now, etablissementId: id, model: 'x', repli: 'R1', montant: 0 });          // RESPIRE : compté
    await journaliser({ ts: now, etablissementId: id, model: 'x', repli: 'R1', montant: 0 });
    await journaliser({ ts: now, etablissementId: null, ip: '', model: 'y', repli: 'R2', montant: 0.5 }); // personnel : compté
    await journaliser({ ts: now, etablissementId: null, ip: '', model: 'demo', repli: 'R3', montant: 0 }); // démo : écartée
    await journaliser({ ts: now - 31 * 86_400_000, etablissementId: id, model: 'vieux', repli: 'R4' });   // trop ancien
    await journaliser({ ts: now, etablissementId: id, model: 'ancien', repli: 'R5', tarifAt: 0 });       // ligne ancienne
    await journaliser({ ts: now, etablissementId: id, model: 'normal', repli: '' });                      // pas de repli
    const r = repliObserves();
    expect(r.map(x => [x.modele, x.appels])).toEqual([['y', 1], ['x', 2]]);
    expect(r[0].montant).toBe(0.5);
  });
});
