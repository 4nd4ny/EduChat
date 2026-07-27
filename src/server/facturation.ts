// LA FACTURE D'UNE ÉCOLE — AU PRIX COÛTANT, ET RIEN D'AUTRE.
//
// UNE LIGNE PAR MODÈLE, ET QUATRE CHIFFRES QUI SE REFONT À LA MAIN : les
// jetons d'entrée, les jetons de sortie, le prix de l'un et le prix de l'autre.
// Une direction rouvre le tarif public du modèle nommé sur la ligne, multiplie,
// et retrouve notre montant. C'est toute la promesse du prix coûtant, et c'est
// tout ce qu'une direction demande.
//
// CE QUI ÉTAIT : une ligne par FOURNISSEUR, à un prix unique appliqué à
// l'entrée comme à la sortie, là où les éditeurs en publient deux dont le
// rapport va de 1 à 5. Le chiffre ne se retrouvait donc nulle part, et une
// facture qu'on ne peut pas recouper n'est pas une facture, c'est une demande
// de confiance.
//
// LE MONTANT NE SE RECALCULE PAS, IL S'ADDITIONNE — et cette distinction vaut
// de l'argent. L'arrondi du porte-monnaie monte APPEL PAR APPEL (versLeHaut,
// jamais au plus proche) ; sommer les jetons d'un mois pour ne monter qu'une
// fois à la fin rendrait un total inférieur d'un centime par appel à ce qui a
// réellement été prélevé, et le relevé démentirait le solde. Chaque appel a donc
// figé son montant sur sa ligne de journal, et la facture les additionne. Les
// jetons et les prix restent là pour que le calcul se REFASSE, jamais pour
// qu'il se remplace.
//
// CE COMMENTAIRE DISAIT AUSSI QUE LA CONSOMMATION « SE RECALCULE À TOUT
// MOMENT ». Elle ne le fait plus au tarif du JOUR, et c'est voulu : un tarif
// qui change ce soir ne doit pas déplacer d'un centime ce qu'une école devait
// ce matin. Les factures antérieures au prix par modèle, dont les lignes de
// journal ne portent aucun prix figé (tarif_at = 0), se relisent à l'ancienne
// formule — au prix unique du fournisseur, exactement comme hier.
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
import { contributionDe, coutAuTarif, titulaireEcole, DETAIL_COMMISSION } from './porteMonnaie';

/**
 * UNE LIGNE DE FACTURE — tout ce qu'il faut pour la refaire soi-même.
 *
 * Le modèle est nommé (un prix sans le nom du modèle ne se vérifie nulle part),
 * les jetons sont séparés, les deux prix sont ceux QU'ON A APPLIQUÉS ce
 * mois-là — pas ceux d'aujourd'hui.
 */
export type LigneFacture = {
  provider: string;
  /** Le modèle réellement appelé. C'est lui qui porte le prix. */
  modele: string;
  /** La somme des deux, conservée : tous les écrans existants la lisent. */
  tokens: number;
  tokensIn: number;
  tokensOut: number;
  /**
   * LE NOMBRE D'APPELS, ET IL EST INDISPENSABLE À LA VÉRIFICATION.
   *
   * Sans lui, la ligne ne se recoupe PAS : le montant est la somme d'arrondis
   * pris appel par appel (règle du porte-monnaie, toujours vers le haut), et il
   * dépasse donc le simple produit jetons × prix. Une direction qui multiplie
   * et trouve moins conclurait à une erreur. Avec le compte d'appels, elle sait
   * exactement d'où vient l'écart et peut l'encadrer : jamais plus d'un centime
   * par appel. Un chiffre qui explique un écart vaut mieux qu'un écart tu.
   */
  appels: number;
  /** Prix du million de jetons appliqués à CES appels-là, entrée et sortie. */
  prixEntreeMtok: number;
  prixSortieMtok: number;
  montant: number;
  /**
   * Vide quand le prix est celui du modèle appelé. Sinon, ce qui a servi à sa
   * place, dit en clair — une ligne facturée au repli ne doit pas ressembler à
   * une ligne ordinaire.
   */
  repli: string;
  /**
   * Ligne antérieure au prix par modèle : relue au prix unique du fournisseur,
   * comme elle l'a toujours été. Le passé ne se réécrit pas en silence.
   */
  ancien: boolean;
};

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
  lignes: LigneFacture[];
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

/**
 * Le prix UNIQUE par fournisseur, réglé à la main. CE N'EST PLUS CE QUI
 * FACTURE : le prix vient désormais du modèle appelé (tarifs_modeles, écrit par
 * la sonde). Il ne sert plus qu'à deux choses, toutes deux nécessaires — de
 * dernier recours quand aucun prix par modèle n'a pu être relevé, et de clé de
 * relecture pour les lignes de journal antérieures au changement, qui ne
 * portent pas de prix figé.
 */
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
 * CE QUI A DÉJÀ ÉTÉ FACTURÉ À L'AVEUGLE — la trace que l'administration doit
 * voir, et la seule qui parle d'argent réellement bougé.
 *
 * Un repli protège le budget dans le bon sens, mais il ne doit jamais devenir
 * l'état normal : ce que cette liste montre, c'est un modèle dont personne n'a
 * relevé le prix et que des classes emploient tous les jours. Elle se dérive du
 * journal, sans table supplémentaire — donc elle ne peut pas se désaccorder de
 * ce qui a été prélevé, et elle disparaît d'elle-même dès que la sonde relève
 * le prix manquant.
 *
 * Les trente derniers jours : au-delà, un modèle retiré du catalogue il y a six
 * mois resterait signalé pour toujours, et une alerte perpétuelle ne se lit
 * plus.
 */
