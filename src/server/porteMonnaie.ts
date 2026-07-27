// LE PORTE-MONNAIE — CELUI D'UNE ÉCOLE, CELUI D'UNE PERSONNE, MÊME RÈGLE.
//
// Le titulaire provisionne, la plateforme décompte, et l'accès se ferme quand
// le solde est épuisé. Personne ne court après une facture : c'est tout
// l'intérêt.
//
// POURQUOI UN « TITULAIRE » ET NON DEUX MODULES. Une école et un particulier
// achètent la même chose au même prix : des jetons au prix coûtant, avec une
// contribution prélevée à la recharge. Écrire deux fois l'arrondi directionnel,
// la commission et le registre, c'est se garantir qu'un jour on corrigera l'un
// sans l'autre — et que deux chiffres décriront le même franc. Ce qui diffère
// entre les deux n'est PAS une règle d'argent : c'est une ligne de SQL (quelle
// table porte le solde) et un taux de contribution (choisi par l'école, imposé
// par la plateforme au particulier). Tout le reste est commun, et le reste
// c'est presque tout.
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

// ─── QUI DÉTIENT CE PORTE-MONNAIE ───────────────────────────────────────────
//
// Une union discriminée, et non un couple (id, email) dont l'un serait toujours
// nul : le type interdit alors, à la compilation, d'oublier un cas ou d'en
// remplir deux. Chaque fonction d'argent en prend un, et un seul.

export type Titulaire =
  | { genre: 'ecole'; id: number }
  | { genre: 'compte'; email: string };

export const titulaireEcole = (id: number): Titulaire => ({ genre: 'ecole', id });
export const titulaireCompte = (email: string): Titulaire => ({ genre: 'compte', email });

/**
 * SENTINELLE : une ligne personnelle porte etablissement_id = 0.
 *
 * credit_mouvements.etablissement_id est NOT NULL depuis l'origine et les
 * migrations sont additives — on ne peut donc pas la rendre nullable. Aucun
 * établissement ne porte l'id 0 (AUTOINCREMENT commence à 1) : toutes les
 * lectures existantes, qui filtrent sur un id réel, ignorent ces lignes sans
 * qu'on ait eu à les toucher. C'est titulaire_email qui dit la vérité.
 */
const SANS_ECOLE = 0;

/** Les deux colonnes qui localisent un mouvement, pour l'écriture et la lecture. */
function cle(t: Titulaire): { etablissementId: number; email: string | null } {
  return t.genre === 'ecole'
    ? { etablissementId: t.id, email: null }
    : { etablissementId: SANS_ECOLE, email: t.email };
}

// DEUX ARRONDIS, ET JAMAIS LE MÊME. Arrondir « au plus proche » revient à
// perdre un demi-centime une fois sur deux — sur des millions d'appels, c'est
// la plateforme qui paie la différence, et elle n'a pas les moyens. Ce qu'on
// PRÉLÈVE monte, ce qu'on CRÉDITE descend. Un helper unique serait le moyen
// le plus sûr de voir la mauvaise direction revenir un jour par distraction.
const versLeHaut = (x: number) => Math.ceil(x * 100 - 1e-9) / 100;
const versLeBas = (x: number) => Math.floor(x * 100 + 1e-9) / 100;
const centimes = (x: number) => Math.round(x * 100) / 100;   // affichage seul

// ─── LE PRIX D'UN APPEL SE LIT SUR LE MODÈLE, PAS SUR LE FOURNISSEUR ────────
//
// CE QUI ÉTAIT, ET POURQUOI ÇA NE POUVAIT PAS TENIR. Un seul prix était lu par
// FOURNISSEUR, et il était appliqué à l'entrée comme à la sortie. Or les trois
// barreaux d'un même éditeur vont de 1 à 15 le million de jetons, et le rapport
// entrée/sortie va de 1 à 5 chez tous. Aucun prix unique ne pouvait donc être
// juste, et la promesse d'un prix coûtant « recalculable au centime » — la
// seule chose que ce service ait à offrir à une école qui doit justifier un
// budget — ne pouvait pas être tenue.
//
// CE QUI EST : le prix vient de tarifs_modeles, écrit par la sonde depuis le
// catalogue public d'OpenRouter, POUR LE MODÈLE RÉELLEMENT APPELÉ. Une école
// rouvre le tarif public du barreau qu'elle emploie et retrouve nos deux
// chiffres.

