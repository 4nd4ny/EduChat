import Link from "next/link";
import { useRouter } from "next/router";
import React, { useMemo, useState } from "react";
import { useT } from "../i18n/useT";

// Des listes qui ne débordent pas de l'écran, et une porte vers la liste
// entière.
//
// Huit lignes suffisent à voir ce qui se passe ; au-delà, un tableau de bord
// devient un mur qu'on ne lit plus. Le reste se parcourt page à page, et
// « Tout voir » rouvre la MÊME page dans un nouvel onglet avec `?tout=<id>` :
// seule cette liste y est rendue, entière, avec recherche et tri. C'est là
// qu'on va chercher une entrée précise — pas dans un tableau de bord.
//
// Le mode est porté par l'URL : il survit à un rechargement et se partage.

export const PAR_PAGE = 8;

export type Tri<T> = { cle: string; label: string; compare: (a: T, b: T) => number };

/** Identifiant de la liste affichée seule, ou null. */
export function useListeSeule(): string | null {
  const router = useRouter();
  if (!router.isReady) return null;
  return typeof router.query.tout === "string" ? router.query.tout : null;
}

export function useListe<T>(id: string, items: T[], options?: {
  cherchable?: (item: T) => string;
  tris?: Tri<T>[];
}) {
  const t = useT();
  const seule = useListeSeule();
  const tout = seule === id;
  const [page, setPage] = useState(0);
  const [recherche, setRecherche] = useState("");
  const [triActif, setTriActif] = useState(options?.tris?.[0]?.cle ?? "");
  const { cherchable, tris } = options ?? {};

  const filtres = useMemo(() => {
    if (!tout) return items;
    const q = recherche.trim().toLowerCase();
    const gardes = q && cherchable
      ? items.filter(i => cherchable(i).toLowerCase().includes(q))
      : items.slice();
    const tri = tris?.find(t => t.cle === triActif);
    return tri ? gardes.sort(tri.compare) : gardes;
  }, [tout, items, recherche, triActif, tris, cherchable]);

  const pages = Math.max(1, Math.ceil(items.length / PAR_PAGE));
  const courante = Math.min(page, pages - 1);

  const barre = tout ? (
    <span className="ml-2 inline-flex flex-wrap items-center gap-2 align-middle text-xs font-normal">
      {cherchable && (
        <input value={recherche} onChange={e => setRecherche(e.target.value)}
          placeholder={t("liste.search")} aria-label={t("liste.searchAria")}
          className="w-48 rounded bg-tertiary px-2 py-0.5" />
      )}
      {!!tris?.length && (
        <select value={triActif} onChange={e => setTriActif(e.target.value)}
          aria-label={t("liste.sortAria")} className="rounded bg-tertiary px-2 py-0.5">
          {tris.map(t => <option key={t.cle} value={t.cle}>{t.label}</option>)}
        </select>
      )}
      <span className="opacity-60">
        {recherche.trim()
          ? t("liste.entriesOf").replace("{n}", String(filtres.length)).replace("{total}", String(items.length))
          : t("liste.entries").replace("{n}", String(filtres.length))}
      </span>
    </span>
  ) : (
    <span className="ml-2 inline-flex items-center gap-1 align-middle text-xs font-normal">
      {items.length > PAR_PAGE && (
        <>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={courante === 0}
            className="rounded border border-white/20 px-2 py-0.5 hover:bg-tertiary disabled:opacity-30">
            ◀
          </button>
          <span className="opacity-60">{courante + 1}/{pages}</span>
          <button onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={courante >= pages - 1}
            className="rounded border border-white/20 px-2 py-0.5 hover:bg-tertiary disabled:opacity-30">
            ▶
          </button>
        </>
      )}
      <Link href={{ query: { tout: id } }} target="_blank" rel="noreferrer"
        title={t("liste.allTitle")}
        className="rounded border border-white/20 px-2 py-0.5 hover:bg-tertiary">
        {t("liste.all")}
      </Link>
    </span>
  );

  return {
    /** Les entrées à rendre : la page courante, ou tout en mode « tout voir ». */
    visibles: tout ? filtres : items.slice(courante * PAR_PAGE, courante * PAR_PAGE + PAR_PAGE),
    /** Pagination, ou recherche et tri — à poser à côté du titre. */
    barre,
    tout,
  };
}