export function repliObserves() {
  const depuis = Date.now() - 30 * 86_400_000;
  return getDb().prepare(`
    SELECT provider, model AS modele, tarif_repli AS repli,
           COUNT(*) AS appels, COALESCE(SUM(montant), 0) AS montant, MAX(ts) AS dernier
    FROM usage_log
    WHERE ts >= ? AND tarif_at > 0 AND tarif_repli <> ''
      -- LA DÉMONSTRATION PUBLIQUE RESTE DEHORS. Elle tourne sur un modèle que
      -- la sonde n'interroge pas (hors des trois fournisseurs d'école) : elle
      -- figurerait donc ici à jamais, et une alerte perpétuelle ne se lit plus.
      -- Le tri se fait sur ce qui distingue vraiment ces lignes — de l'argent
      -- prélevé, ou une école identifiée (une école RESPIRE prélève zéro et
      -- doit tout de même apparaître : c'est la plateforme qui paie pour elle).
      -- Reste hors du compte un porte-monnaie personnel dont le tarif vaudrait
      -- zéro : ce cas-là, le journal d'erreurs le crie et « barreaux sans
      -- tarif » le prévient.
      AND (montant > 0 OR etablissement_id IS NOT NULL)
    GROUP BY provider, model, tarif_repli
    ORDER BY montant DESC, appels DESC
  `).all(depuis) as Array<{
    provider: string; modele: string; repli: string;
    appels: number; montant: number; dernier: number;
  }>;
}

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
  //
  // LE REGROUPEMENT PORTE AUSSI SUR LES DEUX PRIX, et c'est délibéré : si le
  // tarif d'un modèle a changé au milieu du mois, l'école lit DEUX lignes pour
  // ce modèle, chacune avec le prix qui lui a été appliqué. Une ligne unique
  // portant l'un des deux prix serait invérifiable — la multiplication ne
  // tomberait juste ni avec l'ancien ni avec le nouveau.
  //
  // `tarif_at > 0` sépare les lignes d'AVANT le prix par modèle, qui ne portent
  // aucun prix figé et se relisent à l'ancienne formule.
  const brut = db.prepare(`
    SELECT u.etablissement_id AS id,
           u.provider AS provider, u.model AS modele,
           SUM(u.tokens) AS tokens,
           SUM(u.tokens_in) AS tokensIn, SUM(u.tokens_out) AS tokensOut,
           COUNT(*) AS appels, SUM(u.montant) AS montant,
           u.prix_entree_mtok AS prixEntree, u.prix_sortie_mtok AS prixSortie,
           MAX(u.tarif_repli) AS repli,
           MAX(u.tarif_at) AS tarifAt
    FROM usage_log u JOIN etablissements e ON e.id = u.etablissement_id
    WHERE u.ts >= ? AND u.ts < ? AND u.used_server_key = 1
      AND (? IS NULL OR u.etablissement_id = ?)
    GROUP BY u.etablissement_id, u.provider, u.model,
             u.prix_entree_mtok, u.prix_sortie_mtok, u.tarif_at > 0
  `).all(debut, fin, etablissementId, etablissementId) as
    { id: number; provider: string; modele: string;
      tokens: number; tokensIn: number; tokensOut: number; appels: number; montant: number;
      prixEntree: number; prixSortie: number; repli: string; tarifAt: number }[];

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
    // LE MONTANT VIENT DU REGISTRE, PAS D'UN SECOND CALCUL. Chaque appel a figé
    // ce qu'il a coûté sur sa ligne de journal, au moment même où il était
    // prélevé du porte-monnaie : additionner ces montants est la SEULE façon
    // que le relevé et le solde disent le même franc. Refaire la
    // multiplication à partir des jetons du mois donnerait un centime de moins
    // par appel, parce que l'arrondi du porte-monnaie monte appel par appel.
    //
    // LES LIGNES ANCIENNES (tarif_at = 0) N'ONT RIEN FIGÉ : elles datent d'avant
    // le prix par modèle. On les relit exactement comme hier — au prix unique du
    // fournisseur, appliqué à l'entrée comme à la sortie —, et on le DIT
    // (`ancien`). Réévaluer le passé au tarif d'aujourd'hui changerait des
    // factures déjà émises et déjà payées.
    const lignes: LigneFacture[] = brut.filter(b => b.id === ecole.id).map(b => {
      const ancien = !b.tarifAt;
      const unique = prix[b.provider] ?? 0;
      const prixEntree = ancien ? unique : b.prixEntree;
      const prixSortie = ancien ? unique : b.prixSortie;
      return {
        provider: b.provider, modele: b.modele,
        tokens: b.tokens, tokensIn: b.tokensIn, tokensOut: b.tokensOut, appels: b.appels,
        prixEntreeMtok: prixEntree, prixSortieMtok: prixSortie,
        montant: ancien
          ? coutAuTarif({ entree: prixEntree, sortie: prixSortie }, b.tokensIn, b.tokensOut, 0)
          : centimes(b.montant),
        repli: b.repli ?? '', ancien,
      };
    }).sort((a, b) => b.montant - a.montant || b.tokens - a.tokens);

    const jetons = lignes.reduce((n, l) => n + l.tokens, 0);
    const respire = !!ecole.respire;
    // RESPIRE : zéro, participation comprise. Ces écoles sont la destination
    // des 10 %, pas leur source.
    // L'ARRONDI RESTE DIRECTIONNEL — vers le haut, jamais au plus proche : le
    // service ne doit pas passer dans le rouge par arrondi. Il ne fait plus ici
    // qu'absorber le bruit des flottants, chaque montant additionné étant déjà
    // arrondi au centime, mais garder la direction ne coûte rien et perdre la
    // règle de vue coûterait un jour un demi-centime une fois sur deux.
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
