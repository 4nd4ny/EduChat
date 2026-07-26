// TRADUCTION AUTOMATIQUE DES TUTEURS SOCRATIQUES
//
// Un tuteur écrit en français faisait répondre le modèle en français, même à
// un élève qui lisait le site en allemand. Traduire l'interface ne suffisait
// donc pas : c'est le CORPS du prompt qui décide de la langue de la leçon.
//
// Règle : dès qu'un tuteur est publié (validé par l'administration), il est
// traduit dans les trois autres langues du site, sur la clé interne, par
// Claude Haiku — le modèle le plus économe de l'échelle Anthropic, largement
// suffisant pour une traduction.
//
// LE LIEN AVEC L'ORIGINAL TIENT EN UN ENTIER. Chaque traduction retient la
// `source_version` dont elle est issue. Une traduction est PÉRIMÉE dès que
// `source_version < prompts.version` — et comme toute modification du corps
// incrémente déjà la version (décision du 25 juillet), la péremption est
// automatique : il n'y a rien à invalider à la main, rien à synchroniser, et
// aucun état ne peut mentir. L'administration voit les périmées, les vérifie,
// et relance la traduction ; tant qu'elle ne l'a pas fait, c'est l'ORIGINAL
// qui est servi — jamais une traduction dont on sait qu'elle ne correspond
// plus au texte.
//
// La traduction ne bloque JAMAIS la publication : un fournisseur lent ou une
// clé sans crédit ne doit pas empêcher un tuteur d'entrer au catalogue. Elle
// part en arrière-plan, et son échec se lit dans l'administration.

import { getDb } from './db';
import { DeveloperKeys } from '../utils/env';
import type { PromptRow } from './db';

export const LOCALES = ['fr', 'en', 'it', 'de'] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Claude Haiku : choix explicite du client. Surchargeable sans redéploiement. */
export const MODELE_TRADUCTION = process.env.SECRET_TRANSLATE_MODEL || 'claude-haiku-4-5-20251001';

/** Au-delà, on ne traduit pas automatiquement : ce n'est plus un prompt, c'est un livre. */
const MAX_OCTETS_TRADUISIBLES = 48 * 1024;

const NOM_LANGUE: Record<Locale, string> = {
  fr: 'français', en: 'anglais (britannique)', it: 'italien', de: 'allemand (usage suisse : « ss », jamais « ß »)',
};

export type EtatTraduction = {
  locale: Locale;
  /** ok : utilisable · pending : en cours · failed : échec · absent : jamais tentée */
  state: 'ok' | 'pending' | 'failed' | 'absent';
  /** Vraie quand la traduction existe mais date d'une version antérieure. */
  perimee: boolean;
  sourceVersion: number;
  detail: string;
  updatedAt: number;
  tokens: number;
};

type LigneTraduction = {
  prompt_id: number; locale: string; name: string; description: string; body: string;
  auto: number; updated_at: number; source_version: number; state: string;
  detail: string; model: string; tokens: number;
};

// ---------------------------------------------------------------- lecture

/**
 * La traduction à SERVIR pour cette locale, ou undefined s'il faut s'en tenir
 * à l'original. Une traduction périmée n'est jamais servie : mieux vaut un
 * tuteur dans la mauvaise langue qu'un tuteur qui ne dit plus ce que son
 * auteur a écrit.
 */
export function traductionFraiche(promptId: number, version: number, locale: string):
  { name: string; description: string; body: string } | undefined {
  if (!isLocale(locale)) return undefined;
  const ligne = getDb().prepare(
    "SELECT name, description, body FROM prompt_translations " +
    "WHERE prompt_id = ? AND locale = ? AND state = 'ok' AND source_version >= ?",
  ).get(promptId, locale, version) as { name: string; description: string; body: string } | undefined;
  if (!ligne || !ligne.body) return undefined;
  return ligne;
}

