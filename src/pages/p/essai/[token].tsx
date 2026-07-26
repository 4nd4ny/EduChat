import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import { MdContentCopy, MdPlayArrow, MdSend } from "react-icons/md";
import { authHeaders } from "../../../utils/account";
import { useT } from "../../../i18n/useT";
import type { TranslationKey } from "../../../i18n/dictionaries";

type Draft = {
  // « name » est l'IDENTITÉ du tuteur (adresse /p/nom, clé des favoris, jointure
  // de facturation) : il ne se traduit jamais et part tel quel au serveur.
  // « title », servi à côté par l'API, est le nom traduit — affichage seulement.
  name: string; title: string; authorName: string; language: string; description: string;
  body: string; status: string;
};

// Codes d'erreur du serveur → clés du dictionnaire. Les codes, eux, restent
// techniques : ils font partie du contrat de l'API et ne se traduisent pas.
// ERR_ARCHIVED existe déjà au dictionnaire commun des erreurs : on le réutilise.
const errorKeys: Record<string, TranslationKey> = {
  ERR_FORBIDDEN: "essai.err.forbidden",
  ERR_STATUS: "essai.err.status",
  ERR_ARCHIVED: "err.ERR_ARCHIVED",
  ERR_BODY_TOO_SHORT: "essai.err.bodyTooShort",
  ERR_BODY_TOO_LARGE: "essai.err.bodyTooLarge",
  ERR_QUOTA_USER: "essai.err.quotaUser",
};

// Atelier d'un prompt « en construction », accessible par URL secrète — non
// verrouillé : quiconque connaît le lien peut lire, tester et commenter de
// vive voix. L'édition et la soumission passent, elles, par les droits
// (jeton d'auteur ou share_token transmis avec la requête).
export default function EssaiPage() {
  const router = useRouter();
  const t = useT();
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
      const key = errorKeys[data?.error?.code];
      setError(key ? t(key) : t("essai.err.generic"));
      return null;
    }
    return data;
  };

  const save = async () => {
    const result = await patch({ action: "edit", body, description });
    if (result) setMessage(t("essai.msg.saved"));
  };

  const submit = async () => {
    const result = await patch({ action: "submit" });
    if (result) {
      setDraft({ ...draft!, status: "pending" });
      setMessage(t("essai.msg.submitted"));
    }
  };

  // Dépublier / republier : droits d'AUTEUR IDENTIFIÉ (jeton) — l'atelier est
  // l'endroit naturel pour piloter le cycle de vie de SON tuteur (rien n'est
  // jamais supprimé : la bascule est réversible).
  const retire = async () => {
    const result = await patch({ action: "retire" });
    if (result) {
      setDraft({ ...draft!, status: "retired" });
      setMessage(t("essai.msg.retired"));
    }
  };
  const republish = async () => {
    const result = await patch({ action: "republish" });
    if (result) {
      setDraft({ ...draft!, status: "published" });
      setMessage(t("essai.msg.republished"));
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
        <p>{t("essai.notFound")}</p>
        <Link href="/" className="mt-4 inline-block underline">{t("admin.denied.backCatalogue")}</Link>
      </div>
    );
  }
  if (!draft) return <div className="py-16 text-center text-primary opacity-60">{t("common.loading")}</div>;

  const editable = draft.status === "draft";
  // Nom affiché : la traduction si l'API en sert une, l'identité sinon.
  const affiche = draft.title || draft.name;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-16 text-primary">
      <Head><title>{`${t("essai.headTitle", { name: affiche })} — EduChat`}</title></Head>

      {/* Le mot en gras est un état du tuteur : il vient du vocabulaire commun
          des statuts, le reste de la phrase est propre à l'atelier. */}
      <div className="rounded border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
        {draft.status === "draft" && <>{t("essai.banner.draft.pre")} <b>{t("compte.prompts.status.draft")}</b> {t("essai.banner.draft.rest")}</>}
        {draft.status === "pending" && <>{t("essai.banner.pending.pre")} <b>{t("essai.banner.pending.strong")}</b>{t("essai.banner.pending.rest")}</>}
        {draft.status === "published" && <>{t("essai.banner.published.pre")} <b>{t("compte.prompts.status.published")}</b>{t("essai.banner.published.sep")} <Link className="underline" href={`/p/${encodeURIComponent(draft.name)}`}>{t("essai.banner.published.link")}</Link>.</>}
        {draft.status === "retired" && <>{t("essai.banner.retired.pre")} <b>{t("compte.prompts.status.retired")}</b> {t("essai.banner.retired.rest")}</>}
      </div>

      <h1 className="mt-4 text-3xl font-bold">{affiche}</h1>
      <p className="text-sm opacity-70">{t("home.by")} {draft.authorName || t("admin.anonymous")} · {draft.language.toUpperCase()}</p>

      {editable && (
        <p className="mt-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {t("essai.publishWarning.pre")} <b>{t("essai.publishWarning.strong")}</b> {t("essai.publishWarning.rest")}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => router.push(`/chat?essai=${encodeURIComponent(token)}`)}
          className="flex items-center gap-1 rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90">
          <MdPlayArrow /> {t("essai.action.test")}
        </button>
        <button onClick={share}
          className="flex items-center gap-1 rounded border border-white/20 px-4 py-2 text-sm hover:bg-tertiary">
          <MdContentCopy /> {copied ? t("essai.action.copied") : t("essai.action.copyLink")}
        </button>
        {editable && (
          <button onClick={submit} disabled={busy}
            title={t("essai.action.submitTitle")}
            className="flex items-center gap-1 rounded border border-green-500/50 px-4 py-2 text-sm hover:bg-green-500/10 disabled:opacity-50">
            <MdSend /> {t("essai.action.submit")}
          </button>
        )}
        {draft.status === "published" && (
          <button onClick={retire} disabled={busy}
            title={t("essai.action.retireTitle")}
            className="flex items-center gap-1 rounded border border-white/20 px-4 py-2 text-sm hover:bg-tertiary disabled:opacity-50">
            {t("compte.prompts.retire")}
          </button>
        )}
        {draft.status === "retired" && (
          <button onClick={republish} disabled={busy}
            title={t("essai.action.republishTitle")}
            className="flex items-center gap-1 rounded border border-green-500/50 px-4 py-2 text-sm hover:bg-green-500/10 disabled:opacity-50">
            {t("compte.prompts.republish")}
          </button>
        )}
      </div>

      {editable ? (
        <div className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">{t("essai.form.description")}
            <input value={description} onChange={e => setDescription(e.target.value)} maxLength={500}
              className="rounded bg-tertiary p-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">{t("essai.form.body")}
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={16}
              className="rounded bg-tertiary p-3 font-mono text-sm leading-relaxed" />
          </label>
          <button onClick={save} disabled={busy}
            className="w-fit rounded border border-white/20 px-4 py-2 text-sm hover:bg-tertiary disabled:opacity-50">
            {t("essai.form.save")}
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
