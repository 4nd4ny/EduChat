import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useState } from "react";
import {
  MdSearch, MdStar, MdStarBorder, MdPlayArrow, MdChatBubbleOutline,
  MdAddCircleOutline, MdSchool, MdSettings, MdCompareArrows,
} from "react-icons/md";
import { useAnthropic } from "../context/AnthropicProvider";
import { getFavorites, toggleFavorite } from "../utils/favorites";
import { formatTokens } from "../utils/formatTokens";
import { useT } from "../i18n/useT";
import type { TranslationKey } from "../i18n/dictionaries";
import DemoChat from "../chat/DemoChat";
import SiteStats from "../site/SiteStats";

type Card = {
  name: string;
  title: string;
  translated: boolean; authorName: string; language: string; description: string;
  version: number; createdAt: number; updatedAt: number;
  usageCount: number; tokensTotal: number;
  ratingAvg: number | null; ratingCount: number;
};

const SORT_KEYS = ["score", "uses", "rating", "recent", "tokens", "name"] as const;

// UNE seule ligne de navigation, par PROFIL : chaque case ouvre directement
// l'espace de travail correspondant. Les services transverses (langue,
// confidentialité, guide, compte) vivent désormais dans la barre du haut,
// commune à tout le site.
type ProfileId = "learner" | "teacher" | "school" | "promptagogue";

const PROFILES: Array<{
  id: ProfileId;
  labelKey: TranslationKey;
  actionKey: TranslationKey;
  href: string;
  icon: React.ReactNode;
}> = [
  { id: "learner", labelKey: "nav.learner", actionKey: "nav.freeChat", href: "/chat", icon: <MdChatBubbleOutline /> },
  { id: "teacher", labelKey: "nav.teacher", actionKey: "nav.session", href: "/session", icon: <MdSchool /> },
  { id: "school", labelKey: "nav.school", actionKey: "nav.settings", href: "/etablissement", icon: <MdSettings /> },
  { id: "promptagogue", labelKey: "nav.promptagogue", actionKey: "nav.duel", href: "/duel", icon: <MdCompareArrows /> },
];

// Toutes les cases partagent la même géométrie : la grille impose la largeur,
// cette classe la hauteur et le centrage. `min-w-0 break-words` est
// indispensable : sans lui, un mot long non sécable (« Sitzungsverwaltung »)
// déborderait de sa case sur les petits écrans.
const CELL = "flex h-full min-h-[3.5rem] w-full min-w-0 flex-col items-center justify-center gap-0.5 break-words rounded border border-white/20 px-3 py-2 text-center leading-tight transition hover:border-[#DC6521]/60 hover:bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC6521]";

// Barre de recherche, bouton « Proposer » et liste de tri : même fond et
// surtout même HAUTEUR imposée. Sans elle, chacun se dimensionnerait sur sa
// propre police (17,6 px pour la recherche, 14 px pour les deux autres) et
// la ligne paraîtrait bancale.
const FIELD = "h-10 rounded bg-tertiary";