/** L'état des quatre langues pour ce tuteur — ce que lit l'administration. */
export function etatsPour(row: Pick<PromptRow, 'id' | 'version' | 'language'>): EtatTraduction[] {
  const lignes = getDb().prepare('SELECT * FROM prompt_translations WHERE prompt_id = ?')
    .all(row.id) as LigneTraduction[];
  const source = isLocale(row.language) ? row.language : 'fr';
  return LOCALES.filter(locale => locale !== source).map(locale => {
    const ligne = lignes.find(l => l.locale === locale);
    if (!ligne) {
      return { locale, state: 'absent' as const, perimee: false, sourceVersion: 0, detail: '', updatedAt: 0, tokens: 0 };
    }
    const state = (['ok', 'pending', 'failed'].includes(ligne.state) ? ligne.state : 'failed') as 'ok' | 'pending' | 'failed';
    return {
      locale, state,
      perimee: state === 'ok' && ligne.source_version < row.version,
      sourceVersion: ligne.source_version,
      detail: ligne.detail,
      updatedAt: ligne.updated_at,
      tokens: ligne.tokens,
    };
  });
}

/** Résumé d'une ligne : combien de langues sont prêtes, et faut-il agir ? */
export function resumeTraductions(row: Pick<PromptRow, 'id' | 'version' | 'language'>) {
  const etats = etatsPour(row);
  return {
    etats,
    pretes: etats.filter(e => e.state === 'ok' && !e.perimee).length,
    total: etats.length,
    aVerifier: etats.some(e => e.perimee),
    enEchec: etats.some(e => e.state === 'failed'),
    enCours: etats.some(e => e.state === 'pending'),
  };
}

// ---------------------------------------------------------------- écriture

const enCours = new Set<number>();

/**
 * Lance la traduction SANS attendre : appelée depuis les routes qui publient.
 * Toute erreur est absorbée — publier ne doit jamais échouer parce qu'un
 * fournisseur tousse.
 */
export function planifierTraduction(promptId: number): void {
  void traduireTuteur(promptId).catch(erreur => {
    console.error(`Traduction du tuteur ${promptId} abandonnée :`, erreur);
  });
}

/**
 * Traduit un tuteur dans les trois autres langues. Idempotent : ce qui est
 * déjà à jour n'est pas retraduit, donc relancer ne coûte rien.
 */
export async function traduireTuteur(promptId: number, forcer = false): Promise<EtatTraduction[]> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM prompts WHERE id = ?').get(promptId) as PromptRow | undefined;
  if (!row) return [];
  if (enCours.has(promptId)) return etatsPour(row);
  enCours.add(promptId);
  try {
    const source = isLocale(row.language) ? row.language : 'fr';
    const cibles = LOCALES.filter(locale => locale !== source);
    const trop = Buffer.byteLength(row.body, 'utf8') > MAX_OCTETS_TRADUISIBLES;

    for (const cible of cibles) {
      const dejaFaite = db.prepare(
        "SELECT 1 FROM prompt_translations WHERE prompt_id = ? AND locale = ? AND state = 'ok' AND source_version >= ?",
      ).get(promptId, cible, row.version);
      if (dejaFaite && !forcer) continue;

      if (trop) {
        ecrire(promptId, cible, row.version, 'failed', {
          detail: `Corps de ${(row.body.length / 1024).toFixed(0)} Ko : au-delà de la limite de traduction automatique (${MAX_OCTETS_TRADUISIBLES / 1024} Ko).`,
        });
        continue;
      }

      // « pending » d'abord : si le processus meurt en plein appel, l'état
      // reste lisible dans l'administration au lieu de disparaître.
      ecrire(promptId, cible, row.version, 'pending', { detail: '' });
      try {
        const { champs, tokens } = await traduireUn(row, source, cible);
        ecrire(promptId, cible, row.version, 'ok', {
          nom: champs.nom, description: champs.description, corps: champs.corps, tokens, detail: '',
        });
        journaliser(promptId, tokens);
      } catch (erreur) {
        ecrire(promptId, cible, row.version, 'failed', {
          detail: String(erreur instanceof Error ? erreur.message : erreur).slice(0, 300),
        });
      }
    }
    const frais = db.prepare('SELECT * FROM prompts WHERE id = ?').get(promptId) as PromptRow;
    return etatsPour(frais);
  } finally {
    enCours.delete(promptId);
  }
}

