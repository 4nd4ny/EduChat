import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { MdClose, MdOpenInFull, MdSend } from "react-icons/md";
import AssistantMessageContent from "./AssistantMessageContent";
import { getClientId } from "../utils/clientId";

type Msg = { role: "user" | "assistant"; content: string };

// Démo « hyper simplifiée » sur l'accueil : essai gratuit et anonyme d'un tuteur,
// sans compte ni clé ni réglages. Passe par /api/completion sans clé personnelle
// → le serveur utilise le repli gratuit (OpenRouter/Gemma). Pour l'expérience
// complète (historique, fournisseurs, clé personnelle), le bouton « Utiliser »
// ouvre le vrai chat /chat.
export default function DemoChat({ promptName, onClose }: { promptName: string; onClose: () => void }) {
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
        setError(data?.error?.code === "ERR_LOCKED"
          ? "La démo gratuite n'est pas disponible pour le moment. Utilisez « Utiliser » avec votre clé personnelle."
          : data?.error?.code === "ERR_FREE_BUSY"
            ? "Le modèle gratuit est momentanément saturé (beaucoup de monde). Réessayez dans un instant, ou cliquez « Utiliser » avec votre clé personnelle."
            : data?.error?.code === "ERR_RATE_LIMIT"
              ? "Trop de messages d'affilée — patientez un instant."
              : "Le tuteur n'a pas pu répondre. Réessayez dans un moment.");
        return;
      }
      setMessages(previous => [...previous, { role: "assistant", content: data.reply }]);
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-[#DC6521]/50 bg-secondary p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Démo — <span className="text-[#DC6521]">{promptName}</span></h2>
        <div className="flex items-center gap-2">
          <Link href={`/chat?tuteur=${encodeURIComponent(promptName)}`}
            className="flex items-center gap-1 rounded border border-white/20 px-3 py-1.5 text-xs hover:bg-tertiary">
            <MdOpenInFull /> Ouvrir en grand
          </Link>
          <button onClick={onClose} aria-label="Fermer la démo" className="rounded p-1.5 hover:bg-tertiary"><MdClose /></button>
        </div>
      </div>
      <p className="mt-1 text-xs opacity-60">
        Essai gratuit et anonyme, sans compte. Ce tuteur ne donne pas les réponses : il vous guide par des questions.
      </p>

      <div className="mt-3 max-h-96 min-h-[8rem] overflow-y-auto rounded bg-tertiary p-3 text-sm">
        {messages.length === 0 && !loading && (
          <p className="opacity-50">Posez une question à ce tuteur pour commencer…</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className="mb-3">
            <span className="text-xs uppercase tracking-wide opacity-50">{m.role === "user" ? "Vous" : promptName}</span>
            {m.role === "user"
              ? <p className="whitespace-pre-wrap text-primary">{m.content}</p>
              : <div className="mt-1"><AssistantMessageContent content={m.content} /></div>}
          </div>
        ))}
        {loading && <p className="opacity-50">Le tuteur réfléchit…</p>}
        <div ref={endRef} />
      </div>

      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}

      <form className="mt-3 flex gap-2" onSubmit={event => { event.preventDefault(); void send(); }}>
        <input value={input} onChange={event => setInput(event.target.value)}
          placeholder="Votre question…" aria-label="Votre question"
          className="flex-grow rounded bg-tertiary p-2 text-sm outline-none" />
        <button type="submit" disabled={loading || !input.trim()} aria-label="Envoyer"
          className="rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90 disabled:opacity-50"><MdSend /></button>
      </form>
    </div>
  );
}
