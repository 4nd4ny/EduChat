// Accès aux prompts socratiques — requêtes partagées par les routes API.

import { getDb, PromptRow } from './db';
import { getEtablissementById, resolveEtablissementByIp } from './etablissements';
import { traductionFraiche } from './traduction';

// ─── QUI A LE DROIT DE VOIR QUOI ─────────────────────────────────────────────
//
// LES TUTEURS D'UNE ÉCOLE LUI APPARTIENNENT. Un tuteur proposé par un membre
// d'un établissement est RATTACHÉ à cet établissement, et il ne sort de ses
// murs que si l'administration de l'école l'a explicitement rendu public.
// Trois familles, donc :
//
//   • rattachement NULL — le catalogue de la PLATEFORME : tuteurs fondateurs,
//     propositions anonymes, auteurs sans école. Visible de TOUS, toujours.
//     C'est ce qui fait qu'une école qui n'ouvre rien n'a pas une page vide,
//     et que le visiteur de passage retrouve le catalogue d'avant.
//   • rattaché à MON école — visible chez moi quoi qu'il arrive : une école
//     voit toujours ses propres tuteurs, « publie » ne parle que du dehors.
//   • rattaché AILLEURS — visible seulement s'il est publie = 1, et seulement
//     si mon école a ouvert son catalogue (hors établissement : toujours, car
//     « public » veut dire public).
//
// CE FILTRE VIT EN BASE, jamais à l'affichage : ce qui ne doit pas être lu ne
// doit pas sortir de la table. Un filtre appliqué au rendu laisserait le nom
// d'un tuteur d'une autre école transparaître par la fiche, la notation, la
// filiation ou la complétion — quatre chemins, un seul verrou.
export type PorteeCatalogue = {
  /** L'école d'où vient la requête (résolue par IP), ou null hors établissement. */
  etablissementId: number | null;
  /** Les tuteurs publics des AUTRES sont-ils visibles depuis cette portée ? */
  publicsExternes: boolean;
};

/**
 * La portée de lecture d'une IP appelante.
 *
 * Hors établissement, « publicsExternes » vaut VRAI : un tuteur rendu public
 * l'est pour le monde, c'est le sens du geste. Dans une école, c'est elle qui
 * décide (etablissements.catalogue_ouvert, défaut fermé).
 */
export function porteeDepuisIp(ip: string): PorteeCatalogue {
  const etab = resolveEtablissementByIp(ip);
  if (!etab) return { etablissementId: null, publicsExternes: true };
  return { etablissementId: etab.id, publicsExternes: !!etab.catalogue_ouvert };
}

/**
 * La portée d'une école DÉSIGNÉE (et non déduite de l'IP) : l'enseignant qui
 * pose le tuteur par défaut d'une séance le fait pour SON établissement, relu
 * en base, où qu'il soit lui-même connecté.
 */
export function porteeDeLEcole(etablissementId: number): PorteeCatalogue {
  const etab = getEtablissementById(etablissementId);
  return { etablissementId, publicsExternes: !!etab?.catalogue_ouvert };
}

/**
 * Le prédicat SQL de visibilité, à joindre à tout WHERE qui sert des tuteurs
 * au public. Il attend l'alias « p » sur la table prompts et les paramètres
 * nommés de parametresPortee().
 */
export const CLAUSE_VISIBLE = `p.status = 'published' AND p.archived = 0
      AND (p.etablissement_id IS NULL
           OR (@etab IS NOT NULL AND p.etablissement_id = @etab)
           OR (@externes = 1 AND p.publie = 1))`;

/** Les paramètres nommés qu'attend CLAUSE_VISIBLE. */
export function parametresPortee(portee: PorteeCatalogue): { etab: number | null; externes: number } {
  return { etab: portee.etablissementId, externes: portee.publicsExternes ? 1 : 0 };
}

/**
 * La MÊME règle, sur une ligne déjà lue — pour les routes qui ont chargé le
 * tuteur avant de savoir si elles avaient le droit de le servir (commentaires).
 * Deux écritures d'une seule règle : toute correction de l'une appelle l'autre,
 * et c'est CLAUSE_VISIBLE qui fait foi.
 */
