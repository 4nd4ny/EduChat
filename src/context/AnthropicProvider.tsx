import { v4 as uuidv4 } from "uuid";
import React, { PropsWithChildren, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Conversation, getHistory, clearHistory, storeConversation, History, deleteConversationFromHistory, updateConversation } from "./History";

import { providerDefaults, type ProviderId, type ReasoningLevel } from "../shared/providers";

export { providerDefaults };
export type { ProviderId, ReasoningLevel };
export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; model?: string };

// Traduction des codes d'erreur stables renvoyés par les API.
// À l'arrivée de l'i18n (étape 10), cette table déménagera dans les dictionnaires.
const errorMessages: Record<string, string> = {
  ERR_METHOD_NOT_ALLOWED: "Méthode non autorisée.",
  ERR_LOCKED: "La clé de la plateforme est réservée aux établissements (espace /school déverrouillé par un enseignant, ou IP d'école en plage horaire). Saisissez votre clé API personnelle pour continuer ici.",
  ERR_RATE_LIMIT: "Trop de requêtes en peu de temps. Patientez une minute.",
  ERR_BODY_TOO_LARGE: "La conversation est trop longue à envoyer.",
  ERR_PROVIDER_UNSUPPORTED: "Fournisseur non pris en charge.",
  ERR_MODEL_INVALID: "Nom de modèle invalide.",
  ERR_NO_API_KEY: "Aucune clé API n'est configurée sur le serveur pour ce fournisseur.",
  ERR_EMPTY_CONVERSATION: "La conversation est vide.",
  ERR_UPSTREAM: "Le fournisseur d'IA n'a pas répondu correctement.",
};

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // 2 Mo

/**
 * Valide et normalise une conversation importée. Lève une erreur explicite au
 * moindre écart : le fichier vient de l'extérieur et son contenu finira rendu
 * dans le navigateur. Gère aussi l'ancien format { reply, tokenUsage }.
 */
function parseImportedMessages(jsonData: any): ChatMessage[] {
  if (!jsonData || typeof jsonData !== "object") throw new Error("Fichier illisible : JSON attendu.");
  if (!Array.isArray(jsonData.messages)) throw new Error("Fichier invalide : aucune liste « messages ».");
  if (jsonData.messages.length > 5000) throw new Error("Conversation trop longue (plus de 5000 messages).");

  return jsonData.messages.map((message: any, index: number) => {
    if (!message || typeof message !== "object") throw new Error(`Message ${index + 1} : format invalide.`);
    if (message.role !== "user" && message.role !== "assistant") {
      throw new Error(`Message ${index + 1} : rôle « ${String(message.role)} » non autorisé.`);
    }
    // Ancien format : le contenu pouvait être un objet { reply, tokenUsage }.
    const raw = typeof message.content === "object" && message.content !== null && typeof message.content.reply === "string"
      ? message.content.reply
      : message.content;
    if (typeof raw !== "string") throw new Error(`Message ${index + 1} : contenu textuel attendu.`);
    return {
      id: uuidv4(),
      role: message.role,
      content: raw,
      ...(typeof message.model === "string" ? { model: message.model } : {}),
    } as ChatMessage;
  });
}

// Cumule les tokens consommés et notifie l'affichage (titre d'onglet et bandeau).
// Layout.tsx et formatTokens.ts assurent déjà le rendu : il ne manquait que
// l'alimentation de la clé localStorage, jamais écrite jusqu'ici.
function addTokenUsage(tokens: number) {
  if (typeof window === "undefined" || !Number.isFinite(tokens) || tokens <= 0) return;
  const previous = parseInt(localStorage.getItem("totalTokens") || "0", 10) || 0;
  localStorage.setItem("totalTokens", String(previous + tokens));
  window.dispatchEvent(new Event("totalTokensUpdated"));
}

type Context = {
  loading: boolean; messages: ChatMessage[]; setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  addMessage: (content: string, submit?: boolean, role?: "user" | "assistant") => void;
  provider: ProviderId; setProvider: (value: ProviderId) => void; model: string; setModel: (value: string) => void;
  apiKey: string; setApiKey: (value: string) => void; reasoning: ReasoningLevel; setReasoning: (value: ReasoningLevel) => void;
  promptName: string; setPromptName: (value: string) => void;
  conversationId: string; conversationName: string; updateConversationName: (id: string, name: string) => void;
  generateTitle: () => void; loadConversation: (id: string, conversation: Conversation) => void; importConversation: (jsonData: any) => void;
  resetConversation: () => void; deleteConversation: (id: string) => void; deleteMessagesFromIndex: (index: number) => void;
  clearConversation: () => void; conversations: History; clearConversations: () => void; error: string;
};

const noop = () => {};
const ChatContext = React.createContext<Context>({
  loading: false, messages: [], setMessages: noop as any, addMessage: noop as any,
  provider: "anthropic", setProvider: noop as any, model: providerDefaults.anthropic.model, setModel: noop as any,
  apiKey: "", setApiKey: noop as any, reasoning: "medium", setReasoning: noop as any,
  promptName: "", setPromptName: noop as any,
  conversationId: "", conversationName: "", updateConversationName: noop as any, generateTitle: noop,
  loadConversation: noop as any, importConversation: noop as any, resetConversation: noop, deleteConversation: noop as any,
  deleteMessagesFromIndex: noop as any, clearConversation: noop, conversations: {}, clearConversations: noop, error: "",
});

