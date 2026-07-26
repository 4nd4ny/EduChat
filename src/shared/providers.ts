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
   * `adultOnly` : fournisseur RETIRÉ de l'interface publique au titre du
   * règlement européen sur l'IA (AI Act), qui interdit d'exposer des mineurs
   * à certains systèmes. Le code reste entier — ces fournisseurs
   * reviendront derrière le futur « compte adulte vérifié ». D'ici là ils
   * n'apparaissent nulle part, et la clé d'une école ne les finance jamais.
   */
  adultOnly?: boolean;
}> = {
  mistral: { label: "Mistral", model: "mistral-medium-latest", gdpr: true, images: true, voice: true },
  anthropic: { label: "Claude", model: "claude-sonnet-5", gdpr: true, images: true, pdf: true },
  openai: { label: "ChatGPT", model: "gpt-5.1", gdpr: true, images: true, pdf: true, voice: true },
  gemini: { label: "Gemini", model: "gemini-3.5-flash", adultOnly: true },
  grok: { label: "Grok", model: "grok-4.5", adultOnly: true, images: true },
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
  deepseek: { label: "DeepSeek", model: "deepseek-v4-flash", adultOnly: true, wrng: true },
  qwen: { label: "Qwen", model: "qwen-plus", adultOnly: true, wrng: true },
  kimi: { label: "Kimi", model: "kimi-k2.5", adultOnly: true, wrng: true },
  glm: { label: "GLM", model: "glm-4.6", adultOnly: true, wrng: true },
  minimax: { label: "MiniMax", model: "MiniMax-M2.5", adultOnly: true, wrng: true },
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
 * Fournisseurs proposés dans l'interface publique — ceux qu'un mineur peut
 * légitimement rencontrer. Les autres ne sont pas supprimés : ils attendent
 * le mode « compte adulte vérifié ».
 */
export const PUBLIC_PROVIDER_IDS: ProviderId[] = PROVIDER_IDS.filter(
  id => !providerDefaults[id].adultOnly);
