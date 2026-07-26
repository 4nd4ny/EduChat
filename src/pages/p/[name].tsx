import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useState } from "react";
import { MdCheck, MdContentCopy, MdPlayArrow, MdStar, MdStarBorder, MdVisibilityOff } from "react-icons/md";
import { useAnthropic } from "../../context/AnthropicProvider";
import { getFavorites, toggleFavorite, getGivenRating, storeGivenRating } from "../../utils/favorites";
import { authHeaders } from "../../utils/account";
import { formatTokens } from "../../utils/formatTokens";
import { useT } from "../../i18n/useT";

type Detail = {
  // « name » est l'identité (URL, favoris, facturation) ; « title » est ce
  // qu'on montre, et il suit la langue du lecteur.
  name: string; title: string; authorName: string; language: string; description: string;
  version: number; createdAt: number; updatedAt: number;
  usageCount: number; tokensTotal: number;
  ratingAvg: number | null; ratingCount: number; body: string;
  inspiredBy: string | null; variants: string[];
};
type Version = { version: number; createdAt: number; sizeBytes: number };
type Comment = { id: number; body: string; createdAt: number; status?: "pending" | "approved" | "hidden" };

// Fiche publique d'un prompt socratique : le texte est INTÉGRALEMENT lisible
// (décision client — esprit open source, l'école est gratuite).
export default function PromptPage() {
  const router = useRouter();
  const t = useT();
  const locale = router.locale ?? "fr";
  const { setPromptName } = useAnthropic();
  const name = typeof router.query.name === "string" ? router.query.name : "";

  const [detail, setDetail] = useState<Detail | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [givenRating, setGivenRating] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  // Commentaires anonymes : approuvés pour tous ; l'auteur du tuteur et
  // l'admin voient aussi les « en attente » et modèrent.
  const [comments, setComments] = useState<Comment[]>([]);
  const [isModerator, setIsModerator] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [commentMessage, setCommentMessage] = useState("");

  const loadComments = useCallback(() => {
    if (!name) return;
    fetch(`/api/prompts/${encodeURIComponent(name)}/comments`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => { setComments(data.comments ?? []); setIsModerator(!!data.moderator); })
      .catch(() => {});
  }, [name]);
  useEffect(() => { loadComments(); }, [loadComments]);

  const postComment = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = newComment.trim();
    if (body.length < 3) return;
    setCommentMessage("");
    const response = await fetch(`/api/prompts/${encodeURIComponent(name)}/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (response.ok) {
      setNewComment("");
      setCommentMessage(t("prompt.comment.thanks"));
      loadComments();
    } else {
      // Le code d'erreur reste technique (contrat serveur) ; seul le message
      // montré au lecteur passe par le dictionnaire.
      const data = await response.json().catch(() => ({}));
      setCommentMessage(data?.error?.code === "ERR_RATE_LIMIT"
        ? t("prompt.comment.rateLimit")
        : t("prompt.comment.failed"));
    }
  };

  const moderate = async (id: number, action: "approve" | "hide") => {
    setCommentMessage("");
    const response = await fetch(`/api/prompts/${encodeURIComponent(name)}/comments`, {
      method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ id, action }),
    });
    if (!response.ok) setCommentMessage(t("prompt.comment.moderationFailed"));
    loadComments();
  };

  useEffect(() => {
    if (!name) return;
    setFavorites(getFavorites());
    setGivenRating(getGivenRating(name));
    fetch(`/api/prompts/${encodeURIComponent(name)}?locale=${locale}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => { setDetail(data.prompt); setVersions(data.versions ?? []); })
      .catch(() => setNotFound(true));
    // « locale » fait partie des dépendances : le sélecteur de langue navigue
    // côté client (router.push avec { locale }), sans remonter la page. Sans
    // cette dépendance, le titre, la description et le texte du tuteur
    // resteraient dans la langue du premier chargement.
  }, [name, locale]);

  const rate = async (stars: number) => {
    if (!detail || givenRating !== null) return;
    const response = await fetch(`/api/prompts/${encodeURIComponent(name)}/rate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stars }),
    });
    if (response.ok) {
      const data = await response.json();
      storeGivenRating(name, stars);
      setGivenRating(stars);
      setDetail({ ...detail, ratingAvg: data.ratingAvg, ratingCount: data.ratingCount });
    }
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/p/${encodeURIComponent(name)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* presse-papier indisponible */ }
  };

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-primary">
        {/* Même phrase que le code d'erreur serveur : on réutilise sa clé.
            Le lien de retour réutilise lui aussi une clé existante — c'est déjà
            ce que fait la page d'essai voisine pour le même lien. */}
        <p>{t("err.ERR_PROMPT_UNKNOWN")}</p>
        <Link href="/" className="mt-4 inline-block underline">{t("admin.denied.backCatalogue")}</Link>
      </div>
    );
  }
  if (!detail) return <div className="py-16 text-center text-primary opacity-60">{t("common.loading")}</div>;

  const isFavorite = favorites.includes(detail.name);
  // L'auteur. Le serveur renvoie une chaîne vide quand le tuteur a été proposé
  // sans compte, ou que le compte n'a pas renseigné de nom : c'est l'interface
  // qui nomme l'absence, dans la langue de la page.
  const auteur = detail.authorName
    ? detail.authorName
    : t("admin.anonymous");

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-16 text-primary">
      <Head><title>{`${detail.title || detail.name} — EduChat`}</title></Head>


      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <h1 className="text-3xl font-bold">{detail.title || detail.name}</h1>
          <button onClick={() => setFavorites(toggleFavorite(detail.name))}
            aria-label={t(isFavorite ? "home.favRemove" : "home.favAdd")}
            className="text-3xl text-yellow-400">
            {isFavorite ? <MdStar /> : <MdStarBorder />}
          </button>
        </div>
        <p className="opacity-80">{detail.description}</p>
        {/* Filiation : de qui ce tuteur s'inspire, et qui s'inspire de lui. */}
        {(detail.inspiredBy || (detail.variants?.length ?? 0) > 0) && (
          <div className="flex flex-col gap-1 rounded border border-white/10 bg-secondary p-2 text-xs">
            {detail.inspiredBy && (
              <span>🌱 {t("prompt.inspiredBy")}{" "}
                <Link className="font-bold underline" href={`/p/${encodeURIComponent(detail.inspiredBy)}`}>
                  {detail.inspiredBy}
                </Link>
              </span>
            )}
            {(detail.variants?.length ?? 0) > 0 && (
              <span>🌿 {t("prompt.hasInspired")}{" "}
                {detail.variants.map((v, i) => (
                  <React.Fragment key={v}>
                    {i > 0 && ", "}
                    <Link className="font-bold underline" href={`/p/${encodeURIComponent(v)}`}>{v}</Link>
                  </React.Fragment>
                ))}
              </span>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-70">
          <span>{t("home.by")} {auteur}</span>
          <span className="uppercase">{detail.language}</span>
          <span>{t("prompt.version", { n: detail.version })}</span>
          {/* Pas de machinerie de pluriel dans useT : deux clés, comme stats.prompt/prompts. */}
          <span>{t(detail.usageCount > 1 ? "prompt.usages" : "prompt.usage", { n: detail.usageCount })}</span>
          <span>{formatTokens(detail.tokensTotal)} {t("stats.tokens")}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={() => { setPromptName(detail.name); router.push(`/chat?tuteur=${encodeURIComponent(detail.name)}`); }}
            className="flex items-center gap-1 rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90">
            <MdPlayArrow /> {t("prompt.try")}
          </button>
          <button onClick={share}
            className="flex items-center gap-1 rounded border border-white/20 px-4 py-2 text-sm hover:bg-tertiary">
            <MdContentCopy /> {copied ? t("prompt.linkCopied") : t("prompt.recommend")}
          </button>
          <Link href={`/publier?variante=${encodeURIComponent(detail.name)}`}
            className="rounded border border-white/20 px-4 py-2 text-sm hover:bg-tertiary">
            {t("prompt.variant")}
          </Link>
        </div>

        <div className="flex items-center gap-2 pt-2 text-sm">
          <span className="opacity-70">
            {detail.ratingAvg !== null
              ? t("prompt.rating", { avg: detail.ratingAvg, n: detail.ratingCount })
              : t("prompt.notRated")}
          </span>
          <span className="flex" role="group" aria-label={t("prompt.rateAria")}>
            {[1, 2, 3, 4, 5].map(star => (
              <button key={star} onClick={() => rate(star)} disabled={givenRating !== null}
                aria-label={t(star > 1 ? "prompt.stars" : "prompt.star", { n: star })}
                className={`text-xl ${givenRating !== null && star <= givenRating ? "text-yellow-400" : "text-yellow-400/50 hover:text-yellow-400"} disabled:cursor-default`}>
                {givenRating !== null && star <= givenRating ? <MdStar /> : <MdStarBorder />}
              </button>
            ))}
          </span>
          {givenRating !== null && <span className="text-xs opacity-60">{t("prompt.rateThanks")}</span>}
        </div>
      </header>

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-bold">{t("prompt.bodyHeading")}</h2>
        <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-secondary p-4 text-sm leading-relaxed">
          {detail.body}
        </pre>
      </section>

      {/* ---- Commentaires anonymes (modérés par l'auteur ou l'admin) ---- */}
      <section className="mt-8">
        <h2 className="mb-2 text-lg font-bold">{t("prompt.comments")}</h2>
        {/* Deux phrases entières plutôt qu'une concaténation : la ponctuation
            finale ne se recolle pas de la même façon d'une langue à l'autre. */}
        <p className="text-xs opacity-60">
          {t(isModerator ? "prompt.comment.introModerator" : "prompt.comment.intro")}
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {comments.length === 0 && (
            <li className="text-sm opacity-50">{t("prompt.comment.empty")}</li>
          )}
          {comments.map(c => (
            <li key={c.id}
              className={`rounded border p-3 text-sm ${c.status === "pending" ? "border-yellow-500/40 bg-yellow-500/5"
                : c.status === "hidden" ? "border-white/10 opacity-40" : "border-white/10 bg-secondary"}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-wrap">{c.body}</p>
                {isModerator && c.status && (
                  <span className="flex shrink-0 items-center gap-1">
                    {c.status !== "approved" && (
                      <button onClick={() => moderate(c.id, "approve")} title={t("prompt.comment.approveTitle")}
                        className="rounded bg-green-600/70 p-1 text-xs hover:bg-green-600"><MdCheck /></button>
                    )}
                    {c.status !== "hidden" && (
                      <button onClick={() => moderate(c.id, "hide")} title={t("prompt.comment.hideTitle")}
                        className="rounded bg-gray-600/70 p-1 text-xs hover:bg-gray-600"><MdVisibilityOff /></button>
                    )}
                  </span>
                )}
              </div>
              <div className="mt-1 flex gap-2 text-xs opacity-50">
                <span>{new Date(c.createdAt).toLocaleDateString("fr-CH")}</span>
                {/* « approuvé » et « masqué » existent déjà pour la table de
                    modération de l'administration : mêmes mots, mêmes états, on
                    ne recrée pas la paire. Seul « en attente » manquait. */}
                {isModerator && c.status && (
                  <span className="uppercase">
                    {t(c.status === "pending" ? "prompt.comment.statusPending"
                      : c.status === "hidden" ? "admin.comments.hidden"
                        : "admin.comments.approved")}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
        <form onSubmit={postComment} className="mt-3 flex flex-col gap-2">
          <textarea value={newComment} onChange={e => setNewComment(e.target.value)} rows={3}
            maxLength={2000} placeholder={t("prompt.comment.placeholder")}
            aria-label={t("prompt.comment.aria")}
            className="rounded bg-tertiary p-3 text-sm outline-none" />
          <div className="flex items-center gap-3">
            <button type="submit" disabled={newComment.trim().length < 3}
              className="rounded bg-[#DC6521] px-4 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50">
              {t("prompt.comment.send")}
            </button>
            {commentMessage && <span className="text-xs opacity-70">{commentMessage}</span>}
          </div>
        </form>
      </section>

      {versions.length > 1 && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-bold">{t("prompt.versions")}</h2>
          <ul className="text-sm opacity-80">
            {versions.map(v => (
              <li key={v.version} className="border-b border-white/5 py-1">
                {/* La date reste au format fr-CH, comme partout ailleurs sur le site ;
                    seule l'unité de taille change de langue. */}
                {t("prompt.versionLine", {
                  v: v.version,
                  date: new Date(v.createdAt).toLocaleDateString("fr-CH"),
                  size: (v.sizeBytes / 1024).toFixed(1),
                })}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
