import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import { MdArrowBack, MdContentCopy, MdPlayArrow, MdStar, MdStarBorder } from "react-icons/md";
import { useAnthropic } from "../../context/AnthropicProvider";
import { getFavorites, toggleFavorite, getGivenRating, storeGivenRating } from "../../utils/favorites";
import { formatTokens } from "../../utils/formatTokens";

type Detail = {
  name: string; authorName: string; language: string; description: string;
  version: number; createdAt: number; updatedAt: number;
  usageCount: number; tokensTotal: number;
  ratingAvg: number | null; ratingCount: number; body: string;
};
type Version = { version: number; createdAt: number; sizeBytes: number };

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
