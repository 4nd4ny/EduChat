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
import LanguageSwitcher from "../i18n/LanguageSwitcher";
import DemoChat from "../chat/DemoChat";
import SiteStats from "../site/SiteStats";

type Card = {
  name: string; authorName: string; language: string; description: string;
  version: number; createdAt: number; updatedAt: number;
  usageCount: number; tokensTotal: number;
  ratingAvg: number | null; ratingCount: number;
};

const SORT_KEYS = ["score", "uses", "rating", "recent", "tokens", "name"] as const;

// La navigation est organisée PAR PROFIL (ligne 1). Le profil choisi décide
// du raccourci métier proposé en ligne 2 ; les trois entrées de service
// (compte, confidentialité, guide) y sont toujours présentes, et les langues
// occupent la ligne 3. Tant qu'aucun profil n'est choisi, la place du
// raccourci sert à expliquer que le compte est facultatif.
type ProfileId = "learner" | "teacher" | "school" | "promptagogue";

const PROFILES: Array<{
  id: ProfileId;
  labelKey: TranslationKey;
  actionKey: TranslationKey;
  href: string;
  icon: React.ReactNode;
}> = [
  { id: "learner", labelKey: "nav.learner", actionKey: "nav.freeChat", href: "/chat", icon: <MdChatBubbleOutline /> },
  // ?session=1 : ouvre les RÉGLAGES de session (tuteur déployé sur la classe)
  // même quand le site est déjà déverrouillé — sans quoi l'enseignant ne
  // pouvait plus y revenir de toute la durée du verrou.
  { id: "teacher", labelKey: "nav.teacher", actionKey: "nav.session", href: "/school?session=1", icon: <MdSchool /> },
  { id: "school", labelKey: "nav.school", actionKey: "nav.settings", href: "/etablissement", icon: <MdSettings /> },
  { id: "promptagogue", labelKey: "nav.promptagogue", actionKey: "nav.duel", href: "/duel", icon: <MdCompareArrows /> },
];

const PROFILE_STORAGE_KEY = "educhat-profile";

// Toutes les cases des lignes 1 et 2 partagent exactement la même géométrie :
// la grille impose la largeur, cette classe impose la hauteur et le centrage.
// `min-w-0 break-words` est indispensable : sans lui, un mot long non
// sécable (« Sitzungsverwaltung ») déborderait de sa case et chevaucherait
// la voisine sur les petits écrans.
const CELL = "flex h-full min-h-[2.5rem] w-full min-w-0 items-center justify-center gap-1.5 break-words rounded px-3 py-2 text-center leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC6521]";
const CELL_PLAIN = `${CELL} border border-white/20 hover:bg-tertiary`;
// Sur l'orange de marque, seul un texte SOMBRE atteint le contraste AA
// (4,5:1) ; du blanc n'y serait qu'à 3,5:1.
const CELL_SELECTED = `${CELL} bg-[#DC6521] font-bold text-[#111827]`;
const CELL_ACTION = `${CELL} border border-[#DC6521]/60 bg-[#DC6521]/10 font-semibold hover:bg-[#DC6521]/20`;

