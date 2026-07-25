import React, { useEffect, useState } from "react";
import { ProviderId, providerDefaults, ReasoningLevel, useAnthropic } from "../context/AnthropicProvider";
import { authHeaders, getAccount } from "../utils/account";
import { useT } from "../i18n/useT";
import { useModelList } from "./useModelList";
import { fr as frDict, type TranslationKey } from "../i18n/dictionaries";

// Réglages de la conversation (fournisseur, modèle, raisonnement, clé
// personnelle). Ils vivent désormais dans la barre du haut, au-dessus du
// chat, et non plus au-dessus de la zone de saisie.
//
// Deux présentations, un seul code :
//  - « bar »   : une rangée compacte, sans étiquettes au-dessus (grand écran) ;
//  - « panel » : les mêmes champs empilés et étiquetés, pour le menu déroulant
//    des petits écrans, où la rangée ne tiendrait pas.

const FIELD = "h-9 min-w-0 rounded bg-tertiary px-2 text-xs text-primary outline-none focus-visible:ring-2 focus-visible:ring-[#DC6521]";

export default function ChatSettings({ layout }: { layout: "bar" | "panel" }) {
  const {
    provider, setProvider, model, setModel, apiKey, setApiKey, reasoning, setReasoning,
    savedKeyProviders, keysOptin, refreshSavedKeys,
  } = useAnthropic();
  const t = useT();
  const bar = layout === "bar";

  // Mémorisation de la clé : réservée aux comptes, sur consentement explicite.
  // L'état vit dans le CONTEXTE (et non ici) : la zone de saisie en a besoin
  // pour savoir si le trombone et le micro doivent apparaître.
  const [hasAccount, setHasAccount] = useState(false);
  const [keysAvailable, setKeysAvailable] = useState(true);
  const [keyError, setKeyError] = useState("");

  // Modèles proposés pour le fournisseur courant (voir useModelList).
  const { models, listId } = useModelList(provider, apiKey);

  useEffect(() => { setHasAccount(!!getAccount()); }, []);

  // Cocher enregistre la clé du champ pour le fournisseur courant ; décocher
  // efface TOUTES les clés mémorisées (le serveur ne doit pas garder un
  // secret que l'on vient de refuser).
  const putKeys = async (payload: Record<string, unknown>) => {
    setKeyError("");
    const response = await fetch("/api/keys", {
      method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      if (response.status === 503) setKeysAvailable(false);
      const data = await response.json().catch(() => ({}));
      const code = data?.error?.code as string | undefined;
      setKeyError(code && (frDict as any)[`err.${code}`] ? t(`err.${code}` as TranslationKey) : t("err.fallback"));
      return;
    }
    refreshSavedKeys();
  };

  const toggleRemember = (checked: boolean) =>
    putKeys({ optin: checked, ...(checked && apiKey.trim() ? { provider, apiKey } : {}) });

  // Enregistrer la clé du champ pour le fournisseur affiché (bouton explicite).
  const rememberCurrent = () => apiKey.trim() ? putKeys({ provider, apiKey }) : undefined;

  const keySaved = savedKeyProviders.includes(provider);

  // En rangée, l'étiquette n'est portée que par aria-label/title ; en panneau,
  // elle est visible au-dessus du champ.
  const Wrap = ({ label, width, children }: { label: string; width: string; children: React.ReactNode }) =>
    bar
      ? <div className={width}>{children}</div>
      : <label className="flex flex-col gap-1 text-xs text-primary">{label}{children}</label>;

  return (
    <div className={bar ? "flex items-center gap-2" : "flex flex-col gap-3"}>
      <Wrap label={t("chat.input.provider")} width="w-32">
        <div className="relative">
          <select
            data-tour="provider"
            value={provider}
            onChange={event => setProvider(event.target.value as ProviderId)}
            title={t("chat.input.provider")}
            aria-label={t("chat.input.provider")}
            className={`${FIELD} w-full`}
          >
            {Object.entries(providerDefaults).map(([id, item]) =>
              <option key={id} value={id}>{item.label}{item.gdpr ? ` · ${t("chat.input.gdpr.tag")}` : item.wrng ? ` · ${t("chat.input.wrng.tag")}` : ""}</option>)}
          </select>
        </div>
      </Wrap>

      {/* Drapeau du fournisseur, collé au champ Modèle. En rangée il est
          PIVOTÉ (écriture verticale, lecture de bas en haut) : il occupe
          ainsi deux millimètres de large au lieu d'une case entière.
          Vert « RGPD » = cadre possible avec votre clé ; rouge « WRNG » =
          sous-traitant hors UE sans cadre reconnu. */}
      <div className={bar ? "flex items-center gap-0" : "contents"}>
      {(providerDefaults[provider]?.gdpr || providerDefaults[provider]?.wrng) && (
        <a href="/rgpd" target="_blank" rel="noreferrer"
          title={providerDefaults[provider]?.wrng ? t("chat.input.wrng.title") : t("chat.input.gdpr.title")}
          className={[
            providerDefaults[provider]?.wrng ? "bg-red-600/80 hover:bg-red-600" : "bg-green-600/80 hover:bg-green-600",
            "rounded-sm text-[9px] font-semibold uppercase tracking-wide text-white no-underline",
            bar
              ? "flex h-9 shrink-0 items-center justify-center px-px [writing-mode:vertical-rl] rotate-180"
              : "w-fit px-1 py-px leading-none",
          ].join(" ")}>
          {providerDefaults[provider]?.wrng ? t("chat.input.wrng.tag") : t("chat.input.gdpr.tag")}
        </a>
      )}

      <Wrap label={t("chat.input.model")} width="w-40">
        <input
          data-tour="model"
          list={listId}
          value={model}
          onChange={event => setModel(event.target.value)}
          title={models.length ? t("chat.input.modelList") : t("chat.input.model")}
          aria-label={t("chat.input.model")}
          className={`${FIELD} w-full ${bar ? "rounded-l-none" : ""}`}
        />
      </Wrap>
      </div>

      <Wrap label={t("chat.input.reasoning")} width="w-28">
        <select
          data-tour="reasoning"
          value={reasoning}
          onChange={event => setReasoning(event.target.value as ReasoningLevel)}
          title={t("chat.input.reasoning")}
          aria-label={t("chat.input.reasoning")}
          className={`${FIELD} w-full`}
        >
          <option value="low">{t("chat.input.reasoning.low")}</option>
          <option value="medium">{t("chat.input.reasoning.medium")}</option>
          <option value="high">{t("chat.input.reasoning.high")}</option>
        </select>
      </Wrap>

      <Wrap label={t("chat.input.apiKey")} width="w-36">
        <input
          data-tour="apikey"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={event => setApiKey(event.target.value)}
          placeholder={keySaved ? t("chat.input.keySaved") : t("chat.input.apiKeyPlaceholder")}
          title={keySaved ? t("chat.input.keySavedTitle") : t("chat.input.apiKey")}
          aria-label={t("chat.input.apiKey")}
          className={`${FIELD} w-full ${keySaved ? "ring-1 ring-green-600/60" : ""}`}
        />
      </Wrap>

      {/* Mémorisation de la clé : uniquement pour les comptes, jamais par
          défaut, et l'état de la case suit le compte d'un appareil à l'autre. */}
      {hasAccount && keysAvailable && (
        <label className={`flex items-center gap-1.5 text-[10px] leading-tight text-primary ${bar ? "max-w-[7rem]" : ""}`}
          title={t("chat.input.rememberKeyTitle")}>
          <input type="checkbox" checked={keysOptin} onChange={event => void toggleRemember(event.target.checked)} />
          <span className="opacity-70">{t("chat.input.rememberKey")}</span>
        </label>
      )}
      <datalist id={listId}>
        {models.map(name => <option key={name} value={name} />)}
      </datalist>

      {keyError && <span role="alert" className="text-[10px] text-red-400">{keyError}</span>}
      {hasAccount && keysAvailable && keysOptin && !keySaved && apiKey.trim() && (
        <button type="button" onClick={() => void rememberCurrent()}
          className="h-9 shrink-0 rounded border border-white/20 px-2 text-[10px] text-primary hover:bg-tertiary">
          {t("chat.input.rememberThis")}
        </button>
      )}
    </div>
  );
}
