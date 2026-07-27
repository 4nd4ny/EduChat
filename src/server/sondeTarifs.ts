// SONDE DE TARIFS — ce qu'elle peut faire, et ce qu'elle ne peut pas.
//
// CONSTAT MESURÉ, pas supposé. Les API des trois fournisseurs conformes au
// RGPD ont été interrogées : /v1/models chez Anthropic, chez OpenAI et chez
// Mistral répond 200 et ne contient AUCUN champ de prix. Aucun des trois ne
// publie de tarif lisible par une machine. Aller « chercher les prix sur
// leurs sites » voudrait donc dire analyser des pages de marketing en HTML :
// ça marche le jour où on l'écrit, ça casse en silence trois semaines plus
// tard, et ça casse sur la donnée qui fabrique les factures.
//
// CE QUI EXISTE, en revanche : le catalogue public d'OpenRouter, machine à
// lire, sans clé, qui porte un prix d'entrée et un prix de sortie POUR CHAQUE
// MODÈLE des trois fournisseurs — et ces prix sont ceux que les éditeurs
// publient (relevé du 27 juillet 2026 : Haiku 4.5 à 1/5, Sonnet 5 à 2/10,
// Mistral Small 0.15/0.60). C'est un miroir, pas une source ; il est simplement
// le seul miroir lisible qui existe. « Sonnet 3/15 » figurait ici : c'était le
// prix de Sonnet 4.5, resté écrit après le changement de barreau.
//
// ─── CE QU'ELLE APPLIQUE DÉSORMAIS, ET CE QU'ELLE SE CONTENTE DE PROPOSER ───
//
// Ce fichier a longtemps porté « TROIS RAISONS DE NE RIEN APPLIQUER
// AUTOMATIQUEMENT ». Deux de ces trois raisons ont cessé d'exister, et il faut
// le dire ici même, sous peine de laisser un lecteur croire que le code
// ci-dessous contredit son propre en-tête :
//
//   · « Le journal ne compte qu'UN nombre de jetons, aucun prix unique n'est
//     donc exact. » — usage_log porte tokens_in et tokens_out SÉPARÉMENT depuis
//     qu'on a cessé de les additionner. Les deux prix relevés ici s'appliquent
//     chacun aux jetons qui lui correspondent : il n'y a plus de mélange à
//     deviner, donc plus rien d'inexact à appliquer. Le mélange survit
//     UNIQUEMENT comme repère d'arbitrage à l'écran, jamais comme prix.
//   · « Un tarif fabrique une FACTURE : le changer tout seul modifierait
//     silencieusement ce qu'une école doit. » — c'était vrai tant que la facture
//     se RECALCULAIT au tarif du jour. Elle ne le fait plus : chaque appel
//     emporte les deux prix qu'on lui a appliqués (usage_log.prix_*_mtok) et le
//     montant réellement prélevé. Une sonde qui tourne ce soir ne peut plus
//     déplacer d'un centime ce qu'une école devait ce matin. C'est ce gel-là,
//     et lui seul, qui autorise l'écriture automatique.
//
// LA TROISIÈME RAISON, ELLE, TIENT TOUJOURS — la monnaie. Le catalogue est en
// DOLLARS, la facturation est dans la monnaie du gestionnaire. La sonde
// convertit à un taux du jour, approximatif et assumé, et écrit AVEC le montant
// la monnaie obtenue. Quand ce taux est injoignable, elle laisse ses montants en
// dollars — et n'écrit alors AUCUN tarif applicable : appliquer des dollars à
// une facture en francs serait une erreur de 20 % annoncée comme un fait, et
// écraser les prix corrects de la veille par des dollars serait pire encore que
// ne rien écrire.
//
// LE PARTAGE EST DONC CELUI-CI :
//   · tarifs_modeles — CE QUI FACTURE. Écrit par la sonde, un prix d'entrée et
//     un prix de sortie par barreau, pour les trois fournisseurs qu'une clé
//     d'école paie. C'est ce que /api/completion applique au modèle qu'il vient
//     réellement d'appeler.
//   · tarifs.prix_mtok — LE CHOIX DE L'ADMINISTRATION, jamais touché ici, et
//     désormais un simple filet : il ne sert que là où aucun prix par modèle
//     n'a pu être relevé (voir tarifDuModele, src/server/porteMonnaie.ts).
//   · les colonnes propose_* — CE QU'ON MONTRE pour arbitrer l'échelle : les
//     trois barreaux côte à côte, leur prix, leur mélange indicatif.

