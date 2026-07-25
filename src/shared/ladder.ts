import { PROVIDER_IDS, providerDefaults, type ProviderId, type ReasoningLevel } from './providers';

// L'ÉCHELLE : trois barreaux par fournisseur, du plus économe au plus fouillé.
//
// Pourquoi une échelle plutôt qu'un choix de modèle. Le nom d'un modèle est du
// jargon, et se tromper d'un caractère donne une erreur incompréhensible. On
// commence donc TOUJOURS au barreau le moins cher ; « Régénérer » monte d'un
// cran, et seulement si la réponse n'a pas convenu. La facture suit l'exigence
// réelle, pas la peur de mal choisir.
//
// Ces valeurs sont une PROPOSITION, vérifiée le 25 juillet 2026 contre les
// catalogues réels des fournisseurs. L'administration peut les remplacer
// (/admin), et l'interface distingue toujours la proposition du choix retenu.
// Certains fournisseurs n'ont que deux barreaux : mieux vaut une échelle
// courte et vraie qu'un troisième barreau inventé.

export const RUNGS = [1, 2, 3] as const;
export type Rung = 1 | 2 | 3;

/** Un barreau haut demande aussi plus d'effort au modèle, quand il sait le faire. */
export const RUNG_REASONING: Record<Rung, ReasoningLevel> = { 1: 'low', 2: 'medium', 3: 'high' };

export const SUGGESTED_LADDER: Record<ProviderId, string[]> = {
  anthropic: ['claude-haiku-4-5-20251001', 'claude-sonnet-5', 'claude-opus-5'],
  openai: ['gpt-5.4-mini', 'gpt-5.5', 'gpt-5.5-pro'],
  mistral: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest'],
  gemini: ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-pro-latest'],
  grok: ['grok-4.20-0309-non-reasoning', 'grok-4.3', 'grok-4.5'],
  openrouter: ['mistralai/mistral-small-3.2-24b-instruct', 'mistralai/mistral-large-2512', 'anthropic/claude-sonnet-5'],
  // Fournisseurs chinois : jamais servis par la clé d'une école (drapeau
  // WRNG), mais leur catalogue est désormais interrogeable — ces échelles sont
  // donc VÉRIFIÉES contre les listes réelles du 25 juillet 2026, sauf Kimi
  // dont la clé manque encore.
  deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  qwen: ['qwen3.7-flash', 'qwen3.7-plus', 'qwen3.7-max'],
  kimi: ['kimi-k2.5', 'kimi-k3'],
  glm: ['glm-5-turbo', 'glm-5', 'glm-5.2'],
  minimax: ['MiniMax-M2.5-highspeed', 'MiniMax-M2.7', 'MiniMax-M3'],
};

/** Le barreau demandé, ramené à ce que l'échelle propose réellement. */
export function modelForRung(ladder: string[], rung: number, provider: ProviderId): string {
  const echelle = ladder.length ? ladder : [providerDefaults[provider].model];
  const index = Math.min(Math.max(Math.trunc(rung) || 1, 1), echelle.length) - 1;
  return echelle[index];
}

/** Peut-on encore monter d'un cran chez ce fournisseur ? */
export function hasHigherRung(ladder: string[], rung: number): boolean {
  return rung < Math.max(1, ladder.length);
}

export function isRung(value: unknown): value is Rung {
  return value === 1 || value === 2 || value === 3;
}

export const LADDER_PROVIDERS = PROVIDER_IDS;