// Accueil = LE catalogue des prompts socratiques (pivot v3) :
// le choix du tuteur est au centre de l'expérience.
export default function Catalogue() {
  const router = useRouter();
  const t = useT();
  const locale = router.locale ?? "fr";
  const { setPromptName } = useAnthropic();
  const [cards, setCards] = useState<Card[]>([]);
  const [sort, setSort] = useState("score");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  // Tuteur ouvert en démo inline (null = fermé). « Essayer » ouvre la démo.
  const [demo, setDemo] = useState<string | null>(null);
  const demoRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => setFavorites(getFavorites()), []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/prompts?sort=${sort}&q=${encodeURIComponent(query)}&locale=${locale}`, { signal: controller.signal })
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

  // « Utiliser » (et « Chat libre ») : ouvre le vrai chat, avec réglages et historique.
  const usePrompt = (name: string) => {
    setPromptName(name);
    router.push(name ? `/chat?tuteur=${encodeURIComponent(name)}` : "/chat");
  };

  // « Essayer » : ouvre la démo inline sous l'en-tête et y fait défiler.
  const openDemo = (name: string) => {
    setDemo(name);
    requestAnimationFrame(() => demoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 text-primary">
      <Head><title>{t("home.headTitle")}</title></Head>

      <header className="flex flex-col items-center gap-3 pt-8 pb-6 text-center">
        <h1 className="text-4xl font-bold">EduChat</h1>
        <p className="text-lg opacity-80">{t("home.tagline")}</p>

        {/* Une ligne, quatre profils : chaque case EST l'entrée de son espace
            de travail (le libellé secondaire annonce ce qui va s'ouvrir). */}
        <nav className="mt-2 grid w-full max-w-3xl grid-cols-2 gap-2 text-sm md:grid-cols-4">
          {PROFILES.map(item => item.id === "learner" ? (
            // Le chat libre remet le tuteur à zéro : c'est une action, pas un lien.
            <button key={item.id} onClick={() => usePrompt("")} className={CELL}>
              <span className="flex items-center gap-1.5 font-semibold">{item.icon} {t(item.labelKey)}</span>
              <span className="text-[11px] opacity-60">{t(item.actionKey)}</span>
            </button>
          ) : (
            <Link key={item.id} href={item.href} className={CELL}>
              <span className="flex items-center gap-1.5 font-semibold">{item.icon} {t(item.labelKey)}</span>
              <span className="text-[11px] opacity-60">{t(item.actionKey)}</span>
            </Link>
          ))}
        </nav>
      </header>

      {/* Démo inline : « Essayer » un tuteur ouvre ce panneau ici même. */}
      <div ref={demoRef} className="scroll-mt-4">
        {demo && <DemoChat promptName={demo}
          titre={ordered.find(c => c.name === demo)?.title}
          onClose={() => setDemo(null)} />}
      </div>

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center">
        <label className="relative flex-grow">
          <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 opacity-60" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t("home.search")}
            className={`${FIELD} w-full pl-10 pr-3 outline-none`}
            aria-label={t("home.search")}
          />
        </label>
        <Link href="/publier"
          className={`${FIELD} flex items-center justify-center gap-2 px-4 text-sm hover:opacity-80`}>
          <MdAddCircleOutline /> {t("home.propose")}
        </Link>
        <label className="flex items-center gap-2 text-sm">
          <span className="opacity-70">{t("home.sort")}</span>
          <select value={sort} onChange={e => setSort(e.target.value)} className={`${FIELD} px-2`}>
            {SORT_KEYS.map(value => <option key={value} value={value}>{t(`home.sort.${value}` as TranslationKey)}</option>)}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="py-12 text-center opacity-60">{t("common.loading")}</p>
      ) : ordered.length === 0 ? (
        <p className="py-12 text-center opacity-60">{t("home.empty")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {ordered.map(card => (
            <li key={card.name}
              className="flex flex-col gap-2 rounded-lg border border-white/10 bg-secondary p-4 shadow">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/p/${encodeURIComponent(card.name)}`}
                  className="text-xl font-bold hover:underline">{card.title}</Link>
                <button
                  onClick={() => setFavorites(toggleFavorite(card.name))}
                  aria-label={favorites.includes(card.name) ? t("home.favRemove") : t("home.favAdd")}
                  className="text-2xl text-yellow-400"
                >
                  {favorites.includes(card.name) ? <MdStar /> : <MdStarBorder />}
                </button>
              </div>
              <p className="flex-grow text-sm opacity-80">{card.description}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs opacity-70">
                <span>{t("home.by")} {card.authorName}</span>
                <span className="uppercase">{card.language}</span>
                <span>v{card.version}</span>
                <span>{card.usageCount} {t("home.uses")}</span>
                <span>{formatTokens(card.tokensTotal)}</span>
                <span>{card.ratingAvg !== null ? `★ ${card.ratingAvg} (${card.ratingCount})` : t("home.notRated")}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-2">
                <button onClick={() => openDemo(card.name)}
                  className="flex items-center gap-1 rounded bg-[#DC6521] px-3 py-1.5 text-sm font-bold hover:opacity-90">
                  <MdPlayArrow /> {t("home.try")}
                </button>
                <button onClick={() => usePrompt(card.name)}
                  className="flex items-center gap-1 rounded border border-white/20 px-3 py-1.5 text-sm hover:bg-tertiary">
                  <MdChatBubbleOutline /> {t("home.use")}
                </button>
                <Link href={`/p/${encodeURIComponent(card.name)}`}
                  className="rounded border border-white/20 px-3 py-1.5 text-sm hover:bg-tertiary">
                  {t("home.view")}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* La fréquentation du site, épinglée en bas de la fenêtre. */}
      <SiteStats />
    </div>
  );
}
