// LA FACTURE D'UNE ÉCOLE, ET LES 10 % QUI PAIENT LA GRATUITÉ DES AUTRES.
//
// La consommation se recalcule à tout moment depuis usage_log : jetons par
// fournisseur, multipliés par le tarif du fournisseur. S'y ajoute une
// PARTICIPATION AUX FRAIS DE FONCTIONNEMENT, dix pour cent, qui alimente les
// clés offertes — la démonstration publique du site et les écoles RESPIRE.
//
// Elle est affichée en clair, sur sa propre ligne, dans l'administration de
// chaque école. Une contribution qu'on cache n'est plus une contribution,
// c'est une marge ; et une école qui voit ce qu'elle finance l'accepte mieux
// qu'une école qui découvre un écart entre son relevé et sa facture.
//
// Les écoles RESPIRE ne paient RIEN, participation comprise : elles sont la
// destination de cet argent, pas sa source.

import { getDb } from './db';
import { monthStartUtc } from './admin';
import { BillingCurrency, BillingSurchargePct } from '../utils/env';

export type LigneFournisseur = { provider: string; tokens: number; prixMtok: number; montant: number };

export type Facture = {
  etablissementId: number;
  etablissement: string;
  respire: boolean;
  periode: string;
  lignes: LigneFournisseur[];
  jetons: number;
  /** Consommation au tarif, avant participation. */
  consommation: number;
  /** Les 10 % — nommés, jamais fondus dans le total. */
  participation: number;
  participationPct: number;
  total: number;
  devise: string;
  /** État de l'émission, s'il y en a eu une. */
  emiseAt: number | null;
  payeeAt: number | null;
  /** Le montant figé à l'émission diffère-t-il du recalcul d'aujourd'hui ? */
  tarifChange: boolean;
};