// Accueil = LE catalogue des prompts socratiques (pivot v3) :
// le choix du tuteur est au centre de l'expérience.
export default function Catalogue() {
  const router = useRouter();
  const t = useT();
  const { setPromptName } = useAnthropic();
  const [cards, setCards] = useState<Card[]>([]);
  const [sort, setSort] = useState("score");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  // Profil sélectionné en ligne 1 (null = aucun). Lu APRÈS le montage : le
  // rendu serveur ne connaît pas le navigateur. Tant que la lecture n'a pas
  // eu lieu, la case reste VIDE (et non remplie du message) : celui qui a
  // déjà un profil ne voit donc aucun saut de mise en page à l'hydratation.
  const [profile, setProfile] = useState<ProfileId | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  // Tuteur ouvert en démo inline (null = fermé). « Essayer » ouvre la démo.
  const [demo, setDemo] = useState<string | null>(null);
  const demoRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => setFavorites(getFavorites()), []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROFILE_STORAGE_KEY) as ProfileId | null;
      if (saved && PROFILES.some(p => p.id === saved)) setProfile(saved);
    } catch { /* stockage refusé (navigation privée stricte) : profil non mémorisé */ }
    setProfileLoaded(true);
  }, []);

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

  // Re-cliquer sur son profil le désélectionne (retour au message d'accueil).
  const chooseProfile = (id: ProfileId) => {
    setProfile(previous => {
      const next = previous === id ? null : id;
      try {
        if (next) localStorage.setItem(PROFILE_STORAGE_KEY, next);
        else localStorage.removeItem(PROFILE_STORAGE_KEY);
      } catch { /* stockage refusé : la sélection vaut pour cette visite */ }
      return next;
    });
  };

  const active = PROFILES.find(p => p.id === profile) ?? null;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 text-primary">
      <Head><title>EduChat — Tuteurs socratiques</title></Head>

      <header className="flex flex-col items-center gap-3 pt-10 pb-6 text-center">
        <h1 className="text-4xl font-bold">EduChat</h1>
        <p className="text-lg opacity-80">{t("home.tagline")}</p>

        <nav className="mt-2 flex w-full max-w-3xl flex-col gap-2 text-sm">
          {/* Ligne 1 — les profils */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {PROFILES.map(item => (
              <button
                key={item.id}
                onClick={() => chooseProfile(item.id)}
                aria-pressed={profile === item.id}
                className={profile === item.id ? CELL_SELECTED : CELL_PLAIN}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </div>

          {/* Ligne 2 — le raccourci du profil (ou le message d'accueil), puis
              les trois entrées de service, toujours présentes. */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {!profileLoaded ? (
              // Avant lecture du profil mémorisé : case vide de la hauteur
              // d'un bouton, pour ne pas faire sauter la mise en page.
              <div className="min-h-[2.5rem]" aria-hidden />
            ) : active ? (
              active.id === "learner" ? (
                <button onClick={() => usePrompt("")} className={CELL_ACTION}>
                  {active.icon} {t(active.actionKey)}
                </button>
              ) : (
                <Link href={active.href} className={CELL_ACTION}>
                  {active.icon} {t(active.actionKey)}
                </Link>
              )
            ) : (
              // Aucun profil choisi : la case du raccourci accueille le
              // message. Sur mobile elle prend toute la largeur, sinon elle
              // étirerait sa voisine à sa propre hauteur.
              <p className="col-span-2 flex h-full items-center justify-center rounded border border-dashed border-white/20 px-3 py-2 text-[11px] leading-snug opacity-70 md:col-span-1">
                {t("nav.hint")}
              </p>
            )}
            <Link href="/verifier" className={CELL_PLAIN} title={t("home.accountTitle")}>
              {t("home.account")}
            </Link>
            <Link href="/rgpd" className={CELL_PLAIN}>{t("common.privacy")}</Link>
            {/* Le message occupant deux colonnes sur mobile, « Guide » prend
                la largeur restante pour ne pas laisser de trou. */}
            <Link href="/tutoriel"
              className={`${CELL_PLAIN} ${profileLoaded && !active ? "col-span-2 md:col-span-1" : ""}`}>
              {t("nav.guide")}
            </Link>
          </div>

          {/* Ligne 3 — les langues */}
          <div className="flex justify-center pt-1"><LanguageSwitcher /></div>
        </nav>
      </header>

      {/* Démo inline : « Essayer » un tuteur ouvre ce panneau ici même. */}
      <div ref={demoRef} className="scroll-mt-4">
        {demo && <DemoChat promptName={demo} onClose={() => setDemo(null)} />}
      </div>

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center">
        <label className="relative flex-grow">
          <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 opacity-60" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t("home.search")}
            className="w-full rounded bg-tertiary py-2 pl-10 pr-3 outline-none"
            aria-label={t("home.search")}
          />
        </label>
        <Link href="/publier"
          className="flex items-center justify-center gap-2 rounded bg-tertiary px-4 py-2 text-sm hover:opacity-80">
          <MdAddCircleOutline /> {t("home.propose")}
        </Link>
        <label className="flex items-center gap-2 text-sm">
          <span className="opacity-70">{t("home.sort")}</span>
          <select value={sort} onChange={e => setSort(e.target.value)} className="rounded bg-tertiary p-2">
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
                  className="text-xl font-bold hover:underline">{card.name}</Link>
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