import { getDb } from './db';
import { getLadder } from './ladder';
import { SCHOOL_PROVIDER_IDS, type ProviderId } from '../shared/providers';
import { BillingCurrency } from '../utils/env';

/**
 * Taux USD → monnaie de facturation, lu chez Frankfurter (données BCE, sans
 * clé). Approximatif et assumé : ces prix servent à PROVISIONNER un
 * porte-monnaie, pas à établir une créance. Une seconde source publique
 * (open.er-api) donnait 0.817769 quand celle-ci donnait 0.81761 — l'écart, deux
 * dix-millièmes, dit assez que la précision n'est pas le sujet.
 *
 * Injoignable, on rend null : la sonde propose alors en dollars, en le disant,
 * plutôt que d'inventer un taux.
 */
async function tauxDeChange(): Promise<number | null> {
  if (BillingCurrency.toUpperCase() === 'USD') return 1;
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${encodeURIComponent(BillingCurrency)}`,
      { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const taux = (await r.json())?.rates?.[BillingCurrency.toUpperCase()];
    return typeof taux === 'number' && taux > 0 ? taux : null;
  } catch {
    return null;
  }
}

/** Rapport entrée/sortie retenu pour le mélange, faute de le mesurer. */
export const RATIO_ENTREE = 0.75;

/**
 * UN BARREAU SONDÉ. Les trois sont rendus, pas seulement celui qu'on propose :
 * l'échelle « détermine le niveau d'intelligence et le coût par étudiant », et
 * on n'arbitre pas entre trois niveaux dont on ne voit qu'un seul prix.
 */
export type BarreauTarif = {
  /** 1, 2 ou 3 — la position dans l'échelle du fournisseur. */
  rang: number;
  /** Le modèle tel que l'échelle le nomme (identifiant de l'éditeur). */
  barreau: string;
  /** Modèle d'OpenRouter dont le prix a été lu, ou '' si rien ne correspond. */
  modele: string;
  entreeMtok: number;
  sortieMtok: number;
  melangeMtok: number;
  detail: string;
};

export type Proposition = {
  provider: ProviderId;
  /** Modèle d'OpenRouter dont le prix a été lu, ou '' si rien ne correspond. */
  modele: string;
  entreeMtok: number;
  sortieMtok: number;
  /** Le mélange proposé, au ratio ci-dessus, dans la devise ci-dessous. */
  melangeMtok: number;
  /**
   * MONNAIE RÉELLE DES MONTANTS ci-dessus, jamais une intention : la monnaie de
   * facturation quand le taux de change a pu être lu, « USD » sinon. Les trois
   * barreaux partagent forcément la même — ils sont convertis d'un seul taux.
   */
  devise: string;
  detail: string;
  at: number;
  /** Les trois barreaux relevés, du plus économe au plus fouillé. */
  barreaux: BarreauTarif[];
  /** Le rang du barreau dont le tarif ci-dessus est repris (le plus haut). */
  rangRetenu: number;
};

type ModeleOpenRouter = { id: string; created?: number; pricing?: { prompt?: string; completion?: string } };

const centimes = (x: number) => Math.round(x * 100) / 100;

/**
 * Le nom du vendeur chez OpenRouter, quand il diffère de notre identifiant.
 * Il ne sert qu'à RESTREINDRE la recherche au catalogue du bon éditeur : sans
 * ce garde-fou, deux modèles de vendeurs différents portant un nom voisin
 * peuvent se disputer un barreau. Absent ou introuvable, on retombe sur le
 * catalogue entier — un quatrième fournisseur d'école ne doit pas rendre la
 * sonde muette du seul fait qu'il manque une ligne ici.
 */
const VENDEUR_OPENROUTER: Partial<Record<ProviderId, string>> = {
  anthropic: 'anthropic', openai: 'openai', mistral: 'mistralai',
};

/**
 * Le modèle d'OpenRouter qui correspond à un barreau de notre échelle.
 *
 * Nos identifiants sont ceux des éditeurs (« claude-haiku-4-5-20251001»),
 * OpenRouter les préfixe et normalise (« anthropic/claude-haiku-4.5 »). On
 * compare donc des formes réduites : minuscules, sans préfixe d'éditeur, sans
 * ponctuation ni date. Une correspondance approximative vaut mieux qu'aucune
 * — mais son ABSENCE doit se voir, jamais retomber sur zéro en silence.
 *
 * ─── POURQUOI L'ÉGALITÉ EXACTE NE GAGNE PLUS, ET CE QUI GAGNE À SA PLACE ────
 *
 * La version précédente prenait la PREMIÈRE entrée dont la forme réduite
 * égalait la cible, et s'arrêtait là. Mesuré le 27 juillet 2026 contre le
 * catalogue public : « mistral-large-latest » tombait sur
 * « mistralai/mistral-large » (2.00 / 6.00 $), une entrée de FÉVRIER 2024,
 * alors que la version courante est « mistralai/mistral-large-2512 »
 * (0.50 / 1.50 $). Le tarif Mistral affiché était QUATRE FOIS trop élevé —
 * exactement le piège que la branche approximative décrivait, mais que la
 * branche exacte court-circuitait.
 *
 * La règle est donc : la cible et SES VARIANTES DATÉES forment un seul
 * ensemble, où la PLUS RÉCENTE (`created`) l'emporte. Une variante datée, ce
 * n'est pas n'importe quel nom qui commence pareil : c'est la cible suivie
 * d'un HORODATAGE — au moins quatre chiffres, « 2512 », « 20251001 » — et rien
 * d'autre. Cette précision n'est pas une coquetterie, elle a deux
 * contre-exemples mesurés :
 *
 *   · Élargir aux préfixes ferait tomber « gpt-5.5 » (5 / 30 $) sur
 *     « gpt-5.5-pro » (30 / 180 $), plus récent de trois secondes dans le
 *     catalogue. Six fois trop cher, l'erreur inverse de celle qu'on corrige.
 *   · Et « claude-haiku-4-5-20251001 » tomberait sur
 *     « ~anthropic/claude-haiku-latest », un pointeur flottant, là où le nom
 *     daté désigne une version précise dont le prix est vérifiable.
 *
 * La branche approximative reste EN DERNIER RECOURS, inchangée : c'est elle
 * qui sert aujourd'hui « mistral-medium-latest », dont les variantes
 * (« -3 », « -3.1 », « -3-5 ») portent un numéro de version à deux chiffres et
 * non un horodatage. Qui débogue un barreau Mistral renommé demain doit savoir
 * que c'est là, et non au-dessus, que la correspondance se joue.
 */
function correspond(nôtre: string, provider: ProviderId, catalogue: ModeleOpenRouter[]): ModeleOpenRouter | undefined {
  const reduire = (s: string) => s.toLowerCase().split('/').pop()!.replace(/[^a-z0-9]/g, '');
  // Le « ~ » de « ~anthropic/… » marque chez OpenRouter une entrée dérivée :
  // l'ôter suffit à reconnaître le vendeur.
  const vendeur = (s: string) => s.toLowerCase().replace(/^~/, '').split('/')[0];
  const chez = catalogue.filter(m => vendeur(m.id) === (VENDEUR_OPENROUTER[provider] ?? provider));
  const cat = chez.length ? chez : catalogue;

  // « mistral-medium-latest » est un ALIAS : Mistral le résout vers une
  // version datée, qu'OpenRouter nomme « mistralai/mistral-medium-3-5 ». Le
  // suffixe ne porte donc aucune information — l'ôter est ce qui permet la
  // correspondance, et c'est ainsi qu'on a découvert le trou.
  const cible = reduire(nôtre).replace(/\d{8}$/, '').replace(/latest$/, '');
  // Un barreau réglé sur « latest » tout court se réduirait à la chaîne vide,
  // et TOUTE entrée du catalogue commencerait par elle : on facturerait une
  // école au prix d'un modèle tiré au hasard. Mieux vaut « aucune
  // correspondance », qui se voit.
  if (!cible) return undefined;

  const plusRecent = (liste: ModeleOpenRouter[]) =>
    liste.sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0];

  const variantes = cat.filter(m => {
    const r = reduire(m.id);
    return r === cible || (r.startsWith(cible) && /^\d{4,}$/.test(r.slice(cible.length)));
  });
  if (variantes.length) return plusRecent(variantes);

  // À défaut, on cherche par préfixe — et parmi les candidats, LE PLUS RÉCENT.
  // Départager par la longueur du nom paraissait sage et donnait le contraire
  // de ce qu'on veut : « mistral-medium-3 » l'emportait sur
  // « mistral-medium-3-5 », c'est-à-dire l'ancien prix sur l'actuel. Un alias
  // « latest » désigne la version courante ; la date de création du catalogue
  // est ce qui s'en approche le mieux.
  const approx = cat.filter(m => reduire(m.id).startsWith(cible.slice(0, Math.max(8, cible.length - 4))));
  return approx.length ? plusRecent(approx) : undefined;
}

/**
 * OÙ RECOUPER LE PRIX, en un clic — la page du catalogue public, filtrée sur
 * l'éditeur. Un tarif qu'on ne peut pas recouper est un tarif qu'il faut
 * croire ; celui-ci se lit là où la sonde l'a lu. Rendu par l'API plutôt
 * qu'écrit dans l'interface : le périmètre des fournisseurs d'école a une
 * seule définition (SCHOOL_PROVIDER_IDS), et c'est celle-là.
 */
export function lienVerification(provider: ProviderId): string | null {
  return SCHOOL_PROVIDER_IDS.includes(provider)
    ? `https://openrouter.ai/models?order=most-popular&q=${encodeURIComponent(provider)}`
    : null;
}

