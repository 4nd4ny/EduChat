import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import { MdContentCopy, MdPlayArrow, MdSend } from "react-icons/md";
import { authHeaders } from "../../../utils/account";

type Draft = {
  name: string; authorName: string; language: string; description: string;
  body: string; status: string;
};

const errorLabels: Record<string, string> = {
  ERR_FORBIDDEN: "Vous n'avez pas les droits pour cette action (dépublier/republier demande le jeton d'auteur : identifiez-vous sur /verifier).",
  ERR_STATUS: "Ce prompt n'est plus dans un état permettant cette action.",
  ERR_ARCHIVED: "Ce prompt a été archivé par l'administration : il est figé.",
  ERR_BODY_TOO_SHORT: "Le prompt est trop court.",
  ERR_BODY_TOO_LARGE: "Le prompt dépasse 256 Ko.",
  ERR_QUOTA_USER: "Quota de 1 Mo atteint.",
};

// Atelier d'un prompt « en construction », accessible par URL secrète — non
// verrouillé : quiconque connaît le lien peut lire, tester et commenter de
// vive voix. L'édition et la soumission passent, elles, par les droits
// (jeton d'auteur ou share_token transmis avec la requête).
export default function EssaiPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : "";

  const [draft, setDraft] = useState<Draft | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [body, setBody] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/drafts/${encodeURIComponent(token)}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => {
        setDraft(data.prompt);
        setBody(data.prompt.body);
        setDescription(data.prompt.description);
      })
      .catch(() => setNotFound(true));
  }, [token]);

  const patch = async (payload: object) => {
    setBusy(true); setError(""); setMessage("");
    const response = await fetch(`/api/prompts/${encodeURIComponent(draft!.name)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ shareToken: token, ...payload }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(errorLabels[data?.error?.code] || "L'action a échoué.");
      return null;
    }
    return data;
  };

  const save = async () => {
    const result = await patch({ action: "edit", body, description });
    if (result) setMessage("Brouillon enregistré.");
  };

  const submit = async () => {
    const result = await patch({ action: "submit" });
    if (result) {
      setDraft({ ...draft!, status: "pending" });
      setMessage("Soumis ! Le tuteur paraîtra au catalogue après validation.");
    }
  };

  // Dépublier / republier : droits d'AUTEUR IDENTIFIÉ (jeton) — l'atelier est
  // l'endroit naturel pour piloter le cycle de vie de SON tuteur (rien n'est
  // jamais supprimé : la bascule est réversible).
  const retire = async () => {
    const result = await patch({ action: "retire" });
    if (result) {
      setDraft({ ...draft!, status: "retired" });
      setMessage("Dépublié — le tuteur n'apparaît plus au catalogue (republiable à tout moment).");
    }
  };
  const republish = async () => {
    const result = await patch({ action: "republish" });
    if (result) {
      setDraft({ ...draft!, status: "published" });
      setMessage("Republié — le tuteur est de retour au catalogue.");
    }
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* presse-papier indisponible */ }
  };

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-primary">
        <p>Ce lien d'essai n'existe pas (ou le prompt a été archivé par l'administration).</p>
        <Link href="/" className="mt-4 inline-block underline">Retour au catalogue</Link>
      </div>
    );
  }
  if (!draft) return <div className="py-16 text-center text-primary opacity-60">Chargement…</div>;

  const editable = draft.status === "draft";

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-16 text-primary">
      <Head><title>{`Essai : ${draft.name} — EduChat`}</title></Head>

      <div className="rounded border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
        {draft.status === "draft" && <>Prompt <b>en construction</b> — invisible au catalogue. Ce lien secret permet de le lire et de le tester : partagez-le à vos testeurs.</>}
        {draft.status === "pending" && <>Prompt <b>soumis</b>, en attente de validation.</>}
        {draft.status === "published" && <>Ce prompt est désormais <b>publié</b> : <Link className="underline" href={`/p/${encodeURIComponent(draft.name)}`}>voir sa fiche publique</Link>.</>}
        {draft.status === "retired" && <>Ce prompt a été <b>dépublié</b> — rien n'est supprimé, son auteur peut le republier ci-dessous.</>}
      </div>

      <h1 className="mt-4 text-3xl font-bold">{draft.name}</h1>
      <p className="text-sm opacity-70">par {draft.authorName || "Anonyme"} · {draft.language.toUpperCase()}</p>

      {editable && (
        <p className="mt-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Soumettre est le point de non-retour : une fois validé, ce tuteur appartient au
          <b> domaine public d'EduChat</b> et ne sera jamais supprimé. Il restera dépubliable
          (retrait du catalogue, réversible) ; ses compteurs de consommation, eux, sont conservés.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => router.push(`/chat?essai=${encodeURIComponent(token)}`)}
          className="flex items-center gap-1 rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90">
          <MdPlayArrow /> Tester dans le chat
        </button>
        <button onClick={share}
          className="flex items-center gap-1 rounded border border-white/20 px-4 py-2 text-sm hover:bg-tertiary">
          <MdContentCopy /> {copied ? "Lien copié !" : "Copier le lien d'invitation"}
        </button>
        {editable && (
          <button onClick={submit} disabled={busy}
            title="Après validation, le tuteur appartient au domaine public d'EduChat : il ne sera jamais supprimé, seulement dépubliable."
            className="flex items-center gap-1 rounded border border-green-500/50 px-4 py-2 text-sm hover:bg-green-500/10 disabled:opacity-50">
            <MdSend /> Soumettre pour publication
          </button>
        )}
        {draft.status === "published" && (
          <button onClick={retire} disabled={busy}
            title="Retirer du catalogue — réversible, rien n'est supprimé (jeton d'auteur requis)"
            className="flex items-center gap-1 rounded border border-white/20 px-4 py-2 text-sm hover:bg-tertiary disabled:opacity-50">
            Dépublier
          </button>
        )}
        {draft.status === "retired" && (
          <button onClick={republish} disabled={busy}
            title="Remettre au catalogue (jeton d'auteur requis)"
            className="flex items-center gap-1 rounded border border-green-500/50 px-4 py-2 text-sm hover:bg-green-500/10 disabled:opacity-50">
            Republier
          </button>
        )}
      </div>

      {editable ? (
        <div className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">Description
            <input value={description} onChange={e => setDescription(e.target.value)} maxLength={500}
              className="rounded bg-tertiary p-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">Prompt système
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={16}
              className="rounded bg-tertiary p-3 font-mono text-sm leading-relaxed" />
          </label>
          <button onClick={save} disabled={busy}
            className="w-fit rounded border border-white/20 px-4 py-2 text-sm hover:bg-tertiary disabled:opacity-50">
            Enregistrer les modifications
          </button>
        </div>
      ) : (
        <pre className="mt-6 whitespace-pre-wrap rounded-lg border border-white/10 bg-secondary p-4 text-sm leading-relaxed">
          {draft.body}
        </pre>
      )}

      {message && <p className="mt-4 text-sm text-green-400">{message}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
    </div>
  );
}
