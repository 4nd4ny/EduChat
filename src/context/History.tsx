import type { ChatMessage } from "@/context/AnthropicProvider";
import { v4 as uuidv4 } from "uuid";

const HISTORY_KEY = "pg-history";

// Types
export type Conversation = {
  name: string;
  createdAt: number; // Unix timestamp
  lastMessage: number; // Unix timestamp
  messages: ChatMessage[];
  // Tuteur socratique de la conversation : le nom ET la version, figée au
  // premier échange — une conversation ne change JAMAIS de version toute seule.
  promptName?: string;
  promptVersion?: number;
};

export type History = Record<string, Conversation>;

// Store conversation in local storage
export const storeConversation = (id: string, conversation: Conversation) => {
  const history = getHistory();
  id = id || uuidv4();
  localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify({
      ...history,
      [id]: conversation,
    })
  );
  return id;
};

// Get a conversation from local storage
export const getConversation = (id: string) => {
  const history = getHistory();
  return history[id];
};

// Update a conversation in local storage
export const updateConversation = (
  id: string,
  conversation: Partial<Conversation>
) => {
  const history = getHistory();
  localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify({
      ...history,
      [id]: {
        ...history[id],
        ...conversation,
      },
    })
  );
};

// Delete a conversation from local storage
export const deleteConversationFromHistory = (id: string) => {
  const history = getHistory();
  delete history[id];
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
};

// Get conversations from local storage
export const getHistory: () => History = () => {
  // Repli sur un historique vide si pg-history est corrompu (JSON illisible ou
  // non objet), comme pour les favoris et les notes : sinon toute la barre
  // latérale, l'export et l'import du profil échouent. La valeur corrompue n'est
  // écrasée qu'à la prochaine écriture.
  try {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}");
    return history && typeof history === "object" && !Array.isArray(history) ? history : {};
  } catch {
    return {};
  }
};

// Clear conversations from local storage
export const clearHistory = () => {
  localStorage.removeItem(HISTORY_KEY);
};
