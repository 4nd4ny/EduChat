// LE PORTE-MONNAIE D'UNE ÉCOLE.
//
// L'école provisionne, la plateforme décompte, et l'accès se ferme quand le
// solde est épuisé. Personne ne court après une facture : c'est tout l'intérêt.
//
// CE QU'ON PEUT DÉCOMPTER, EXACTEMENT. Les API de complétion ne renvoient PAS
// de coût — vérifié : Anthropic rend input_tokens/output_tokens, Mistral rend
// prompt_tokens/completion_tokens, aucun des deux ne rend de montant. Ce qu'on
// a, ce sont des JETONS, séparés entrée/sortie depuis qu'on a cessé de les
// additionner. Le coût est donc exact au TARIF près et au CHANGE près — les
// deux seules approximations, toutes deux assumées et visibles.
//
// UN REGISTRE, PAS SEULEMENT UN SOLDE. Une recharge est un événement dont on
// demandera des comptes ; un solde seul ne sait pas d'où il vient. Chaque
// mouvement est écrit, et le solde de l'établissement est mis à jour DANS LA
// MÊME TRANSACTION — sinon les deux divergent et plus rien ne se réconcilie.

import { getDb } from './db';
import { BillingCurrency, BillingSurchargePct } from '../utils/env';

export type Mouvement = {
  id: number; etablissementId: number; ts: number;
  /** recharge (+) · consommation (−) · ajustement (±) */
  genre: 'recharge' | 'consommation' | 'ajustement';
  montant: number; solde: number; detail: string; par: string;
};

// DEUX ARRONDIS, ET JAMAIS LE MÊME. Arrondir « au plus proche » revient à
// perdre un demi-centime une fois sur deux — sur des millions d'appels, c'est
// la plateforme qui paie la différence, et elle n'a pas les moyens. Ce qu'on
// PRÉLÈVE monte, ce qu'on CRÉDITE descend. Un helper unique serait le moyen
// le plus sûr de voir la mauvaise direction revenir un jour par distraction.
const versLeHaut = (x: number) => Math.ceil(x * 100 - 1e-9) / 100;
const versLeBas = (x: number) => Math.floor(x * 100 + 1e-9) / 100;
const centimes = (x: number) => Math.round(x * 100) / 100;   // affichage seul

/** Prix du million de jetons, entrée et sortie, dans la monnaie de facturation. */
function prixDe(provider: string): { entree: number; sortie: number } {
  const row = getDb().prepare(
    'SELECT prix_mtok, prix_entree_mtok, prix_sortie_mtok FROM tarifs WHERE provider = ?')
    .get(provider) as { prix_mtok: number; prix_entree_mtok: number; prix_sortie_mtok: number } | undefined;
  if (!row) return { entree: 0, sortie: 0 };
  // Repli sur le prix unique tant que le détail n'a pas été réglé : mieux vaut
  // décompter approximativement que ne rien décompter du tout.
  if (!row.prix_entree_mtok && !row.prix_sortie_mtok) {
    return { entree: row.prix_mtok, sortie: row.prix_mtok };
  }
  return { entree: row.prix_entree_mtok, sortie: row.prix_sortie_mtok };
}

/**
 * Ce que coûte un appel, PARTICIPATION COMPRISE.
 *
 * Le porte-monnaie est la vérité : c'est lui qu'on décompte, c'est lui qui
 * ferme l'accès. La facture n'en est que le relevé. Décompter le tarif nu ici
 * pendant que la facture ajoutait 10 % donnait deux chiffres pour la même
 * consommation — et une fois qu'il est question d'argent, un écart inexpliqué
 * est ce qui ruine la confiance.
 *
 * Arrondi VERS LE HAUT, au centime : une plateforme financée par le chômage
 * de son auteur ne peut pas se permettre de perdre un demi-centime une fois
 * sur deux.
 */
export function coutDe(provider: string, tokensIn: number, tokensOut: number): number {
  const prix = prixDe(provider);
  const brut = (tokensIn * prix.entree + tokensOut * prix.sortie) / 1_000_000;
  return versLeHaut(brut * (1 + BillingSurchargePct / 100));
}

/** La part de participation dans un coût — pour la dire, mouvement par mouvement. */
export function partParticipation(cout: number): number {
  return versLeHaut(cout - cout / (1 + BillingSurchargePct / 100));
}

export function solde(etablissementId: number): number {
  const row = getDb().prepare('SELECT solde, respire FROM etablissements WHERE id = ?')
    .get(etablissementId) as { solde: number; respire: number } | undefined;
  return row ? row.solde : 0;
}

/**
 * Cette école peut-elle encore consommer ?
 *
 * RESPIRE : toujours — elle est financée par la participation des autres.
 * Sinon : tant que le solde est strictement positif. Un solde exactement nul
 * ferme l'accès, un solde négatif aussi (un appel peut déborder, voir plus bas).
 */
export function aDuCredit(etablissementId: number): boolean {
  const row = getDb().prepare('SELECT solde, respire FROM etablissements WHERE id = ?')
    .get(etablissementId) as { solde: number; respire: number } | undefined;
  if (!row) return false;
  return !!row.respire || row.solde > 0;
}

