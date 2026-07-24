import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useState } from "react";
import { MdArrowBack, MdCheck, MdContentCopy, MdPlayArrow, MdStar, MdStarBorder, MdVisibilityOff } from "react-icons/md";
import { useAnthropic } from "../../context/AnthropicProvider";
import { getFavorites, toggleFavorite, getGivenRating, storeGivenRating } from "../../utils/favorites";
import { authHeaders } from "../../utils/account";
import { formatTokens } from "../../utils/formatTokens";

type Detail = {
  name: string; authorName: string; language: string; description: string;
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
      setCommentMessage("Merci ! Votre commentaire sera visible après modération.");
      loadComments();
    } else {
      const data = await response.json().catch(() => ({}));
      setCommentMessage(data?.error?.code === "ERR_RATE_LIMIT"
        ? "Trop de commentaires d'affilée — patientez une minute."
        : "Le commentaire n'a pas pu être envoyé.");
    }
  };

  const moderate = async (id: number, action: "approve" | "hide") => {
    setCommentMessage("");
    const response = await fetch(`/api/prompts/${encodeURIComponent(name)}/comments`, {
      method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ id, action }),
    });
    if (!response.ok) setCommentMessage("La modération a échoué (session expirée ?).");
    loadComments();
  };

  useEffect(() => {
    if (!name) return;
    setFavorites(getFavorites());
    setGivenRating(getGivenRating(name));
    fetch(`/api/prompts/${encodeURIComponent(name)}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => { setDetail(data.prompt); setVersions(data.versions ?? []); })
      .catch(() => setNotFound(true));
  }, [name]);

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
        <p>Ce tuteur n'existe pas ou n'est plus publié.</p>
        <Link href="/" className="mt-4 inline-block underline">Retour au catalogue</Link>
      </div>
    );
  }
  if (!detail) return <div className="py-16 text-center text-primary opacity-60">Chargement…</div>;

  const isFavorite = favorites.includes(detail.name);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 text-primary">
      <Head><title>{`${detail.name} — EduChat`}</title></Head>

      <nav className="pt-6 pb-4">
        <Link href="/" className="flex w-fit items-center gap-1 text-sm opacity-70 hover:opacity-100">
          <MdArrowBack /> Catalogue
        </Link>
      </nav>

      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <h1 className="text-3xl font-bold">{detail.name}</h1>
          <button onClick={() => setFavorites(toggleFavorite(detail.name))}
            aria-label={isFavorite ? "Retirer des favoris" : "Mettre en favori"}
            className="text-3xl text-yellow-400">
            {isFavorite ? <MdStar /> : <MdStarBorder />}
          </button>
        </div>
        <p className="opacity-80">{detail.description}</p>
        {/* Filiation : de qui ce tuteur s'inspire, et qui s'inspire de lui. */}
        {(detail.inspiredBy || (detail.variants?.length ?? 0) > 0) && (
          <div className="flex flex-col gap-1 rounded border border-white/10 bg-secondary p-2 text-xs">
            {detail.inspiredBy && (
              <span>🌱 Inspiré de{" "}
                <Link className="font-bold underline" href={`/p/${encodeURIComponent(detail.inspiredBy)}`}>
                  {detail.inspiredBy}
                </Link>
              </span>
            )}
            {(detail.variants?.length ?? 0) > 0 && (
              <span>🌿 A inspiré :{" "}
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
          <span>par {detail.authorName}</span>
          <span className="uppercase">{detail.language}</span>
          <span>version {detail.version}</span>
          <span>{detail.usageCount} usage{detail.usageCount > 1 ? "s" : ""}</span>
          <span>{formatTokens(detail.tokensTotal)} générés</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={() => { setPromptName(detail.name); router.push(`/chat?tuteur=${encodeURIComponent(detail.name)}`); }}
            className="flex items-center gap-1 rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90">
            <MdPlayArrow /> Essayer ce tuteur
          </button>
          <button onClick={share}
            className="flex items-center gap-1 rounded border border-white/20 px-4 py-2 text-sm hover:bg-tertiary">
            <MdContentCopy /> {copied ? "Lien copié !" : "Recommander (copier le lien)"}
          </button>
          <Link href={`/publier?variante=${encodeURIComponent(detail.name)}`}
            className="rounded border border-white/20 px-4 py-2 text-sm hover:bg-tertiary">
            Proposer une variante
          </Link>
        </div>

        <div className="flex items-center gap-2 pt-2 text-sm">
          <span className="opacity-70">
            {detail.ratingAvg !== null ? `Note : ${detail.ratingAvg}/5 (${detail.ratingCount} avis)` : "Pas encore noté —"}
          </span>
          <span className="flex" role="group" aria-label="Noter ce tuteur">
            {[1, 2, 3, 4, 5].map(star => (
              <button key={star} onClick={() => rate(star)} disabled={givenRating !== null}
                aria-label={`${star} étoile${star > 1 ? "s" : ""}`}
                className={`text-xl ${givenRating !== null && star <= givenRating ? "text-yellow-400" : "text-yellow-400/50 hover:text-yellow-400"} disabled:cursor-default`}>
                {givenRating !== null && star <= givenRating ? <MdStar /> : <MdStarBorder />}
              </button>
            ))}
          </span>
          {givenRating !== null && <span className="text-xs opacity-60">Merci pour votre avis !</span>}
        </div>
      </header>

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-bold">Le prompt système, en intégralité</h2>
        <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-secondary p-4 text-sm leading-relaxed">
          {detail.body}
        </pre>
      </section>

      {/* ---- Commentaires anonymes (modérés par l'auteur ou l'admin) ---- */}
      <section className="mt-8">
        <h2 className="mb-2 text-lg font-bold">Commentaires</h2>
        <p className="text-xs opacity-60">
          Les commentaires sont anonymes et publiés après modération
          {isModerator ? " — vous modérez cette fiche." : "."}
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {comments.length === 0 && (
            <li className="text-sm opacity-50">Aucun commentaire pour l'instant — le vôtre sera le premier.</li>
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
                      <button onClick={() => moderate(c.id, "approve")} title="Approuver (visible de tous)"
                        className="rounded bg-green-600/70 p-1 text-xs hover:bg-green-600"><MdCheck /></button>
                    )}
                    {c.status !== "hidden" && (
                      <button onClick={() => moderate(c.id, "hide")} title="Masquer (jamais supprimé)"
                        className="rounded bg-gray-600/70 p-1 text-xs hover:bg-gray-600"><MdVisibilityOff /></button>
                    )}
                  </span>
                )}
              </div>
              <div className="mt-1 flex gap-2 text-xs opacity-50">
                <span>{new Date(c.createdAt).toLocaleDateString("fr-CH")}</span>
                {isModerator && c.status && <span className="uppercase">{c.status === "pending" ? "en attente" : c.status === "hidden" ? "masqué" : "approuvé"}</span>}
              </div>
            </li>
          ))}
        </ul>
        <form onSubmit={postComment} className="mt-3 flex flex-col gap-2">
          <textarea value={newComment} onChange={e => setNewComment(e.target.value)} rows={3}
            maxLength={2000} placeholder="Votre commentaire anonyme (retour d'usage, suggestion...)"
            aria-label="Votre commentaire anonyme"
            className="rounded bg-tertiary p-3 text-sm outline-none" />
          <div className="flex items-center gap-3">
            <button type="submit" disabled={newComment.trim().length < 3}
              className="rounded bg-[#DC6521] px-4 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50">
              Envoyer (anonyme)
            </button>
            {commentMessage && <span className="text-xs opacity-70">{commentMessage}</span>}
          </div>
        </form>
      </section>

      {versions.length > 1 && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-bold">Versions</h2>
          <ul className="text-sm opacity-80">
            {versions.map(v => (
              <li key={v.version} className="border-b border-white/5 py-1">
                v{v.version} — {new Date(v.createdAt).toLocaleDateString("fr-CH")} — {(v.sizeBytes / 1024).toFixed(1)} Ko
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
