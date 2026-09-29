// UC-19 — Tests unitaires : la facture mensuelle d'une école
// (src/server/facturation.ts : periodeDe, tarifs/reglerTarif, facturesDuMois,
// emettre, marquerPayee, impayees).
import { describe, it, expect, beforeEach } from 'vitest';
import { viderBase, creerEtablissement, base } from '../../helpers/db';
import { journaliser, JUILLET } from './journal';
import {
  periodeDe, tarifs, reglerTarif, facturesDuMois, emettre, marquerPayee, impayees,
} from '../../../src/server/facturation';

beforeEach(async () => { await viderBase(); });

describe('periodeDe', () => {
  it('compose « AAAA-MM » avec le mois sur deux chiffres', () => {
    expect(periodeDe(2026, 7)).toBe('2026-07');
    expect(periodeDe(2026, 12)).toBe('2026-12');
  });
});

describe('tarifs / reglerTarif (prix unique par fournisseur)', () => {
  it('écrit puis remplace le prix d’un fournisseur', () => {
    reglerTarif('anthropic', 3);
    reglerTarif('anthropic', 4.5);
    reglerTarif('mistral', 1);
    expect(tarifs()).toEqual({ anthropic: 4.5, mistral: 1 });
  });
  it('borne un prix négatif à zéro', () => {
    reglerTarif('openai', -2);
    expect(tarifs().openai).toBe(0);
  });
});

