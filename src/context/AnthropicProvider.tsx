import { v4 as uuidv4 } from "uuid";
import React, { PropsWithChildren, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Conversation, getHistory, clearHistory, storeConversation, History, deleteConversationFromHistory, updateConversation } from "./History";

import { providerDefaults, type ProviderId, type ReasoningLevel } from "../shared/providers";
import { translate } from "../i18n/useT";
import { getClientId } from "../utils/clientId";
import { fr as frDict } from "../i18n/dictionaries";
import { requestCompletion } from "../utils/streamCompletion";
import { authHeaders, getAccount } from "../utils/account";
import { pushProfile } from "../utils/profileSync";

export { providerDefaults };
export type { ProviderId, ReasoningLevel };
// Pièce jointe en attente d'envoi (base64 complet) — ne vit qu'en mémoire.
export type PendingAttachment = { kind: "image" | "pdf"; mediaType: string; name: string; data: string };
// Dans l'historique, seules les MÉTADONNÉES des pièces jointes sont conservées
// (nom + type) : le contenu base64 ferait exploser le quota localStorage.
export type ChatMessage = {
  id: string; role: "user" | "assistant"; content: string; model?: string;
  attachments?: { kind: string; name: string }[];
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
  /** Clés mémorisées côté serveur pour ce compte (jamais leur valeur). */
  savedKeyProviders: ProviderId[]; keysOptin: boolean; refreshSavedKeys: () => void;
  /** Une clé est-elle utilisable pour le fournisseur courant — saisie OU mémorisée ? */
  hasUsableKey: boolean;
  loading: boolean; messages: ChatMessage[]; setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  addMessage: (content: string, submit?: boolean, role?: "user" | "assistant", attachments?: PendingAttachment[]) => void;
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
  savedKeyProviders: [], keysOptin: false, refreshSavedKeys: noop, hasUsableKey: false,
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

  // Clés mémorisées du compte : partagées par TOUTE l'interface de chat. Sans
  // cet état commun, la zone de saisie croirait qu'aucune clé n'est
  // disponible dès que le champ est vide — et masquerait le trombone et le
  // micro précisément aux comptes qui ont mémorisé leur clé.
  const [savedKeyProviders, setSavedKeyProviders] = useState<ProviderId[]>([]);
  const [keysOptin, setKeysOptin] = useState(false);
  const refreshSavedKeys = useCallback(() => {
    if (typeof window === "undefined" || !getAccount()) {
      setSavedKeyProviders([]); setKeysOptin(false); return;
    }
    fetch("/api/keys", { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => { setSavedKeyProviders(data.providers ?? []); setKeysOptin(!!data.optin); })
      .catch(() => {});
  }, []);
  useEffect(() => {
    refreshSavedKeys();
    window.addEventListener("accountChanged", refreshSavedKeys);
    return () => window.removeEventListener("accountChanged", refreshSavedKeys);
  }, [refreshSavedKeys]);
  const hasUsableKey = !!apiKey.trim() || savedKeyProviders.includes(provider);

  // Sauvegarde AUTOMATIQUE des conversations pour les comptes identifiés :
  // dès qu'on a un compte, ses discussions sont mémorisées en base sans rien
  // demander de plus (le serveur refuse si l'option a été décochée à la
  // vérification). Écriture différée : une salve de messages n'écrit qu'une
  // fois, quinze secondes après le dernier changement.
  useEffect(() => {
    if (!messages.length || typeof window === "undefined" || !getAccount()) return;
    const timer = setTimeout(() => {
      void pushProfile().then(ok => {
        if (!ok) console.warn("Sauvegarde automatique du profil impossible (option désactivée ou réseau).");
      });
    }, 15_000);
    return () => clearTimeout(timer);
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

  const send = useCallback(async (nextMessages: ChatMessage[], attachments?: PendingAttachment[]) => {
    setLoading(true); setError("");
    // Streaming : un message assistant « en cours » est créé au premier fragment
    // puis complété au fil du flux. En repli gratuit (ou fournisseur sans flux),
    // le serveur répond d'un bloc et le message n'apparaît qu'à la fin — le
    // comportement historique.
    const assistantId = uuidv4();
    let placeholderShown = false;
    let streamLabel = providerDefaults[provider].label;
    let pendingText = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      flushTimer = null;
      const value = pendingText;
      setMessages(previous => previous.map(m => m.id === assistantId ? { ...m, content: value } : m));
    };
    try {
      const result = await requestCompletion({
        provider, model, apiKey, reasoning,
        promptName: promptName || undefined,
        promptVersion: promptVersion || undefined,
        shareToken: shareToken || undefined,
        clientId: getClientId() || undefined,
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
        ...(attachments?.length ? { attachments } : {}),
      }, {
        onStart: meta => {
          const usedProvider = providerDefaults[meta.provider as ProviderId] ? (meta.provider as ProviderId) : provider;
          streamLabel = providerDefaults[usedProvider].label + (meta.free ? " (gratuit)" : "");
        },
        onDelta: fullText => {
          if (!placeholderShown) {
            placeholderShown = true;
            setMessages(previous => [...previous, { id: assistantId, role: "assistant", content: fullText, model: streamLabel }]);
            return;
          }
          // Rafraîchissement throttlé (~7 fois/s) : l'affichage reste fluide sans
          // réécrire l'historique localStorage à chaque token.
          pendingText = fullText;
          if (!flushTimer) flushTimer = setTimeout(flush, 150);
        },
      });
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      addTokenUsage(result.tokenUsage);
      // Épingle la version du tuteur au premier échange réussi.
      if (result.promptVersion && !promptVersion) setPromptVersion(Number(result.promptVersion));
      const usedProvider = providerDefaults[result.provider as ProviderId] ? (result.provider as ProviderId) : provider;
      const label = providerDefaults[usedProvider].label + (result.free ? " (gratuit)" : "");
      if (placeholderShown) {
        setMessages(previous => previous.map(m => m.id === assistantId ? { ...m, content: result.reply, model: label } : m));
      } else {
        setMessages(previous => [...previous, { id: assistantId, role: "assistant", content: result.reply, model: label }]);
      }
    } catch (exception: any) {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      // Codes d'erreur stables du serveur, traduits dans la langue courante.
      const code = (exception as any)?.code as string | undefined;
      const message = code && (frDict as any)[`err.${code}`]
        ? translate(router.locale, `err.${code}` as any)
        : (code ? translate(router.locale, "err.fallback") : (exception?.message || "Erreur inconnue."));
      setError(message);
      if (placeholderShown) {
        setMessages(previous => previous.map(m => m.id === assistantId
          ? { ...m, content: `${m.content}\n\n*Erreur : ${message}*` } : m));
      } else {
        setMessages(previous => [...previous, { id: assistantId, role: "assistant", content: `Erreur : ${message}`, model: providerDefaults[provider].label }]);
      }
    } finally { setLoading(false); }
  }, [provider, model, apiKey, reasoning, promptName, promptVersion, shareToken, router.locale]);

  const addMessage = useCallback((content: string, submit = true, role: "user" | "assistant" = "user", attachments?: PendingAttachment[]) => {
    const value = content.trim(); if (!value) return;
    setMessages(previous => {
      const next = [...previous, {
        id: uuidv4(), role, content: value,
        // Historique : métadonnées seulement (le base64 reste hors localStorage).
        ...(attachments?.length ? { attachments: attachments.map(({ kind, name }) => ({ kind, name })) } : {}),
      }];
      if (submit && role === "user") void send(next, attachments);
      return next;
    });
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

  const value = useMemo(() => ({ savedKeyProviders, keysOptin, refreshSavedKeys, hasUsableKey, loading, messages, setMessages, addMessage, provider, setProvider, model, setModel, apiKey, setApiKey, reasoning, setReasoning, promptName, setPromptName, promptVersion, switchPromptVersion, shareToken, setShareToken, conversationId, conversationName, updateConversationName, generateTitle, loadConversation, importConversation, resetConversation, deleteConversation, deleteMessagesFromIndex, clearConversation, conversations, clearConversations, error }), [savedKeyProviders, keysOptin, refreshSavedKeys, hasUsableKey, loading, messages, addMessage, provider, setProvider, model, apiKey, reasoning, conversationId, conversationName, updateConversationName, generateTitle, loadConversation, importConversation, resetConversation, deleteConversation, deleteMessagesFromIndex, clearConversation, conversations, clearConversations, error]);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export const useAnthropic = () => React.useContext(ChatContext);