/**
 * Écrit un mouvement ET met à jour le solde, dans la même transaction.
 *
 * Appelable DEPUIS une transaction en cours (better-sqlite3 les imbrique en
 * points de sauvegarde) : le décompte d'un appel s'écrit avec sa ligne de
 * journal, jamais à côté.
 */
export function bouger(
  etablissementId: number, genre: Mouvement['genre'], montant: number,
  detail = '', par = '', paypalId: string | null = null,
): number {
  const db = getDb();
  // Un crédit descend au centime, un débit monte : jamais l'inverse. On ne
  // crédite pas un centime qu'on n'a pas reçu.
  const exact = montant >= 0 ? versLeBas(montant) : -versLeHaut(-montant);
  return db.transaction(() => {
    db.prepare('UPDATE etablissements SET solde = ROUND(solde + ?, 2) WHERE id = ?')
      .run(exact, etablissementId);
    const apres = (db.prepare('SELECT solde FROM etablissements WHERE id = ?')
      .get(etablissementId) as { solde: number }).solde;
    // paypal_id porte une contrainte UNIQUE : c'est LUI qui garantit qu'une
    // notification rejouée ne crédite pas deux fois. La violation fait échouer
    // toute la transaction — solde compris —, ce qu'aucun « SELECT puis
    // INSERT » ne sait faire face à deux requêtes simultanées.
    db.prepare(`
      INSERT INTO credit_mouvements (etablissement_id, ts, genre, montant, solde, detail, par, paypal_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(etablissementId, Date.now(), genre, exact, apres, detail.slice(0, 200), par, paypalId);
    return apres;
  })();
}

/**
 * Décompte un appel. Ne refuse JAMAIS : le contrôle a lieu AVANT l'appel, et
 * une réponse déjà produite doit être payée même si elle fait passer le solde
 * sous zéro. Le dépassement d'un appel est borné par la taille d'une réponse ;
 * c'est le prix d'un décompte qui n'interrompt jamais quelqu'un en train de
 * lire.
 */
export function decompter(
  etablissementId: number, provider: string, tokensIn: number, tokensOut: number, modele: string,
): number {
  // RESPIRE ne se décompte pas. Le tarif, lui, n'est PAS nul — il est le même
  // pour tout le monde : c'est l'ÉCOLE qui est exonérée, pas le fournisseur.
  // Sans ce test, une école RESPIRE plongerait dans le rouge en silence.
  const ecole = getDb().prepare('SELECT respire FROM etablissements WHERE id = ?')
    .get(etablissementId) as { respire: number } | undefined;
  if (!ecole || ecole.respire) return 0;
  const cout = coutDe(provider, tokensIn, tokensOut);
  if (!cout) return 0;
  // La participation est NOMMÉE dans le mouvement : une école qui lit son
  // historique voit ligne à ligne ce qu'elle finance pour les autres.
  const part = partParticipation(cout);
  return bouger(etablissementId, 'consommation', -cout,
    `${provider} · ${modele} · dont ${part.toFixed(2)} de participation`, '');
}

export function mouvements(etablissementId: number, limite = 50): Mouvement[] {
  return getDb().prepare(`
    SELECT id, etablissement_id AS etablissementId, ts, genre, montant, solde, detail, par
    FROM credit_mouvements WHERE etablissement_id = ? ORDER BY ts DESC LIMIT ?
  `).all(etablissementId, limite) as Mouvement[];
}

/**
 * L'état des porte-monnaie, pour l'administration.
 *
 * `jours` estime l'autonomie restante d'après la dépense des trente derniers
 * jours — c'est la seule façon de recommander une recharge qui ait un sens :
 * un montant ne dit rien, une durée si.
 */
export function etatDesComptes(etablissementId: number | null) {
  const db = getDb();
  const depuis = Date.now() - 30 * 86_400_000;
  const rows = db.prepare(`
    SELECT e.id, e.name AS nom, e.respire, e.solde, e.billing_email AS billingEmail,
           COALESCE((SELECT SUM(-m.montant) FROM credit_mouvements m
                     WHERE m.etablissement_id = e.id AND m.genre = 'consommation' AND m.ts >= ?), 0) AS depense30
    FROM etablissements e
    WHERE (? IS NULL OR e.id = ?)
    ORDER BY e.name
  `).all(depuis, etablissementId, etablissementId) as
    { id: number; nom: string; respire: number; solde: number; billingEmail: string; depense30: number }[];

  return rows.map(r => {
    const parJour = r.depense30 / 30;
    return {
      etablissementId: r.id, etablissement: r.nom, respire: !!r.respire,
      solde: centimes(r.solde), devise: BillingCurrency,
      billingEmail: r.billingEmail,
      depense30: centimes(r.depense30),
      /** Jours d'autonomie au rythme des trente derniers jours. null = inconnu. */
      jours: parJour > 0 ? Math.max(0, Math.floor(r.solde / parJour)) : null,
      /** Recharge conseillée : de quoi tenir trois mois au même rythme. */
      recharge: parJour > 0 ? Math.max(0, Math.ceil((parJour * 90 - r.solde) / 10) * 10) : 0,
      aSec: !r.respire && r.solde <= 0,
    };
  });
}