/** Ce qu'on a réellement appliqué à un appel — et d'où ça vient. */
export type TarifApplique = {
  provider: string;
  /** Le modèle réellement appelé (effModel) : c'est lui qui fixe le prix. */
  modele: string;
  /** Prix du million de jetons, dans la monnaie de facturation. */
  entree: number;
  sortie: number;
  /**
   * VIDE quand ce modèle a son propre prix relevé. Sinon, ce qui a servi à sa
   * place, dit en clair : la phrase voyage jusqu'au registre du porte-monnaie
   * et jusqu'à l'administration, parce qu'un décompte approximatif qui ne se
   * dit pas est un décompte faux qu'on découvrira trop tard.
   */
  repli: string;
  /** Date de la résolution. 0 n'existe pas ici : il marque les lignes anciennes. */
  at: number;
};

/**
 * LE TARIF D'UN APPEL, ET LA CHAÎNE DE REPLI QUI GARANTIT QU'IL N'EST PAS NUL.
 *
 * PREMIÈRE RÈGLE, AVANT TOUTES LES AUTRES : NE JAMAIS FACTURER ZÉRO EN SILENCE.
 * Un zéro muet, c'est le service qui travaille à perte sans que personne le
 * voie — et comme rien ne casse, on s'en aperçoit à la fin de l'année. Mais un
 * refus de servir n'est pas une option non plus : on ne bloque pas une classe
 * en pleine séance parce qu'un nom de modèle a changé chez l'éditeur.
 *
 * D'où quatre niveaux, chacun faisant un travail que le suivant ne fait pas :
 *
 *   1. LE PRIX DU MODÈLE, relevé au catalogue. Le cas normal.
 *   2. LE BARREAU LE PLUS CHER CONNU DU MÊME FOURNISSEUR. C'est un tarif RÉEL,
 *      celui d'un modèle qui existe et dont le prix se recoupe — et non un
 *      maximum colonne par colonne, qui fabriquerait un tarif chimérique que
 *      personne ne pourrait vérifier nulle part. Il protège le budget dans le
 *      bon sens : on surestime le coût d'un modèle inconnu plutôt que de le
 *      sous-estimer, et l'école consomme un peu moins que ce qu'elle a payé
 *      plutôt qu'un peu plus.
 *   3. LE PRIX UNIQUE DU FOURNISSEUR (table `tarifs`), s'il est réglé à la
 *      main. C'est l'ancien comportement, conservé pour les fournisseurs que la
 *      sonde n'interroge pas.
 *   4. ZÉRO, ET SEULEMENT ALORS — parce qu'on ne peut pas inventer un prix. Il
 *      part au journal d'erreurs et il est nommé sur chaque ligne qu'il touche.
 *
 * LA DEVISE EST UNE CONDITION D'APPLICATION, pas un détail d'affichage. La
 * sonde laisse ses montants EN DOLLARS le jour où le taux de change est
 * injoignable ; les appliquer tels quels à une facture en francs serait une
 * erreur de 20 % annoncée comme un fait. Une ligne dont la devise n'est pas
 * celle de facturation est donc traitée comme absente.
 */
