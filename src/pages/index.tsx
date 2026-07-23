import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useState } from "react";
import { MdSearch, MdStar, MdStarBorder, MdSchool, MdPlayArrow } from "react-icons/md";
import { useAnthropic } from "../context/AnthropicProvider";
import { getFavorites, toggleFavorite } from "../utils/favorites";
import { formatTokens } from "../utils/formatTokens";

type Card = {
  name: string; authorName: string; language: string; description: string;
  version: number; createdAt: number; updatedAt: number;
  usageCount: number; tokensTotal: number;
  ratingAvg: number | null; ratingCount: number;
};

const SORTS: Array<[string, string]> = [
  ["score", "Recommandés"],
  ["uses", "Les plus utilisés"],
  ["rating", "Les mieux notés"],
  ["recent", "Les plus récents"],
  ["tokens", "Tokens générés"],
  ["name", "Nom A → Z"],
];

// Accueil = LE catalogue des prompts socratiques (pivot v3) :
// le choix du tuteur est au centre de l'expérience.
export default function Catalogue() {
  const router = useRouter();
  const { setPromptName } = useAnthropic();
  const [cards, setCards] = useState<Card[]>([]);
  const [sort, setSort] = useState("score");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => setFavorites(getFavorites()), []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/prompts?sort=${sort}&q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(r => r.json())
        .then(data => { setCards(data.prompts ?? []); setLoading(false); })
        .catch(() => {});
    }, query ? 200 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [sort, query]);

  // Les favoris remontent en tête, dans l'ordre du tri courant.
  const ordered = useMemo(() => {
    const fav = cards.filter(c => favorites.includes(c.name));
    const rest = cards.filter(c => !favorites.includes(c.name));
    return [...fav, ...rest];
  }, [cards, favorites]);

  const tryPrompt = (name: string) => {
    setPromptName(name);
    router.push(name ? `/chat?tuteur=${encodeURIComponent(name)}` : "/chat");
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 text-primary">
      <Head><title>EduChat — Tuteurs socratiques</title></Head>

      <header className="flex flex-col gap-2 pt-10 pb-6 text-center">
        <h1 className="text-4xl font-bold">EduChat</h1>
        <p className="text-lg opacity-80">
          Des tuteurs socratiques pour apprendre en réfléchissant — jamais en recopiant.
        </p>
        <nav className="mt-2 flex flex-wrap items-center justify-center gap-3 text-sm">
          <button onClick={() => tryPrompt("")}
            className="rounded border border-white/20 px-4 py-2 hover:bg-tertiary">
            Chat libre (clé personnelle)
          </button>
          <Link href="/school"
            className="flex items-center gap-2 rounded border border-white/20 px-4 py-2 hover:bg-tertiary">
            <MdSchool /> Espace établissement
          </Link>
          <Link href="/publier"
            className="rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90">
            Proposer un tuteur
          </Link>
          <Link href="/rgpd" className="px-2 py-2 text-xs opacity-60 hover:opacity-100">
            Confidentialité
          </Link>
        </nav>
      </header>

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center">
        <label className="relative flex-grow">
          <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 opacity-60" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher un tuteur (nom, description...)"
            className="w-full rounded bg-tertiary py-2 pl-10 pr-3 outline-none"
            aria-label="Rechercher un tuteur"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="opacity-70">Trier :</span>
          <select value={sort} onChange={e => setSort(e.target.value)} className="rounded bg-tertiary p-2">
            {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="py-12 text-center opacity-60">Chargement du catalogue…</p>
      ) : ordered.length === 0 ? (
        <p className="py-12 text-center opacity-60">Aucun tuteur ne correspond à cette recherche.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {ordered.map(card => (
            <li key={card.name}
              className="flex flex-col gap-2 rounded-lg border border-white/10 bg-secondary p-4 shadow">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/p/${encodeURIComponent(card.name)}`}
                  className="text-xl font-bold hover:underline">{card.name}</Link>
                <button
                  onClick={() => setFavorites(toggleFavorite(card.name))}
                  aria-label={favorites.includes(card.name) ? "Retirer des favoris" : "Mettre en favori"}
                  className="text-2xl text-yellow-400"
                >
                  {favorites.includes(card.name) ? <MdStar /> : <MdStarBorder />}
                </button>
              </div>
              <p className="flex-grow text-sm opacity-80">{card.description}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs opacity-70">
                <span>par {card.authorName}</span>
                <span className="uppercase">{card.language}</span>
                <span>v{card.version}</span>
                <span>{card.usageCount} usage{card.usageCount > 1 ? "s" : ""}</span>
                <span>{formatTokens(card.tokensTotal)}</span>
                <span>{card.ratingAvg !== null ? `★ ${card.ratingAvg} (${card.ratingCount})` : "pas encore noté"}</span>
              </div>
              <div className="mt-1 flex gap-2">
                <button onClick={() => tryPrompt(card.name)}
                  className="flex items-center gap-1 rounded bg-[#DC6521] px-3 py-1.5 text-sm font-bold hover:opacity-90">
                  <MdPlayArrow /> Essayer
                </button>
                <Link href={`/p/${encodeURIComponent(card.name)}`}
                  className="rounded border border-white/20 px-3 py-1.5 text-sm hover:bg-tertiary">
                  Voir la fiche
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-12 text-center text-xs opacity-50">
        Les conversations restent dans votre navigateur. Seuls les prompts socratiques
        publiés et les compteurs anonymes vivent sur le serveur.
      </footer>
    </div>
  );
}
