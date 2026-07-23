import React, { useCallback } from "react";
import { MdSend } from "react-icons/md";
import { ProviderId, providerDefaults, ReasoningLevel, useAnthropic } from "../context/AnthropicProvider";
import { formatTokens } from "../utils/formatTokens";
import { useT } from "../i18n/useT";

export default function ChatInput() {
  const { loading, addMessage, provider, setProvider, model, setModel, apiKey, setApiKey, reasoning, setReasoning } = useAnthropic();
  const t = useT();
  const textAreaRef = React.useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = React.useState("");
  const [totalTokens, setTotalTokens] = React.useState(0);

  // Compteur de tokens : alimenté par AnthropicProvider après chaque réponse.
  React.useEffect(() => {
    const refresh = () => setTotalTokens(parseInt(localStorage.getItem("totalTokens") || "0", 10) || 0);
    refresh();
    window.addEventListener("totalTokensUpdated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("totalTokensUpdated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

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
          <label className="flex flex-col gap-1">{t("chat.input.provider")}
            <select className="rounded bg-tertiary p-2" value={provider} onChange={event => setProvider(event.target.value as ProviderId)}>
              {Object.entries(providerDefaults).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">{t("chat.input.model")}
            <input className="rounded bg-tertiary p-2" value={model} onChange={event => setModel(event.target.value)} aria-label={t("chat.input.model")} />
          </label>
          <label className="flex flex-col gap-1">{t("chat.input.reasoning")}
            <select className="rounded bg-tertiary p-2" value={reasoning} onChange={event => setReasoning(event.target.value as ReasoningLevel)}>
              <option value="low">{t("chat.input.reasoning.low")}</option><option value="medium">{t("chat.input.reasoning.medium")}</option><option value="high">{t("chat.input.reasoning.high")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">{t("chat.input.apiKey")} <span className="font-normal opacity-70">{t("chat.input.apiKeyOptional")}</span>
            <input type="password" autoComplete="off" className="rounded bg-tertiary p-2" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={t("chat.input.apiKeyPlaceholder")} aria-label={t("chat.input.apiKey")} />
          </label>
        </div>
        {totalTokens > 0 && (
          <div className="text-right text-xs text-primary opacity-60" title={t("chat.input.consumed")}>
            {formatTokens(totalTokens)} {t("chat.input.consumed")}
          </div>
        )}
        <div className="relative flex w-full rounded border border-stone-500/20 bg-tertiary shadow-xl">
          <textarea name="query" placeholder={t("chat.input.ask")} ref={textAreaRef} className="flex max-h-[120px] w-full resize-none border-none bg-tertiary p-4 text-primary outline-none" onChange={event => setInput(event.target.value)} value={input} rows={1} />
          <button type="submit" className="rounded p-4 text-primary hover:bg-[#DC6521]" disabled={loading || !input.trim()} aria-label={t("chat.input.send")}>
            {loading ? <div className="mx-auto h-5 w-5 animate-spin rounded-full border-b-2 border-white" /> : <MdSend />}
          </button>
        </div>
      </form>
    </div>
  );
}
