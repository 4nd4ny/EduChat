// Source UNIQUE des fournisseurs et de leurs modèles par défaut.
// Ce fichier est importé côté client (AnthropicProvider) ET côté serveur
// (api/completion) : toute divergence de configuration devient impossible.

export type ProviderId =
  | "anthropic" | "openai" | "gemini" | "openrouter" | "grok" | "mistral"
  // Fournisseurs chinois, tous compatibles « OpenAI chat/completions ».
  | "deepseek" | "qwen" | "kimi" | "glm" | "minimax";
export type ReasoningLevel = "low" | "medium" | "high";

// `gdpr` : ce fournisseur propose-t-il un cadre RGPD (DPA, pas d'entraînement sur
// les données de l'API) pour une clé personnelle en offre commerciale ? Fondé sur
// une recherche des politiques officielles (juillet 2026) :
//  - mistral : OUI, le plus solide (sous-traitant français, hébergement UE par
//    défaut, DPA public, pas d'entraînement API).
//  - anthropic (Claude) / openai (ChatGPT) : cadre RGPD réel MAIS conditionnel
//    (DPA en offre commerciale, transferts UE→US encadrés par clauses-types).
//  - gemini : l'endpoint utilisé (AI Studio) peut entraîner sur les données →
//    pas de tag. grok / openrouter (modèles gratuits/chinois) : non garanti.
// Le tag signale une POSSIBILITÉ de conformité avec votre propre clé, jamais une
// garantie absolue — voir la page /rgpd.
// `images` / `pdf` : pièces jointes acceptées par l'API du fournisseur telle
// que câblée ici (envoi en base64). Réservées à la clé PERSONNELLE — jamais au
// repli gratuit ni à la clé interne (maîtrise des coûts et du juridique).
// Gemini : l'API interactions utilisée ne documente pas d'entrée base64 stable
// → pas de pièces jointes. Grok/Mistral : images seulement (pas de PDF natif).
// `voice` : le fournisseur expose une API de TRANSCRIPTION audio utilisable
// avec la clé personnelle (OpenAI : gpt-4o-mini-transcribe/whisper ; Mistral :
// Voxtral). La lecture des réponses, elle, passe par la synthèse vocale du
// navigateur — aucun coût, aucune donnée envoyée.
// Les MODÈLES par défaut ci-dessous sont un point de départ : le champ
// « Modèle » du chat propose désormais le catalogue réel du fournisseur
// (rafraîchi chaque jour, src/server/models.ts) tout en restant librement
// éditable. Un défaut qui vieillit se corrige donc en deux clics.
//
// `wrng` : DRAPEAU ROUGE. Le sous-traitant est établi hors UE/EEE sans cadre
// de transfert reconnu (fournisseurs chinois) : les données peuvent être
// conservées et réutilisées sous une législation qui ne connaît ni le RGPD ni
// la nLPD, avec un accès possible des autorités locales. À réserver à des
// contenus NON personnels — jamais de travaux d'élèves identifiables.
export const providerDefaults: Record<ProviderId, {
  label: string; model: string; gdpr?: boolean; wrng?: boolean;
  images?: boolean; pdf?: boolean; voice?: boolean;
  /**
   * `ecarte` : fournisseur ÉCARTÉ D'UN PUBLIC SCOLAIRE, au titre du règlement
   * européen sur l'IA (AI Act), qui interdit d'exposer des mineurs à certains
   * systèmes. Là où l'école répond des personnes — sur son réseau — ils ne
   * figurent pas ; et aucune clé de la plateforme ne les finance jamais, nulle
   * part (src/server/accesFournisseurs.ts porte la démonstration).
   *
   * ─── POURQUOI CE DRAPEAU NE FUSIONNE PAS AVEC `wrng`, ET NE DOIT PAS ──────
   *
   * Il a porté le nom `adultOnly` tant qu'une « majorité certifiée » ouvrait
   * ces fournisseurs ; cette certification a disparu, et la tentation est alors
   * de supprimer le drapeau ou de le fondre dans `wrng`. LES DEUX SERAIENT DES
   * FAUTES, et chacune se démontre sur un fournisseur précis :
   *
   *   · LE SUPPRIMER rouvrirait GEMINI à une école. Gemini ne porte pas de
   *     drapeau rouge — l'éditeur n'est pas un sous-traitant hors cadre — mais
   *     il est écarté d'un public mineur. Sans `ecarte`, il retomberait dans
   *     SCHOOL_PROVIDER_IDS : la clé d'un collège le paierait, et il
   *     s'afficherait dans la liste d'une salle de classe. C'est très
   *     exactement l'engagement pris devant une direction qui tomberait.
   *
   *   · LES FONDRE mentirait dans l'autre sens, et deux fois. Sur Gemini,
   *     l'interface afficherait un drapeau rouge « sous-traitant hors UE sans
   *     cadre reconnu » — une affirmation FACTUELLE, et fausse. Et OPENROUTER,
   *     drapeau rouge lui aussi, resterait ce qu'il doit rester : le moteur du
   *     repli gratuit public et un intermédiaire vers l'échelle réglée par
   *     l'administration — donc PAS écarté. Un drapeau unique ne saurait plus
   *     dire lequel des deux traitements appliquer.
   *
   * Les deux drapeaux répondent à deux questions distinctes : `wrng` CONSTATE
   * un fait sur le sous-traitant (et s'affiche à ce titre), `ecarte` porte une
   * DÉCISION sur le public. Qu'ils coïncident sur cinq fournisseurs chinois ne
   * les rend pas identiques — ils divergent aux deux bords, et ce sont
   * précisément les bords qui coûtent cher.
   */
  ecarte?: boolean;
}> = {
  mistral: { label: "Mistral", model: "mistral-medium-latest", gdpr: true, images: true, voice: true },
  anthropic: { label: "Claude", model: "claude-sonnet-5", gdpr: true, images: true, pdf: true },
  openai: { label: "ChatGPT", model: "gpt-5.1", gdpr: true, images: true, pdf: true, voice: true },
  gemini: { label: "Gemini", model: "gemini-3.5-flash", ecarte: true },
  grok: { label: "Grok", model: "grok-4.5", ecarte: true, wrng: true, images: true },
  // OpenRouter est un INTERMÉDIAIRE : même en routant vers un modèle dont
  // l'éditeur offre un cadre correct, les échanges transitent par lui et
  // peuvent y être exploités. Drapeau rouge, donc — il reste le moteur du
  // repli gratuit public, où rien de personnel n'a sa place.
  openrouter: { label: "OpenRouter", model: "openai/gpt-5.1", wrng: true, images: true, pdf: true },
  // Modèles chinois : API compatibles OpenAI, clé PERSONNELLE uniquement,
  // TEXTE seulement dans EduChat. Des variantes « vision » existent chez
  // Qwen, Kimi et GLM, mais elles supposent de changer aussi de modèle :
  // annoncer le trombone avec le modèle par défaut ne ferait que produire
  // des refus du fournisseur. Aucun PDF natif, aucune transcription câblée.
  deepseek: { label: "DeepSeek", model: "deepseek-v4-flash", ecarte: true, wrng: true },
  qwen: { label: "Qwen", model: "qwen-plus", ecarte: true, wrng: true },
  kimi: { label: "Kimi", model: "kimi-k2.5", ecarte: true, wrng: true },
  glm: { label: "GLM", model: "glm-4.6", ecarte: true, wrng: true },
  minimax: { label: "MiniMax", model: "MiniMax-M2.5", ecarte: true, wrng: true },
};

