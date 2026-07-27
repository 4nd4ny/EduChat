// LA FACTURE D'UNE ÉCOLE — AU PRIX COÛTANT, ET RIEN D'AUTRE.
//
// La consommation se recalcule à tout moment depuis usage_log : jetons par
// fournisseur, multipliés par le tarif du fournisseur. ET C'EST TOUT : le
// total d'une facture est celui de sa consommation.
//
// CE COMMENTAIRE DISAIT LE CONTRAIRE, ET IL AVAIT CESSÉ D'ÊTRE VRAI. Il
// annonçait « une participation aux frais, dix pour cent, qui s'ajoute ».
// Depuis le passage au prix coûtant, la contribution de l'école — 3,5 à 10 %,
// qu'elle choisit — est prélevée UNE FOIS, À LA RECHARGE
// (src/server/porteMonnaie.ts, commissionRecharge), et elle s'inscrit au
// registre du porte-monnaie comme un mouvement daté. Elle n'apparaît donc plus
// sur la facture : ce qu'une école lit ici, elle peut le confronter au tarif
// public d'Anthropic, d'OpenAI ou de Mistral et retrouver notre chiffre au
// centime — c'est tout l'intérêt du changement, et une ligne « participation :
// 0.00 » suffirait à le brouiller.
//
// Les écoles RESPIRE ne paient RIEN : elles sont la destination de cet argent,
// pas sa source — et elles ne rechargent pas, donc ne contribuent nulle part.

import { getDb } from './db';
import { monthStartUtc } from './admin';
import { BillingCurrency } from '../utils/env';
import { contributionDe, coutDe, titulaireEcole, DETAIL_COMMISSION } from './porteMonnaie';

export type LigneFournisseur = { provider: string; tokens: number; prixMtok: number; montant: number };

/**
 * LES MENTIONS ADMINISTRATIVES — ce que l'école ajoute pour pouvoir payer.
 *
 * Une facture juste ne suffit pas à être payée : il faut qu'elle arrive au bon
 * service, sous la référence par laquelle la dépense a été engagée. Ces trois
 * champs appartiennent donc à l'ÉCOLE et à elle seule.
 *
 * AUCUN N'ENTRE DANS LE CALCUL. Le montant reste celui du porte-monnaie ; rien
 * de ce qu'une école saisit ne peut le déplacer d'un centime — c'est la seule
 * raison pour laquelle on peut lui en confier la saisie sans réserve.
 */
export type MentionsFacture = {
  adresse: string; reference: string; note: string;
  /**
   * L'adresse affichée vient-elle du profil de l'école (billing_address, saisi
   * à l'inscription) faute de saisie propre à ce mois ? Le dire évite qu'on
   * croie avoir validé une adresse qu'on n'a jamais relue.
   */
  adresseParDefaut: boolean;
  updatedAt: number | null;
  par: string;
};

/** Bornes de saisie. Longues, mais bornées : une adresse n'est pas un roman. */
const MAX_ADRESSE = 500, MAX_REFERENCE = 120, MAX_NOTE = 500;

/**
 * Les mentions d'un mois, avec repli sur l'adresse du profil de l'école.
 *
 * Le repli n'écrit rien : tant que l'école n'a rien saisi pour CE mois, elle
 * lit l'adresse de son profil et peut la corriger sans que la correction
 * remonte au profil — une facture de janvier ne doit pas changer parce que
 * l'école a déménagé en juin.
 */
export function mentionsDe(etablissementId: number, periode: string): MentionsFacture {
  const db = getDb();
  const row = db.prepare('SELECT adresse, reference, note, updated_at, par FROM facture_mentions WHERE etablissement_id = ? AND periode = ?')
    .get(etablissementId, periode) as
    { adresse: string; reference: string; note: string; updated_at: number; par: string } | undefined;
  const profil = (db.prepare('SELECT billing_address FROM etablissements WHERE id = ?')
    .get(etablissementId) as { billing_address: string } | undefined)?.billing_address ?? '';
  const adressePropre = (row?.adresse ?? '').trim();
  return {
    adresse: adressePropre || profil,
    reference: row?.reference ?? '',
    note: row?.note ?? '',
    adresseParDefaut: !adressePropre,
    updatedAt: row?.updated_at || null,
    par: row?.par ?? '',
  };
}

/**
 * Écrit les mentions d'un mois. TROIS CHAMPS, NOMMÉS UN PAR UN — jamais un
 * corps de requête recopié : c'est ce qui garantit qu'aucune saisie d'école ne
 * puisse atteindre un montant, une devise ou une date d'émission.
 *
 * Un champ absent du patch est CONSERVÉ : l'écran peut n'envoyer que ce qui a
 * changé, et deux personnes qui remplissent l'une l'adresse et l'autre la
 * référence ne s'effacent pas mutuellement.
 */