export function estVisible(row: PromptRow, portee: PorteeCatalogue): boolean {
  if (row.status !== 'published' || row.archived) return false;
  if (row.etablissement_id === null) return true;
  if (portee.etablissementId !== null && row.etablissement_id === portee.etablissementId) return true;
  return portee.publicsExternes && !!row.publie;
}

// Champs publics d'une carte du catalogue (jamais le share_token).
//
// `name` reste le NOM CANONIQUE en toutes langues : c'est l'adresse publique
// (/p/nom), la clé des favoris dans le navigateur, la référence des
// conversations en cours et la jointure de facturation. Une traduction ne le
// remplace jamais — elle ajoute `title`, qui n'est QUE de l'affichage.
export type PromptCard = {
  name: string; title: string; authorName: string; language: string; description: string;
  version: number; createdAt: number; updatedAt: number;
  usageCount: number; tokensTotal: number;
  ratingAvg: number | null; ratingCount: number;
  sizeBytes: number; webSearch: boolean;
  /** Vrai quand le titre et la description affichés viennent d'une traduction. */
  translated: boolean;
};

export function toCard(row: PromptRow, locale?: string): PromptCard {
  const tr = locale ? traductionFraiche(row.id, row.version, locale) : undefined;
  return {
    name: row.name,
    title: tr?.name || row.name,
    // Le nom tel qu'il est, ou RIEN — jamais le mot « Anonyme ». Le serveur ne
    // connaît pas la langue du lecteur, et ce mot français servi comme une
    // donnée se lisait « di Anonyme » sur la fiche italienne : c'est à
    // l'interface de nommer l'absence, dans la langue de la page.
    //
    // Le test portait autrefois sur author_email, ce qui aurait effacé le nom
    // des tuteurs fondateurs — signés « EduChat », sans adresse. Un nom sans
    // compte reste un nom : seule son ABSENCE est anonyme.
    authorName: row.author_name,
    language: row.language,
    description: tr?.description || row.description,
    translated: !!tr,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    usageCount: row.usage_count,
    tokensTotal: row.tokens_total,
    ratingAvg: row.rating_count > 0 ? Math.round((row.rating_sum / row.rating_count) * 10) / 10 : null,
    ratingCount: row.rating_count,
    sizeBytes: row.size_bytes,
    webSearch: !!row.web_search,
  };
}

// Tris disponibles — le tri s'exécute EN BASE (exigence n°4 du cahier des
// charges : la liste est triable selon les données mémorisées en base).
// « score » mélange usage, note et fraîcheur pour éviter l'effet boule de
// neige des premiers prompts publiés.
// Colonnes préfixées « p. » : la requête joint désormais les traductions, et
// « name » existe des deux côtés — sans préfixe, SQLite refuse l'ambiguïté.
const ORDER_BY: Record<string, string> = {
  score: `(p.usage_count
           + 5.0 * COALESCE(CAST(p.rating_sum AS REAL) / NULLIF(p.rating_count, 0), 0)
           + 50.0 / (1.0 + (@now - p.created_at) / 86400000.0)) DESC`,
  uses: 'p.usage_count DESC, p.updated_at DESC',
  rating: 'COALESCE(CAST(p.rating_sum AS REAL) / NULLIF(p.rating_count, 0), -1) DESC, p.rating_count DESC',
  recent: 'p.created_at DESC',
  updated: 'p.updated_at DESC',
  tokens: 'p.tokens_total DESC',
  name: 'p.name COLLATE NOCASE ASC',
};