// Pièce jointe telle qu'elle transite du navigateur vers /api/completion.
// `data` est le contenu base64 SANS préfixe data-URL ; le serveur reconstruit
// le format attendu par chaque fournisseur.
export type AttachmentKind = 'image' | 'pdf';
export type Attachment = { kind: AttachmentKind; mediaType: string; name: string; data: string };

export const ATTACHMENT_MEDIA_TYPES: Record<AttachmentKind, string[]> = {
  image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  pdf: ['application/pdf'],
};
export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 Mo par fichier (avant base64)

/** Le fournisseur accepte-t-il ce type de pièce jointe ? */
export function providerAcceptsAttachment(provider: ProviderId, kind: AttachmentKind): boolean {
  const caps = providerDefaults[provider];
  return kind === 'image' ? !!caps.images : !!caps.pdf;
}

export const PROVIDER_IDS = Object.keys(providerDefaults) as ProviderId[];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && PROVIDER_IDS.includes(value as ProviderId);
}

export function isReasoningLevel(value: unknown): value is ReasoningLevel {
  return value === "low" || value === "medium" || value === "high";
}

// Codes d'erreur stables renvoyés par les API et traduits côté client
// (préparation de l'i18n — aucun message en dur côté serveur).
// L'étape 9 y ajoutera ERR_QUOTA_ETABLISSEMENT.
export const ERR = {
  METHOD: "ERR_METHOD_NOT_ALLOWED",
  LOCKED: "ERR_LOCKED",
  RATE_LIMIT: "ERR_RATE_LIMIT",
  BODY_TOO_LARGE: "ERR_BODY_TOO_LARGE",
  PROVIDER: "ERR_PROVIDER_UNSUPPORTED",
  MODEL: "ERR_MODEL_INVALID",
  NO_KEY: "ERR_NO_API_KEY",
  EMPTY: "ERR_EMPTY_CONVERSATION",
  UPSTREAM: "ERR_UPSTREAM",
  ATTACH_KEY: "ERR_ATTACHMENTS_KEY",           // pièces jointes sans clé personnelle
  ATTACH_UNSUPPORTED: "ERR_ATTACHMENTS_UNSUPPORTED", // fournisseur incompatible
  ATTACH_INVALID: "ERR_ATTACHMENTS_INVALID",   // format/taille invalides
  VOICE_KEY: "ERR_VOICE_KEY",                  // transcription sans clé personnelle
  VOICE_UNSUPPORTED: "ERR_VOICE_UNSUPPORTED",  // fournisseur sans API de transcription
  VOICE_INVALID: "ERR_VOICE_INVALID",          // audio invalide (format/taille)
} as const;

