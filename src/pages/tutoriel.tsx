import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";
import { MdArrowBack } from "react-icons/md";
import GuideFR from "../tutorial/GuideFR";
import GuideEN from "../tutorial/GuideEN";
import GuideIT from "../tutorial/GuideIT";
import GuideDE from "../tutorial/GuideDE";
import LanguageSwitcher from "../i18n/LanguageSwitcher";

// Guide d'EduChat — quatre langues, sélectionnées par la locale de l'URL
// (/tutoriel, /en/tutoriel, /it/tutoriel, /de/tutoriel). Le CONTENU vit dans
// src/tutorial/Guide{FR,EN,IT,DE} ; la mécanique partagée dans
// src/tutorial/shared.tsx. Le français reste la version de référence.

const GUIDES = { fr: GuideFR, en: GuideEN, it: GuideIT, de: GuideDE } as const;
const TITLES = {
  fr: "Guide — EduChat", en: "Guide — EduChat",
  it: "Guida — EduChat", de: "Leitfaden — EduChat",
} as const;
const BACK = { fr: "Catalogue", en: "Catalogue", it: "Catalogo", de: "Katalog" } as const;

export default function TutorielPage() {
  const { locale } = useRouter();
  const lang = (locale && locale in GUIDES ? locale : "fr") as keyof typeof GUIDES;
  const Guide = GUIDES[lang];

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 text-primary">
      <Head><title>{TITLES[lang]}</title></Head>
      <nav className="flex items-center justify-between pt-6 pb-4">
        <Link href="/" className="flex w-fit items-center gap-1 text-sm opacity-70 hover:opacity-100">
          <MdArrowBack /> {BACK[lang]}
        </Link>
        <LanguageSwitcher />
      </nav>
      <Guide />
    </div>
  );
}
