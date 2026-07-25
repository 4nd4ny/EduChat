import React, { useEffect, useState } from "react";
import { useModelList } from "./useModelList";
import { useT } from "../i18n/useT";
import type { ProviderId } from "../shared/providers";

// Le champ « Modèle », partagé par le chat et le duel.
//
// Pourquoi une LISTE DÉROULANTE et non un champ à suggestions : un
// <datalist> ne montre que les options CONTENANT le texte déjà saisi. Le
// champ arrivant prérempli (« claude-sonnet-5 »), le menu se réduisait à
// cette seule ligne et tout le catalogue semblait absent — c'est exactement
// ce qu'on nous a signalé. Une liste montre toujours tout.
//
// La saisie libre reste accessible par « Autre… » : un modèle sorti ce matin
// doit rester utilisable même si le catalogue ne le connaît pas encore. On y
// bascule automatiquement quand le modèle courant n'est pas dans la liste —
// aucune clé côté serveur pour cet éditeur, ou identifiant saisi à la main.

const LIBRE = "__saisie_libre__";

export default function ModelField({ provider, apiKey, model, onChange, className, dataTour }: {
  provider: ProviderId;
  apiKey: string;
  model: string;
  onChange: (model: string) => void;
  className: string;
  dataTour?: string;
}) {
  const t = useT();
  const { models, listId } = useModelList(provider, apiKey);
  const [saisieLibre, setSaisieLibre] = useState(false);

  // Changer de fournisseur remet la liste au premier plan : le catalogue
  // précédent n'a plus rien à voir avec le nouveau.
  useEffect(() => { setSaisieLibre(false); }, [provider]);

  const catalogue = models.length > 1;
  const modeLibre = saisieLibre || !catalogue || !models.includes(model);
  const infobulle = catalogue
    ? t("chat.input.modelList").replace("{n}", String(models.length))
    : t("chat.input.model");

  if (modeLibre) {
    return (
      <>
        <input
          data-tour={dataTour}
          list={listId}
          value={model}
          onChange={event => onChange(event.target.value)}
          title={infobulle}
          aria-label={t("chat.input.model")}
          className={className}
        />
        <datalist id={listId}>
          {models.map(name => <option key={name} value={name} />)}
        </datalist>
      </>
    );
  }

  return (
    <select
      data-tour={dataTour}
      value={model}
      onChange={event => {
        if (event.target.value === LIBRE) setSaisieLibre(true);
        else onChange(event.target.value);
      }}
      title={infobulle}
      aria-label={t("chat.input.model")}
      className={className}
    >
      {models.map(name => <option key={name} value={name}>{name}</option>)}
      <option value={LIBRE}>{t("chat.input.modelOther")}</option>
    </select>
  );
}
