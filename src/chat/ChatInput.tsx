import React, { useCallback } from "react";
import { MdAttachFile, MdClose, MdSend } from "react-icons/md";
import { PendingAttachment, providerDefaults, useAnthropic } from "../context/AnthropicProvider";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from "../shared/providers";
import { formatTokens } from "../utils/formatTokens";
import { useT } from "../i18n/useT";
import VoiceControls from "./VoiceControls";

// Zone de saisie seule : les réglages de conversation (fournisseur, modèle,
// raisonnement, clé) vivent maintenant dans la barre du haut.
export default function ChatInput() {
  const { loading, addMessage, provider, hasUsableKey } = useAnthropic();
  const t = useT();
  const textAreaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [input, setInput] = React.useState("");
  const [totalTokens, setTotalTokens] = React.useState(0);
  // Pièces jointes en attente (base64 en mémoire seulement, jamais persistées).
  const [attachments, setAttachments] = React.useState<PendingAttachment[]>([]);
  const [attachError, setAttachError] = React.useState("");

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

  // Upload réservé à la clé PERSONNELLE + fournisseurs compatibles (le serveur
  // refait la même vérification — ceci n'est que le confort d'interface).
  // « Clé utilisable » = saisie dans la page OU mémorisée pour ce compte :
  // sans cela, ces boutons disparaîtraient pour ceux qui ont justement
  // demandé à ne plus retaper leur clé.
  const caps = providerDefaults[provider] ?? {};
  const canAttach = hasUsableKey && (!!caps.images || !!caps.pdf);
  // Chat vocal : clé perso + fournisseur doté d'une API de transcription.
  const canVoice = hasUsableKey && !!caps.voice;
  const acceptTypes = [
    ...(caps.images ? ["image/png", "image/jpeg", "image/webp", "image/gif"] : []),
    ...(caps.pdf ? ["application/pdf"] : []),
  ].join(",");

  // Changement de fournisseur ou clé retirée : purge des pièces incompatibles.
  React.useEffect(() => {
    if (!canAttach) { setAttachments([]); return; }
    setAttachments(previous => previous.filter(a =>
      a.kind === "image" ? !!caps.images : !!caps.pdf));
  }, [provider, canAttach]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFiles = useCallback(async (list: FileList | null) => {
    if (!list?.length) return;
    setAttachError("");
    const next = [...attachments];
    for (const file of Array.from(list)) {
      const kind = file.type === "application/pdf" ? "pdf" as const
        : file.type.startsWith("image/") ? "image" as const : null;
      if (!kind || (kind === "image" && !caps.images) || (kind === "pdf" && !caps.pdf)) {
        setAttachError(t("chat.input.attach.badType")); continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) { setAttachError(t("chat.input.attach.tooBig")); continue; }
      if (next.length >= MAX_ATTACHMENTS) { setAttachError(t("chat.input.attach.tooMany")); break; }
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      }).catch(() => "");
      if (!data) { setAttachError(t("chat.input.attach.readError")); continue; }
      next.push({ kind, mediaType: file.type, name: file.name, data });
    }
    setAttachments(next.slice(0, MAX_ATTACHMENTS));
  }, [attachments, caps.images, caps.pdf, t]);

  const handleSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    if (loading || !input.trim()) return;
    addMessage(input, true, "user", attachments.length ? attachments : undefined);
    setInput(""); setAttachments([]); setAttachError("");
  }, [loading, input, addMessage, attachments]);

  React.useEffect(() => {
    if (!textAreaRef.current) return;
    textAreaRef.current.style.height = "40px";
    textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
  }, [input]);

  return (
    <div className="fixed bottom-0 flex h-[10rem] w-full bg-gradient-to-t from-[rgb(var(--bg-secondary))] to-transparent xl:w-[calc(100%-320px)]">
      <form className="mx-auto flex h-full w-full max-w-6xl flex-col justify-end gap-2 p-4 pb-6" onSubmit={handleSubmit}>
        <div data-tour="composer" className="relative flex w-full rounded border border-stone-500/20 bg-tertiary shadow-xl">
          <textarea name="query" placeholder={t("chat.input.ask")} ref={textAreaRef} className="flex max-h-[120px] w-full resize-none border-none bg-tertiary p-4 text-primary outline-none" onChange={event => setInput(event.target.value)} value={input} rows={1} />
          {canAttach && (
            <>
              <input ref={fileInputRef} type="file" multiple accept={acceptTypes} className="hidden"
                onChange={event => { void handleFiles(event.target.files); event.target.value = ""; }} />
              <button type="button" data-tour="attach" onClick={() => fileInputRef.current?.click()}
                title={t("chat.input.attach.title")} aria-label={t("chat.input.attach.title")}
                className="rounded p-4 text-primary hover:bg-[#DC6521]">
                <MdAttachFile />
              </button>
            </>
          )}
          {canVoice && (
            <VoiceControls onDictation={text =>
              setInput(previous => (previous.trim() ? `${previous.trim()} ${text}` : text))} />
          )}
          <button type="submit" data-tour="send" className="rounded p-4 text-primary hover:bg-[#DC6521]" disabled={loading || !input.trim()} aria-label={t("chat.input.send")}>
            {loading ? <div className="mx-auto h-5 w-5 animate-spin rounded-full border-b-2 border-white" /> : <MdSend />}
          </button>
        </div>

        {/* Les pièces jointes en attente restent collées à la zone de saisie. */}
        {(attachments.length > 0 || attachError) && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {attachments.map((a, index) => (
              <span key={`${a.name}-${index}`} className="flex items-center gap-1 rounded bg-tertiary px-2 py-1 text-primary">
                <MdAttachFile className="opacity-60" />
                <span className="max-w-[10rem] truncate">{a.name}</span>
                <button type="button" aria-label={t("chat.input.attach.remove")}
                  onClick={() => setAttachments(previous => previous.filter((_, i) => i !== index))}
                  className="opacity-60 hover:opacity-100"><MdClose /></button>
              </span>
            ))}
            {attachError && <span role="alert" className="text-red-400">{attachError}</span>}
          </div>
        )}

        {totalTokens > 0 && (
          <div data-tour="tokens" className="text-right text-xs text-primary opacity-60" title={t("chat.input.consumed")}>
            {formatTokens(totalTokens)} {t("chat.input.consumed")}
          </div>
        )}
      </form>
    </div>
  );
}
