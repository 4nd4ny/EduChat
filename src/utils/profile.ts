// Export / import du PROFIL complet du navigateur : conversations, favoris,
// notes données et compteur de tokens. C'est le format de portabilité entre
// navigateurs (exigence n°11) — et la future charge utile de la
// synchronisation serveur opt-in (étape 15).

import { getHistory, type Conversation, type History } from '../context/History';
import type { ChatMessage } from '../context/AnthropicProvider';

export const PROFILE_FORMAT = 1;

export type Profile = {
  educhatProfile: number;
  exportedAt: number;
  conversations: History;
  favorites: string[];
  ratings: Record<string, number>;
  totalTokens: number;
};

export function buildProfile(): Profile {
  const read = (key: string, fallback: string) => {
    try { return JSON.parse(localStorage.getItem(key) || fallback); } catch { return JSON.parse(fallback); }
  };
  return {
    educhatProfile: PROFILE_FORMAT,
    exportedAt: Date.now(),
    conversations: getHistory(),
    favorites: read('prompt-favorites', '[]'),
    ratings: read('prompt-ratings', '{}'),
    totalTokens: parseInt(localStorage.getItem('totalTokens') || '0', 10) || 0,
  };
}

/**
 * Aiguillage du fichier déposé : tout objet portant un champ numérique
 * `educhatProfile` est traité comme un profil. La version elle-même est
 * contrôlée par applyProfile, pour qu'un profil d'une version inconnue reçoive
 * un refus explicite au lieu d'être confié à importConversation.
 *
 * Le champ s'appelle `educhatProfile` et non `formatVersion` (planning, étape
 * 11) : on le conserve pour rester compatible avec les fichiers déjà exportés.
 */
export function isProfile(data: any): data is Profile {
  return !!data && typeof data === 'object' && typeof data.educhatProfile === 'number';
}

/** Versions de profil que ce code sait lire. */
export const SUPPORTED_PROFILE_FORMATS: readonly number[] = [PROFILE_FORMAT];

/** Même plafond que l'import d'une conversation seule (parseImportedMessages). */
export const MAX_PROFILE_MESSAGES = 5000;

const isPlainObject = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Valide et normalise les messages d'une conversation du profil, avec les
 * MÊMES règles que l'import d'une conversation seule (parseImportedMessages,
 * src/context/AnthropicProvider.tsx) : rôle user/assistant, contenu textuel
 * (ancien format { reply } accepté), au plus 5000 messages. Contrairement à
 * celui-ci, l'identifiant du message et les métadonnées de pièces jointes sont
 * conservés, pour que l'aller-retour entre navigateurs soit exact. Les champs
 * inconnus sont écartés.
 */
function validateMessages(conversationId: string, messages: any[]): ChatMessage[] {
  const where = `conversation « ${conversationId.slice(0, 80)} »`;
  if (messages.length > MAX_PROFILE_MESSAGES) {
    throw new Error(`Profil invalide : ${where} trop longue (plus de ${MAX_PROFILE_MESSAGES} messages).`);
  }
  return messages.map((message: any, index: number) => {
    if (!isPlainObject(message)) throw new Error(`Profil invalide : ${where}, message ${index + 1} : format invalide.`);
    if (message.role !== 'user' && message.role !== 'assistant') {
      throw new Error(`Profil invalide : ${where}, message ${index + 1} : rôle « ${String(message.role)} » non autorisé.`);
    }
    const raw = isPlainObject(message.content) && typeof message.content.reply === 'string'
      ? message.content.reply
      : message.content;
    if (typeof raw !== 'string') throw new Error(`Profil invalide : ${where}, message ${index + 1} : contenu textuel attendu.`);
    const attachments = Array.isArray(message.attachments)
      ? message.attachments.filter((a: any) => isPlainObject(a) && typeof a.kind === 'string' && typeof a.name === 'string')
        .map((a: any) => ({ kind: a.kind, name: a.name }))
      : [];
    return {
      ...(typeof message.id === 'string' ? { id: message.id } : {}),
      role: message.role,
      content: raw,
      ...(typeof message.model === 'string' ? { model: message.model } : {}),
      ...(attachments.length ? { attachments } : {}),
    } as ChatMessage;
  });
}

/** Lecture tolérante d'une clé locale : repli si illisible ou mal typée. */
function readLocal<T>(key: string, fallback: T, accept: (value: unknown) => boolean): T {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return accept(value) ? value as T : fallback;
  } catch { return fallback; }
}

/**
 * Applique un profil importé en FUSIONNANT avec l'existant : les conversations
 * du fichier s'ajoutent (celles du navigateur sont conservées), favoris et
 * notes s'unissent, le compteur de tokens prend le maximum des deux.
 * Le jeton de compte (educhat-token) n'est JAMAIS inclus ni écrasé.
 *
 * Tout est validé et lu AVANT la première écriture : un profil refusé (ou un
 * stockage local corrompu) ne laisse jamais d'import partiel.
 */
export function applyProfile(profile: Profile): { conversations: number } {
  if (!SUPPORTED_PROFILE_FORMATS.includes(profile.educhatProfile)) {
    throw new Error(`Profil invalide : version ${String(profile.educhatProfile)} non prise en charge.`);
  }
  // Un tableau recevrait les identifiants "0", "1"… : ce n'est pas le format.
  if (!isPlainObject(profile.conversations)) {
    throw new Error('Profil invalide : aucune conversation.');
  }

  // 1. Validation et calculs, sans rien écrire.
  const existing = getHistory();
  let added = 0;
  for (const [id, conversation] of Object.entries(profile.conversations)) {
    // Conversation sans tableau messages : ignorée, comme auparavant.
    if (!isPlainObject(conversation) || !Array.isArray(conversation.messages)) continue;
    // Validée même si une version locale existe : un fichier hostile est refusé en bloc.
    const messages = validateMessages(id, conversation.messages);
    if (!existing[id]) {
      existing[id] = { ...conversation, messages } as Conversation;
      added += 1;
    }
  }

  // Favoris locaux illisibles : même repli que getFavorites (liste vide).
  const localFavorites = readLocal<unknown[]>('prompt-favorites', [], Array.isArray);
  const favorites = new Set<string>([
    ...localFavorites.filter((f): f is string => typeof f === 'string'),
    // Seules les chaînes (noms de tuteurs) sont des favoris.
    ...(Array.isArray(profile.favorites) ? profile.favorites.filter(f => typeof f === 'string') : []),
  ]);

  const ratings = {
    ...(isPlainObject(profile.ratings) ? profile.ratings : {}),
    ...readLocal<Record<string, unknown>>('prompt-ratings', {}, isPlainObject),
  };

  const localTokens = parseInt(localStorage.getItem('totalTokens') || '0', 10) || 0;
  // Un compteur non fini (« Infinity ») ou négatif est ignoré : il serait
  // rangé tel quel puis relu comme 0 par buildProfile.
  const fileTokens = Number(profile.totalTokens);
  const importedTokens = Number.isFinite(fileTokens) && fileTokens > 0 ? Math.floor(fileTokens) : 0;

  // 2. Écritures.
  localStorage.setItem('pg-history', JSON.stringify(existing));
  localStorage.setItem('prompt-favorites', JSON.stringify(Array.from(favorites)));
  localStorage.setItem('prompt-ratings', JSON.stringify(ratings));
  localStorage.setItem('totalTokens', String(Math.max(localTokens, importedTokens)));
  window.dispatchEvent(new Event('totalTokensUpdated'));

  return { conversations: added };
}

export function downloadProfile() {
  const blob = new Blob([JSON.stringify(buildProfile(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `educhat-profil-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