export function tarifDuModele(provider: string, modele: string): TarifApplique {
  const db = getDb();
  const at = Date.now();
  const base = { provider, modele, at };
  const devise = BillingCurrency.toUpperCase();

  const lu = db.prepare(`
    SELECT prix_entree_mtok AS entree, prix_sortie_mtok AS sortie FROM tarifs_modeles
    WHERE provider = ? AND modele = ? AND UPPER(devise) = ?
      AND (prix_entree_mtok > 0 OR prix_sortie_mtok > 0)
  `).get(provider, modele, devise) as { entree: number; sortie: number } | undefined;
  if (lu) return { ...base, entree: lu.entree, sortie: lu.sortie, repli: '' };

  // Le plus cher se mesure sur la SORTIE d'abord : c'est elle qui domine le
  // coût d'un tuteur socratique, qui écrit plus qu'il ne lit.
  const cher = db.prepare(`
    SELECT modele, prix_entree_mtok AS entree, prix_sortie_mtok AS sortie FROM tarifs_modeles
    WHERE provider = ? AND UPPER(devise) = ? AND (prix_entree_mtok > 0 OR prix_sortie_mtok > 0)
    ORDER BY prix_sortie_mtok DESC, prix_entree_mtok DESC LIMIT 1
  `).get(provider, devise) as { modele: string; entree: number; sortie: number } | undefined;
  if (cher) {
    return {
      ...base, entree: cher.entree, sortie: cher.sortie,
      repli: `Aucun tarif relevé pour « ${modele} » : prix du barreau le plus cher (${cher.modele}).`,
    };
  }

  const unique = db.prepare(
    'SELECT prix_mtok, prix_entree_mtok, prix_sortie_mtok FROM tarifs WHERE provider = ?')
    .get(provider) as { prix_mtok: number; prix_entree_mtok: number; prix_sortie_mtok: number } | undefined;
  const entree = unique?.prix_entree_mtok || unique?.prix_mtok || 0;
  const sortie = unique?.prix_sortie_mtok || unique?.prix_mtok || 0;
  if (entree || sortie) {
    return { ...base, entree, sortie, repli: `Aucun tarif relevé pour « ${modele} » : prix unique du fournisseur.` };
  }

  // DERNIER NIVEAU, et il ne crie PAS ICI. La démonstration publique gratuite
  // passe par cette même fonction sur un modèle que la sonde n'interroge pas :
  // hurler à chaque appel de démonstration noierait l'anomalie qu'on cherche
  // sous du bruit quotidien, ce qui revient exactement à se taire. C'est
  // `decompter` qui alerte — là où de l'argent aurait dû bouger et n'a pas
  // bougé. La colonne tarif_repli, elle, porte la raison aussi longtemps que
  // la ligne, démonstration comprise.
  return { ...base, entree: 0, sortie: 0, repli: `Aucun tarif connu pour « ${modele} » : rien n'a été décompté.` };
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
 * Le taux effectif d'un titulaire.
 *
 * UNE ÉCOLE CHOISIT le sien, entre 3.5 et 10 % — ce qui rend le service
 * difficile à copier : la valeur n'est pas dans la marge, elle est dans le
 * service, et une école qui choisit ce qu'elle donne n'a aucune raison d'aller
 * voir ailleurs. À défaut de choix, le réglage du serveur.
 *
 * UNE PERSONNE NE CHOISIT PAS, ET N'A RIEN À CHOISIR : elle paie le PLANCHER,
 * toujours, et le plancher ne couvre que les frais d'encaissement de PayPal.
 * Ce n'est pas la même chose que « pas de curseur » — c'est ZÉRO MARGE.
 *
 * Le curseur de 3,5 à 10 % est l'affaire des ÉCOLES : une direction arbitre un
 * budget public et décide ce qu'elle donne à la gratuité des autres. Un
 * particulier, lui, n'a pas à financer les écoles — le site est fait pour lui,
 * ce sont les écoles qui doivent aider les élèves et non l'inverse. Lui
 * appliquer le réglage du serveur (BillingSurchargePct, 10 % par défaut !)
 * revenait à lui faire payer une participation dont il n'est pas le
 * bénéficiaire, et à laquelle il n'avait pas consenti.
 *
 * CONTRIBUTION_MIN vaut exactement FRAIS_PAYPAL_PCT (src/server/paypal.ts) :
 * la constante n'est pas importée d'ici parce que paypal.ts importe ce
 * module — le cycle serait pire que la duplication d'un 3,5 commenté des deux
 * côtés. Voir COMMISSION_MIN pour la PART FIXE des mêmes frais.
 */
export function contributionDe(t: Titulaire): number {
  if (t.genre === 'compte') return CONTRIBUTION_MIN;
  const row = getDb().prepare('SELECT contribution_pct FROM etablissements WHERE id = ?')
    .get(t.id) as { contribution_pct: number } | undefined;
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
export function coutAuTarif(
  tarif: { entree: number; sortie: number }, tokensIn: number, tokensOut: number, pct = 0,
): number {
  const brut = (tokensIn * tarif.entree + tokensOut * tarif.sortie) / 1_000_000;
  // pct vaut 0 pour tout ce qui est facturé : PASSAGE À PRIX COÛTANT. Le
  // paramètre survit pour les simulations et les relevés qui veulent montrer
  // ce qu'un taux donnerait — jamais pour décompter.
  return versLeHaut(brut * (1 + pct / 100));
}

/**
 * LA PART FIXE DES FRAIS D'ENCAISSEMENT, en valeur absolue.
 *
 * PayPal ne facture pas qu'un pourcentage : il prend aussi un forfait par
 * transaction (de l'ordre d'un demi-franc en Suisse). Encaisser cinq francs
 * coûte donc proportionnellement bien plus cher qu'en encaisser deux cents, et
 * sans ce plancher une petite recharge coûterait à la plateforme plus qu'elle
 * ne lui rapporte. OpenRouter fait de même (0,80 $ chez Stripe).
 *
 * CE PLANCHER MORD, ET IL DOIT SE DIRE. Sur 5 francs il prélève 0.50, soit
 * 10 % — pas 3,5. Toute phrase affichée et toute ligne de registre qui
 * annoncent « le pourcentage » sans nommer ce forfait promettent un chiffre
 * que le relevé démentira : voir `plancher` ci-dessous, qui existe pour que
 * l'écran et le registre puissent dire lequel des deux a joué.
 */
export const COMMISSION_MIN = 0.5;

/**
 * L'EN-TÊTE DU MOUVEMENT DE COMMISSION — une seule fois écrite, et voici
 * pourquoi elle mérite une constante.
 *
 * La commission s'inscrit au registre comme un `ajustement` négatif : c'est ce
 * qu'elle est (le versement, lui, est la `recharge`), et lui inventer un genre
 * à part laisserait les mouvements déjà écrits sous l'ancien nom, donc hors de
 * toute somme future. Le detail est alors le SEUL moyen de la reconnaître, et
 * le bilan de la plateforme (bilanParticipation, src/server/facturation.ts) en
 * dépend : une chaîne recopiée à la main dans les deux routes de recharge et
 * une troisième fois dans la requête qui les additionne se serait désaccordée
 * au premier remaniement, et le bilan serait tombé à zéro sans rien casser —
 * la panne la plus difficile à voir.
 */
export const DETAIL_COMMISSION = 'Contribution aux frais';

/**
 * LE LIBELLÉ D'UNE RETENUE, QUI DOIT SURVIVRE À LA LECTURE DU RELEVÉ.
 *
 * Écrire « (3,5 %) » en face de −0.50 sur une recharge de 5 francs est faux :
 * c'est 10 %. Le titulaire ne le découvre pas à l'écran — où l'on peut encore
 * nuancer — mais des mois plus tard, au relevé, seul, avec deux chiffres qui
 * ne se recoupent pas. On nomme donc CE QUI A ÉTÉ APPLIQUÉ : le pourcentage
 * quand c'est lui, le forfait quand c'est le forfait.
 *
 * L'EN-TÊTE NE BOUGE PAS. bilanParticipation (src/server/facturation.ts)
 * retrouve ces lignes par `detail LIKE DETAIL_COMMISSION || '%'` : tout ce qui
 * suit est libre, ce qui précède ne l'est pas. D'où la composition ici, en un
 * seul endroit, plutôt que dans chacune des deux routes de recharge.
 */
export function detailCommission(
  c: { pct: number; commission: number; plancher: boolean }, devise: string,
): string {
  return c.plancher
    ? `${DETAIL_COMMISSION} (forfait ${c.commission.toFixed(2)} ${devise})`
    : `${DETAIL_COMMISSION} (${c.pct} %)`;
}

/**
 * Ce qu'une recharge retient, et LEQUEL DES DEUX CALCULS a gagné.
 *
 * `pct` reste le taux NOMINAL du titulaire — celui que l'école a choisi, le
 * plancher pour une personne. `plancher` dit que le forfait a mordu, c'est-à-
 * dire que la retenue n'est PAS ce pourcentage : sans ce booléen, chaque
 * appelant refait la comparaison de son côté, et le jour où l'un d'eux
 * l'oublie, l'écran ou le relevé annonce un taux que le montant dément.
 */
export function commissionRecharge(t: Titulaire, montant: number):
  { commission: number; credite: number; pct: number; plancher: boolean } {
  const pct = contributionDe(t);
  const proportionnelle = versLeHaut(montant * pct / 100);
  const commission = Math.max(COMMISSION_MIN, proportionnelle);
  // Le crédit descend au centime, la commission monte : jamais l'inverse.
  return {
    commission,
    credite: Math.max(0, versLeBas(montant - commission)),
    pct,
    plancher: commission > proportionnelle,
  };
}

/** La part de participation dans un coût — pour la dire, mouvement par mouvement. */
export function partParticipation(cout: number, pct: number): number {
  return versLeHaut(cout - cout / (1 + pct / 100));
}

/**
 * Choisit le taux d'une école, borné. Réservé à qui administre cette école.
 * Pas d'équivalent pour un compte : voir contributionDe — un particulier paie
 * le taux de la plateforme, il n'a pas de curseur à régler.
 */
export function reglerContribution(etablissementId: number, pct: number): number {
  const borne = Math.min(CONTRIBUTION_MAX, Math.max(CONTRIBUTION_MIN, pct));
  getDb().prepare('UPDATE etablissements SET contribution_pct = ? WHERE id = ?')
    .run(borne, etablissementId);
  return borne;
}

/** L'état brut du porte-monnaie : son solde, et l'exonération s'il en a une. */
function etat(t: Titulaire): { solde: number; respire: boolean } | null {
  const db = getDb();
  if (t.genre === 'ecole') {
    const row = db.prepare('SELECT solde, respire FROM etablissements WHERE id = ?')
      .get(t.id) as { solde: number; respire: number } | undefined;
    return row ? { solde: row.solde, respire: !!row.respire } : null;
  }
  const row = db.prepare('SELECT solde FROM users WHERE email = ?')
    .get(t.email) as { solde: number } | undefined;
  // RESPIRE N'EXISTE PAS POUR UNE PERSONNE, et ce n'est pas un oubli :
  // l'exonération est un geste envers une institution qui ne peut pas payer
  // (voir admin.credit.rateHelp), financé par la contribution des autres
  // écoles. Un particulier qui ne peut pas payer a déjà la démonstration
  // publique gratuite — il n'a pas besoin d'un porte-monnaie pour cela.
  return row ? { solde: row.solde, respire: false } : null;
}

export function soldeDe(t: Titulaire): number {
  return etat(t)?.solde ?? 0;
}

/**
 * Ce titulaire peut-il encore consommer ?
 *
 * RESPIRE (écoles seulement) : toujours — elle est financée par la
 * participation des autres. Sinon : tant que le solde est STRICTEMENT positif.
 * Un solde exactement nul ferme l'accès, un solde négatif aussi (un appel peut
 * déborder, voir plus bas).
 *
 * Le « strictement » compte doublement depuis que ce test sert aussi de moyen
 * de paiement personnel (src/server/accesFournisseurs.ts) : un `>= 0` donnerait
 * à quiconque a possédé un jour un centime un laissez-passer permanent sur le
 * réseau des écoles.
 */
export function aDuCredit(t: Titulaire): boolean {
  const e = etat(t);
  if (!e) return false;
  return e.respire || e.solde > 0;
}

/**
 * Ce compte a-t-il DÉJÀ un porte-monnaie — c'est-à-dire au moins un mouvement ?
 *
 * Cette question n'a de sens que pour une personne, et elle est indispensable à
 * /api/completion : sans elle, un solde vide serait indiscernable d'une absence
 * de porte-monnaie. Or les deux appellent des réponses opposées — qui n'a
 * jamais provisionné doit continuer de recevoir la démonstration gratuite comme
 * avant, et qui a provisionné puis épuisé doit l'APPRENDRE, et non se retrouver
 * silencieusement rétrogradé sur le petit modèle gratuit en se demandant
 * pourquoi les réponses ont changé.
 *
 * Un porte-monnaie ne se ferme jamais : les mouvements ne sont pas supprimés
 * (registre comptable), donc ce prédicat ne repasse jamais à faux. C'est voulu —
 * on ne veut pas qu'un remboursement rende à quelqu'un une démonstration
 * gratuite qu'il croirait payante.
 */
export function aUnPorteMonnaie(email: string): boolean {
  const row = getDb().prepare('SELECT 1 AS v FROM credit_mouvements WHERE titulaire_email = ? LIMIT 1')
    .get(email) as { v: number } | undefined;
  return !!row;
}

/**
 * Écrit un mouvement ET met à jour le solde, dans la même transaction.
 *
 * Appelable DEPUIS une transaction en cours (better-sqlite3 les imbrique en
 * points de sauvegarde) : le décompte d'un appel s'écrit avec sa ligne de
 * journal, jamais à côté.
 */
export function bouger(
  t: Titulaire, genre: Mouvement['genre'], montant: number,
  detail = '', par = '', paypalId: string | null = null,
): number {
  const db = getDb();
  const { etablissementId, email } = cle(t);
  // Un crédit descend au centime, un débit monte : jamais l'inverse. On ne
  // crédite pas un centime qu'on n'a pas reçu.
  const exact = montant >= 0 ? versLeBas(montant) : -versLeHaut(-montant);
  // LA SEULE DIFFÉRENCE ENTRE LES DEUX TITULAIRES tient dans ces deux lignes :
  // quelle table porte le solde. Pas une règle d'argent — une adresse.
  const majSolde = t.genre === 'ecole'
    ? 'UPDATE etablissements SET solde = ROUND(solde + ?, 2) WHERE id = ?'
    : 'UPDATE users SET solde = ROUND(solde + ?, 2) WHERE email = ?';
  const relire = t.genre === 'ecole'
    ? 'SELECT solde FROM etablissements WHERE id = ?'
    : 'SELECT solde FROM users WHERE email = ?';
  const ou = t.genre === 'ecole' ? t.id : t.email;
  return db.transaction(() => {
    db.prepare(majSolde).run(exact, ou);
    const apres = (db.prepare(relire).get(ou) as { solde: number } | undefined)?.solde;
    // UN TITULAIRE INTROUVABLE NE PASSE PAS EN SILENCE. L'UPDATE d'une ligne
    // absente ne lève rien en SQL : sans ce test, un mouvement s'écrirait au
    // registre avec un solde inventé, et personne ne s'en apercevrait avant la
    // réconciliation. On préfère l'échec bruyant — et comme il survient DANS la
    // transaction, ni le solde ni la ligne ne subsistent. Le seul appelant qui
    // rattrape cette exception (/api/completion, recordStats) la distingue
    // explicitement d'un échec de statistique : « bruyant » ne vaut que si
    // personne ne l'enterre en aval.
    if (apres === undefined) throw new Error(`Porte-monnaie introuvable (${t.genre}).`);
    // paypal_id porte une contrainte UNIQUE : c'est LUI qui garantit qu'une
    // notification rejouée ne crédite pas deux fois. La violation fait échouer
    // toute la transaction — solde compris —, ce qu'aucun « SELECT puis
    // INSERT » ne sait faire face à deux requêtes simultanées. L'index étant
    // commun aux deux titulaires, l'idempotence l'est aussi.
    db.prepare(`
      INSERT INTO credit_mouvements (etablissement_id, titulaire_email, ts, genre, montant, solde, detail, par, paypal_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(etablissementId, email, Date.now(), genre, exact, apres, detail.slice(0, 200), par, paypalId);
    return apres;
  })();
}

/**
 * Décompte un appel. Ne refuse JAMAIS : le contrôle a lieu AVANT l'appel, et
 * une réponse déjà produite doit être payée même si elle fait passer le solde
 * sous zéro. Le dépassement d'un appel est borné par la taille d'une réponse ;
 * c'est le prix d'un décompte qui n'interrompt jamais quelqu'un en train de
 * lire.
 *
 * LE TARIF ARRIVE DÉJÀ RÉSOLU, et ce n'est pas un détail de signature : la
 * même valeur est écrite sur la ligne de journal (usage_log) et prélevée ici,
 * dans une seule transaction. Le résoudre deux fois — une fois pour journaliser
 * et une fois pour prélever — suffirait à ce qu'une sonde tombée entre les deux
 * fasse dire à la facture autre chose qu'au solde.
 *
 * REND LE MONTANT DÉBITÉ, et non le solde qui suit : c'est ce montant que la
 * facture additionnera, donc c'est lui que l'appelant doit pouvoir figer.
 */
export function decompter(
  t: Titulaire, tarif: TarifApplique, tokensIn: number, tokensOut: number,
): number {
  // RESPIRE ne se décompte pas. Le tarif, lui, n'est PAS nul — il est le même
  // pour tout le monde : c'est l'ÉCOLE qui est exonérée, pas le fournisseur.
  // Sans ce test, une école RESPIRE plongerait dans le rouge en silence.
  //
  // UN COMPTE N'A PAS D'EXONÉRATION, et on ne recopie donc PAS ici le
  // « titulaire absent → 0 » de la version école : un porte-monnaie personnel
  // introuvable au moment de payer est une anomalie, pas une gratuité. bouger()
  // la fera remonter ; l'avaler ici ferait disparaître la dépense en silence.
  if (t.genre === 'ecole') {
    const ecole = getDb().prepare('SELECT respire FROM etablissements WHERE id = ?')
      .get(t.id) as { respire: number } | undefined;
    if (!ecole || ecole.respire) return 0;
  }
  // PRIX COÛTANT : plus aucune marge sur l'inférence. Ce que le titulaire paie
  // ici est exactement ce que le fournisseur nous facture, et il peut le
  // vérifier contre le tarif public du modèle qu'il a employé. La contribution,
  // elle, a été prélevée à la recharge.
  const cout = coutAuTarif(tarif, tokensIn, tokensOut, 0);
  // UN DÉCOMPTE NUL SUR UN APPEL QUI A EU LIEU EST UNE ANOMALIE, ET C'EST ICI
  // QU'ELLE SE DIT — au seul endroit où l'on sait qu'un titulaire aurait dû
  // payer. Le service travaillerait sinon à perte sans que rien ne casse, et
  // on s'en apercevrait à la fin de l'année.
  if (!cout && (tokensIn || tokensOut)) {
    console.error(
      `CONSOMMATION DÉCOMPTÉE À ZÉRO — ${tarif.provider} · ${tarif.modele} · `
      + `${tokensIn}+${tokensOut} jetons : ${tarif.repli || 'tarif nul'}.`);
  }
  if (!cout) return 0;
  // LE REPLI SE LIT SUR LE RELEVÉ, pas seulement dans un tableau de bord. Qui
  // relit son registre six mois plus tard doit voir, sur la ligne elle-même,
  // que ce montant-là n'a pas été calculé au prix du modèle appelé.
  //
  // On ne rend PAS ce que bouger() rend (le solde qui suit) : c'est le MONTANT
  // que l'appelant doit figer sur sa ligne de journal. bouger() lève si le
  // titulaire est introuvable — cette ligne n'est donc atteinte que si le
  // prélèvement a bien eu lieu.
  bouger(t, 'consommation', -cout, detailConsommation(tarif), '');
  return cout;
}

/**
 * Le libellé d'une consommation au registre. Composé ici, en un seul endroit,
 * parce qu'il est la SEULE trace durable du repli pour le titulaire — la
 * colonne tarif_repli, elle, vit sur le journal d'usage, que personne d'autre
 * que l'administration ne lit.
 */
function detailConsommation(tarif: TarifApplique): string {
  const base = `${tarif.provider} · ${tarif.modele}`;
  return tarif.repli ? `${base} · ${tarif.repli}` : base;
}

export function mouvements(t: Titulaire, limite = 50): Mouvement[] {
  const db = getDb();
  // Deux requêtes plutôt qu'un OR : la première suit idx_credit_etab, la
  // seconde idx_credit_titulaire. Un prédicat unique les aurait perdus tous les
  // deux sur une table qui n'est jamais purgée.
  if (t.genre === 'ecole') {
    return db.prepare(`
      SELECT id, etablissement_id AS etablissementId, ts, genre, montant, solde, detail, par
      FROM credit_mouvements WHERE etablissement_id = ? AND titulaire_email IS NULL
      ORDER BY ts DESC LIMIT ?
    `).all(t.id, limite) as Mouvement[];
  }
  return db.prepare(`
    SELECT id, etablissement_id AS etablissementId, ts, genre, montant, solde, detail, par
    FROM credit_mouvements WHERE titulaire_email = ? ORDER BY ts DESC LIMIT ?
  `).all(t.email, limite) as Mouvement[];
}

/**
 * L'état du porte-monnaie d'UNE PERSONNE, pour la page « Mes données ».
 *
 * Même forme que etatDesComptes pour une école — solde, dépense récente,
 * autonomie estimée — parce que c'est la même question : « combien me
 * reste-t-il, et pour combien de temps ? ». Un montant seul ne dit rien, une
 * durée si.
 */
export function etatDuCompte(email: string) {
  const db = getDb();
  const depuis = Date.now() - 30 * 86_400_000;
  const solde = soldeDe(titulaireCompte(email));
  const depense30 = (db.prepare(`
    SELECT COALESCE(SUM(-montant), 0) AS total FROM credit_mouvements
    WHERE titulaire_email = ? AND genre = 'consommation' AND ts >= ?
  `).get(email, depuis) as { total: number }).total;
  const parJour = depense30 / 30;
  return {
    ouvert: aUnPorteMonnaie(email),
    solde: centimes(solde),
    devise: BillingCurrency,
    depense30: centimes(depense30),
    contributionPct: contributionDe(titulaireCompte(email)),
    /**
     * Le forfait, à côté du taux, PARCE QUE LA PHRASE AFFICHÉE A BESOIN DES
     * DEUX. Dire « 3,5 % » seul serait faux dès la plus petite recharge, où
     * c'est ce montant-ci qui est retenu. Il voyage avec le solde (/api/me/data)
     * et non avec les bornes de paiement (/api/me/credits) : la phrase se lit
     * même quand PayPal est éteint et que /api/me/credits n'a pas été appelé.
     */
    commissionPlancher: COMMISSION_MIN,
    /** Jours d'autonomie au rythme des trente derniers jours. null = inconnu. */
    jours: parJour > 0 ? Math.max(0, Math.floor(solde / parJour)) : null,
    aSec: solde <= 0,
  };
}

/**
 * L'état des porte-monnaie DES ÉCOLES, pour l'administration.
 *
 * Les porte-monnaie personnels n'y figurent pas, et il n'existe pas d'écran qui
 * les liste : le solde d'une personne est SA donnée, pas un tableau de bord.
 * Chacun voit le sien depuis « Mes données » (etatDuCompte).
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
                     WHERE m.etablissement_id = e.id AND m.titulaire_email IS NULL
                       AND m.genre = 'consommation' AND m.ts >= ?), 0) AS depense30
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
