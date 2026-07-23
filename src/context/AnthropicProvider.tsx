import { v4 as uuidv4 } from "uuid";
import React, { PropsWithChildren, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Conversation, getHistory, clearHistory, storeConversation, History, deleteConversationFromHistory, updateConversation } from "./History";

import { providerDefaults, type ProviderId, type ReasoningLevel } from "../shared/providers";
import { translate } from "../i18n/useT";
import { getClientId } from "../utils/clientId";
import { fr as frDict } from "../i18n/dictionaries";

export { providerDefaults };
export type { ProviderId, ReasoningLevel };
export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; model?: string };

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
  promptVersion: number; switchPromptVersion: (version: number) => void;
  shareToken: string; setShareToken: (value: string) => void;
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
  promptVersion: 0, switchPromptVersion: noop as any,
  shareToken: "", setShareToken: noop as any,
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
  const [promptName, setPromptNameState] = useState("");
  // Version épinglée par la conversation (0 = version courante au 1er échange).
  const [promptVersion, setPromptVersion] = useState(0);
  // URL secrète d'un brouillon en cours de test (étape 7).
  const [shareToken, setShareToken] = useState("");

  // Changer de tuteur remet la version et le mode essai à zéro.
  const setPromptName = useCallback((value: string) => {
    setPromptNameState(value);
    setPromptVersion(0);
    setShareToken("");
  }, []);

  // Bascule de version : action EXPLICITE de l'utilisateur (décision n°9).
  const switchPromptVersion = useCallback((version: number) => setPromptVersion(version), []);
  const [conversationId, setConversationId] = useState("");
  const [conversationName, setConversationName] = useState("...");
  const [conversations, setConversations] = useState<History>({});
  const [error, setError] = useState("");

  useEffect(() => setConversations(getHistory()), []);
  useEffect(() => {
    if (!messages.length) return;
    const conversation: Conversation = {
      name: conversationName || "...",
      // Préserve la vraie date de création (elle était écrasée à chaque message,
      // ce qui faussait le tri de l'historique).
      createdAt: conversations[conversationId]?.createdAt ?? Date.now(),
      lastMessage: Date.now(), messages: messages as any,
      ...(promptName ? { promptName, promptVersion } : {}),
    };
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
        body: JSON.stringify({
          provider, model, apiKey, reasoning,
          promptName: promptName || undefined,
          promptVersion: promptVersion || undefined,
          shareToken: shareToken || undefined,
          clientId: getClientId() || undefined,
          messages: nextMessages.map(({ role, content }) => ({ role, content })) }) });
      const data = await response.json();
      if (!response.ok) {
        // Codes d'erreur stables du serveur, traduits dans la langue courante.
        const code = data?.error?.code as string | undefined;
        const key = code && (frDict as any)[`err.${code}`] ? `err.${code}` : "err.fallback";
        throw new Error(translate(router.locale, key as any));
      }
      addTokenUsage(Number(data.tokenUsage));
      // Épingle la version du tuteur au premier échange réussi.
      if (data.promptVersion && !promptVersion) setPromptVersion(Number(data.promptVersion));
      const usedProvider = (data.provider && providerDefaults[data.provider as ProviderId]) ? (data.provider as ProviderId) : provider;
      const label = providerDefaults[usedProvider].label + (data.free ? " (gratuit)" : "");
      setMessages(previous => [...previous, { id: uuidv4(), role: "assistant", content: data.reply, model: label }]);
    } catch (exception: any) {
      const message = exception?.message || "Erreur inconnue.";
      setError(message); setMessages(previous => [...previous, { id: uuidv4(), role: "assistant", content: `Erreur : ${message}`, model: providerDefaults[provider].label }]);
    } finally { setLoading(false); }
  }, [provider, model, apiKey, reasoning, promptName, promptVersion, shareToken]);

  const addMessage = useCallback((content: string, submit = true, role: "user" | "assistant" = "user") => {
    const value = content.trim(); if (!value) return;
    setMessages(previous => { const next = [...previous, { id: uuidv4(), role, content: value }]; if (submit && role === "user") void send(next); return next; });
  }, [send]);
  const deleteMessagesFromIndex = useCallback((index: number) => setMessages(previous => previous.slice(0, index)), []);
  const resetConversation = useCallback(() => { setMessages([]); setConversationId(""); setConversationName("..."); router.push("/"); }, [router]);
  const clearConversation = useCallback(() => { setMessages([]); setConversationId(""); }, []);
  const deleteConversation = useCallback((id: string) => { deleteConversationFromHistory(id); setConversations(previous => { const { [id]: _, ...rest } = previous; return rest; }); if (id === conversationId) clearConversation(); }, [conversationId, clearConversation]);
  const clearConversations = useCallback(() => { clearHistory(); setMessages([]); setConversationId(""); setConversations({}); router.push("/"); }, [router]);
  const loadConversation = useCallback((id: string, conversation: Conversation) => {
    setConversationId(id); setConversationName(conversation.name); setMessages(conversation.messages as any);
    setPromptNameState(conversation.promptName || ""); setPromptVersion(conversation.promptVersion || 0); setShareToken("");
  }, []);
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

  const value = useMemo(() => ({ loading, messages, setMessages, addMessage, provider, setProvider, model, setModel, apiKey, setApiKey, reasoning, setReasoning, promptName, setPromptName, promptVersion, switchPromptVersion, shareToken, setShareToken, conversationId, conversationName, updateConversationName, generateTitle, loadConversation, importConversation, resetConversation, deleteConversation, deleteMessagesFromIndex, clearConversation, conversations, clearConversations, error }), [loading, messages, addMessage, provider, setProvider, model, apiKey, reasoning, conversationId, conversationName, updateConversationName, generateTitle, loadConversation, importConversation, resetConversation, deleteConversation, deleteMessagesFromIndex, clearConversation, conversations, clearConversations, error]);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export const useAnthropic = () => React.useContext(ChatContext);
