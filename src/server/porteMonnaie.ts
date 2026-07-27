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
 * Le taux effectif d'un titulaire.
 *
 * UNE ÉCOLE CHOISIT le sien, entre 3.5 et 10 % — ce qui rend le service
 * difficile à copier : la valeur n'est pas dans la marge, elle est dans le
 * service, et une école qui choisit ce qu'elle donne n'a aucune raison d'aller
 * voir ailleurs. À défaut de choix, le réglage du serveur.
 *
 * UNE PERSONNE NE CHOISIT PAS, et c'est délibéré : le curseur a été donné aux
 * écoles parce qu'une direction arbitre un budget public et qu'on lui doit ce
 * geste. Un particulier achète quelques francs de jetons ; lui demander de
 * fixer lui-même sa contribution transformerait un achat de deux clics en une
 * question de conscience. Il paie le taux de la plateforme, annoncé avant la
 * recharge — bornes comprises, pour qu'un réglage de serveur aberrant ne se
 * traduise jamais en prélèvement aberrant.
 */
export function contributionDe(t: Titulaire): number {
  if (t.genre === 'compte') {
    return Math.min(CONTRIBUTION_MAX, Math.max(CONTRIBUTION_MIN, BillingSurchargePct));
  }
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

export function commissionRecharge(t: Titulaire, montant: number):
  { commission: number; credite: number; pct: number } {
  const pct = contributionDe(t);
  const commission = Math.max(COMMISSION_MIN, versLeHaut(montant * pct / 100));
  // Le crédit descend au centime, la commission monte : jamais l'inverse.
  return { commission, credite: Math.max(0, versLeBas(montant - commission)), pct };
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
 */
export function decompter(
  t: Titulaire, provider: string, tokensIn: number, tokensOut: number, modele: string,
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
  // vérifier contre le tarif public de Claude, ChatGPT ou Mistral. La
  // contribution, elle, a été prélevée à la recharge.
  const cout = coutDe(provider, tokensIn, tokensOut, 0);
  if (!cout) return 0;
  return bouger(t, 'consommation', -cout, `${provider} · ${modele}`, '');
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
