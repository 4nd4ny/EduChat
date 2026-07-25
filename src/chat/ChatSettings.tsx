import React, { useEffect, useState } from "react";
import { ProviderId, providerDefaults, ReasoningLevel, useAnthropic } from "../context/AnthropicProvider";
import { authHeaders, getAccount } from "../utils/account";
import { useT } from "../i18n/useT";
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

/**
 * Étiquette d'un réglage. En rangée elle n'est portée que par aria-label et
 * title ; en panneau elle est visible au-dessus du champ.
 *
 * DÉFINIE HORS DU COMPOSANT, et ce n'est pas un détail : déclarée à
 * l'intérieur, elle était recréée à chaque rendu, donc React la voyait comme
 * un composant DIFFÉRENT et remontait le champ à chaque frappe — le curseur
 * sautait hors de la zone de saisie dès le premier caractère de la clé.
 */
function Wrap({ bar, label, width, children }: {
  bar: boolean; label: string; width: string; children: React.ReactNode;
}) {
  return bar
    ? <div className={width}>{children}</div>
    : <label className="flex flex-col gap-1 text-xs text-primary">{label}{children}</label>;
}

export default function ChatSettings({ layout }: { layout: "bar" | "panel" }) {
  const {
    provider, setProvider, apiKey, setApiKey,
    savedKeyProviders, refreshSavedKeys,
  } = useAnthropic();
  const t = useT();
  const bar = layout === "bar";

  // Mémorisation de la clé : réservée aux comptes, sur consentement explicite.
  // L'état vit dans le CONTEXTE (et non ici) : la zone de saisie en a besoin
  // pour savoir si le trombone et le micro doivent apparaître.
  const [hasAccount, setHasAccount] = useState(false);
  const [keysAvailable, setKeysAvailable] = useState(true);
  const [keyError, setKeyError] = useState("");
  // Fournisseurs que le serveur peut servir sans clé personnelle. Les autres
  // sont signalés dans la liste : mieux vaut le dire avant le clic qu'après
  // une erreur incompréhensible.
  const [served, setServed] = useState<string[] | null>(null);
  useEffect(() => {
    fetch("/api/providers").then(r => r.json()).then(d => setServed(d.served ?? [])).catch(() => {});
  }, []);

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

  // Cocher = enregistrer la clé du champ ; champ vide = effacer celle que le
  // serveur détient pour ce fournisseur (« mémoriser l'absence de clé »).
  const memoriser = async () => {
    setSaisieFinie(false);
    if (apiKey.trim()) { await putKeys({ optin: true, provider, apiKey }); return; }
    setKeyError("");
    const response = await fetch(`/api/keys?provider=${encodeURIComponent(provider)}`,
      { method: "DELETE", headers: authHeaders() });
    if (response.ok) refreshSavedKeys(); else setKeyError(t("err.fallback"));
  };

  const keySaved = savedKeyProviders.includes(provider);
  // La proposition de mémorisation n'arrive qu'À LA SORTIE du champ : pendant
  // la frappe, une case qui apparaît au premier caractère déplace la barre
  // sous les doigts. On la montre donc quand la saisie est finie, et
  // seulement s'il y a quelque chose à décider :
  //   champ rempli   → proposer de mémoriser cette clé ;
  //   champ vidé mais clé mémorisée → proposer d'oublier celle du serveur.
  const [saisieFinie, setSaisieFinie] = useState(false);
  useEffect(() => { setSaisieFinie(false); }, [provider]);
  const aProposer = saisieFinie && (apiKey.trim() ? true : keySaved);
  const oublier = !apiKey.trim() && keySaved;
  const drapeau = !!(providerDefaults[provider]?.gdpr || providerDefaults[provider]?.wrng);

  return (
    <div className={bar ? "flex items-center gap-2" : "flex flex-col gap-3"}>
      {/* Drapeau du fournisseur, collé À GAUCHE de la liste. En rangée il est
          PIVOTÉ (écriture verticale, lecture de bas en haut) : il occupe ainsi
          deux millimètres de large au lieu d'une case entière, et reste lisible.
          Vert « RGPD » = cadre possible avec votre clé ; rouge « WRNG » =
          sous-traitant hors UE sans cadre reconnu. */}
      <div className={bar ? "flex items-center gap-0" : "contents"}>
      {drapeau && (
        <a href="/rgpd" target="_blank" rel="noreferrer"
          title={providerDefaults[provider]?.wrng ? t("chat.input.wrng.title") : t("chat.input.gdpr.title")}
          className={[
            providerDefaults[provider]?.wrng ? "bg-red-600/80 hover:bg-red-600" : "bg-green-600/80 hover:bg-green-600",
            "text-[9px] font-semibold uppercase tracking-wide text-white no-underline",
            bar
              ? "flex h-9 shrink-0 items-center justify-center rounded-l-sm px-px [writing-mode:vertical-rl] rotate-180"
              : "w-fit rounded-sm px-1 py-px leading-none",
          ].join(" ")}>
          {providerDefaults[provider]?.wrng ? t("chat.input.wrng.tag") : t("chat.input.gdpr.tag")}
        </a>
      )}
      <Wrap bar={bar} label={t("chat.input.provider")} width="w-32">
        <div className="relative">
          <select
            data-tour="provider"
            value={provider}
            onChange={event => setProvider(event.target.value as ProviderId)}
            title={t("chat.input.provider")}
            aria-label={t("chat.input.provider")}
            className={`${FIELD} w-full ${bar && drapeau ? "rounded-l-none" : ""}`}
          >
            {Object.entries(providerDefaults).map(([id, item]) => {
              const cleRequise = served !== null && !served.includes(id);
              return (
                <option key={id} value={id}>
                  {item.label}
                  {item.gdpr ? ` · ${t("chat.input.gdpr.tag")}` : item.wrng ? ` · ${t("chat.input.wrng.tag")}` : ""}
                  {cleRequise ? ` · ${t("chat.input.ownKeyOnly")}` : ""}
                </option>
              );
            })}
          </select>
        </div>
      </Wrap>
      </div>

      {/* Plus de choix de modèle ici : c'est l'administration qui règle
          l'échelle des trois barreaux par fournisseur, et « Régénérer » monte
          d'un cran. Nommer un modèle reste possible dans le DUEL, dont c'est
          précisément l'objet. */}


      <Wrap bar={bar} label={t("chat.input.apiKey")} width="w-36">
        <input
          data-tour="apikey"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={event => setApiKey(event.target.value)}
          onFocus={() => setSaisieFinie(false)}
          onBlur={() => setSaisieFinie(true)}
          placeholder={keySaved ? t("chat.input.keySaved") : t("chat.input.apiKeyPlaceholder")}
          title={keySaved ? t("chat.input.keySavedTitle") : t("chat.input.apiKey")}
          aria-label={t("chat.input.apiKey")}
          className={`${FIELD} w-full ${keySaved ? "ring-1 ring-green-600/60" : ""}`}
        />
      </Wrap>

      {/* La case n'apparaît qu'au moment utile : une clé vient d'être saisie
          pour ce fournisseur et le serveur ne l'a pas encore. Le reste du
          temps elle n'avait rien à proposer, et occupait la barre pour rien.
          Cocher vaut consentement ET enregistrement, en un geste. */}
      {hasAccount && keysAvailable && aProposer && (
        <label className={`flex items-center gap-1.5 text-[10px] leading-tight text-primary ${bar ? "max-w-[7rem]" : ""}`}
          title={oublier ? t("chat.input.forgetKeyTitle") : t("chat.input.rememberKeyTitle")}>
          <input type="checkbox" checked={false} onChange={() => void memoriser()} />
          <span className="opacity-70">{oublier ? t("chat.input.forgetKey") : t("chat.input.rememberKey")}</span>
        </label>
      )}

      {keyError && <span role="alert" className="text-[10px] text-red-400">{keyError}</span>}
    </div>
  );
}