export function reglerMentions(
  etablissementId: number, periode: string,
  patch: { adresse?: string; reference?: string; note?: string }, par: string,
): MentionsFacture {
  const db = getDb();
  const actuel = db.prepare('SELECT adresse, reference, note FROM facture_mentions WHERE etablissement_id = ? AND periode = ?')
    .get(etablissementId, periode) as { adresse: string; reference: string; note: string } | undefined;
  const borne = (valeur: string | undefined, defaut: string, max: number) =>
    valeur === undefined ? defaut : String(valeur).trim().slice(0, max);
  db.prepare(`
    INSERT INTO facture_mentions (etablissement_id, periode, adresse, reference, note, updated_at, par)
    VALUES (@id, @periode, @adresse, @reference, @note, @now, @par)
    ON CONFLICT(etablissement_id, periode) DO UPDATE SET
      adresse = excluded.adresse, reference = excluded.reference,
      note = excluded.note, updated_at = excluded.updated_at, par = excluded.par
  `).run({
    id: etablissementId, periode,
    adresse: borne(patch.adresse, actuel?.adresse ?? '', MAX_ADRESSE),
    reference: borne(patch.reference, actuel?.reference ?? '', MAX_REFERENCE),
    note: borne(patch.note, actuel?.note ?? '', MAX_NOTE),
    now: Date.now(), par: par.slice(0, 200),
  });
  return mentionsDe(etablissementId, periode);
}

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
  /** Adresse email de facturation de l'école — l'en-tête du document imprimé. */
  billingEmail: string;
  /** Ce que l'école a ajouté pour pouvoir payer (jamais un calcul). */
  mentions: MentionsFacture;
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
           u.provider AS provider, SUM(u.tokens) AS tokens,
           SUM(u.tokens_in) AS tokensIn, SUM(u.tokens_out) AS tokensOut
    FROM usage_log u JOIN etablissements e ON e.id = u.etablissement_id
    WHERE u.ts >= ? AND u.ts < ? AND u.used_server_key = 1
      AND (? IS NULL OR u.etablissement_id = ?)
    GROUP BY u.etablissement_id, u.provider
  `).all(debut, fin, etablissementId, etablissementId) as
    { id: number; nom: string; respire: number; provider: string;
      tokens: number; tokensIn: number; tokensOut: number }[];

  // Une école sans consommation doit tout de même apparaître : « rien à payer »
  // est une information, l'absence de ligne est un doute.
  const ecoles = db.prepare(`
    SELECT id, name AS nom, respire, billing_email AS billingEmail FROM etablissements
    WHERE (? IS NULL OR id = ?) ORDER BY name
  `).all(etablissementId, etablissementId) as
    { id: number; nom: string; respire: number; billingEmail: string }[];

  const emises = db.prepare('SELECT * FROM factures WHERE periode = ?').all(periode) as
    { etablissement_id: number; total: number; emise_at: number; payee_at: number | null }[];

  return ecoles.map(ecole => {
    // UNE SEULE FORMULE, celle du porte-monnaie (coutDe, avec un taux de 0 pour
    // obtenir la consommation nue). La facture recalculait naguère à partir du
    // prix UNIQUE tandis que le porte-monnaie décomptait aux prix ENTRÉE et
    // SORTIE : le relevé affichait 0.00 pendant que le solde baissait
    // réellement. Deux formules pour un même chiffre finissent toujours par
    // diverger — celle-ci n'existe plus qu'à un seul endroit.
    const lignes = brut.filter(b => b.id === ecole.id).map(b => ({
      provider: b.provider,
      tokens: b.tokens,
      prixMtok: prix[b.provider] ?? 0,
      montant: coutDe(b.provider, b.tokensIn, b.tokensOut, 0),
    })).sort((a, b) => b.tokens - a.tokens);

    const jetons = lignes.reduce((n, l) => n + l.tokens, 0);
    const respire = !!ecole.respire;
    // RESPIRE : zéro, participation comprise. Ces écoles sont la destination
    // des 10 %, pas leur source.
    // MÊME RÈGLE QUE LE PORTE-MONNAIE, arrondi vers le haut compris : la
    // facture est le RELEVÉ de ce qui a été décompté, pas un second calcul.
    // Deux calculs parallèles finissent toujours par diverger d'un centime,
    // et c'est l'écart inexpliqué qui ruine la confiance.
    const consommation = respire ? 0 : Math.ceil(lignes.reduce((n, l) => n + l.montant, 0) * 100 - 1e-9) / 100;
    // Le taux est celui que CETTE école a choisi — la facture ne peut pas
    // annoncer un pourcentage différent de celui qui a été décompté.
    // PLUS DE PARTICIPATION SUR LA CONSOMMATION : elle a été prélevée à la
    // recharge. Le relevé montre donc le PRIX COÛTANT, celui que l'école peut
    // confronter au tarif public du fournisseur — c'est tout l'intérêt.
    const pct = contributionDe(titulaireEcole(ecole.id));
    const participation = 0;
    const emise = emises.find(f => f.etablissement_id === ecole.id);

    return {
      etablissementId: ecole.id, etablissement: ecole.nom, respire, periode,
      lignes, jetons, consommation, participation,
      participationPct: pct,
      total: centimes(consommation + participation),
      devise: BillingCurrency,
      emiseAt: emise?.emise_at ?? null,
      payeeAt: emise?.payee_at ?? null,
      billingEmail: ecole.billingEmail,
      // Lues à chaque relecture, jamais figées à l'émission : une école qui
      // corrige sa référence après coup doit pouvoir réimprimer le document
      // sans que le site ait à réémettre — et une réémission, à l'inverse, ne
      // doit rien effacer de ce qu'elle a saisi.
      mentions: mentionsDe(ecole.id, periode),
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
 * Ce que la contribution a rapporté ce mois-ci, et ce qu'elle a financé.
 *
 * ELLE NE SE LIT PLUS SUR LES FACTURES, ET C'EST TOUT LE CORRECTIF. Ce bilan
 * additionnait `facture.participation` — un champ que le passage au prix
 * coûtant met à zéro par construction. La plateforme affichait donc « 0.00
 * encaissé » en regard de ce qu'elle offrait, et le rapprochement qui justifie
 * cet écran — a-t-on collecté de quoi payer la gratuité qu'on promet ? —
 * répondait non tous les mois. Un tableau de bord qui se trompe dans ce
 * sens-là est pire qu'absent : il fait croire à une perte.
 *
 * LA CONTRIBUTION VIT DÉSORMAIS AU REGISTRE DU PORTE-MONNAIE, prélevée à la
 * recharge (src/server/porteMonnaie.ts). On la relit donc là où elle est
 * écrite : les `ajustement` négatifs portant l'en-tête DETAIL_COMMISSION, sur
 * TOUS les titulaires — écoles ET porte-monnaie personnels, puisque les deux
 * la paient et que les deux financent la même gratuité.
 *
 * Le taux affiché n'est plus « le » taux : chaque école choisit le sien entre
 * 3,5 et 10 %, et le plancher de 0.50 le relève sur les petits versements. On
 * montre donc celui qui RESSORT — commission rapportée aux versements du mois.
 */
export function bilanParticipation(year: number, month: number) {
  const db = getDb();
  const debut = monthStartUtc(year, month);
  const fin = monthStartUtc(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1);
  const prix = tarifs();

  // Le `LIKE` porte sur une chaîne que le serveur écrit lui-même, jamais sur
  // une saisie : les deux seules routes de recharge la composent à partir de
  // DETAIL_COMMISSION. Un ajustement manuel qui commencerait par ces mots
  // serait compté à tort — c'est le prix d'un registre dont le genre n'a pas
  // été scindé, et un genre neuf laisserait au contraire tout l'historique
  // hors du compte.
  const encaisse = db.prepare(`
    SELECT COALESCE(SUM(-montant), 0) AS total FROM credit_mouvements
    WHERE ts >= ? AND ts < ? AND genre = 'ajustement' AND montant < 0
      AND detail LIKE ? || '%'
  `).get(debut, fin, DETAIL_COMMISSION) as { total: number };
  const versements = db.prepare(`
    SELECT COALESCE(SUM(montant), 0) AS total FROM credit_mouvements
    WHERE ts >= ? AND ts < ? AND genre = 'recharge' AND montant > 0
  `).get(debut, fin) as { total: number };
  const collectee = encaisse.total;

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

  // LA BASE, C'EST CE QUI A ÉTÉ VERSÉ — plus la consommation facturée. Rapporter
  // la commission à une consommation qu'elle ne touche plus donnerait un taux
  // sans rapport avec celui que les écoles ont réglé au curseur, et qui bougerait
  // au gré d'un mois creux ou chargé.
  const base = versements.total;
  return {
    devise: BillingCurrency,
    pct: base > 0 ? Math.round((collectee / base) * 1000) / 10 : 0,
    collectee: centimes(collectee),
    demo: cout(offerts.filter(o => o.origine === 'demo')),
    respire: cout(offerts.filter(o => o.origine === 'respire')),
    jetonsOfferts: offerts.reduce((n, o) => n + o.tokens, 0),
  };
}
