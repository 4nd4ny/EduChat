import React, { useEffect } from "react";
import ChatMessages from "../chat/ChatMessages";
import { useAnthropic } from "../context/AnthropicProvider";

// Espace établissement (educh.at/school) : la même expérience de chat, mais
// derrière le déverrouillage enseignant (mot de passe, ou IP d'établissement en
// plage horaire) — c'est le Layout qui pose le verrou sur ce chemin. Ici, les
// complétions utilisent la clé interne de la plateforme, et leur consommation
// est enregistrée par IP d'établissement pour la facture mensuelle.
export default function SchoolPage() {
  const { promptName, setPromptName, messages } = useAnthropic();

  // Héritage des réglages de session : le tuteur « déployé » par l'enseignant
  // arrive pré-sélectionné chez chaque élève de l'IP de l'établissement.
  useEffect(() => {
    if (promptName || messages.length > 0) return;
    fetch("/api/session-settings")
      .then(r => r.json())
      .then(data => {
        if (data.settings?.promptName) setPromptName(data.settings.promptName);
      })
      .catch(() => {});
  }, []);

  return <ChatMessages />;
}
