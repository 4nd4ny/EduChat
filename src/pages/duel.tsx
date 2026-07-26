import Head from "next/head";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { MdCompareArrows, MdSend } from "react-icons/md";
import AssistantMessageContent from "../chat/AssistantMessageContent";
import { providerDefaults, PROVIDER_IDS, type ProviderId, type ReasoningLevel } from "../shared/providers";
import { requestCompletion } from "../utils/streamCompletion";
import { getClientId } from "../utils/clientId";
import { getAccount, getToken } from "../utils/account";
import { fr as frDict } from "../i18n/dictionaries";
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

const err = (code: string) => (frDict as any)[`err.${code}`] ?? (frDict as any)["err.fallback"];

function DuelColumn({ title, messages, busy }: { title: string; messages: Msg[]; busy: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages]);
  return (
    <div className="flex min-h-[16rem] flex-col rounded-lg border border-white/10 bg-secondary">
      <div className="border-b border-white/10 px-3 py-2 text-sm font-bold text-[#DC6521]">{title}</div>
      <div className="flex-grow overflow-y-auto p-3 text-sm" style={{ maxHeight: "50vh" }}>
        {messages.length === 0 && <p className="opacity-50">La réponse de cette colonne s'affichera ici.</p>}
        {messages.map((m, i) => (
          <div key={i} className="mb-3">
            <span className="text-xs uppercase tracking-wide opacity-50">{m.role === "user" ? "Vous" : title}</span>
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
    fetch("/api/prompts?sort=name")
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
  if ((me === null || !routeur.isReady) && !demo) return <div className="py-16 text-center text-primary opacity-60">Chargement…</div>;
  if ((me === "anonymous" || (me && !me.isPromptagogue)) && !demo) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-primary">
        <Head><title>Duel — EduChat</title></Head>
        <MdCompareArrows className="mx-auto mb-4 text-5xl text-[#DC6521]" />
        <h1 className="text-2xl font-bold">Le mode duel est réservé aux promptagogues</h1>
        <p className="mt-3 opacity-80">
          Comparer deux tuteurs sur le même modèle, ou le même tuteur sur deux modèles,
          est un outil d'affinage pour les auteurs de prompts. Identifiez-vous (30 secondes,
          sans mot de passe) pour y accéder.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/verifier" className="rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90">
            Vérifier mon email
          </Link>
          <Link href="/" className="rounded border border-white/20 px-4 py-2 hover:bg-tertiary">
            Retour au catalogue
          </Link>
        </div>
      </div>
    );
  }

  // ---- L'atelier -----------------------------------------------------------
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-24 text-primary">
      <Head><title>Duel — EduChat</title></Head>

      {demo && (
        <p className="mb-4 rounded-lg border border-[#DC6521]/50 bg-[#DC6521]/10 p-3 text-sm">
          <b>Démonstration.</b> L&apos;atelier de comparaison est réservé aux promptagogues — et
          <b> toute personne qui vérifie son adresse email en devient un</b>, en trente secondes
          et sans mot de passe. Ici, les commandes sont désactivées : rien n&apos;est envoyé.
        </p>
      )}
      {tour && <InterfaceTour parcours="duel" onClose={() => setTour(false)} />}

      <h1 className="flex items-center gap-2 text-3xl font-bold"><MdCompareArrows /> Duel</h1>
      <p className="mt-1 text-sm opacity-70">
        La même question part dans les deux colonnes — observez, comparez, affinez.
        Ces conversations d'essai ne sont pas conservées.
      </p>

      <div data-tour="duel-mode" className="mt-4 flex flex-wrap gap-2 text-sm">
        <button disabled={demo} onClick={() => setMode("prompts")}
          className={`rounded px-3 py-1.5 ${mode === "prompts" ? "bg-[#DC6521] font-bold" : "border border-white/20 hover:bg-tertiary"}`}>
          2 tuteurs · 1 modèle
        </button>
        <button disabled={demo} onClick={() => setMode("models")}
          className={`rounded px-3 py-1.5 ${mode === "models" ? "bg-[#DC6521] font-bold" : "border border-white/20 hover:bg-tertiary"}`}>
          1 tuteur · 2 modèles
        </button>
      </div>

      {/* Configuration */}
      <div data-tour="duel-colonneA" className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-white/10 bg-secondary p-4 text-xs md:grid-cols-2">
        {mode === "prompts" ? (
          <>
            <label className="flex flex-col gap-1">Tuteur A
              <select disabled={demo} className="rounded bg-tertiary p-2" value={config[0].promptName}
                onChange={e => updateConfig(0, { promptName: e.target.value })}>
                {prompts.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">Tuteur B
              <select disabled={demo} className="rounded bg-tertiary p-2" value={config[1].promptName}
                onChange={e => updateConfig(1, { promptName: e.target.value })}>
                {prompts.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">Fournisseur (commun)
              <select disabled={demo} className="rounded bg-tertiary p-2" value={config[0].provider}
                onChange={e => updateConfig(0, { provider: e.target.value as ProviderId })}>
                {PROVIDER_IDS.map(id => <option key={id} value={id}>{providerDefaults[id].label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">Modèle (commun)
              <ModelField disabled={demo} className="rounded bg-tertiary p-2"
                provider={config[0].provider} apiKey={config[0].apiKey} model={config[0].model}
                onChange={value => updateConfig(0, { model: value })} />
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">Clé personnelle
              <input disabled={demo} type="password" autoComplete="off" className="rounded bg-tertiary p-2" value={config[0].apiKey}
                placeholder="Sinon : clé gérée (si session déverrouillée)"
                onChange={e => updateConfig(0, { apiKey: e.target.value })} />
            </label>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1 md:col-span-2">Tuteur (commun)
              <select disabled={demo} className="rounded bg-tertiary p-2" value={config[0].promptName}
                onChange={e => updateConfig(0, { promptName: e.target.value })}>
                {prompts.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            {([0, 1] as const).map(index => (
              <div key={index} className="flex flex-col gap-2 rounded border border-white/10 p-2">
                <span className="font-bold opacity-70">Moteur {index === 0 ? "A" : "B"}</span>
                <label className="flex flex-col gap-1">Fournisseur
                  <select disabled={demo} className="rounded bg-tertiary p-2" value={config[index].provider}
                    onChange={e => updateConfig(index, { provider: e.target.value as ProviderId })}>
                    {PROVIDER_IDS.map(id => <option key={id} value={id}>{providerDefaults[id].label}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">Modèle
                  <ModelField disabled={demo} className="rounded bg-tertiary p-2"
                    provider={config[index].provider} apiKey={config[index].apiKey} model={config[index].model}
                    onChange={value => updateConfig(index, { model: value })} />
                </label>
                <label className="flex flex-col gap-1">Clé personnelle
                  <input disabled={demo} type="password" autoComplete="off" className="rounded bg-tertiary p-2" value={config[index].apiKey}
                    placeholder="Sinon : clé gérée (si session déverrouillée)"
                    onChange={e => updateConfig(index, { apiKey: e.target.value })} />
                </label>
              </div>
            ))}
          </>
        )}
        <label className="flex flex-col gap-1">Raisonnement
          <select disabled={demo} className="rounded bg-tertiary p-2" value={reasoning}
            onChange={e => setReasoning(e.target.value as ReasoningLevel)}>
            <option value="low">Rapide</option>
            <option value="medium">Équilibré</option>
            <option value="high">Approfondi</option>
          </select>
        </label>
        <div className="flex items-end justify-end">
          <button disabled={demo} onClick={() => setColumns([[], []])}
            className="rounded border border-white/20 px-3 py-2 hover:bg-tertiary">
            Vider les colonnes
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
          placeholder="Votre question, envoyée aux deux colonnes…"
          aria-label="Votre question, envoyée aux deux colonnes"
          className="flex-grow rounded border border-stone-500/20 bg-tertiary p-3 outline-none" />
        <button data-tour="duel-envoyer" type="submit" disabled={demo || busy[0] || busy[1] || !question.trim()}
          aria-label="Envoyer aux deux colonnes"
          className="rounded bg-[#DC6521] px-5 font-bold hover:opacity-90 disabled:opacity-50">
          <MdSend />
        </button>
      </form>
    </div>
  );
}