/**
 * Interroge le catalogue public d'OpenRouter, ÉCRIT le prix d'entrée et le prix
 * de sortie de chaque barreau (tarifs_modeles) et propose un tarif de synthèse
 * pour chacun des fournisseurs qu'une école peut réellement utiliser.
 *
 * N'écrit JAMAIS `prix_mtok`, qui reste le choix de l'administration.
 */
export async function sonderTarifs(): Promise<Proposition[]> {
  let catalogue: ModeleOpenRouter[] = [];
  let panne = '';
  try {
    const r = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    catalogue = ((await r.json())?.data ?? []) as ModeleOpenRouter[];
  } catch (erreur) {
    panne = String(erreur instanceof Error ? erreur.message : erreur).slice(0, 200);
  }

  const taux = await tauxDeChange();

  const db = getDb();
  // `prix_mtok` n'apparaît QUE dans le VALUES d'insertion, jamais dans le
  // DO UPDATE SET : c'est la ligne qui, mal éditée, remettrait à zéro le tarif
  // de toutes les écoles à la première sonde. La sonde propose, elle n'applique
  // pas.
  const ecrire = db.prepare(`
    INSERT INTO tarifs (provider, prix_mtok, updated_at, propose_entree, propose_sortie, propose_melange, propose_modele, propose_detail, propose_barreaux, propose_devise, propose_at)
    VALUES (@provider, 0, @at, @entree, @sortie, @melange, @modele, @detail, @barreaux, @devise, @at)
    ON CONFLICT(provider) DO UPDATE SET
      propose_entree = excluded.propose_entree, propose_sortie = excluded.propose_sortie,
      propose_melange = excluded.propose_melange, propose_modele = excluded.propose_modele,
      propose_detail = excluded.propose_detail, propose_barreaux = excluded.propose_barreaux,
      propose_devise = excluded.propose_devise, propose_at = excluded.propose_at
  `);

  // LE CHAÎNON QUI MANQUAIT : le prix relevé s'ÉCRIT, barreau par barreau.
  //
  // La clé est (provider, barreau) — le nom que l'ÉCHELLE donne au modèle,
  // c'est-à-dire exactement ce que /api/completion enverra à l'éditeur
  // (effModel). L'identifiant d'OpenRouter, lui, va dans `source` : il ne sert
  // pas à retrouver le prix, il sert à recouper d'où il vient.
  //
  // ON N'ÉCRASE QUE CE QU'ON A LU. Une entrée sans prix n'écrit rien plutôt que
  // d'écrire deux zéros : un zéro écrit ici serait un modèle facturé gratuit,
  // c'est-à-dire la seule chose dont on soit certain qu'elle est fausse. Sans
  // ligne, la chaîne de repli du porte-monnaie prend la main — et elle, elle
  // laisse une trace.
  const ecrireTarif = db.prepare(`
    INSERT INTO tarifs_modeles (provider, modele, prix_entree_mtok, prix_sortie_mtok, devise, source, updated_at)
    VALUES (@provider, @modele, @entree, @sortie, @devise, @source, @at)
    ON CONFLICT(provider, modele) DO UPDATE SET
      prix_entree_mtok = excluded.prix_entree_mtok, prix_sortie_mtok = excluded.prix_sortie_mtok,
      devise = excluded.devise, source = excluded.source, updated_at = excluded.updated_at
  `);

  const at = Date.now();
  // LES TROIS FOURNISSEURS D'ÉCOLE, ET RIEN D'AUTRE. SCHOOL_PROVIDER_IDS est la
  // définition de ce périmètre (mistral, anthropic, openai) ; sonder au-delà
  // reviendrait à proposer un tarif pour un fournisseur qu'aucune clé de la
  // plateforme ne paie jamais.
  return SCHOOL_PROVIDER_IDS.map(provider => {
    // Et, chez chacun, SEULEMENT les barreaux de son échelle — jamais son
    // catalogue entier. Trois lignes suffisent parce que trois lignes sont ce
    // que l'échelle propose : c'est le coût par élève de chaque niveau
    // d'intelligence, mis côte à côte pour qu'on puisse arbitrer.
    const echelle = getLadder(provider).slice(0, 3);
    // Converti dans la monnaie de facturation quand le taux a pu être lu :
    // une proposition en dollars oblige l'administration à sortir une
    // calculette, ce qui est précisément le geste qu'on veut lui épargner.
    // Le même taux pour les trois barreaux : trois lignes qu'on compare
    // doivent être dans la même unité.
    const k = taux ?? 1;

    const barreaux: BarreauTarif[] = echelle.map((barreau, i) => {
      const trouve = panne || !barreau ? undefined : correspond(barreau, provider, catalogue);
      const entree = (trouve?.pricing?.prompt ? parseFloat(trouve.pricing.prompt) * 1e6 : 0) * k;
      const sortie = (trouve?.pricing?.completion ? parseFloat(trouve.pricing.completion) * 1e6 : 0) * k;
      // « Non trouvé » doit SE VOIR. Un zéro muet arrêterait la facturation d'un
      // fournisseur sans que personne s'en aperçoive.
      const detail = panne ? `Catalogue OpenRouter injoignable : ${panne}`
        : !barreau ? 'Aucun barreau réglé pour ce fournisseur.'
          : !trouve ? `Aucune correspondance pour « ${barreau} » dans le catalogue OpenRouter.`
            : entree || sortie ? '' : `« ${trouve.id} » ne porte pas de prix.`;
      return {
        rang: i + 1, barreau, modele: trouve?.id ?? '',
        entreeMtok: centimes(entree), sortieMtok: centimes(sortie),
        melangeMtok: centimes(entree * RATIO_ENTREE + sortie * (1 - RATIO_ENTREE)),
        detail,
      };
    });

    // LE BARREAU LE PLUS HAUT — le plus fouillé, pas forcément le plus cher.
    // Une école provisionne son porte-monnaie sur ce tarif : le sous-estimer,
    // c'est lui promettre une autonomie qu'elle n'aura pas, et la bloquer en
    // pleine leçon le jour où un enseignant monte d'un cran.
    //
    // « Le plus haut » et « le plus cher » ont longtemps coïncidé, et ne
    // coïncident plus : Mistral Large 2512 (0.50 / 1.50 $) est moins cher que
    // Mistral Medium 3.5 (1.50 / 7.50 $) chez le même éditeur. Les trois lignes
    // sont donc rendues avec leur prix, et celle qu'on retient est nommée : qui
    // règle l'échelle doit voir ce que son choix coûte, pas le déduire.
    const retenu = barreaux[barreaux.length - 1];

    const proposition: Proposition = {
      provider,
      modele: retenu?.modele ?? '',
      entreeMtok: retenu?.entreeMtok ?? 0,
      sortieMtok: retenu?.sortieMtok ?? 0,
      melangeMtok: retenu?.melangeMtok ?? 0,
      devise: taux ? BillingCurrency : 'USD',
      detail: retenu?.detail ?? 'Aucun barreau réglé pour ce fournisseur.',
      at, barreaux, rangRetenu: retenu?.rang ?? 0,
    };
    // ─── L'ÉCRITURE DES TARIFS APPLICABLES ───
    //
    // DEUX CONDITIONS, ET AUCUNE N'EST NÉGOCIABLE :
    //   · le taux de change a été lu (`taux`), donc les montants sont dans la
    //     monnaie de facturation. Sinon on ne touche à rien : les prix corrects
    //     de la dernière sonde valent mieux que des dollars appliqués comme des
    //     francs, et bien mieux qu'une table vidée.
    //   · le barreau a un prix. Un barreau sans correspondance au catalogue
    //     n'écrit pas de ligne — c'est ce qui déclenche le repli explicite du
    //     porte-monnaie plutôt qu'une facturation à zéro.
    if (taux) {
      for (const b of barreaux) {
        if (!b.barreau || (!b.entreeMtok && !b.sortieMtok)) continue;
        try {
          ecrireTarif.run({
            provider, modele: b.barreau, entree: b.entreeMtok, sortie: b.sortieMtok,
            devise: BillingCurrency, source: b.modele, at,
          });
        } catch (erreur) {
          // Un tarif non enregistré n'interrompt pas les autres : chaque
          // barreau est indépendant, et un fournisseur muet ne doit pas rendre
          // les deux autres muets avec lui.
          console.error(`Tarif non enregistré (${provider} · ${b.barreau}) :`, erreur);
        }
      }
    }

    try {
      ecrire.run({
        provider, at,
        entree: proposition.entreeMtok, sortie: proposition.sortieMtok,
        melange: proposition.melangeMtok, modele: proposition.modele,
        detail: proposition.detail, barreaux: JSON.stringify(barreaux),
        // La monnaie EST une donnée de la mesure, au même titre que le nombre.
        // Elle est écrite avec lui, et non redéduite à la relecture : le taux
        // de change peut avoir manqué ce jour-là et être revenu depuis.
        devise: proposition.devise,
      });
    } catch (erreur) {
      console.error('Proposition de tarif non enregistrée :', erreur);
    }
    return proposition;
  });
}

