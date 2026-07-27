import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useState } from "react";
import {
  MdSearch, MdStar, MdStarBorder, MdPlayArrow, MdChatBubbleOutline,
  MdAddCircleOutline, MdSchool, MdSettings, MdCompareArrows,
} from "react-icons/md";
import { useAnthropic } from "../context/AnthropicProvider";
import { authHeaders } from "../utils/account";
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

type Profile = {
  id: ProfileId;
  labelKey: TranslationKey;
  actionKey: TranslationKey;
  href: string;
  icon: React.ReactNode;
};

const LEARNER: Profile = { id: "learner", labelKey: "nav.learner", actionKey: "nav.freeChat", href: "/chat", icon: <MdChatBubbleOutline /> };
// /enseignant, et non plus /session : la répartition par niveau (décision A)
// nomme chaque espace par la personne à qui il s'adresse. L'ancienne adresse
// reste servie (src/pages/session.tsx la réexporte) — les quatre guides y
// mènent encore.
const TEACHER: Profile = { id: "teacher", labelKey: "nav.teacher", actionKey: "nav.session", href: "/enseignant", icon: <MdSchool /> };
const SCHOOL: Profile = { id: "school", labelKey: "nav.school", actionKey: "nav.settings", href: "/etablissement", icon: <MdSettings /> };
const PROMPTAGOGUE: Profile = { id: "promptagogue", labelKey: "nav.promptagogue", actionKey: "nav.duel", href: "/duel", icon: <MdCompareArrows /> };

