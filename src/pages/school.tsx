import React from "react";
import ChatMessages from "../chat/ChatMessages";

// Espace établissement (educh.at/school) : la même expérience de chat, mais
// derrière le déverrouillage enseignant (mot de passe, ou IP d'établissement en
// plage horaire) — c'est le Layout qui pose le verrou sur ce chemin. Ici, les
// complétions utilisent la clé interne de la plateforme, et leur consommation
// est enregistrée par IP d'établissement pour la facture mensuelle.
export default function SchoolPage() {
  return <ChatMessages />;
}
