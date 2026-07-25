import { useEffect, useId, useState } from "react";
import { authHeaders } from "../utils/account";
import type { ProviderId } from "../shared/providers";

// Suggestions de modèles pour un champ « Modèle ».
//
// Le champ reste LIBRE — la liste n'est qu'une aide à la saisie, pour ne pas
// bloquer un modèle sorti ce matin — mais elle n'annonce que des
// identifiants que le fournisseur accepterait vraiment (voir
// src/server/models.ts). Sans clé, elle se réduit souvent au modèle par
// défaut : c'est voulu, une suggestion fausse serait pire que rien.
//
// L'identifiant de la liste est propre à chaque instance : plusieurs champs
// Modèle coexistent dans le DOM (rangée et panneau du chat, deux colonnes du
// duel) et deux <datalist id> identiques ne lieraient que le premier.
export function useModelList(provider: ProviderId, apiKey: string) {
  const [models, setModels] = useState<string[]>([]);
  const listId = `educhat-models-${useId().replace(/:/g, "")}`;

  // La clé du visiteur permet au serveur de demander au fournisseur SA
  // propre liste : c'est le seul moyen d'avoir les identifiants exacts d'un
  // éditeur dont le serveur n'a pas de clé. On attend une clé plausible, et
  // une pause dans la frappe, pour ne pas appeler à chaque caractère.
  const cleUtile = apiKey.trim().length >= 20 ? apiKey.trim() : "";

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ provider, apiKey: cleUtile }),
      })
        .then(response => (response.ok ? response.json() : Promise.reject()))
        .then(data => { if (alive) setModels(Array.isArray(data.models) ? data.models : []); })
        .catch(() => { if (alive) setModels([]); });
    }, cleUtile ? 700 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [provider, cleUtile]);

  return { models, listId };
}