export function periodeDe(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Le tarif courant, par fournisseur. Un fournisseur absent vaut zéro. */
export function tarifs(): Record<string, number> {
  const rows = getDb().prepare('SELECT provider, prix_mtok FROM tarifs').all() as
    { provider: string; prix_mtok: number }[];
  return Object.fromEntries(rows.map(r => [r.provider, r.prix_mtok]));
}

export function reglerTarif(provider: string, prixMtok: number): void {
  getDb().prepare(`
    INSERT INTO tarifs (provider, prix_mtok, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(provider) DO UPDATE SET prix_mtok = excluded.prix_mtok, updated_at = excluded.updated_at
  `).run(provider, Math.max(0, prixMtok), Date.now());
}

/** Arrondi au centime — une facture ne se lit pas à la quinzième décimale. */
const centimes = (x: number) => Math.round(x * 100) / 100;

/**
 * La facture d'un mois. `etablissementId` null = toutes les écoles, une
 * facture par école (réservé au site).
 */
export function facturesDuMois(year: number, month: number, etablissementId: number | null): Facture[] {
  const db = getDb();
  const debut = monthStartUtc(year, month);
  const fin = monthStartUtc(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1);
  const periode = periodeDe(year, month);
  const prix = tarifs();

  // Seule la clé INTERNE se facture, et seulement rattachée à un
  // établissement : le repli gratuit public n'a pas de client.
  const brut = db.prepare(`
    SELECT u.etablissement_id AS id, e.name AS nom, COALESCE(e.respire, 0) AS respire,
           u.provider AS provider, SUM(u.tokens) AS tokens
    FROM usage_log u JOIN etablissements e ON e.id = u.etablissement_id
    WHERE u.ts >= ? AND u.ts < ? AND u.used_server_key = 1
      AND (? IS NULL OR u.etablissement_id = ?)
    GROUP BY u.etablissement_id, u.provider
  `).all(debut, fin, etablissementId, etablissementId) as
    { id: number; nom: string; respire: number; provider: string; tokens: number }[];

  // Une école sans consommation doit tout de même apparaître : « rien à payer »
  // est une information, l'absence de ligne est un doute.
  const ecoles = db.prepare(`
    SELECT id, name AS nom, respire FROM etablissements
    WHERE (? IS NULL OR id = ?) ORDER BY name
  `).all(etablissementId, etablissementId) as { id: number; nom: string; respire: number }[];

  const emises = db.prepare('SELECT * FROM factures WHERE periode = ?').all(periode) as
    { etablissement_id: number; total: number; emise_at: number; payee_at: number | null }[];

  return ecoles.map(ecole => {
    const lignes = brut.filter(b => b.id === ecole.id).map(b => ({
      provider: b.provider,
      tokens: b.tokens,
      prixMtok: prix[b.provider] ?? 0,
      montant: centimes((b.tokens / 1_000_000) * (prix[b.provider] ?? 0)),
    })).sort((a, b) => b.tokens - a.tokens);

    const jetons = lignes.reduce((n, l) => n + l.tokens, 0);
    const respire = !!ecole.respire;
    // RESPIRE : zéro, participation comprise. Ces écoles sont la destination
    // des 10 %, pas leur source.
    const consommation = respire ? 0 : centimes(lignes.reduce((n, l) => n + l.montant, 0));
    const participation = respire ? 0 : centimes(consommation * BillingSurchargePct / 100);
    const emise = emises.find(f => f.etablissement_id === ecole.id);

    return {
      etablissementId: ecole.id, etablissement: ecole.nom, respire, periode,
      lignes, jetons, consommation, participation,
      participationPct: BillingSurchargePct,
      total: centimes(consommation + participation),
      devise: BillingCurrency,
      emiseAt: emise?.emise_at ?? null,
      payeeAt: emise?.payee_at ?? null,
      // Le montant figé à l'émission ne correspond plus au recalcul : le tarif
      // a bougé depuis. La facture ÉMISE fait foi ; on le signale, on ne
      // réécrit pas le passé.
      tarifChange: !!emise && Math.abs(emise.total - centimes(consommation + participation)) >= 0.01,
    };
  });
}

/** Fige le montant du mois pour une école. Réémettre écrase — tant qu'impayée. */
export function emettre(etablissementId: number, year: number, month: number): Facture | null {
  const facture = facturesDuMois(year, month, etablissementId)[0];
  if (!facture || facture.respire) return null;
  const db = getDb();
  const deja = db.prepare('SELECT payee_at FROM factures WHERE etablissement_id = ? AND periode = ?')
    .get(etablissementId, facture.periode) as { payee_at: number | null } | undefined;
  // Une facture PAYÉE ne se réémet pas : le montant acquitté est un fait.
  if (deja?.payee_at) return facture;
  db.prepare(`
    INSERT INTO factures (etablissement_id, periode, jetons, consommation, participation, total, devise, emise_at)
    VALUES (@id, @periode, @jetons, @consommation, @participation, @total, @devise, @now)
    ON CONFLICT(etablissement_id, periode) DO UPDATE SET
      jetons = excluded.jetons, consommation = excluded.consommation,
      participation = excluded.participation, total = excluded.total,
      devise = excluded.devise, emise_at = excluded.emise_at
  `).run({
    id: etablissementId, periode: facture.periode, jetons: facture.jetons,
    consommation: facture.consommation, participation: facture.participation,
    total: facture.total, devise: facture.devise, now: Date.now(),
  });
  return facturesDuMois(year, month, etablissementId)[0];
}

export function marquerPayee(etablissementId: number, periode: string, payee: boolean): boolean {
  const r = getDb().prepare('UPDATE factures SET payee_at = ? WHERE etablissement_id = ? AND periode = ?')
    .run(payee ? Date.now() : null, etablissementId, periode);
  return r.changes > 0;
}

/** Les impayées, toutes écoles et toutes périodes — la vue du site. */
export function impayees() {
  return getDb().prepare(`
    SELECT f.etablissement_id AS etablissementId, e.name AS etablissement, f.periode,
           f.jetons, f.consommation, f.participation, f.total, f.devise,
           f.emise_at AS emiseAt, e.billing_email AS billingEmail
    FROM factures f JOIN etablissements e ON e.id = f.etablissement_id
    WHERE f.payee_at IS NULL
    ORDER BY f.periode DESC, e.name
  `).all() as Array<{
    etablissementId: number; etablissement: string; periode: string; jetons: number;
    consommation: number; participation: number; total: number; devise: string;
    emiseAt: number; billingEmail: string;
  }>;
}

/**
 * Ce que la participation a rapporté, et ce qu'elle a financé.
 *
 * Le premier chiffre est la somme des 10 % facturés ; le second, la
 * consommation des clés offertes — démonstration publique et écoles RESPIRE.
 * Les mettre côte à côte est la seule façon de vérifier que la promesse tient.
 */
export function bilanParticipation(year: number, month: number) {
  const db = getDb();
  const debut = monthStartUtc(year, month);
  const fin = monthStartUtc(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1);
  const prix = tarifs();

  const collectee = facturesDuMois(year, month, null)
    .reduce((n, f) => n + f.participation, 0);

  const offerts = db.prepare(`
    SELECT u.provider AS provider, SUM(u.tokens) AS tokens,
           CASE WHEN u.etablissement_id IS NULL THEN 'demo' ELSE 'respire' END AS origine
    FROM usage_log u LEFT JOIN etablissements e ON e.id = u.etablissement_id
    WHERE u.ts >= ? AND u.ts < ? AND u.used_server_key = 1
      AND (u.etablissement_id IS NULL OR e.respire = 1)
    GROUP BY origine, u.provider
  `).all(debut, fin) as { provider: string; tokens: number; origine: 'demo' | 'respire' }[];

  const cout = (l: typeof offerts) => centimes(l.reduce(
    (n, o) => n + (o.tokens / 1_000_000) * (prix[o.provider] ?? 0), 0));

  return {
    devise: BillingCurrency,
    pct: BillingSurchargePct,
    collectee: centimes(collectee),
    demo: cout(offerts.filter(o => o.origine === 'demo')),
    respire: cout(offerts.filter(o => o.origine === 'respire')),
    jetonsOfferts: offerts.reduce((n, o) => n + o.tokens, 0),
  };
}
