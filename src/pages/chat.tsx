import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import ChatMessages from "../chat/ChatMessages";
import InterfaceTour from "../chat/InterfaceTour";
import { useAnthropic } from "../context/AnthropicProvider";

// Chat public : accessible à tout le monde, avec sa clé API personnelle.
// Le tuteur choisi au catalogue arrive par ?tuteur=Nom (ou via le contexte).
// ?visite=1 (depuis le tutoriel) lance la visite guidée de l'interface.
export default function ChatPage() {
  const router = useRouter();
  const { promptName, setPromptName, shareToken, setShareToken, clearConversation } = useAnthropic();
  const [tour, setTour] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const fromQuery = typeof router.query.tuteur === "string" ? router.query.tuteur : "";
    const essai = typeof router.query.essai === "string" ? router.query.essai : "";
    if (router.query.visite === "1") setTour(true);
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
  }, [router.isReady, router.query.tuteur, router.query.essai, router.query.visite]);

  const closeTour = () => {
    setTour(false);
    // Nettoie ?visite=1 de l'URL sans recharger.
    const { visite, ...rest } = router.query;
    void router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
  };

  return (
    <>
      <ChatMessages />
      {tour && <InterfaceTour onClose={closeTour} />}
    </>
  );
}
