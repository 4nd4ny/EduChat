import React, { useState, useEffect, useRef } from "react";
import ChatInput from "./ChatInput";
import ChatMessage from "./ChatMessage";
import ChatPlaceholder from "./ChatPlaceholder";
import { useAIProvider } from "../context/AIProviderManager";
import { useOpenAI } from "../context/OpenAIProvider";
import { useAnthropic } from "../context/AnthropicProvider";

export default function ChatMessages() {
  const { useOpenAIForNext, setUseOpenAIForNext } = useAIProvider();
  const openai = useOpenAI();
  const anthropic = useAnthropic();
  
  // Utiliser les messages d'Anthropic comme source principale
  const { messages = [] } = anthropic;
  
  const messageContainer = useRef<HTMLDivElement>(null);
  const [scrolling, setScrolling] = useState(false);
  const [visibleMessages, setVisibleMessages] = useState<typeof messages>([]);
  const messageEndRef = useRef<HTMLDivElement>(null);
  
  let lastScrollTop = 0;

  // Gestion du scroll
  const handleUserScroll = () => {
    if (messageContainer.current) {
      const currentScrollTop = messageContainer.current.scrollTop;
      const maxScrollTop = messageContainer.current.scrollHeight - messageContainer.current.offsetHeight;

      if (currentScrollTop < lastScrollTop) {
        setScrolling(true);
      }

      if (currentScrollTop >= maxScrollTop) {
        setScrolling(false);
      }

      lastScrollTop = currentScrollTop;
    }
  };

  // Synchronisation des messages visibles
  useEffect(() => {
    if (messages) {
      setVisibleMessages(messages);
    } else {
      setVisibleMessages([]);
    }
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    if (!scrolling) {
      const scrollInterval = setInterval(() => {
        if (messageContainer.current) {
          const currentScrollTop = messageContainer.current.scrollTop;
          const maxScrollTop = messageContainer.current.scrollHeight - messageContainer.current.offsetHeight;
          if (currentScrollTop < maxScrollTop) {
            messageContainer.current.scrollTop += 4;
          } else {
            clearInterval(scrollInterval);
          }
        }
      }, 40);

      return () => clearInterval(scrollInterval);
    }
  }, [messages, scrolling]);

  // Event listeners pour le scroll
  useEffect(() => {
    const container = messageContainer.current;
    if (container) {
      container.addEventListener('scroll', handleUserScroll);
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', handleUserScroll);
      }
    };
  }, []);

  // Raccourci clavier pour la soumission
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && e.metaKey && anthropic.addMessage) {
        anthropic.addMessage();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [anthropic]);



  return (
    <div className="flex h-full w-full flex-col items-stretch md:pl-[320px]">
      <div
        className="relative flex-1 flex-col items-stretch overflow-auto border-b bg-tertiary pb-[10rem] scrollbar scrollbar-w-3 scrollbar-thumb-[rgb(var(--bg-primary))] scrollbar-track-[rgb(var(--bg-secondary))] scrollbar-thumb-rounded-full"
        ref={messageContainer}
      >
        {!messages || visibleMessages.length === 0 ? (
          <ChatPlaceholder />
        ) : (
          <>
            {visibleMessages.map((message, index) => (
              <ChatMessage
                key={`${message.id}-${message.role}`}
                message={message}
                isInitialUserMessage={index === 0}
                isLastAssistantMessage={
                  message.role === 'assistant' &&
                  index === visibleMessages.length - 1
                }
                messageIndex={index}
              />
            ))}
            <hr className="border-b border-stone-400/20" />
          </>
        )}
        <div ref={messageEndRef} />
      </div>
      <ChatInput />
    </div>
  );
}