describe('facturesDuMois — consommation du mois', () => {
  it('additionne les montants FIGÉS par appel et garde les deux prix appliqués', async () => {
    const id = await creerEtablissement({ name: 'Collège A', contributionPct: 5 });
    await journaliser({ ts: JUILLET, etablissementId: id, model: 'claude-haiku', tokensIn: 1000, tokensOut: 2000,
      prixEntree: 1, prixSortie: 5, montant: 0.02 });
    await journaliser({ ts: JUILLET + 1000, etablissementId: id, model: 'claude-haiku', tokensIn: 10, tokensOut: 20,
      prixEntree: 1, prixSortie: 5, montant: 0.01 });
    const [f] = facturesDuMois(2026, 7, id);
    expect(f.periode).toBe('2026-07');
    expect(f.lignes).toHaveLength(1);
    const l = f.lignes[0];
    expect(l).toMatchObject({ provider: 'anthropic', modele: 'claude-haiku', appels: 2, tokensIn: 1010, tokensOut: 2020,
      tokens: 3030, prixEntreeMtok: 1, prixSortieMtok: 5, montant: 0.03, ancien: false, repli: '' });
    // Le montant n'est PAS recalculé depuis les jetons (1010×1 + 2020×5)/1e6 = 0.01111 → 0.02 :
    // il est la somme des prélèvements réels, arrondis appel par appel.
    expect(f.consommation).toBe(0.03);
    expect(f.total).toBe(0.03);
    expect(f.jetons).toBe(3030);
    expect(f.devise).toBe('CHF');
  });

  it('un changement de tarif en cours de mois produit deux lignes pour le même modèle', async () => {
    const id = await creerEtablissement();
    await journaliser({ ts: JUILLET, etablissementId: id, tokensIn: 100, prixEntree: 1, prixSortie: 5, montant: 0.01 });
    await journaliser({ ts: JUILLET + 1, etablissementId: id, tokensIn: 100, prixEntree: 2, prixSortie: 6, montant: 0.04 });
    const [f] = facturesDuMois(2026, 7, id);
    expect(f.lignes.map(l => l.prixEntreeMtok)).toEqual([2, 1]); // triées par montant décroissant
    expect(f.total).toBe(0.05);
  });

  it('relit une ligne ANCIENNE (tarif_at = 0) au prix unique du fournisseur, entrée comme sortie', async () => {
    const id = await creerEtablissement();
    reglerTarif('anthropic', 3);
    await journaliser({ ts: JUILLET, etablissementId: id, tokensIn: 500_000, tokensOut: 500_000, tarifAt: 0, montant: 0 });
    const [f] = facturesDuMois(2026, 7, id);
    expect(f.lignes[0]).toMatchObject({ ancien: true, prixEntreeMtok: 3, prixSortieMtok: 3, montant: 3 });
    expect(f.total).toBe(3);
  });

  it('une ligne ancienne sans ventilation entrée/sortie (tokens seul) est relue à jetons × prix unique', async () => {
    // Anomalie corrigée (UC-19, n° 1) : les lignes antérieures à la séparation
    // entrée/sortie (et celles de la traduction) n'ont que `tokens`
    // (tokens_in = tokens_out = 0) ; elles étaient valorisées à 0. « Comme
    // hier » : 1 M de jetons × 2.00 = 2.00.
    const id = await creerEtablissement();
    reglerTarif('anthropic', 2);
    await journaliser({ ts: JUILLET, etablissementId: id, tokens: 1_000_000, tarifAt: 0 });
    const [f] = facturesDuMois(2026, 7, id);
    expect(f.lignes[0]).toMatchObject({ tokens: 1_000_000, tokensIn: 0, tokensOut: 0, ancien: true, montant: 2 });
    expect(f.total).toBe(2);
  });

  it('lignes anciennes mêlées, ventilées ou non, dans un même groupe : tout est compté une fois', async () => {
    const id = await creerEtablissement();
    reglerTarif('anthropic', 1);
    await journaliser({ ts: JUILLET, etablissementId: id, tokens: 1_000_000, tarifAt: 0 });
    await journaliser({ ts: JUILLET, etablissementId: id, tokensIn: 500_000, tokensOut: 500_000, tarifAt: 0 });
    const [f] = facturesDuMois(2026, 7, id);
    expect(f.lignes).toHaveLength(1);
    expect(f.lignes[0]).toMatchObject({ tokens: 2_000_000, appels: 2, montant: 2 });
  });

  it('ignore la clé personnelle, les autres mois, les autres écoles et la démonstration', async () => {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    await journaliser({ ts: JUILLET, etablissementId: a, montant: 1, tokensIn: 10 });
    await journaliser({ ts: JUILLET, etablissementId: a, montant: 5, tokensIn: 10, serverKey: false });
    await journaliser({ ts: Date.UTC(2026, 7, 1), etablissementId: a, montant: 7, tokensIn: 10 }); // 1er août
    await journaliser({ ts: Date.UTC(2026, 6, 1) - 1, etablissementId: a, montant: 9, tokensIn: 10 }); // 30 juin
    await journaliser({ ts: JUILLET, etablissementId: b, montant: 2, tokensIn: 10 });
    await journaliser({ ts: JUILLET, etablissementId: null, ip: '', montant: 0, tokensIn: 10 });
    const [fa] = facturesDuMois(2026, 7, a);
    expect(fa.total).toBe(1);
    const toutes = facturesDuMois(2026, 7, null);
    expect(toutes.map(f => [f.etablissement, f.total])).toEqual([['A', 1], ['B', 2]]);
  });

  it('décembre se termine au 1er janvier de l’année suivante', async () => {
    const id = await creerEtablissement();
    await journaliser({ ts: Date.UTC(2026, 11, 31, 23), etablissementId: id, montant: 1, tokensIn: 1 });
    await journaliser({ ts: Date.UTC(2027, 0, 1), etablissementId: id, montant: 4, tokensIn: 1 });
    expect(facturesDuMois(2026, 12, id)[0].total).toBe(1);
    expect(facturesDuMois(2027, 1, id)[0].total).toBe(4);
  });

  it('une école sans consommation apparaît avec un total nul', async () => {
    const id = await creerEtablissement();
    const [f] = facturesDuMois(2026, 7, id);
    expect(f.lignes).toEqual([]);
    expect(f.total).toBe(0);
    expect(f.emiseAt).toBeNull();
  });

  it('RESPIRE : les lignes restent visibles, mais consommation et total valent zéro', async () => {
    const id = await creerEtablissement({ respire: true });
    await journaliser({ ts: JUILLET, etablissementId: id, montant: 0.5, tokensIn: 10, prixEntree: 1 });
    const [f] = facturesDuMois(2026, 7, id);
    expect(f.respire).toBe(true);
    expect(f.lignes).toHaveLength(1);
    expect(f.consommation).toBe(0);
    expect(f.total).toBe(0);
  });

  it('participation toujours nulle ; le taux affiché est celui de l’école, borné', async () => {
    const choisi = await creerEtablissement({ contributionPct: 5 });
    const tropHaut = await creerEtablissement({ contributionPct: 25 });
    const defaut = await creerEtablissement({ contributionPct: -1 });
    await journaliser({ ts: JUILLET, etablissementId: choisi, montant: 10, tokensIn: 1 });
    const [f] = facturesDuMois(2026, 7, choisi);
    expect(f.participation).toBe(0);
    expect(f.participationPct).toBe(5);
    expect(f.total).toBe(10);
    expect(facturesDuMois(2026, 7, tropHaut)[0].participationPct).toBe(10);
    expect(facturesDuMois(2026, 7, defaut)[0].participationPct).toBe(10); // SECRET_BILLING_SURCHARGE_PCT par défaut
  });

  it('signale une ligne facturée au repli', async () => {
    const id = await creerEtablissement();
    await journaliser({ ts: JUILLET, etablissementId: id, montant: 0.1, tokensIn: 1, repli: 'Aucun tarif relevé' });
    expect(facturesDuMois(2026, 7, id)[0].lignes[0].repli).toBe('Aucun tarif relevé');
  });
});

