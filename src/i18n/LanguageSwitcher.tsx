import { useRouter } from "next/router";
import React from "react";

// Sélecteur de langue : le routage localisé (/en, /it, /de) est fourni par
// Next lui-même ; changer de langue conserve la page courante.
export default function LanguageSwitcher() {
  const router = useRouter();
  const locales = router.locales ?? ["fr"];
  return (
    <span className="flex items-center gap-1 text-xs">
      {locales.map(locale => (
        <button
          key={locale}
          onClick={() => router.push(router.asPath, undefined, { locale })}
          className={`rounded px-1.5 py-0.5 uppercase ${locale === router.locale ? "bg-tertiary font-bold" : "opacity-50 hover:opacity-100"}`}
          aria-label={`Langue : ${locale}`}
        >
          {locale}
        </button>
      ))}
    </span>
  );
}
