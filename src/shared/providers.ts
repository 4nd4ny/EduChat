// Source UNIQUE des fournisseurs et de leurs modèles par défaut.
// Ce fichier est importé côté client (AnthropicProvider) ET côté serveur
// (api/completion) : toute divergence de configuration devient impossible.

export type ProviderId = "anthropic" | "openai" | "gemini" | "openrouter" | "grok" | "mistral";
export type ReasoningLevel = "low" | "medium" | "high";

export const providerDefaults: Record<ProviderId, { label: string; model: string }> = {
  anthropic: { label: "Claude", model: "claude-sonnet-4-5" },
  openai: { label: "ChatGPT", model: "gpt-5.1" },
  gemini: { label: "Gemini", model: "gemini-3.5-flash" },
  openrouter: { label: "OpenRouter", model: "openai/gpt-5.1" },
  grok: { label: "Grok", model: "grok-4.5" },
  mistral: { label: "Mistral", model: "mistral-medium-latest" },
};

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
} as const;

export type ErrorCode = (typeof ERR)[keyof typeof ERR];
