import Head from "next/head";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { MdCompareArrows, MdSend } from "react-icons/md";
import AssistantMessageContent from "../chat/AssistantMessageContent";
import { providerDefaults, type ProviderId, type ReasoningLevel } from "../shared/providers";
import { useFournisseurs } from "../chat/useFournisseurs";
import NoteAIAct from "../chat/NoteAIAct";
import { requestCompletion } from "../utils/streamCompletion";
import { getClientId } from "../utils/clientId";
import { authHeaders, getAccount, getToken } from "../utils/account";
import { fr as frDict, type TranslationKey } from "../i18n/dictionaries";
import { useT } from "../i18n/useT";
import { useRouter } from "next/router";
import InterfaceTour from "../chat/InterfaceTour";
import ModelField from "../chat/ModelField";

// Mode DUEL — l'atelier des promptagogues (page réservée, vérifiée côté
// serveur : /api/completion refuse « dual » sans compte promptagogue).
//
// Deux comparaisons possibles, même question envoyée aux deux colonnes :
//  - « 2 tuteurs, 1 modèle » : quelle formulation de prompt guide le mieux ?
//  - « 1 tuteur, 2 modèles » : le prompt tient-il sur un autre LLM ?
//
// Les conversations de duel restent en mémoire de page (c'est un banc d'essai,
// pas un historique) ; rien n'est écrit dans localStorage.

type DuelMode = "prompts" | "models";
type Msg = { role: "user" | "assistant"; content: string };
type Me = { isPromptagogue: boolean; name: string } | null | "anonymous";

type ColumnConfig = {
  promptName: string;
  provider: ProviderId;
  model: string;
  apiKey: string;
};

function DuelColumn({ title, messages, busy }: { title: string; messages: Msg[]; busy: boolean }) {
  const t = useT();
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages]);
  return (
    <div className="flex min-h-[16rem] flex-col rounded-lg border border-white/10 bg-secondary">
      <div className="border-b border-white/10 px-3 py-2 text-sm font-bold text-[#DC6521]">{title}</div>
      <div className="flex-grow overflow-y-auto p-3 text-sm" style={{ maxHeight: "50vh" }}>
        {messages.length === 0 && <p className="opacity-50">{t("duel.column.empty")}</p>}
        {messages.map((m, i) => (
          <div key={i} className="mb-3">
            <span className="text-xs uppercase tracking-wide opacity-50">{m.role === "user" ? t("duel.column.you") : title}</span>
            {m.role === "user"
              ? <p className="whitespace-pre-wrap">{m.content}</p>
              : <div className="prose prose-sm mt-1 max-w-none dark:prose-invert"><AssistantMessageContent content={m.content} /></div>}
          </div>
        ))}
        {busy && <p className="animate-pulse opacity-50">…</p>}
        <div ref={endRef} />
      </div>
    </div>
  );
}