function ecrire(
  promptId: number, locale: Locale, sourceVersion: number, state: string,
  champs: { nom?: string; description?: string; corps?: string; tokens?: number; detail: string },
): void {
  // Un échec ou une mise en attente ne doit pas effacer la traduction
  // précédente : elle reste en base (périmée, donc non servie), et
  // l'administration peut encore la lire pour comprendre ce qui a changé.
  const garde = state === 'ok';
  getDb().prepare(`
    INSERT INTO prompt_translations
      (prompt_id, locale, name, description, body, auto, updated_at, source_version, state, detail, model, tokens)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(prompt_id, locale) DO UPDATE SET
      name        = CASE WHEN ? THEN excluded.name        ELSE prompt_translations.name        END,
      description = CASE WHEN ? THEN excluded.description ELSE prompt_translations.description END,
      body        = CASE WHEN ? THEN excluded.body        ELSE prompt_translations.body        END,
      updated_at  = excluded.updated_at,
      source_version = CASE WHEN ? THEN excluded.source_version ELSE prompt_translations.source_version END,
      state       = excluded.state,
      detail      = excluded.detail,
      model       = excluded.model,
      tokens      = CASE WHEN ? THEN excluded.tokens ELSE prompt_translations.tokens END
  `).run(
    promptId, locale, champs.nom ?? '', champs.description ?? '', champs.corps ?? '',
    Date.now(), sourceVersion, state, champs.detail, MODELE_TRADUCTION, champs.tokens ?? 0,
    garde ? 1 : 0, garde ? 1 : 0, garde ? 1 : 0, garde ? 1 : 0, garde ? 1 : 0,
  );
}

/**
 * La traduction est payée sur la clé interne. Elle est journalisée SANS IP et
 * SANS établissement : c'est une dépense de la plateforme, pas d'une école.
 * Sans cette précaution, elle atterrirait sur la facture de l'établissement
 * dont l'IP se trouve passer par là.
 */
function journaliser(promptId: number, tokens: number): void {
  if (!tokens) return;
  try {
    getDb().prepare(`
      INSERT INTO usage_log (ts, ip, etablissement_id, teacher_email, prompt_id, provider, model, tokens, used_server_key, client_id)
      VALUES (?, '', NULL, NULL, ?, 'anthropic', ?, ?, 1, 'traduction')
    `).run(Date.now(), promptId, MODELE_TRADUCTION, tokens);
  } catch (erreur) {
    console.error('Traduction non journalisée :', erreur);
  }
}

// ------------------------------------------------------------- l'appel LLM

const CONSIGNE = `Tu traduis des TUTEURS SOCRATIQUES : des prompts système qui font d'un modèle de langue un enseignant posant des questions plutôt que donnant des réponses.

Ce que tu produis est envoyé tel quel à un modèle comme instruction système. Ce n'est donc pas un texte littéraire : c'est du code en langue naturelle.

RÈGLES ABSOLUES
- Traduis le SENS et les INSTRUCTIONS, sans en ajouter, sans en retirer, sans en adoucir aucune.
- Conserve à l'identique : la structure (titres, listes, numérotation), les sauts de ligne, le balisage Markdown, les exemples de code, les noms propres, les formules mathématiques, et tout gabarit entre accolades ou crochets ({{sujet}}, [NIVEAU]…).
- Une consigne de langue interne au prompt (« réponds en français ») devient la consigne équivalente dans la langue cible.
- N'ajoute aucun commentaire, aucune note de traducteur, aucun préambule.
- Le registre est celui d'un enseignant s'adressant à un élève : vouvoiement institutionnel là où la langue le demande.

FORMAT DE RÉPONSE — exactement ceci, sans rien avant ni après. Les marqueurs <<<1>>> <<<2>>> <<<3>>> <<<0>>> sont des repères techniques : recopie-les CARACTÈRE POUR CARACTÈRE, ne les traduis pas, ne les renumérote pas.
<<<1>>>
(le nom du tuteur traduit, ou inchangé s'il s'agit d'un nom propre comme Socrate)
<<<2>>>
(la description courte traduite)
<<<3>>>
(le prompt système entier, traduit)
<<<0>>>`;