export type ErrorCode = (typeof ERR)[keyof typeof ERR];

/**
 * Fournisseurs qu'une CLÉ D'ÉTABLISSEMENT peut réellement servir — et, par la
 * même occasion, ce qu'on propose SUR LE RÉSEAU d'une école.
 *
 * Ni écarté d'un public scolaire, ni drapeau rouge. OpenRouter en est exclu à
 * ce second titre : la route de complétion refuse déjà de le payer sur la clé
 * interne d'une école, et une liste qui propose ce que le serveur refuse est
 * pire qu'une liste courte — un réglage qu'on enregistre et qui ne marchera
 * jamais se paie en heures de dépannage. Il reste accessible à qui apporte ses
 * propres moyens, sous sa propre responsabilité.
 *
 * C'est aussi la liste que le navigateur affiche TANT QUE LE SERVEUR N'A PAS
 * RÉPONDU (src/chat/useFournisseurs.ts) : le seul périmètre qu'on puisse
 * montrer sans savoir d'où l'on appelle est celui d'une salle de classe.
 */
export const SCHOOL_PROVIDER_IDS: ProviderId[] = PROVIDER_IDS.filter(
  id => !providerDefaults[id].ecarte && !providerDefaults[id].wrng);

/**
 * Fournisseurs admissibles là où l'utilisateur NOMME LE MODÈLE LUI-MÊME
 * (page « duel ») ET n'a pas de compte.
 *
 * OpenRouter porte deux statuts selon l'endroit, et ce n'est pas une
 * incohérence à « corriger » : dans le chat personne ne choisit de modèle —
 * l'administration règle l'échelle — donc OpenRouter n'est qu'un intermédiaire
 * vers des modèles conformes, et il est même le moteur du repli gratuit
 * public. Sur « duel », le modèle est écrit à la main : rien n'empêcherait d'y
 * demander à travers lui ce qu'aucune de nos listes ne contient.
 *
 * CETTE CONSTANTE NE PORTE QUE LE RETRAIT. Le périmètre, lui, vient du serveur
 * (src/server/accesFournisseurs.ts) ; le hook se contente d'en soustraire les
 * intermédiaires quand la surface nomme le modèle et que personne ne répond de
 * l'appel. Un compte, lui, garde OpenRouter : il est identifié et il paie. Le
 * serveur revérifie de toute façon (/api/completion, garde « modèle hors
 * échelle chez un intermédiaire »).
 */
export const DUEL_PUBLIC_PROVIDER_IDS: ProviderId[] = PROVIDER_IDS.filter(
  id => !providerDefaults[id].ecarte && !providerDefaults[id].wrng);
