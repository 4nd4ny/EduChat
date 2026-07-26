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
// publient (Haiku 1/5, Sonnet 3/15, Mistral Small 0.15/0.60 au 26 juillet
// 2026). C'est un miroir, pas une source ; il est simplement le seul miroir
// lisible qui existe.
//
// TROIS RAISONS DE NE RIEN APPLIQUER AUTOMATIQUEMENT :
//
//   1. Ces prix sont en DOLLARS, la facturation est dans la monnaie du
//      gestionnaire. Le change n'est pas notre métier, et un taux implicite
//      de 1:1 fausserait la facture de chaque école.
//   2. Il y a DEUX prix — entrée et sortie — et le journal ne compte qu'UN
//      nombre de jetons (tokensFromUsage additionne les deux). Aucun prix
//      unique n'est donc exact : il dépend d'un rapport entrée/sortie qu'on
//      ne mesure pas. La sonde propose un mélange, en disant lequel.
//   3. Un tarif fabrique une FACTURE. Le changer tout seul modifierait
//      silencieusement ce qu'une école doit.
//
// Elle PROPOSE donc, à côté du choix de l'administration — le même partage que
// pour l'échelle des modèles. Un clic applique, ou pas.

import { getDb } from './db';
import { getLadder } from './ladder';
import { SCHOOL_PROVIDER_IDS, type ProviderId } from '../shared/providers';

/** Rapport entrée/sortie retenu pour le mélange, faute de le mesurer. */
export const RATIO_ENTREE = 0.75;

export type Proposition = {
  provider: ProviderId;
  /** Modèle d'OpenRouter dont le prix a été lu, ou '' si rien ne correspond. */
  modele: string;
  entreeMtok: number;
  sortieMtok: number;
  /** Le mélange proposé, au ratio ci-dessus. En DOLLARS. */
  melangeMtok: number;
  devise: string;
  detail: string;
  at: number;
};

type ModeleOpenRouter = { id: string; created?: number; pricing?: { prompt?: string; completion?: string } };

const centimes = (x: number) => Math.round(x * 100) / 100;

/**
 * Le modèle d'OpenRouter qui correspond à un barreau de notre échelle.
 *
 * Nos identifiants sont ceux des éditeurs (« claude-haiku-4-5-20251001»),
 * OpenRouter les préfixe et normalise (« anthropic/claude-haiku-4.5 »). On
 * compare donc des formes réduites : minuscules, sans préfixe d'éditeur, sans
 * ponctuation ni date. Une correspondance approximative vaut mieux qu'aucune
 * — mais son ABSENCE doit se voir, jamais retomber sur zéro en silence.
 */
function correspond(nôtre: string, catalogue: ModeleOpenRouter[]): ModeleOpenRouter | undefined {
  const reduire = (s: string) => s.toLowerCase().split('/').pop()!.replace(/[^a-z0-9]/g, '');
  // « mistral-medium-latest » est un ALIAS : Mistral le résout vers une
  // version datée, qu'OpenRouter nomme « mistralai/mistral-medium-3-5 ». Le
  // suffixe ne porte donc aucune information — l'ôter est ce qui permet la
  // correspondance, et c'est ainsi qu'on a découvert le trou.
  const cible = reduire(nôtre).replace(/\d{8}$/, '').replace(/latest$/, '');
  const exact = catalogue.find(m => reduire(m.id) === cible);
  if (exact) return exact;
  // À défaut, on cherche par préfixe — et parmi les candidats, LE PLUS RÉCENT.
  // Départager par la longueur du nom paraissait sage et donnait le contraire
  // de ce qu'on veut : « mistral-medium-3 » l'emportait sur
  // « mistral-medium-3-5 », c'est-à-dire l'ancien prix sur l'actuel. Un alias
  // « latest » désigne la version courante ; la date de création du catalogue
  // est ce qui s'en approche le mieux.
  return catalogue
    .filter(m => reduire(m.id).startsWith(cible.slice(0, Math.max(8, cible.length - 4))))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0];
}

/**
 * Interroge le catalogue public d'OpenRouter et propose un tarif pour chacun
 * des fournisseurs qu'une école peut réellement utiliser. N'écrit JAMAIS
 * `prix_mtok` : uniquement les colonnes de proposition.
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

  const db = getDb();
  const ecrire = db.prepare(`
    INSERT INTO tarifs (provider, prix_mtok, updated_at, propose_entree, propose_sortie, propose_melange, propose_modele, propose_detail, propose_at)
    VALUES (@provider, 0, @at, @entree, @sortie, @melange, @modele, @detail, @at)
    ON CONFLICT(provider) DO UPDATE SET
      propose_entree = excluded.propose_entree, propose_sortie = excluded.propose_sortie,
      propose_melange = excluded.propose_melange, propose_modele = excluded.propose_modele,
      propose_detail = excluded.propose_detail, propose_at = excluded.propose_at
  `);

  const at = Date.now();
  return SCHOOL_PROVIDER_IDS.map(provider => {
    // Le barreau du MILIEU : ni le plus économe ni le plus cher, c'est celui
    // qu'une classe rencontre le plus souvent.
    const echelle = getLadder(provider);
    const barreau = echelle[Math.min(1, echelle.length - 1)] ?? '';
    const trouve = panne || !barreau ? undefined : correspond(barreau, catalogue);
    const entree = trouve?.pricing?.prompt ? parseFloat(trouve.pricing.prompt) * 1e6 : 0;
    const sortie = trouve?.pricing?.completion ? parseFloat(trouve.pricing.completion) * 1e6 : 0;

    // « Non trouvé » doit SE VOIR. Un zéro muet arrêterait la facturation d'un
    // fournisseur sans que personne s'en aperçoive.
    const detail = panne ? `Catalogue OpenRouter injoignable : ${panne}`
      : !barreau ? 'Aucun barreau réglé pour ce fournisseur.'
        : !trouve ? `Aucune correspondance pour « ${barreau} » dans le catalogue OpenRouter.`
          : entree || sortie ? '' : `« ${trouve.id} » ne porte pas de prix.`;

    const proposition: Proposition = {
      provider, modele: trouve?.id ?? '',
      entreeMtok: centimes(entree), sortieMtok: centimes(sortie),
      melangeMtok: centimes(entree * RATIO_ENTREE + sortie * (1 - RATIO_ENTREE)),
      devise: 'USD', detail, at,
    };
    try {
      ecrire.run({
        provider, at,
        entree: proposition.entreeMtok, sortie: proposition.sortieMtok,
        melange: proposition.melangeMtok, modele: proposition.modele, detail,
      });
    } catch (erreur) {
      console.error('Proposition de tarif non enregistrée :', erreur);
    }
    return proposition;
  });
}

/** Ce que la dernière sonde a proposé, pour l'administration. */
export function propositions(): Record<string, Omit<Proposition, 'provider'>> {
  const rows = getDb().prepare(`
    SELECT provider, propose_entree AS entreeMtok, propose_sortie AS sortieMtok,
           propose_melange AS melangeMtok, propose_modele AS modele,
           propose_detail AS detail, propose_at AS at
    FROM tarifs WHERE propose_at > 0
  `).all() as Array<Omit<Proposition, 'devise'> & { provider: string }>;
  return Object.fromEntries(rows.map(({ provider, ...reste }) => [provider, { ...reste, devise: 'USD' }]));
}