async function traduireUn(row: PromptRow, source: Locale, cible: Locale):
  Promise<{ champs: { nom: string; description: string; corps: string }; tokens: number }> {
  const cle = DeveloperKeys.anthropic;
  if (!cle) throw new Error('Clé interne Anthropic absente (SECRET_ANTHROPIC_API_KEY) : traduction impossible.');

  const demande =
    `Langue source : ${NOM_LANGUE[source]}. Langue cible : ${NOM_LANGUE[cible]}.\n\n` +
    `<<<1>>>\n${row.name}\n<<<2>>>\n${row.description}\n<<<3>>>\n${row.body}\n<<<0>>>`;

  const reponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': cle, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODELE_TRADUCTION,
      // De quoi rendre un prompt plus long que l'original : l'allemand et
      // l'italien gonflent, et une sortie tronquée serait pire qu'absente.
      max_tokens: 32000,
      temperature: 0,
      system: CONSIGNE,
      messages: [{ role: 'user', content: demande }],
    }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!reponse.ok) {
    const data: any = await reponse.json().catch(() => ({}));
    throw new Error(data?.error?.message ?? `HTTP ${reponse.status}`);
  }
  const data: any = await reponse.json();
  if (data?.stop_reason === 'max_tokens') throw new Error('Réponse tronquée par la limite de jetons.');

  const texte: string = (Array.isArray(data?.content) ? data.content : [])
    .filter((bloc: any) => bloc?.type === 'text').map((bloc: any) => bloc.text).join('');
  const tokens = (data?.usage?.input_tokens ?? 0) + (data?.usage?.output_tokens ?? 0);

  const champs = decouper(texte);
  if (!champs) throw new Error('Réponse du modèle illisible : balises <<<NOM>>>/<<<CORPS>>> absentes.');
  if (Buffer.byteLength(champs.corps, 'utf8') < 40) throw new Error('Corps traduit vide ou trop court.');
  return { champs, tokens };
}

/**
 * Balises plutôt que JSON : un prompt système contient des guillemets, des
 * antislashs et des sauts de ligne par paquets, et un modèle qui échappe mal
 * un JSON de 20 Ko produit un document irrécupérable. Des balises, elles, ne
 * s'échappent pas.
 *
 * MAIS ELLES SE TRADUISENT. Les premiers marqueurs portaient des mots français
 * (NOM, CORPS, FIN) : en italien, le modèle rendait consciencieusement
 * <<<CORPO>>> et <<<FINE>>> — une traduction sur trois échouait, et toujours la
 * même. D'où deux précautions plutôt qu'une : des marqueurs NUMÉRIQUES, qu'on
 * ne traduit pas, et un découpage qui coupe sur n'importe quel marqueur sans
 * jamais lire son libellé. Même si un modèle inventait ses propres étiquettes,
 * l'ordre des trois champs suffirait à les retrouver.
 */
function decouper(texte: string): { nom: string; description: string; corps: string } | null {
  const morceaux = texte.split(/<<<[^>\n]{1,24}>>>/);
  // morceaux[0] est ce qui précède le premier marqueur (normalement vide).
  if (morceaux.length < 4) return null;
  return {
    nom: morceaux[1].trim().slice(0, 120),
    description: morceaux[2].trim().slice(0, 500),
    // Le saut de ligne qui suit le marqueur appartient au format, pas au texte.
    corps: morceaux[3].trim(),
  };
}