// Un prompt ARCHIVÉ (refusé/neutralisé par l'administration) est invisible et
// inutilisable PARTOUT : catalogue, fiche, chat, et même son URL secrète —
// sinon un prompt refusé resterait exploitable (voire sur la clé interne)
// tout en étant invisible de la modération. La ligne reste en base.
// La recherche interroge AUSSI la traduction affichée : chercher « Fragen »
// sur la version allemande doit trouver un tuteur français traduit, sinon
// traduire le catalogue ne le rend pas utilisable pour autant.
// La PORTÉE est un argument OBLIGATOIRE, jamais optionnel : un paramètre qu'on
// peut oublier est un paramètre qu'on oubliera, et l'oubli serait silencieux —
// le catalogue d'une autre école sortirait sans que rien ne proteste. Ainsi le
// compilateur énumère lui-même les appelants le jour où la règle change.
export function listPublished(sort: string, search: string, locale: string | undefined,
  portee: PorteeCatalogue): PromptCard[] {
  const db = getDb();
  const orderBy = ORDER_BY[sort] ?? ORDER_BY.score;
  const rows = db.prepare(`
    SELECT p.* FROM prompts p
    LEFT JOIN prompt_translations t
      ON t.prompt_id = p.id AND t.locale = @locale
     AND t.state = 'ok' AND t.source_version >= p.version
    WHERE ${CLAUSE_VISIBLE}
      AND (@q = ''
           OR p.name LIKE '%' || @q || '%' OR p.description LIKE '%' || @q || '%'
           OR t.name LIKE '%' || @q || '%' OR t.description LIKE '%' || @q || '%')
    ORDER BY ${orderBy}
  `).all({ q: search, now: Date.now(), locale: locale ?? '', ...parametresPortee(portee) }) as PromptRow[];
  return rows.map(row => toCard(row, locale));
}

/**
 * Les NOMS des tuteurs qui APPARTIENNENT à une école, parmi ceux qu'elle voit.
 *
 * Sert uniquement à MARQUER, dans une liste déjà filtrée par listPublished,
 * ce qui vient de la maison — la page d'accueil d'un établissement montre le
 * catalogue accessible depuis son réseau, mais doit pouvoir dire « celui-ci
 * est le vôtre ». C'est un ornement, pas une autorisation : la requête réutilise
 * CLAUSE_VISIBLE plutôt que de réécrire « published AND NOT archived », pour
 * qu'un tuteur retiré du catalogue ne puisse jamais reparaître ici sous forme
 * de nom. Le rétrécissement (p.etablissement_id = @etab) ne fait qu'ajouter
 * une condition à un filtre qui décide déjà de tout.
 */
export function nomsDeLEcole(etablissementId: number): string[] {
  const parametres = parametresPortee(porteeDeLEcole(etablissementId));
  return (getDb().prepare(
    `SELECT p.name FROM prompts p WHERE ${CLAUSE_VISIBLE} AND p.etablissement_id = @etab`)
    .all(parametres) as Array<{ name: string }>).map(row => row.name);
}

export function getPublishedByName(name: string, portee: PorteeCatalogue): PromptRow | undefined {
  return getDb().prepare(`SELECT p.* FROM prompts p WHERE p.name = @name AND ${CLAUSE_VISIBLE}`)
    .get({ name, ...parametresPortee(portee) }) as PromptRow | undefined;
}

export function getByName(name: string): PromptRow | undefined {
  return getDb().prepare('SELECT * FROM prompts WHERE name = ?').get(name) as PromptRow | undefined;
}

export function getByShareToken(token: string): PromptRow | undefined {
  if (!/^[a-f0-9]{24,64}$/.test(token)) return undefined;
  return getDb().prepare('SELECT * FROM prompts WHERE share_token = ? AND archived = 0')
    .get(token) as PromptRow | undefined;
}

// Quotas d'upload (exigences n°8) : 256 Ko par prompt, 1 Mo par utilisateur.
export const MAX_PROMPT_BYTES = 256 * 1024;
export const MAX_USER_BYTES = 1024 * 1024;

export function isValidPromptName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  // Identifiant = nom propre : lettres (accents compris), chiffres, espaces,
  // tirets et apostrophes. « essai » est réservé aux URL secrètes de test.
  if (trimmed.length < 2 || trimmed.length > 64) return false;
  if (trimmed.toLowerCase() === 'essai') return false;
  return /^[\p{L}\p{N}][\p{L}\p{N} '’-]*$/u.test(trimmed);
}