export default function AnthropicProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [provider, setProviderState] = useState<ProviderId>("anthropic");
  const [model, setModel] = useState(providerDefaults.anthropic.model);
  const [apiKey, setApiKey] = useState("");
  const [reasoning, setReasoning] = useState<ReasoningLevel>("medium");
  // Tuteur socratique actif — le CŒUR de l'expérience (pivot v3). Vide = chat libre.
  const [promptName, setPromptName] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [conversationName, setConversationName] = useState("...");
  const [conversations, setConversations] = useState<History>({});
  const [error, setError] = useState("");

  useEffect(() => setConversations(getHistory()), []);
  useEffect(() => {
    if (!messages.length) return;
    const conversation: Conversation = { name: conversationName || "...", createdAt: Date.now(), lastMessage: Date.now(), messages: messages as any };
    const id = storeConversation(conversationId, conversation);
    setConversationId(id); setConversations(previous => ({ ...previous, [id]: conversation }));
    if (router.pathname === "/chat" || router.pathname === "/school") router.push(`/chat/${id}`);
  }, [messages]);

  const setProvider = useCallback((next: ProviderId) => { setProviderState(next); setModel(providerDefaults[next].model); setError(""); }, []);
  const updateConversationName = useCallback((id: string, name: string) => {
    setConversationName(name); updateConversation(id, { name });
    setConversations(previous => previous[id] ? { ...previous, [id]: { ...previous[id], name } } : previous);
  }, []);
  const generateTitle = useCallback(() => {
    const first = messages[0]?.content?.trim();
    if (!first || conversationName !== "...") return;
    updateConversationName(conversationId, first.slice(0, 48) + (first.length > 48 ? "…" : ""));
  }, [messages, conversationName, conversationId, updateConversationName]);

  const send = useCallback(async (nextMessages: ChatMessage[]) => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/completion", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model, apiKey, reasoning, promptName: promptName || undefined, messages: nextMessages.map(({ role, content }) => ({ role, content })) }) });
      const data = await response.json();
      if (!response.ok) {
        const code = data?.error?.code as string | undefined;
        throw new Error((code && errorMessages[code]) || "La réponse a échoué.");
      }
      addTokenUsage(Number(data.tokenUsage));
      setMessages(previous => [...previous, { id: uuidv4(), role: "assistant", content: data.reply, model: providerDefaults[provider].label }]);
    } catch (exception: any) {
      const message = exception?.message || "Erreur inconnue.";
      setError(message); setMessages(previous => [...previous, { id: uuidv4(), role: "assistant", content: `Erreur : ${message}`, model: providerDefaults[provider].label }]);
    } finally { setLoading(false); }
  }, [provider, model, apiKey, reasoning, promptName]);

  const addMessage = useCallback((content: string, submit = true, role: "user" | "assistant" = "user") => {
    const value = content.trim(); if (!value) return;
    setMessages(previous => { const next = [...previous, { id: uuidv4(), role, content: value }]; if (submit && role === "user") void send(next); return next; });
  }, [send]);
  const deleteMessagesFromIndex = useCallback((index: number) => setMessages(previous => previous.slice(0, index)), []);
  const resetConversation = useCallback(() => { setMessages([]); setConversationId(""); setConversationName("..."); router.push("/"); }, [router]);
  const clearConversation = useCallback(() => { setMessages([]); setConversationId(""); }, []);
  const deleteConversation = useCallback((id: string) => { deleteConversationFromHistory(id); setConversations(previous => { const { [id]: _, ...rest } = previous; return rest; }); if (id === conversationId) clearConversation(); }, [conversationId, clearConversation]);
  const clearConversations = useCallback(() => { clearHistory(); setMessages([]); setConversationId(""); setConversations({}); router.push("/"); }, [router]);
  const loadConversation = useCallback((id: string, conversation: Conversation) => { setConversationId(id); setConversationName(conversation.name); setMessages(conversation.messages as any); }, []);
  const importConversation = useCallback((jsonData: any) => {
    try {
      const messages = parseImportedMessages(jsonData);
      const id = uuidv4();
      const conversation = { name: String(jsonData.name || "Discussion importée").slice(0, 200), createdAt: Date.now(), lastMessage: Date.now(), messages } as Conversation;
      storeConversation(id, conversation);
      setConversations(previous => ({ ...previous, [id]: conversation }));
      loadConversation(id, conversation);
      setError("");
      router.push(`/chat/${id}`);
    } catch (exception: any) {
      // Rejet explicite : l'ancienne implémentation abandonnait en silence.
      setError(exception?.message || "Fichier de conversation invalide.");
    }
  }, [loadConversation, router]);

  const value = useMemo(() => ({ loading, messages, setMessages, addMessage, provider, setProvider, model, setModel, apiKey, setApiKey, reasoning, setReasoning, promptName, setPromptName, conversationId, conversationName, updateConversationName, generateTitle, loadConversation, importConversation, resetConversation, deleteConversation, deleteMessagesFromIndex, clearConversation, conversations, clearConversations, error }), [loading, messages, addMessage, provider, setProvider, model, apiKey, reasoning, conversationId, conversationName, updateConversationName, generateTitle, loadConversation, importConversation, resetConversation, deleteConversation, deleteMessagesFromIndex, clearConversation, conversations, clearConversations, error]);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export const useAnthropic = () => React.useContext(ChatContext);