/** Un prix APPLIQUÉ, tel qu'il facture aujourd'hui. */
export type TarifModele = {
  provider: string; modele: string;
  entreeMtok: number; sortieMtok: number;
  devise: string;
  /** Le modèle du catalogue d'où le prix vient — c'est là qu'on le recoupe. */
  source: string;
  at: number;
};

/**
 * LES PRIX QUI FACTURENT, ET LES BARREAUX QUI N'EN ONT PAS.
 *
 * Les deux dans la même réponse, et c'est tout l'objet : un tableau de prix ne
 * dit rien de ce qui MANQUE, et ce qui manque est précisément ce qui sera
 * facturé au repli. L'administration doit voir le trou AVANT qu'une classe
 * consomme dedans — la trace laissée sur les lignes déjà décomptées arrive,
 * elle, après que l'argent a bougé.
 *
 * Le périmètre est celui de l'échelle : trois barreaux pour chacun des trois
 * fournisseurs qu'une clé d'école paie. Un modèle relevé qui ne serait plus au
 * barreau d'aucune échelle n'intéresse personne, et une échelle sans prix est
 * exactement ce qu'on cherche à montrer.
 */
export function tarifsAppliques(): { prix: TarifModele[]; manquants: Array<{ provider: string; barreau: string }> } {
  const rows = getDb().prepare(`
    SELECT provider, modele, prix_entree_mtok AS entreeMtok, prix_sortie_mtok AS sortieMtok,
           devise, source, updated_at AS at
    FROM tarifs_modeles ORDER BY provider, prix_sortie_mtok
  `).all() as TarifModele[];

  const manquants: Array<{ provider: string; barreau: string }> = [];
  for (const provider of SCHOOL_PROVIDER_IDS) {
    for (const barreau of getLadder(provider).slice(0, 3)) {
      if (!barreau) continue;
      // MÊME CONDITION QU'À L'APPLICATION (tarifDuModele) : une ligne dans une
      // autre monnaie que celle de facturation ne facture pas, donc elle ne
      // comble pas ce trou-là. L'écran mentirait s'il la comptait présente.
      const a = rows.some(r => r.provider === provider && r.modele === barreau
        && r.devise.toUpperCase() === BillingCurrency.toUpperCase()
        && (r.entreeMtok > 0 || r.sortieMtok > 0));
      if (!a) manquants.push({ provider, barreau });
    }
  }
  return { prix: rows, manquants };
}

