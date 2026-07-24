import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import GuideFR from "../tutorial/GuideFR";
import GuideEN from "../tutorial/GuideEN";
import GuideIT from "../tutorial/GuideIT";
import GuideDE from "../tutorial/GuideDE";

// Guide d'EduChat — quatre langues, sélectionnées par la locale de l'URL
// (/tutoriel, /en/tutoriel, /it/tutoriel, /de/tutoriel). Le CONTENU vit dans
// src/tutorial/Guide{FR,EN,IT,DE} ; la mécanique partagée dans
// src/tutorial/shared.tsx. Le français reste la version de référence.
// Retour à l'accueil et choix de la langue : dans la barre du haut, commune
// à tout le site.

const GUIDES = { fr: GuideFR, en: GuideEN, it: GuideIT, de: GuideDE } as const;
const TITLES = {
  fr: "Guide — EduChat", en: "Guide — EduChat",
  it: "Guida — EduChat", de: "Leitfaden — EduChat",
} as const;

export default function TutorielPage() {
  const { locale } = useRouter();
  const lang = (locale && locale in GUIDES ? locale : "fr") as keyof typeof GUIDES;
  const Guide = GUIDES[lang];

  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 pb-20 text-primary">
      <Head><title>{TITLES[lang]}</title></Head>
      <Guide />
    </div>
  );
}
