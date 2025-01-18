import { v4 as uuidv4 } from "uuid";
import {
  Conversation,
  getHistory,
  clearHistory,
  storeConversation,
  History,
  deleteConversationFromHistory,
  updateConversation,
} from "./History";
import {
  AnthropicChatMessage,
  AnthropicChatModels,
  ProviderSubmitFunction,
} from "../utils/Anthropic";
import {
  AnthropicApiKey,
} from "../utils/env"
import React, { 
  PropsWithChildren,
  useCallback, 
  useEffect,
} from "react";
import { useRouter } from "next/router";

const CHAT_ROUTE = "/";

const defaultContext = {
  loading: false,
  
  messages: [] as AnthropicChatMessage[],
  setMessages: (() => {}) as React.Dispatch<React.SetStateAction<AnthropicChatMessage[]>>,
  submit: (() => {}) as ProviderSubmitFunction,
  addMessage: () => {},
  updateMessageContent: (id: number, content: string) => {},
  removeMessage: (id: number) => {},
  toggleMessageRole: (id: number) => {},

  conversationId: "",
  conversationName: "",
  updateConversationName: () => {},
  generateTitle: () => {},
  loadConversation: (id: string, conversation: Conversation) => {},
  importConversation: (jsonData: any) => {},
  resetConversation: () => {}, 
  deleteConversation: () => {},  
  deleteMessagesFromIndex: (index: number) => {},
  clearConversation: () => {},

  conversations: {} as History,
  clearConversations: () => {},

  error: "",
};

const AnthropicContext = React.createContext<{
  loading: boolean;

  messages: AnthropicChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<AnthropicChatMessage[]>>;
  submit: () => void;
  addMessage: (
    content?: string,
    submit?: boolean,
    role?: "user" | "assistant"
  ) => void;
  updateMessageContent: (id: number, content: string) => void;
  removeMessage: (id: number) => void;
  toggleMessageRole: (id: number) => void;

  conversationId: string;
  conversationName: string;
  updateConversationName: (id: string, name: string) => void;
  generateTitle: () => void;

  loadConversation: (id: string, conversation: Conversation) => void;
  importConversation: (jsonData: any) => void;
  resetConversation: () => void; 
  deleteConversation: (id: string) => void;
  deleteMessagesFromIndex: (index: number) => void;
  clearConversation: () => void;
  conversations: History;
  clearConversations: () => void;

  error: string;
}>(defaultContext);