/** Ce que la dernière sonde a proposé, pour l'administration. */
export function propositions(): Record<string, Omit<Proposition, 'provider'>> {
  const rows = getDb().prepare(`
    SELECT provider, propose_entree AS entreeMtok, propose_sortie AS sortieMtok,
           propose_melange AS melangeMtok, propose_modele AS modele,
           propose_detail AS detail, propose_barreaux AS barreaux,
           propose_devise AS devise, propose_at AS at
    FROM tarifs WHERE propose_at > 0
  `).all() as Array<Omit<Proposition, 'barreaux' | 'rangRetenu'> & { provider: string; barreaux: string }>;
  return Object.fromEntries(rows.map(({ provider, barreaux, devise, ...reste }) => {
    // La colonne est VIDE pour toute ligne écrite avant la migration, et
    // JSON.parse('') lève : sans ce filet, la page d'administration renverrait
    // 500 tant que la sonde n'a pas retourné une fois. Trois barreaux absents
    // valent mieux qu'un écran blanc — le tarif retenu, lui, est déjà là.
    let lus: BarreauTarif[] = [];
    try {
      const brut = JSON.parse(barreaux || '[]');
      if (Array.isArray(brut)) lus = brut as BarreauTarif[];
    } catch { lus = []; }
    return [provider, {
      // La devise TELLE QU'ELLE A ÉTÉ MESURÉE. Vide pour les lignes écrites
      // avant la migration : on retombe alors sur la monnaie de facturation,
      // qui est ce que ces lignes-là valaient déjà — le repli n'ajoute aucune
      // imprécision, il n'en efface simplement pas une ancienne. La première
      // sonde qui suit remplit la colonne et l'ambiguïté disparaît.
      ...reste, devise: devise || BillingCurrency, barreaux: lus,
      rangRetenu: lus.length ? lus[lus.length - 1].rang : 0,
    }];
  }));
}
