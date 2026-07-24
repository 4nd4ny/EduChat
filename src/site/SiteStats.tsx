import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { formatTokens } from "../utils/formatTokens";
import { getClientId } from "../utils/clientId";
import { useT } from "../i18n/useT";

// Bandeau de fréquentation, épinglé en bas de la fenêtre : la popularité du
// site en un coup d'œil. Tout vient d'agrégats déjà présents en base — aucun
// traceur, aucun cookie, aucune donnée personnelle. L'appel sert aussi de
// signal de présence : afficher l'accueil suffit à être compté « en ligne ».

type Stats = {
  accounts: number; prompts: number; tokens: number; online: number;
  freeCreditsUsd: number | null; freeBudgetUsd: number | null;
};

const REFRESH_MS = 30_000;

function Item({ value, label, title, live }: {
  value: string; label: string; title?: string; live?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap" title={title}>
      {live && (
        <span className="relative mr-0.5 inline-flex h-1.5 w-1.5 self-center">
          {/* Le halo pulsé disparaît si le système demande moins d'animation. */}
          <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
        </span>
      )}
      <b className="font-semibold">{value}</b>
      <span className="opacity-60">{label}</span>
    </span>
  );
}

export default function SiteStats() {
  const t = useT();
  const { locale } = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);

  // Les nombres suivent la langue affichée (séparateurs, devise).
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale || "fr"), [locale]);
  const moneyFormat = useMemo(
    () => new Intl.NumberFormat(locale || "fr", { style: "currency", currency: "USD", maximumFractionDigits: 2 }),
    [locale],
  );

  useEffect(() => {
    let alive = true;
    const load = () => {
      // L'uuid anonyme du navigateur distingue les visiteurs sans les identifier.
      fetch(`/api/stats?cid=${encodeURIComponent(getClientId())}`)
        .then(r => (r.ok ? r.json() : Promise.reject()))
        .then(data => { if (alive) setStats(data); })
        .catch(() => { /* un compteur ne dérange jamais la navigation */ });
    };
    load();
    // Rafraîchissement discret, suspendu quand l'onglet est en arrière-plan.
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!stats) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-secondary/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-5 gap-y-1 overflow-x-auto px-4 py-1.5 text-[11px] tabular-nums text-primary">
        <Item value={numberFormat.format(stats.accounts)} label={t("stats.accounts")} />
        <Item value={numberFormat.format(stats.prompts)} label={t("stats.prompts")} />
        <Item value={formatTokens(stats.tokens)} label={t("stats.tokens")} />
        <Item value={numberFormat.format(stats.online)} label={t("stats.online")} live
          title={t("stats.onlineTitle")} />
        {stats.freeCreditsUsd !== null && (
          <Item
            value={moneyFormat.format(stats.freeCreditsUsd)}
            label={t("stats.credits")}
            title={t("stats.creditsTitle")}
          />
        )}
      </div>
    </div>
  );
}