export default function DuelPage() {
  const t = useT();
  // Message d'erreur d'un code amont, rendu dans la langue de la page (le
  // dictionnaire français sert seulement à savoir si le code est connu).
  const err = (code: string) =>
    (frDict as any)[`err.${code}`] ? t(`err.${code}` as TranslationKey) : t("err.fallback");
  const [me, setMe] = useState<Me>(null);
  // DÉMONSTRATION (?visite=1) : l'atelier s'ouvre sans compte, inerte, pour
  // montrer ce que tout compte vérifié obtient. Aucun appel au modèle.
  const routeur = useRouter();
  const demo = routeur.isReady && routeur.query.visite === "1";
  const [tour, setTour] = useState(false);
  useEffect(() => { if (demo) setTour(true); }, [demo]);
  const [mode, setMode] = useState<DuelMode>("prompts");
  const [prompts, setPrompts] = useState<string[]>([]);
  const [reasoning, setReasoning] = useState<ReasoningLevel>("medium");
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState([false, false]);
  const [columns, setColumns] = useState<[Msg[], Msg[]]>([[], []]);
  const [config, setConfig] = useState<[ColumnConfig, ColumnConfig]>([
    { promptName: "", provider: "anthropic", model: providerDefaults.anthropic.model, apiKey: "" },
    { promptName: "", provider: "openai", model: providerDefaults.openai.model, apiKey: "" },
  ]);

  // Vérification du rôle : jeton local + rôle relu en base via /api/me.
  useEffect(() => {
    const account = getAccount();
    if (!account) { setMe("anonymous"); return; }
    fetch("/api/me", { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => setMe({ isPromptagogue: !!data.isPromptagogue, name: data.name }))
      .catch(() => setMe("anonymous"));
  }, []);

  useEffect(() => {
    // Avec le jeton : les tuteurs réservés de l'école active en font partie.
    fetch("/api/prompts?sort=name", { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        const names = (data.prompts ?? []).map((p: any) => p.name);
        setPrompts(names);
        setConfig(previous => {
          const next: [ColumnConfig, ColumnConfig] = [...previous] as any;
          if (!next[0].promptName && names[0]) next[0] = { ...next[0], promptName: names[0] };
          if (!next[1].promptName && names[1]) next[1] = { ...next[1], promptName: names[1] ?? names[0] };
          return next;
        });
      })
      .catch(() => {});
  }, []);

  // AI ACT — MÊME RÈGLE QUE LE CHAT, ET LE MÊME CODE.
  //
  // Cette page offrait la liste COMPLÈTE des fournisseurs à tout le monde :
  // Grok, Gemini et les cinq chinois y étaient sélectionnables par un élève,
  // depuis le réseau d'une école. La route de complétion les refusait bien —
  // mais après coup, par une erreur, là où il ne fallait tout simplement pas
  // proposer le choix. Le serveur décide (le réseau d'où l'on appelle d'abord,
  // le compte et ses moyens propres ensuite) ; cette page ne fait que le
  // refléter.
  //
  // AVEC UNE PARTICULARITÉ QUI N'APPARTIENT QU'À ELLE : ici le modèle s'écrit
  // à la main, donc OpenRouter cesse d'être un intermédiaire vers l'échelle
  // réglée par l'administration. La surface « duel » le retire de la liste
  // pour qui n'a pas de compte — nommer soi-même un modèle derrière un
  // intermédiaire demande quelqu'un d'identifié, qui paie et répond de son
  // appel, et /api/completion le refuse déjà (ERR_PROVIDER_ACCOUNT_REQUIRED).
  const { served, visibles, motifAIAct, pret } = useFournisseurs({ surface: "duel" });

  // Une colonne peut pointer un fournisseur qui vient de sortir de la liste —
  // au changement de compte, ou parce que la réponse du serveur arrive après
  // le premier rendu. Sans ce rattrapage, le <select> afficherait un choix
  // vide et le premier envoi partirait sur un fournisseur refusé.
  //
  // MAIS SEULEMENT UNE FOIS LE PÉRIMÈTRE CONNU (`pret`). Avant la réponse,
  // `visibles` est la liste d'attente d'une salle de classe, qui n'est le
  // périmètre de personne : corriger là-dessus déplacerait la colonne d'un
  // promptagogue vers un fournisseur qu'il n'a pas choisi, une fraction de
  // seconde avant d'apprendre qu'il avait droit au sien.
  useEffect(() => {
    if (!pret) return;
    setConfig(previous => {
      const next = [...previous] as [ColumnConfig, ColumnConfig];
      let change = false;
      for (const index of [0, 1] as const) {
        if (visibles.includes(next[index].provider)) continue;
        const repli = visibles[0];
        // UNE LISTE VIDE N'A PAS DE PREMIER ÉLÉMENT. Le cas existe depuis que
        // le périmètre peut se réduire au seul repli gratuit : `visibles[0]`
        // vaut alors `undefined`, et `providerDefaults[undefined].model` fait
        // tomber la page entière — un écran blanc pour une liste courte. On
        // garde la configuration précédente : inutilisable, mais visible, et
        // le serveur refuse de toute façon l'appel (ERR_PROMPTAGOGUE_ONLY).
        if (!repli) return previous;
        next[index] = { ...next[index], provider: repli, model: providerDefaults[repli].model };
        change = true;
      }
      return change ? next : previous;
    });
  }, [pret, visibles]);

  const updateConfig = (index: 0 | 1, patch: Partial<ColumnConfig>) => {
    setConfig(previous => {
      const next: [ColumnConfig, ColumnConfig] = [...previous] as any;
      next[index] = { ...next[index], ...patch };
      if (patch.provider) next[index].model = providerDefaults[patch.provider].model;
      return next;
    });
  };

  // Configurations EFFECTIVES par colonne selon le mode :
  //  - « prompts » : tuteurs différents, moteur commun (celui de la colonne A) ;
  //  - « models »  : tuteur commun (colonne A), moteurs différents.
  const effective = useMemo((): [ColumnConfig, ColumnConfig] => {
    if (mode === "prompts") {
      return [config[0], { ...config[0], promptName: config[1].promptName }];
    }
    return [config[0], { ...config[1], promptName: config[0].promptName }];
  }, [mode, config]);

  const columnTitle = (index: 0 | 1) => {
    const c = effective[index];
    return mode === "prompts"
      ? `${c.promptName || "?"}`
      : `${providerDefaults[c.provider].label} · ${c.model}`;
  };

  const ask = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = question.trim();
    if (!value || busy[0] || busy[1]) return;
    setQuestion(""); setError("");
    setBusy([true, true]);

    const token = getToken() ?? undefined;
    await Promise.all(([0, 1] as const).map(async index => {
      const c = effective[index];
      const history = [...columns[index], { role: "user" as const, content: value }];
      // Message utilisateur + réponse en construction, affichés immédiatement.
      setColumns(previous => {
        const next: [Msg[], Msg[]] = [...previous] as any;
        next[index] = [...history, { role: "assistant", content: "" }];
        return next;
      });
      const paint = (text: string) => setColumns(previous => {
        const next: [Msg[], Msg[]] = [...previous] as any;
        const list = [...next[index]];
        list[list.length - 1] = { role: "assistant", content: text };
        next[index] = list;
        return next;
      });
      try {
        const result = await requestCompletion({
          provider: c.provider, model: c.model, apiKey: c.apiKey, reasoning,
          promptName: c.promptName || undefined,
          clientId: getClientId() || undefined,
          dual: true,
          messages: history,
        }, { onDelta: fullText => paint(fullText) }, token);
        paint(result.reply);
      } catch (exception: any) {
        paint(`*${err(exception?.code ?? "ERR_UPSTREAM")}*`);
      } finally {
        setBusy(previous => index === 0 ? [false, previous[1]] : [previous[0], false]);
      }
    }));
  };

  // ---- Garde d'accès -------------------------------------------------------
  if ((me === null || !routeur.isReady) && !demo) return <div className="py-16 text-center text-primary opacity-60">{t("common.loading")}</div>;
  if ((me === "anonymous" || (me && !me.isPromptagogue)) && !demo) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-primary">
        <Head><title>{`${t("duel.title")} — EduChat`}</title></Head>
        <MdCompareArrows className="mx-auto mb-4 text-5xl text-[#DC6521]" />
        <h1 className="text-2xl font-bold">{t("duel.locked.title")}</h1>
        <p className="mt-3 opacity-80">{t("duel.locked.subtitle")}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/verifier" className="rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90">
            {t("compte.anonymousCta")}
          </Link>
          <Link href="/" className="rounded border border-white/20 px-4 py-2 hover:bg-tertiary">
            {t("duel.locked.back")}
          </Link>
        </div>
      </div>
    );
  }

  // ---- L'atelier -----------------------------------------------------------
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-24 text-primary">
      <Head><title>{`${t("duel.title")} — EduChat`}</title></Head>

      {demo && (
        <p className="mb-4 rounded-lg border border-[#DC6521]/50 bg-[#DC6521]/10 p-3 text-sm">
          {/* Bandeau en trois morceaux : le fragment en gras est la promesse
              centrale, il doit rester saillant dans les quatre langues. */}
          <b>{t("duel.demo.tag")}</b> {t("duel.demo.intro")}{" "}
          <b>{t("duel.demo.strong")}</b>{t("duel.demo.outro")}
        </p>
      )}
      {tour && <InterfaceTour parcours="duel" onClose={() => setTour(false)} />}

      <h1 className="flex items-center gap-2 text-3xl font-bold"><MdCompareArrows /> {t("duel.title")}</h1>
      <p className="mt-1 text-sm opacity-70">{t("duel.subtitle")}</p>

      <div data-tour="duel-mode" className="mt-4 flex flex-wrap gap-2 text-sm">
        <button disabled={demo} onClick={() => setMode("prompts")}
          className={`rounded px-3 py-1.5 ${mode === "prompts" ? "bg-[#DC6521] font-bold" : "border border-white/20 hover:bg-tertiary"}`}>
          {t("duel.mode.prompts")}
        </button>
        <button disabled={demo} onClick={() => setMode("models")}
          className={`rounded px-3 py-1.5 ${mode === "models" ? "bg-[#DC6521] font-bold" : "border border-white/20 hover:bg-tertiary"}`}>
          {t("duel.mode.models")}
        </button>
      </div>

      {/* La même note que dans le chat, au-dessus des menus de fournisseurs :
          c'est ici qu'on constate leur absence, c'est donc ici qu'on l'explique. */}
      <div className="mt-4"><NoteAIAct motif={motifAIAct} /></div>

      {/* Configuration */}
      <div data-tour="duel-colonneA" className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-white/10 bg-secondary p-4 text-xs md:grid-cols-2">
        {mode === "prompts" ? (
          <>
            <label className="flex flex-col gap-1">{t("duel.field.tutorA")}
              <select disabled={demo} className="rounded bg-tertiary p-2" value={config[0].promptName}
                onChange={e => updateConfig(0, { promptName: e.target.value })}>
                {prompts.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">{t("duel.field.tutorB")}
              <select disabled={demo} className="rounded bg-tertiary p-2" value={config[1].promptName}
                onChange={e => updateConfig(1, { promptName: e.target.value })}>
                {prompts.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">{t("duel.field.providerShared")}
              <select disabled={demo} className="rounded bg-tertiary p-2" value={config[0].provider}
                onChange={e => updateConfig(0, { provider: e.target.value as ProviderId })}>
                {visibles.map(id => (
                  <option key={id} value={id}>
                    {providerDefaults[id].label}
                    {providerDefaults[id].gdpr ? ` · ${t("chat.input.gdpr.tag")}`
                      : providerDefaults[id].wrng ? ` · ${t("chat.input.wrng.tag")}` : ""}
                    {/* Pas de « clé personnelle » sur un drapeau rouge : hors
                        établissement, ces fournisseurs ne se montrent qu'à un
                        compte, qui apporte forcément de quoi payer — la
                        plateforme ne les finance jamais. Le drapeau WRNG, lui,
                        dit tout ce qu'il y a à dire. */}
                    {served !== null && !served.includes(id) && !providerDefaults[id].wrng
                      ? ` · ${t("chat.input.ownKeyOnly")}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">{t("duel.field.modelShared")}
              <ModelField disabled={demo} className="rounded bg-tertiary p-2"
                provider={config[0].provider} apiKey={config[0].apiKey} model={config[0].model}
                onChange={value => updateConfig(0, { model: value })} />
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">{t("chat.input.apiKey")}
              <input disabled={demo} type="password" autoComplete="off" className="rounded bg-tertiary p-2" value={config[0].apiKey}
                placeholder={t("duel.field.apiKeyPlaceholder")}
                onChange={e => updateConfig(0, { apiKey: e.target.value })} />
            </label>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1 md:col-span-2">{t("duel.field.tutorShared")}
              <select disabled={demo} className="rounded bg-tertiary p-2" value={config[0].promptName}
                onChange={e => updateConfig(0, { promptName: e.target.value })}>
                {prompts.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            {([0, 1] as const).map(index => (
              <div key={index} className="flex flex-col gap-2 rounded border border-white/10 p-2">
                {/* « A » et « B » restent des repères typographiques, pas des mots. */}
                <span className="font-bold opacity-70">{t("duel.field.engine", { letter: index === 0 ? "A" : "B" })}</span>
                <label className="flex flex-col gap-1">{t("chat.input.provider")}
                  <select disabled={demo} className="rounded bg-tertiary p-2" value={config[index].provider}
                    onChange={e => updateConfig(index, { provider: e.target.value as ProviderId })}>
                    {visibles.map(id => (
                  <option key={id} value={id}>
                    {providerDefaults[id].label}
                    {providerDefaults[id].gdpr ? ` · ${t("chat.input.gdpr.tag")}`
                      : providerDefaults[id].wrng ? ` · ${t("chat.input.wrng.tag")}` : ""}
                    {/* Idem : le drapeau rouge se suffit, « clé personnelle » n'y ajoute rien. */}
                    {served !== null && !served.includes(id) && !providerDefaults[id].wrng
                      ? ` · ${t("chat.input.ownKeyOnly")}` : ""}
                  </option>
                ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">{t("chat.input.model")}
                  <ModelField disabled={demo} className="rounded bg-tertiary p-2"
                    provider={config[index].provider} apiKey={config[index].apiKey} model={config[index].model}
                    onChange={value => updateConfig(index, { model: value })} />
                </label>
                <label className="flex flex-col gap-1">{t("chat.input.apiKey")}
                  <input disabled={demo} type="password" autoComplete="off" className="rounded bg-tertiary p-2" value={config[index].apiKey}
                    placeholder={t("duel.field.apiKeyPlaceholder")}
                    onChange={e => updateConfig(index, { apiKey: e.target.value })} />
                </label>
              </div>
            ))}
          </>
        )}
        <label className="flex flex-col gap-1">{t("chat.input.reasoning")}
          <select disabled={demo} className="rounded bg-tertiary p-2" value={reasoning}
            onChange={e => setReasoning(e.target.value as ReasoningLevel)}>
            <option value="low">{t("chat.input.reasoning.low")}</option>
            <option value="medium">{t("chat.input.reasoning.medium")}</option>
            <option value="high">{t("chat.input.reasoning.high")}</option>
          </select>
        </label>
        <div className="flex items-end justify-end">
          <button disabled={demo} onClick={() => setColumns([[], []])}
            className="rounded border border-white/20 px-3 py-2 hover:bg-tertiary">
            {t("duel.clear")}
          </button>
        </div>
      </div>

      {/* Les deux colonnes */}
      <div data-tour="duel-colonneB" className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <DuelColumn title={columnTitle(0)} messages={columns[0]} busy={busy[0]} />
        <DuelColumn title={columnTitle(1)} messages={columns[1]} busy={busy[1]} />
      </div>

      {error && <p role="alert" className="mt-3 rounded bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}

      {/* La question commune */}
      <form onSubmit={ask} className="mt-4 flex gap-2">
        <input data-tour="duel-question" disabled={demo} value={question} onChange={e => setQuestion(e.target.value)}
          placeholder={t("duel.question.placeholder")}
          aria-label={t("duel.question.aria")}
          className="flex-grow rounded border border-stone-500/20 bg-tertiary p-3 outline-none" />
        <button data-tour="duel-envoyer" type="submit" disabled={demo || busy[0] || busy[1] || !question.trim()}
          aria-label={t("duel.send.aria")}
          className="rounded bg-[#DC6521] px-5 font-bold hover:opacity-90 disabled:opacity-50">
          <MdSend />
        </button>
      </form>
    </div>
  );
}
