import { useRouter } from "next/router";
import React, { useEffect } from "react";
import ChatMessages from "../chat/ChatMessages";
import { useAnthropic } from "../context/AnthropicProvider";

// Chat public : accessible à tout le monde, avec sa clé API personnelle.
// Le tuteur choisi au catalogue arrive par ?tuteur=Nom (ou via le contexte).
export default function ChatPage() {
  const router = useRouter();
  const { promptName, setPromptName, shareToken, setShareToken, clearConversation } = useAnthropic();

  useEffect(() => {
    if (!router.isReady) return;
    const fromQuery = typeof router.query.tuteur === "string" ? router.query.tuteur : "";
    const essai = typeof router.query.essai === "string" ? router.query.essai : "";
    if (essai && essai !== shareToken) {
      // Test d'un brouillon via son URL secrète : le serveur résout le prompt
      // par jeton, le nom affiché reste celui du brouillon.
      setPromptName("");
      setShareToken(essai);
      clearConversation();
    } else if (fromQuery && fromQuery !== promptName) {
      setPromptName(fromQuery);
      clearConversation(); // un nouveau tuteur = une nouvelle conversation
    }
  }, [router.isReady, router.query.tuteur, router.query.essai]);

  return <ChatMessages />;
}