// Tailwind compile les classes qu'il LIT dans les sources : `md:grid-cols-${n}`
// ne produirait aucune règle. Les deux seules largeurs possibles sont donc
// écrites en toutes lettres.
const COLONNES: Record<number, string> = { 3: "md:grid-cols-3", 4: "md:grid-cols-4" };

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
  // CE QUE LE SERVEUR SAIT DU RÉSEAU D'OÙ L'ON ARRIVE. `null` = pas encore
  // répondu ; c'est un troisième état, et il compte (voir la ligne de profils).
  const [reseau, setReseau] = useState<{ ecole: string | null; atelier: boolean } | null>(null);
  const ecole = reseau?.ecole ?? null;

  useEffect(() => setFavorites(getFavorites()), []);

  // « bref=1 » : l'accueil n'a besoin que de savoir s'il parle à une école, et
  // si elle ouvre son atelier de promptagogue — pas de son catalogue, qu'il
  // charge déjà par /api/prompts.
  //
  // LA RÉPONSE VIENT DU SERVEUR, ET C'EST TOUT L'INTÉRÊT : resolveEtablissementByIp
  // travaille sur l'adresse que pose le proxy, la même qui reconnaît les élèves
  // et qui facture. Le navigateur ne devine rien ; il reçoit un verdict.
  //
  // SANS LE JETON, ET C'EST DÉLIBÉRÉ. Partout ailleurs, l'école ACTIVE d'un
  // enseignant identifié l'emporte maintenant sur l'IP — il retrouve son
  // établissement de chez lui. Pas ici : cette ligne-là répond à « OÙ EST CE
  // NAVIGATEUR ? », pas à « qui regarde ». C'est la salle de classe qui masque
  // l'atelier de promptagogue, et un enseignant chez lui n'a aucune raison de
  // le perdre. La route applique la même distinction (voir le bloc « bref »
  // de src/pages/api/etablissement/accueil.ts) : l'en-tête n'y changerait rien,
  // le poser laisserait seulement croire le contraire.
  useEffect(() => {
    fetch("/api/etablissement/accueil?bref=1")
      .then(r => r.json())
      .then((d: { ecole?: { name: string } | null; atelierPromptagogue?: boolean }) =>
        setReseau({ ecole: d?.ecole?.name ?? null, atelier: !!d?.atelierPromptagogue }))
      // Sans réponse, l'accueil reste celui de tout le monde : hors école.
      .catch(() => setReseau({ ecole: null, atelier: false }));
  }, []);

  // QUI ENTRE DANS LA LIGNE, ET DANS QUEL ORDRE (décision du client).
  //
  //   · réseau INCONNU → Apprenant, Promptagogue, Établissement. L'enseignant
  //     est masqué : hors d'une école, « gérer une séance » ne mène nulle part.
  //   · réseau D'UNE ÉCOLE → Apprenant, Enseignant, Établissement. Le
  //     promptagogue est masqué : dans une salle de classe, l'atelier d'écriture
  //     de tuteurs n'est pas ce qu'on vient y faire — sauf si l'administration
  //     de l'école l'a rouvert (etablissements.atelier_promptagogue), et il
  //     reparaît alors derrière l'enseignant.
  //
  // TANT QUE LE SERVEUR N'A PAS RÉPONDU, la deuxième case reste VIDE plutôt que
  // de parier. Peindre le promptagogue par défaut le ferait apparaître une
  // fraction de seconde dans chaque école — cliquable pendant ce temps —, ce
  // qui est exactement ce que « masqué » veut éviter ; et parier sur
  // l'enseignant l'afficherait à tous les visiteurs de passage. La case garde
  // sa place pour que la ligne ne saute pas quand la réponse arrive.
  const profils = useMemo<Array<Profile | null>>(() => {
    if (!reseau) return [LEARNER, null, SCHOOL];
    if (!reseau.ecole) return [LEARNER, PROMPTAGOGUE, SCHOOL];
    return reseau.atelier
      ? [LEARNER, TEACHER, PROMPTAGOGUE, SCHOOL]
      : [LEARNER, TEACHER, SCHOOL];
  }, [reseau]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      // Le jeton porte l'école active : le catalogue d'un enseignant contient
      // les tuteurs réservés de son établissement, où qu'il se trouve.
      fetch(`/api/prompts?sort=${sort}&q=${encodeURIComponent(query)}&locale=${locale}`,
        { signal: controller.signal, headers: authHeaders() })
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

        {/* Une ligne, un profil par case : chaque case EST l'entrée de son
            espace de travail (le libellé secondaire annonce ce qui va
            s'ouvrir). Trois cases en général, quatre quand une école rouvre
            son atelier de promptagogue. */}
        <nav className={`mt-2 grid w-full max-w-3xl grid-cols-2 gap-2 text-sm ${COLONNES[profils.length] ?? "md:grid-cols-3"}`}>
          {profils.map((item, i) => !item ? (
            // La case en attente : elle occupe la place, elle ne propose rien.
            // `aria-hidden` pour qu'un lecteur d'écran n'annonce pas un vide.
            <div key={`attente-${i}`} aria-hidden className={`${CELL} pointer-events-none opacity-0`} />
          ) : item.id === "learner" ? (
            // Le chat libre remet le tuteur à zéro : c'est une action, pas un lien.
            <button key={item.id} onClick={() => usePrompt("")} className={CELL}>
              <span className="flex items-center gap-1.5 font-semibold">{item.icon} {t(item.labelKey)}</span>
              <span className="text-[11px] opacity-60">{t(item.actionKey)}</span>
            </button>
          ) : (
            <Link key={item.id} href={item.href} className={CELL}>
              <span className="flex items-center gap-1.5 font-semibold">{item.icon} {t(item.labelKey)}</span>
              {/* La tuile de l'école annonce SON NOM plutôt que « Gestion des
                  paramètres » : depuis le réseau d'un établissement, ce qui
                  s'ouvre est sa page d'accueil, pas une console de réglages. */}
              <span className="text-[11px] opacity-60">
                {item.id === "school" && ecole ? ecole : t(item.actionKey)}
              </span>
            </Link>
          ))}
        </nav>
      </header>

      {/* PLUS DE BLOC « POURQUOI PASSER PAR EDUCHAT » ICI. Il expliquait un
          montage financier — contrat d'API, virement, contribution aux frais —
          à qui vient chercher un tuteur : l'élève, le premier visiteur de
          cette page, n'a rien à en faire, et le catalogue commençait quatre
          paragraphes trop bas. L'argument reste là où il sert, sur
          /etablissement, devant la personne qui devra le répéter à sa
          direction. */}

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
                <span>{t("home.by")} {card.authorName || t("admin.anonymous")}</span>
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