export default function AnthropicProvider({ children }: PropsWithChildren) {
  
  // General
  const router = useRouter(); 
  const [loading, setLoading] = React.useState(false);

  // Model
  const modelList = Object.keys(AnthropicChatModels);

  // Messages
  const [messages, setMessages] = React.useState<AnthropicChatMessage[]>([]);
  
  // Fonction updateTokenCount pour mettre à jour le total de tokens :
  const updateTotalTokens = (newTotal: number) => {
    localStorage.setItem('totalTokens', newTotal.toString());
    // Créez un événement personnalisé
    const event = new Event('totalTokensUpdated');
    window.dispatchEvent(event);
  };
  function updateTokenCount(tokenUsage: number) {
    const storedTokens = localStorage.getItem('totalTokens');
    const previousTokenTotal = storedTokens ? parseInt(storedTokens, 10) : 0;
    const totalTokens = previousTokenTotal + tokenUsage;
    updateTotalTokens(totalTokens);
  }
  function estimateFrenchTokens(text: string) {
    // 1 token = 3,5 caractères (à la louche pour le français...) mais c'est plus compliqué que ça 
    const wordCount = text.split(/\s+/).length;  // Nombre de mots (séparés par espace)
    const charCount = text.length;  // Nombre total de caractères, y compris non-lettres
    const estimatedTokens = (0.75 * wordCount) + (charCount / 4);  // Formule approximative
    return Math.ceil(estimatedTokens);
  }
  function updateInputTokens(text: string) {
    /*
      // Use tiktoken to better count tokens
      const { encoding_for_model } = require("tiktoken");
      async function countTokens(text, model = "gpt-3.5-turbo") {
        const encoder = await encoding_for_model(model); // Chargement de l'encodeur basé sur le modèle
        const tokens = encoder.encode(text); // Tokenisation du texte
        return tokens.length;
      }
    */
    updateTokenCount(estimateFrenchTokens(text)); 
  }
  
  const submit: ProviderSubmitFunction = useCallback(
    async (messages_: AnthropicChatMessage[] = [], modelIndex: number = 0) => {
      
      if (loading) return; // Si déjà en cours, on ne fait rien
      setLoading(true); // Verrouille le bouton submit

      const messagesToSend = messages_?.length ? messages_ : messages || [];

      const currentModel = modelList[0]; // Modèle par défaut
        
      try {
        // Sélection du modèle actuel en fonction de l'index
        const maximum = AnthropicChatModels[currentModel].maxLimit;
        
        let requestBody = {
          max_completion_tokens: maximum,
          model: currentModel,
          messages: messagesToSend.map(({ role, content }) => ({ 
            role, 
            content: typeof content === 'string' ? content : content.reply 
          })),
        };
        updateInputTokens(JSON.stringify(requestBody.messages));

        const response = await fetch("/api/completion", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${AnthropicApiKey}`,
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || "Failed to fetch response, check your API key and try again.");
        }
  
        const { reply, tokenUsage } = await response.json(); // Lecture du contenu JSON
        updateTokenCount(tokenUsage);

        const message: AnthropicChatMessage = {
          id: messagesToSend.length,
          role: 'assistant',
          content: reply, 
          model: currentModel,
        };

        setMessages((prev) => [...prev, message]);
        
      } catch (error: any) {
        console.error("Error in submit:", error);
        setMessages((prev) => [
          ...(prev || []),
          { 
            id: (prev || []).length, 
            role: 'assistant', 
            content: error.message || "An error occurred", 
            model: currentModel 
          },
        ]);
      }

      setLoading(false); // Déverrouille le bouton submit
    },
    [messages, loading]
  );

  const addMessage = useCallback(
    (
      content: string = "",
      newPrompt: boolean = true,
      role: "user" | "assistant" = "user"
    ) => {
      setMessages((prev) => {
        const prevMessages = prev || [];
        const messages = [
          ...prevMessages,
          {
            id: prevMessages.length,
            role,
            content: content || "",
          } as AnthropicChatMessage,
        ];
        submit(messages);
        return messages;
      });
    },
    [submit]
  );

  const updateMessageContent = (id: number, content: string) => {
    setMessages((prev) => {
      const prevMessages = prev || [];
      const index = prevMessages.findIndex((message) => message.id === id);
      if (index === -1) return prevMessages;
      const message = prevMessages[index];
      return [
        ...prevMessages.slice(0, index),
        {
          ...message,
          content,
        },
        ...prevMessages.slice(index + 1),
      ];
    });
  };

  const removeMessage = (id: number) => {
    setMessages((prev) => {
      const prevMessages = prev || [];
      return [...prevMessages.filter((message) => message.id !== id)];
    });
  };

  // Roles
  const toggleMessageRole = (id: number) => {
    setMessages((prev) => {
      const prevMessages = prev || [];
      const index = prevMessages.findIndex((message) => message.id === id);
      if (index === -1) return prevMessages;
      const message = prevMessages[index];
      return [
        ...prevMessages.slice(0, index),
        {
          ...message,
          role: message.role === "user" ? "assistant" : "user",
        },
        ...prevMessages.slice(index + 1),
      ];
    });
  };

  // Conversation 
  const [conversationId, setConversationId] = React.useState<string>("");
  const [conversationName, setConversationName] = React.useState("");
  const updateConversationName = (id: string, name: string) => {
    setConversations((prev) => {
      const conversation = prev[id];
      if (!conversation) return prev;
      return {
        ...prev,
        [id]: {
          ...conversation,
          name,
        },
      };
    });
    if (id === conversationId) setConversationName(name);
    updateConversation(id, { name });
  };

  const handleStoreConversation = useCallback(() => {
  // Vérifier si messages existe et n'est pas vide
  if (!messages?.length) return;
  
    const conversation = {
      name: conversationName || "...",
      createdAt: Date.now(),
      lastMessage: Date.now(),
      messages,
    } as Conversation;

    let id = storeConversation(conversationId, conversation);
    setConversationId(id);
    setConversations((prev) => ({ ...prev, [id]: conversation }));

    if (router.pathname === CHAT_ROUTE) router.push(`/chat/${id}`);
  }, [conversationId, messages, conversationName, router.pathname]);

  useEffect(() => {
    handleStoreConversation();
  }, [messages]);

  const generateTitle = useCallback(async () => {
    if (!messages?.length || !messages[0]?.content) {
      setConversationName("...");
      return;
    }
    // Éviter la récursion si on a déjà un nom
    if (conversationName && conversationName !== "...") {
      return;
    }

    const firstMessage = messages[0].content;
    const messageText = typeof firstMessage === 'string' ? firstMessage : firstMessage.reply;

    const titlePrompt = `Summarize the following text in three words, maintaining the language of the statement (usually french):
      <TEXT>
      ${messageText}
      </TEXT>`;

    updateInputTokens(titlePrompt);
    try {
      const response = await fetch('/api/completion', {
        headers: {
          'x-api-key': AnthropicApiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        method: 'POST',
        body: JSON.stringify({
          model: 'claude-3-5-haiku-latest',
          messages: [{
            role: "user",
            content: titlePrompt
          }],
          max_completion_tokens: 100
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const { reply, tokenUsage } = await response.json(); // Lecture du contenu JSON  
      setConversationName(reply);
      updateConversationName(conversationId, reply);
      updateTokenCount(tokenUsage);

    } catch (error) {
      console.error("Error generating title:", error);
      setConversationName(messageText.slice(0, 30) + "...");
    }
  
  }, [conversationId, messages, conversationName, setConversationName, updateConversationName]);

  // Modifier également le useEffect pour éviter les appels inutiles :
  useEffect(() => {
    if (
      messages?.length === 1 && 
      messages[0]?.role === 'user' && 
      conversationName === "..."
    ) {
      generateTitle();
    }
  }, [messages, conversationName]);

  const loadConversation = (id: string, conversation: Conversation) => {
    setConversationId(id);
    const { messages, name } = conversation;
    setMessages(messages);
    setConversationName(name);
  };

  const importConversation = useCallback((jsonData: any) => {
    try {
      // 1. Validation stricte de la structure
      if (!isValidConversationStructure(jsonData)) {
        throw new Error("Invalid conversation structure");
      }

      // 2. Limiter la taille du JSON
      const jsonString = JSON.stringify(jsonData);
      if (jsonString.length > 1000000) { // Par exemple, limite à 1 Mo
        throw new Error("Imported conversation is too large");
      }

      // 3. Sanitisation des données
      const sanitizedConversation: Conversation = {
        name: jsonData.name, // Limiter à 100 caractères
        createdAt: Number(jsonData.createdAt) || Date.now(),
        lastMessage: Number(jsonData.lastMessage) || Date.now(),
        messages: jsonData.messages.map((msg: any, index: number) => ({
          id: index,
          role: msg.role === "assistant" || msg.role === "user" ? msg.role : "user",
          content: msg.content, // Limiter à 10000 caractères
          model: msg.model
        }))
      };

      const newId = uuidv4();

      // Mettre à jour l'état local
      setConversations((prev: History) => ({
        ...prev,
        [newId]: sanitizedConversation
      }));

      // Stocker la nouvelle conversation
      storeConversation(newId, sanitizedConversation);

      // Charger la conversation importée
      loadConversation(newId, sanitizedConversation);

      // Rediriger vers la nouvelle conversation
      router.push(`/chat/${newId}`);

      console.log("Conversation imported successfully");
    } catch (error) {
      console.error("Error importing conversation:", error);
      // Notification à l'utilisateur
    }
  }, [router, loadConversation]);

  // Fonctions auxiliaires

  function isValidConversationStructure(data: any): boolean {
    return (
      typeof data === 'object' &&
      typeof data.name === 'string' &&
      Array.isArray(data.messages) &&
      data.messages.every((msg: any) =>
        typeof msg === 'object' &&
        (msg.role === 'assistant' || msg.role === 'user') &&
        (typeof msg.content === 'string' || (typeof msg.content === 'object' && typeof msg.content.reply === 'string'))
      )
    );
  }

  function sanitizeString(str: string, maxLength: number): string {
    // Échapper les caractères HTML et limiter la longueur
    return str
      .replace(/[&<>"']/g, (char) => {
        const entities: { [key: string]: string } = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        };
        return entities[char];
      })
      .slice(0, maxLength);
  }

  function isValidModel(model: any): model is keyof typeof AnthropicChatModels {
    return typeof model === 'string' && model in AnthropicChatModels;
  }
  
  const deleteMessagesFromIndex = useCallback((index: number) => {
    setMessages((prev) => {
      const prevMessages = prev || [];
      // Garde uniquement les messages jusqu'à l'index spécifié
      return prevMessages.slice(0, index);
    });
  }, []);  

  const resetConversation = useCallback(() => {
    const newId = Date.now().toString();

    setConversationId(newId);
    setConversationName("...");
    setMessages([]);

    // Créer une nouvelle conversation
    const newConversation: Conversation = {
      name: "...",
      createdAt: Date.now(),
      lastMessage: Date.now(),
      messages: [],
    };

    // Mettre à jour l'historique des conversations
    setConversations(prev => ({
      ...prev,
      [newId]: newConversation
    }));

    // Stocker la nouvelle conversation
    storeConversation(newId, newConversation);

    // Rediriger vers la nouvelle conversation
    router.push(`/chat/${newId}`);
  }, [router]);

  const deleteConversation = (id: string) => {
    deleteConversationFromHistory(id);
    setConversations((prev) => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });

    if (id === conversationId) clearConversation();
  };

  const clearConversation = () => {
    setMessages([]);
    setConversationId("");
  };

  // Conversations
  const [conversations, setConversations] = React.useState<History>({} as History);

  // Load conversation from local storage
  useEffect(() => {
    setConversations(getHistory());
  }, []);

  const clearConversations = useCallback(() => {
    clearHistory();

    setMessages([]);
    setConversationId("");
    setConversations({});

    router.push("/");
  }, []);

  const [error] = React.useState("");

  const value = React.useMemo(
    () => ({
      loading,
      
      messages,
      setMessages,
      submit,
      addMessage,
      updateMessageContent,
      removeMessage,
      
      toggleMessageRole,

      conversationId,
      conversationName,
      updateConversationName,
      generateTitle,
      loadConversation,
      importConversation,
      deleteConversation,
      deleteMessagesFromIndex,
      resetConversation,
      clearConversation,
      clearConversations,
      conversations,
      
      error,
    }),
    [
      loading,

      messages,
      setMessages,
      submit,
      addMessage,

      conversationId,
      importConversation,
      deleteMessagesFromIndex,
      resetConversation,
      clearConversations,
      conversations,

      error,
    ]
  );

  return (
    <AnthropicContext.Provider value={value}>{children}</AnthropicContext.Provider>
  );
}

export const useAnthropic = () => React.useContext(AnthropicContext);
