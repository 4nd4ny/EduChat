import React from "react";
import { ProviderId, providerDefaults, ReasoningLevel, useAnthropic } from "../context/AnthropicProvider";
import { useT } from "../i18n/useT";

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
  const { provider, setProvider, model, setModel, apiKey, setApiKey, reasoning, setReasoning } = useAnthropic();
  const t = useT();
  const bar = layout === "bar";

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
              <option key={id} value={id}>{item.label}{item.gdpr ? ` · ${t("chat.input.gdpr.tag")}` : ""}</option>)}
          </select>
        </div>
      </Wrap>

      {/* Le badge RGPD n'apparaît que pour les fournisseurs concernés et reste
          un lien vers la page qui l'explique. */}
      {providerDefaults[provider]?.gdpr && (
        <a href="/rgpd" target="_blank" rel="noreferrer" title={t("chat.input.gdpr.title")}
          className={`${bar ? "" : "w-fit "}rounded-sm bg-green-600/80 px-1 py-px text-[9px] font-semibold uppercase leading-none tracking-wide text-white no-underline hover:bg-green-600`}>
          {t("chat.input.gdpr.tag")}
        </a>
      )}

      <Wrap label={t("chat.input.model")} width="w-40">
        <input
          data-tour="model"
          value={model}
          onChange={event => setModel(event.target.value)}
          title={t("chat.input.model")}
          aria-label={t("chat.input.model")}
          className={`${FIELD} w-full`}
        />
      </Wrap>

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
          placeholder={t("chat.input.apiKeyPlaceholder")}
          title={t("chat.input.apiKey")}
          aria-label={t("chat.input.apiKey")}
          className={`${FIELD} w-full`}
        />
      </Wrap>
    </div>
  );
}
