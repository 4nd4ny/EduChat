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

// ─── OÙ SE PRÉLÈVE LA CONTRIBUTION : À LA RECHARGE, PAS SUR LES JETONS ──────
//
// Règle reprise d'OpenRouter, qui l'énonce ainsi : « We pass through the
// pricing of the underlying providers without any markup on inference
// pricing », et prélève sa commission sur l'ACHAT DE CRÉDIT (5,5 %, minimum
// 0,80 $ chez Stripe). EduChat fait désormais pareil.
//
// POURQUOI C'EST MEILLEUR ICI, et pas seulement conforme à un usage : une
// école peut VÉRIFIER sa facture. Le décompte d'un appel est exactement le
// prix publié par Anthropic, OpenAI ou Mistral — elle ouvre leur tarif, elle
// retrouve notre chiffre. Pour un service qui se présente comme TIERS DE
// CONFIANCE, c'est l'argument le plus fort qu'on puisse offrir : rien à croire
// sur parole. Une marge fondue dans le prix du jeton, à l'inverse, se vérifie
// mal et se soupçonne bien.
//
// Et la commission tombe au moment où l'argent arrive vraiment — au même
// instant que les frais PayPal, qu'elle est là pour couvrir. Le plancher de
// 3,5 % s'aligne alors exactement sur ce qu'ils coûtent.
//
// CE QU'ON N'A PAS REPRIS D'OPENROUTER, et pourquoi :
//   · leur commission de 5 % sur les clés PERSONNELLES. La mesurer supposerait
//     de journaliser l'usage d'une clé privée — or /rgpd promet le contraire,
//     noir sur blanc. Une promesse de confidentialité ne se reprend pas pour
//     encaisser cinq pour cent.
//   · l'expiration des crédits au bout d'un an. Sur un budget scolaire voté
//     puis dépensé lentement, c'est une confiscation. À trancher par le
//     gestionnaire, pas par le code.

/** Bornes du taux de contribution. Le plancher couvre les frais PayPal, rien de plus. */
export const CONTRIBUTION_MIN = 3.5;
export const CONTRIBUTION_MAX = 10;

/**
 * Le taux effectif d'une école : le sien s'il a été choisi, sinon celui du
 * serveur. C'est L'ÉCOLE qui décide de sa contribution, entre 3.5 et 10 % —
 * ce qui rend le service difficile à copier : la valeur n'est pas dans la
 * marge, elle est dans le service, et une école qui choisit ce qu'elle donne
 * n'a aucune raison d'aller voir ailleurs.
 */
export function contributionDe(etablissementId: number): number {
  const row = getDb().prepare('SELECT contribution_pct FROM etablissements WHERE id = ?')
    .get(etablissementId) as { contribution_pct: number } | undefined;
  const choisi = row?.contribution_pct ?? -1;
  if (choisi < 0) return BillingSurchargePct;
  return Math.min(CONTRIBUTION_MAX, Math.max(CONTRIBUTION_MIN, choisi));
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
export function coutDe(provider: string, tokensIn: number, tokensOut: number, pct = 0): number {
  const prix = prixDe(provider);
  const brut = (tokensIn * prix.entree + tokensOut * prix.sortie) / 1_000_000;
  // pct vaut 0 pour tout ce qui est facturé : PASSAGE À PRIX COÛTANT. Le
  // paramètre survit pour les simulations et les relevés qui veulent montrer
  // ce qu'un taux donnerait — jamais pour décompter.
  return versLeHaut(brut * (1 + pct / 100));
}

/**
 * Commission prélevée sur une RECHARGE, au taux choisi par l'école.
 *
 * Un minimum en valeur absolue, parce que les frais de transaction ont une
 * part fixe : sans lui, une recharge de dix francs coûterait plus cher à
 * encaisser qu'elle ne rapporte. OpenRouter fait de même (0,80 $ chez Stripe).
 */
export const COMMISSION_MIN = 0.5;

export function commissionRecharge(etablissementId: number, montant: number):
  { commission: number; credite: number; pct: number } {
  const pct = contributionDe(etablissementId);
  const commission = Math.max(COMMISSION_MIN, versLeHaut(montant * pct / 100));
  // Le crédit descend au centime, la commission monte : jamais l'inverse.
  return { commission, credite: Math.max(0, versLeBas(montant - commission)), pct };
}

/** La part de participation dans un coût — pour la dire, mouvement par mouvement. */
export function partParticipation(cout: number, pct: number): number {
  return versLeHaut(cout - cout / (1 + pct / 100));
}

/** Choisit le taux d'une école, borné. Réservé à qui administre cette école. */
export function reglerContribution(etablissementId: number, pct: number): number {
  const borne = Math.min(CONTRIBUTION_MAX, Math.max(CONTRIBUTION_MIN, pct));
  getDb().prepare('UPDATE etablissements SET contribution_pct = ? WHERE id = ?')
    .run(borne, etablissementId);
  return borne;
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
  // PRIX COÛTANT : plus aucune marge sur l'inférence. Ce que l'école paie ici
  // est exactement ce que le fournisseur nous facture, et elle peut le
  // vérifier contre le tarif public de Claude, ChatGPT ou Mistral. La
  // contribution, elle, a été prélevée à la recharge.
  const cout = coutDe(provider, tokensIn, tokensOut, 0);
  if (!cout) return 0;
  return bouger(etablissementId, 'consommation', -cout, `${provider} · ${modele}`, '');
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
           e.contribution_pct AS contributionPct,
           COALESCE((SELECT SUM(-m.montant) FROM credit_mouvements m
                     WHERE m.etablissement_id = e.id AND m.genre = 'consommation' AND m.ts >= ?), 0) AS depense30
    FROM etablissements e
    WHERE (? IS NULL OR e.id = ?)
    ORDER BY e.name
  `).all(depuis, etablissementId, etablissementId) as
    { id: number; nom: string; respire: number; solde: number; billingEmail: string;
      contributionPct: number; depense30: number }[];

  return rows.map(r => {
    const parJour = r.depense30 / 30;
    return {
      etablissementId: r.id, etablissement: r.nom, respire: !!r.respire,
      solde: centimes(r.solde), devise: BillingCurrency,
      billingEmail: r.billingEmail,
      contributionPct: r.contributionPct < 0 ? BillingSurchargePct : r.contributionPct,
      depense30: centimes(r.depense30),
      /** Jours d'autonomie au rythme des trente derniers jours. null = inconnu. */
      jours: parJour > 0 ? Math.max(0, Math.floor(r.solde / parJour)) : null,
      /** Recharge conseillée : de quoi tenir trois mois au même rythme. */
      recharge: parJour > 0 ? Math.max(0, Math.ceil((parJour * 90 - r.solde) / 10) * 10) : 0,
      aSec: !r.respire && r.solde <= 0,
    };
  });
}
