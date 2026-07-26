import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { MdClose, MdOpenInFull, MdSend } from "react-icons/md";
import AssistantMessageContent from "./AssistantMessageContent";
import { getClientId } from "../utils/clientId";
import { useT } from "../i18n/useT";

type Msg = { role: "user" | "assistant"; content: string };

// Démo « hyper simplifiée » sur l'accueil : essai gratuit et anonyme d'un tuteur,
// sans compte ni clé ni réglages. Passe par /api/completion sans clé personnelle
// → le serveur utilise le repli gratuit (OpenRouter/Gemma). Pour l'expérience
// complète (historique, fournisseurs, clé personnelle), le bouton « Utiliser »
// ouvre le vrai chat /chat.
export default function DemoChat({ promptName, titre, onClose }:
  { promptName: string; titre?: string; onClose: () => void }) {
  // « promptName » est l'identité (serveur, URL, facturation) ; « titre »
  // n'est que l'affichage, et suit la langue du lecteur.
  const affiche = titre || promptName;
  const t = useT();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMessages([]); setInput(""); setError(""); }, [promptName]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, loading]);

  const send = async () => {
    const value = input.trim();
    if (!value || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: value }];
    setMessages(next); setInput(""); setLoading(true); setError("");
    try {
      const response = await fetch("/api/completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "openrouter", promptName, clientId: getClientId(), messages: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // Les codes d'erreur restent techniques (contrat serveur) ; seul le
        // message montré à l'utilisateur passe par le dictionnaire.
        setError(data?.error?.code === "ERR_LOCKED"
          ? t("demo.error.locked")
          : data?.error?.code === "ERR_FREE_BUSY"
            ? t("demo.error.busy")
            : data?.error?.code === "ERR_RATE_LIMIT"
              ? t("demo.error.rateLimit")
              : t("demo.error.generic"));
        return;
      }
      setMessages(previous => [...previous, { role: "assistant", content: data.reply }]);
    } catch {
      setError(t("demo.error.network"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-[#DC6521]/50 bg-secondary p-4">
      <div className="flex items-center justify-between gap-2">
        {/* Le tiret cadratin reste dans le JSX : c'est de la ponctuation, pas du texte à traduire. */}
        <h2 className="text-lg font-bold">{t("demo.title")} — <span className="text-[#DC6521]">{affiche}</span></h2>
        <div className="flex items-center gap-2">
          <Link href={`/chat?tuteur=${encodeURIComponent(promptName)}`}
            className="flex items-center gap-1 rounded border border-white/20 px-3 py-1.5 text-xs hover:bg-tertiary">
            <MdOpenInFull /> {t("demo.openFull")}
          </Link>
          <button onClick={onClose} aria-label={t("demo.close")} className="rounded p-1.5 hover:bg-tertiary"><MdClose /></button>
        </div>
      </div>
      <p className="mt-1 text-xs opacity-60">
        {t("demo.intro")}
      </p>

      <div className="mt-3 max-h-96 min-h-[8rem] overflow-y-auto rounded bg-tertiary p-3 text-sm">
        {messages.length === 0 && !loading && (
          <p className="opacity-50">{t("demo.empty")}</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className="mb-3">
            <span className="text-xs uppercase tracking-wide opacity-50">{m.role === "user" ? t("demo.you") : affiche}</span>
            {m.role === "user"
              ? <p className="whitespace-pre-wrap text-primary">{m.content}</p>
              : <div className="mt-1"><AssistantMessageContent content={m.content} /></div>}
          </div>
        ))}
        {loading && <p className="opacity-50">{t("demo.thinking")}</p>}
        <div ref={endRef} />
      </div>

      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}

      <form className="mt-3 flex gap-2" onSubmit={event => { event.preventDefault(); void send(); }}>
        <input value={input} onChange={event => setInput(event.target.value)}
          placeholder={t("demo.question.placeholder")} aria-label={t("demo.question.label")}
          className="flex-grow rounded bg-tertiary p-2 text-sm outline-none" />
        {/* « Envoyer » est déjà au dictionnaire pour la zone de saisie du vrai chat : on réutilise la clé. */}
        <button type="submit" disabled={loading || !input.trim()} aria-label={t("chat.input.send")}
          className="rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90 disabled:opacity-50"><MdSend /></button>
      </form>
    </div>
  );
}
