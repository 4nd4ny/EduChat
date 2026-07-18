import React, { useCallback } from "react";
import { MdSend } from "react-icons/md";
import { ProviderId, providerDefaults, ReasoningLevel, useAnthropic } from "../context/AnthropicProvider";

export default function ChatInput() {
  const { loading, addMessage, provider, setProvider, model, setModel, apiKey, setApiKey, reasoning, setReasoning } = useAnthropic();
  const textAreaRef = React.useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = React.useState("");

  const handleSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    if (loading || !input.trim()) return;
    addMessage(input); setInput("");
  }, [loading, input, addMessage]);

  React.useEffect(() => {
    if (!textAreaRef.current) return;
    textAreaRef.current.style.height = "40px";
    textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
  }, [input]);

  return (
    <div className="fixed bottom-0 flex h-[13rem] w-full bg-gradient-to-t from-[rgb(var(--bg-secondary))] to-transparent md:w-[calc(100%-320px)]">
      <form className="mx-auto flex h-full w-full max-w-6xl flex-col justify-end gap-2 p-4 pb-6" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-2 text-xs text-primary md:grid-cols-4">
          <label className="flex flex-col gap-1">Fournisseur
            <select className="rounded bg-tertiary p-2" value={provider} onChange={event => setProvider(event.target.value as ProviderId)}>
              {Object.entries(providerDefaults).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">Modèle
            <input className="rounded bg-tertiary p-2" value={model} onChange={event => setModel(event.target.value)} aria-label="Modèle" />
          </label>
          <label className="flex flex-col gap-1">Raisonnement
            <select className="rounded bg-tertiary p-2" value={reasoning} onChange={event => setReasoning(event.target.value as ReasoningLevel)}>
              <option value="low">Rapide</option><option value="medium">Équilibré</option><option value="high">Approfondi</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">Clé personnelle <span className="font-normal opacity-70">(facultative)</span>
            <input type="password" autoComplete="off" className="rounded bg-tertiary p-2" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="Sinon : clé gérée" aria-label="Clé API personnelle" />
          </label>
        </div>
        <div className="relative flex w-full rounded border border-stone-500/20 bg-tertiary shadow-xl">
          <textarea name="query" placeholder="Posez votre question — la recherche web est activée." ref={textAreaRef} className="flex max-h-[120px] w-full resize-none border-none bg-tertiary p-4 text-primary outline-none" onChange={event => setInput(event.target.value)} value={input} rows={1} />
          <button type="submit" className="rounded p-4 text-primary hover:bg-[#DC6521]" disabled={loading || !input.trim()} aria-label="Envoyer">
            {loading ? <div className="mx-auto h-5 w-5 animate-spin rounded-full border-b-2 border-white" /> : <MdSend />}
          </button>
        </div>
      </form>
    </div>
  );
}
