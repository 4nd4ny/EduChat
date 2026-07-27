import React, { useEffect, useState } from "react";
import { ProviderId, providerDefaults, ReasoningLevel, useAnthropic } from "../context/AnthropicProvider";
import { authHeaders, getAccount } from "../utils/account";
import { useT } from "../i18n/useT";
import { useFournisseurs } from "./useFournisseurs";
import NoteAIAct from "./NoteAIAct";
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
    provider, setProvider, apiKey, setApiKey, rememberKeyLocally, forgetKeyLocally,
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
  // Les fournisseurs que ce visiteur a le droit de voir. La règle vit dans
  // useFournisseurs — la même que celle appliquée sur la page « duel », et une
  // seule fois écrite.
  // `served` (qui paie ?) n'est plus lu ici : l'étiquette « clé perso » qu'il
  // servait à poser a disparu du menu (voir plus bas).
  const { visibles, motifAIAct, demonstration, pret } = useFournisseurs();

  useEffect(() => { setHasAccount(!!getAccount()); }, []);

  // LE MENU NE DOIT PAS AFFICHER UN CHOIX QU'IL NE CONTIENT PLUS.
  //
  // Le fournisseur courant vit dans le contexte, et il survit à tout : au
  // rechargement, au changement de compte, au départ du réseau de l'école. Un
  // visiteur revenu de chez lui avec « anthropic » en mémoire, alors que sa
  // liste ne contient plus que le repli gratuit, voyait un <select> dont la
  // valeur ne figurait dans aucune option — un champ vide sur les navigateurs
  // qui refusent l'orphelin, et le nom d'un fournisseur qu'on ne lui servira
  // pas sur les autres. RIEN NE CASSAIT (l'envoi part de toute façon sur le
  // repli gratuit, dont le fournisseur est imposé par le serveur), et c'est
  // bien le problème : l'écran mentait sans que rien ne le signale.
  //
  // DEUX GARDES, ET AUCUNE N'EST DÉCORATIVE.
  //  · `pret` — avant la réponse du serveur, `visibles` est la liste d'attente
  //    d'une salle de classe. Corriger là-dessus effacerait le « grok » d'un
  //    compte qui y a droit, à chaque chargement de page, une fraction de
  //    seconde avant d'apprendre qu'il y avait droit. On ne réécrit jamais le
  //    choix de quelqu'un sur une supposition.
  //  · `visibles.length` — un périmètre vide (repli gratuit non configuré)
  //    donnerait `visibles[0] === undefined`, et un fournisseur indéfini écrit
  //    dans le contexte casserait providerDefaults partout ailleurs. Mieux
  //    vaut garder l'ancienne valeur, inerte.
  useEffect(() => {
    if (pret && visibles.length && !visibles.includes(provider)) setProvider(visibles[0]);
  }, [pret, visibles, provider, setProvider]);

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

  /**
   * Cocher est le SEUL geste qui mémorise une clé — ni la frappe, ni l'envoi
   * d'un message ne l'enregistrent. Où elle va dépend de qui vous êtes :
   *   sans compte → dans CE navigateur, et nulle part ailleurs ;
   *   avec compte → sur le serveur, chiffrée, donc retrouvée d'un appareil à
   *                 l'autre (elle n'en redescend jamais).
   * Champ vidé → le même geste efface, des deux côtés à la fois.
   */
  const memoriser = async () => {
    setSaisieFinie(false);
    setKeyError("");
    if (apiKey.trim()) {
      if (hasAccount) await putKeys({ optin: true, provider, apiKey });
      else rememberKeyLocally(apiKey);
      try { localStorage.setItem("educhat-key-consent", "1"); } catch { /* stockage refusé */ }
      return;
    }
    // Oublier : le navigateur d'abord (immédiat et sûr), le serveur ensuite.
    forgetKeyLocally();
    if (!hasAccount) return;
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
  // Une clé est-elle déjà gardée pour ce fournisseur, ici ou sur le serveur ?
  const cleLocale = (() => {
    try { return !!localStorage.getItem(`educhat-key-${provider}`); } catch { return false; }
  })();
  const dejaGardee = keySaved || cleLocale;
  const aProposer = saisieFinie && (apiKey.trim() ? true : dejaGardee);
  const oublier = !apiKey.trim() && dejaGardee;
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
      <Wrap bar={bar} label={t("chat.input.provider")} width="min-w-[300px]">
        <div className="relative">
          <select
            data-tour="provider"
            value={provider}
            onChange={event => setProvider(event.target.value as ProviderId)}
            title={t("chat.input.provider")}
            aria-label={t("chat.input.provider")}
            className={`${FIELD} w-full ${bar && drapeau ? "rounded-l-none" : ""}`}
          >
            {/* CE QUE CETTE LISTE CONTIENT DÉPEND D'OÙ L'ON APPELLE ET DE QUI
                L'ON EST — le serveur seul en décide (accesFournisseurs.ts).
                Depuis le réseau d'une école : les fournisseurs conformes, pour
                tout le monde, compte ou pas. Ailleurs, avec un compte : tout.
                Ailleurs, sans compte : la démonstration gratuite seule. */}
            {visibles.map(id => {
              const item = providerDefaults[id];
              return (
                <option key={id} value={id}>
                  {item.label}
                  {item.gdpr ? ` · ${t("chat.input.gdpr.tag")}` : item.wrng ? ` · ${t("chat.input.wrng.tag")}` : ""}
                  {/* PLUS D'ÉTIQUETTE « clé perso » ICI (décision du client).
                      Une étiquette ne vaut que si elle DISTINGUE deux lignes du
                      même menu. Ce n'était pas le cas : le visiteur anonyme hors
                      campus doit apporter sa clé pour TOUS les fournisseurs de sa
                      liste, et marquer chacun d'eux ne lui apprenait rien — cela
                      lui faisait au contraire chercher la ligne qui, elle, serait
                      gratuite, et qui n'existe pas. Gemini en donnait la lecture
                      la plus fausse : ni RGPD ni WRNG, il n'affichait que ce
                      « clé perso » solitaire, comme s'il était le seul concerné.
                      Ce qui reste dit tout ce qu'il y a à dire : le drapeau, qui
                      relève du droit, et l'étiquette de démonstration ci-dessous,
                      qui est la seule information VRAIMENT distinctive — cette
                      ligne-là ne coûte rien.
                      /duel garde la sienne (chat.input.ownKeyOnly) : ce menu-ci
                      n'est pas le sien, et l'auteur qui compare deux moteurs
                      arbitre entre des lignes de statuts différents. */}
                  {demonstration ? ` · ${t("fournisseurs.demoTag")}` : ""}
                </option>
              );
            })}
          </select>
        </div>
        {/* L'absence s'explique SOUS le menu où on la constate : c'est là que
            la question se pose, et pas dans une page d'aide qu'on n'ouvre
            qu'après avoir renoncé. En barre (layout « bar »), la note
            passerait à la ligne sous un contrôle étroit — on la réserve donc
            au panneau, où elle a la place d'être lue. */}
        {!bar && <div className="mt-2"><NoteAIAct motif={motifAIAct} /></div>}
      </Wrap>
      </div>

      {/* Plus de choix de modèle ici : c'est l'administration qui règle
          l'échelle des trois barreaux par fournisseur, et « Régénérer » monte
          d'un cran. Nommer un modèle reste possible dans le DUEL, dont c'est
          précisément l'objet. */}


      <Wrap bar={bar} label={t("chat.input.apiKey")} width="min-w-[300px]">
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
      {aProposer && (hasAccount ? keysAvailable : true) && (
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