describe('emettre', () => {
  it('fige le montant du mois et renvoie la facture émise', async () => {
    const id = await creerEtablissement();
    await journaliser({ ts: JUILLET, etablissementId: id, montant: 12.34, tokensIn: 100 });
    const f = emettre(id, 2026, 7)!;
    expect(f.emiseAt).toBeGreaterThan(0);
    expect(f.payeeAt).toBeNull();
    expect(f.tarifChange).toBe(false);
    const row = (await base()).prepare('SELECT * FROM factures WHERE etablissement_id = ?').get(id) as any;
    expect(row).toMatchObject({ periode: '2026-07', total: 12.34, consommation: 12.34, participation: 0, devise: 'CHF', jetons: 100 });
  });

  it('refuse une école RESPIRE ou inconnue (null)', async () => {
    const respire = await creerEtablissement({ respire: true });
    expect(emettre(respire, 2026, 7)).toBeNull();
    expect(emettre(9999, 2026, 7)).toBeNull();
    expect((await base()).prepare('SELECT COUNT(*) AS n FROM factures').get()).toEqual({ n: 0 });
  });

  it('la facture émise fait foi : une consommation ajoutée ensuite lève tarifChange', async () => {
    const id = await creerEtablissement();
    await journaliser({ ts: JUILLET, etablissementId: id, montant: 1, tokensIn: 1 });
    emettre(id, 2026, 7);
    await journaliser({ ts: JUILLET + 5, etablissementId: id, montant: 2, tokensIn: 1 });
    const [f] = facturesDuMois(2026, 7, id);
    expect(f.total).toBe(3);
    expect(f.tarifChange).toBe(true);
    expect(impayees()[0].total).toBe(1);
  });

  it('réémettre une facture impayée écrase le montant figé', async () => {
    const id = await creerEtablissement();
    await journaliser({ ts: JUILLET, etablissementId: id, montant: 1, tokensIn: 1 });
    emettre(id, 2026, 7);
    await journaliser({ ts: JUILLET + 5, etablissementId: id, montant: 2, tokensIn: 1 });
    expect(emettre(id, 2026, 7)!.tarifChange).toBe(false);
    expect(impayees()[0].total).toBe(3);
  });

  it('une facture PAYÉE ne se réémet pas', async () => {
    const id = await creerEtablissement();
    await journaliser({ ts: JUILLET, etablissementId: id, montant: 1, tokensIn: 1 });
    emettre(id, 2026, 7);
    expect(marquerPayee(id, '2026-07', true)).toBe(true);
    await journaliser({ ts: JUILLET + 5, etablissementId: id, montant: 2, tokensIn: 1 });
    const f = emettre(id, 2026, 7)!;
    expect(f.payeeAt).toBeGreaterThan(0);
    expect(f.tarifChange).toBe(true);
    const row = (await base()).prepare('SELECT total FROM factures WHERE etablissement_id = ?').get(id) as any;
    expect(row.total).toBe(1);
  });
});

describe('marquerPayee / impayees', () => {
  it('bascule payée ↔ impayée ; faux pour une facture inexistante', async () => {
    const id = await creerEtablissement({ name: 'Collège P', billingEmail: 'compta@p.ch' });
    expect(marquerPayee(id, '2026-07', true)).toBe(false);
    await journaliser({ ts: JUILLET, etablissementId: id, montant: 1, tokensIn: 1 });
    emettre(id, 2026, 7);
    expect(impayees()).toHaveLength(1);
    expect(impayees()[0]).toMatchObject({ etablissementId: id, etablissement: 'Collège P', periode: '2026-07', billingEmail: 'compta@p.ch' });
    marquerPayee(id, '2026-07', true);
    expect(impayees()).toEqual([]);
    marquerPayee(id, '2026-07', false);
    expect(impayees()).toHaveLength(1);
  });

  it('liste les impayées de la plus récente à la plus ancienne, puis par nom', async () => {
    const a = await creerEtablissement({ name: 'Alpha' });
    const b = await creerEtablissement({ name: 'Bêta' });
    for (const id of [a, b]) {
      await journaliser({ ts: JUILLET, etablissementId: id, montant: 1, tokensIn: 1 });
      await journaliser({ ts: Date.UTC(2026, 7, 10), etablissementId: id, montant: 1, tokensIn: 1 });
      emettre(id, 2026, 7); emettre(id, 2026, 8);
    }
    expect(impayees().map(f => `${f.periode} ${f.etablissement}`)).toEqual(
      ['2026-08 Alpha', '2026-08 Bêta', '2026-07 Alpha', '2026-07 Bêta']);
  });
});
