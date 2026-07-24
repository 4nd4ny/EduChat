import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useRef, useState } from "react";
import { MdAccountCircle, MdHelpOutline, MdHome, MdLanguage, MdOutlinePrivacyTip } from "react-icons/md";
import { useT } from "../i18n/useT";
import type { TranslationKey } from "../i18n/dictionaries";

// Barre de navigation commune à TOUTES les pages (hauteur 4 rem) :
// accueil à gauche, titre de la page au centre, services à droite (langue,
// confidentialité, guide, compte). C'est la seule navigation transverse du
// site : les pages n'ont plus besoin de leur propre lien « retour ».

const ICON = "flex h-10 w-10 items-center justify-center rounded text-xl text-primary opacity-80 transition hover:bg-tertiary hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC6521]";

// Titre affiché par route. Les routes dynamiques sont traitées à part.
const TITLES: Array<[string, TranslationKey]> = [
  ["/duel", "nav.duel"],
  ["/publier", "home.propose"],
  ["/verifier", "home.account"],
  ["/rgpd", "common.privacy"],
  ["/tutoriel", "nav.guide"],
  ["/session", "nav.session"],
  ["/school", "header.school"],
  ["/etablissements", "header.etabGuide"],
  ["/etablissement", "header.etab"],
  ["/admin", "header.admin"],
  ["/police", "header.police"],
  ["/chat", "header.chat"],
];

function LanguageMenu() {
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const locales = router.locales ?? ["fr"];
  const current = router.locale ?? "fr";

  // Fermeture au clic extérieur et à Échap : un menu qui reste ouvert est un
  // menu qui gêne.
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={boxRef}>
      <button onClick={() => setOpen(o => !o)} className={ICON}
        aria-haspopup="menu" aria-expanded={open} title={t("header.language")}>
        <span className="flex items-center gap-0.5">
          <MdLanguage className="text-lg" />
          <span className="text-[10px] font-bold uppercase">{current}</span>
        </span>
      </button>
      {open && (
        <div role="menu"
          className="absolute right-0 top-11 z-50 flex min-w-[4rem] flex-col overflow-hidden rounded border border-white/15 bg-secondary shadow-xl">
          {locales.filter(locale => locale !== current).map(locale => (
            <button key={locale} role="menuitem"
              onClick={() => { setOpen(false); void router.push(router.asPath, undefined, { locale }); }}
              className="px-3 py-2 text-left text-xs font-semibold uppercase text-primary hover:bg-tertiary">
              {locale}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SiteHeader() {
  const router = useRouter();
  const t = useT();

  // Titre courant : la fiche d'un tuteur porte son nom, sinon le libellé de
  // la route (l'accueil affiche le nom du site).
  let title = "EduChat";
  if (router.pathname.startsWith("/p/essai")) title = t("header.draft");
  else if (router.pathname.startsWith("/p/")) {
    title = typeof router.query.name === "string" ? router.query.name : t("header.tutor");
  } else if (router.pathname !== "/") {
    const match = TITLES.find(([route]) => router.pathname.startsWith(route));
    if (match) title = t(match[1]);
  }

  return (
    <header className="sticky top-0 z-40 h-16 shrink-0 border-b border-white/10 bg-secondary/95 backdrop-blur">
      <div className="mx-auto flex h-full max-w-6xl items-center gap-1 px-2 sm:px-4">
        <Link href="/" className={ICON} title={t("header.home")} aria-label={t("header.home")}>
          <MdHome />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-center text-base font-semibold text-primary">
          {title}
        </h1>
        <nav className="flex items-center gap-0.5" aria-label={t("header.services")}>
          <LanguageMenu />
          <Link href="/rgpd" className={ICON} title={t("header.privacyTitle")} aria-label={t("common.privacy")}>
            <MdOutlinePrivacyTip />
          </Link>
          <Link href="/tutoriel" className={ICON} title={t("nav.guide")} aria-label={t("nav.guide")}>
            <MdHelpOutline />
          </Link>
          <Link href="/verifier" className={ICON} title={t("home.accountTitle")} aria-label={t("home.account")}>
            <MdAccountCircle />
          </Link>
        </nav>
      </div>
    </header>
  );
}
