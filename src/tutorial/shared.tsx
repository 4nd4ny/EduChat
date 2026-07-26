import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useRef, useState } from "react";
import { MdArrowBack, MdArrowForward, MdOpenInNew } from "react-icons/md";

// Briques partagées du guide /tutoriel — le CONTENU vit dans GuideFR/EN/IT/DE,
// la mécanique (carte mentale, visite pas-à-pas, sections) est ici.

// ---------------------------------------------------------------------------
// Carte mentale (Mind-Elixir). Chaque item porte une « cible » : une ancre
// « #... » fait défiler vers la section ; un chemin « /... » ouvre une autre
// page. La navigation se fait par délégation de clic (data-nodeid) car
// Mind-Elixir n'émet pas d'événement au simple clic d'un nœud existant.
// ---------------------------------------------------------------------------

export type Profile = { color: string; topic: string; anchor: string; leaves: [string, string][] };

function buildMap(profiles: Profile[], rootTopic: string) {
  const targets: Record<string, string> = { root: "#visite" };
  const children = profiles.map((p, bi) => {
    const bid = `b${bi}`;
    targets[bid] = p.anchor;
    return {
      id: bid, topic: p.topic, branchColor: p.color,
      style: { background: p.color, color: "#111827", fontWeight: "700" },
      children: p.leaves.map(([label, anchor], li) => {
        const lid = `b${bi}l${li}`;
        targets[lid] = anchor;
        return { id: lid, topic: label };
      }),
    };
  });
  const nodeData = {
    id: "root", topic: rootTopic,
    style: { background: "#DC6521", color: "#ffffff", fontWeight: "700" },
    children,
  };
  return { nodeData, targets };
}

export function Mindmap({ profiles, caption, ariaLabel }: {
  profiles: Profile[]; caption: string; ariaLabel: string;
}) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const { nodeData, targets } = buildMap(profiles, "EduChat");

    const onClick = (event: MouseEvent) => {
      const node = (event.target as HTMLElement)?.closest?.("[data-nodeid]") as HTMLElement | null;
      if (!node) return;
      const target = targets[(node.dataset.nodeid || "").replace(/^me/, "")];
      if (!target) return;
      if (target.startsWith("/")) routerRef.current.push(target);
      else document.querySelector(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    el.addEventListener("click", onClick);

    let cancelled = false;
    (async () => {
      // Import CÔTÉ CLIENT uniquement : Mind-Elixir manipule le DOM.
      const MindElixir = (await import("mind-elixir")).default;
      if (cancelled || !containerRef.current) return;
      const instance = new MindElixir({
        el: containerRef.current,
        direction: MindElixir.SIDE,
        editable: false, draggable: false, contextMenu: false, toolBar: false, keypress: false,
        theme: MindElixir.DARK_THEME,
      });
      instance.init({ nodeData });
      requestAnimationFrame(() => { try { instance.scaleFit(); } catch { /* rendu pas prêt */ } });
    })();

    return () => {
      cancelled = true;
      el.removeEventListener("click", onClick);
      el.innerHTML = "";
    };
    // Le contenu est figé par locale : montage unique.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div ref={containerRef} role="img" aria-label={ariaLabel}
        className="h-[520px] w-full overflow-hidden rounded-lg border border-white/10 bg-secondary" />
      <p className="mt-1 text-center text-xs opacity-50">{caption}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visite pas-à-pas (textuelle) : un pas = une explication + un lien.
// ---------------------------------------------------------------------------

export type WalkStep = { title: string; text: string; href?: string; hrefLabel?: string };

export function GuidedWalk({ steps, labels }: {
  steps: WalkStep[];
  labels: { title: string; stepAria: string; prev: string; next: string };
}) {
  const [step, setStep] = useState(0);
  const current = steps[step];
  return (
    <div className="rounded-lg border border-white/10 bg-secondary p-5">
      <div className="flex items-center justify-between text-xs opacity-60">
        <span>{labels.title}</span>
        <span>{step + 1} / {steps.length}</span>
      </div>
      <div className="mt-1 flex gap-1">
        {steps.map((_, i) => (
          <button key={i} onClick={() => setStep(i)} aria-label={`${labels.stepAria} ${i + 1}`}
            className={`h-1.5 flex-grow rounded ${i <= step ? "bg-[#DC6521]" : "bg-white/15"}`} />
        ))}
      </div>
      <h3 className="mt-4 text-xl font-bold">{current.title}</h3>
      <p className="mt-2 text-sm leading-relaxed opacity-90">{current.text}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
          className="flex items-center gap-1 rounded border border-white/20 px-3 py-1.5 text-sm hover:bg-tertiary disabled:opacity-30">
          <MdArrowBack /> {labels.prev}
        </button>
        <button onClick={() => setStep(Math.min(steps.length - 1, step + 1))} disabled={step === steps.length - 1}
          className="flex items-center gap-1 rounded bg-[#DC6521] px-3 py-1.5 text-sm font-bold hover:opacity-90 disabled:opacity-30">
          {labels.next} <MdArrowForward />
        </button>
        {current.href && (
          <a href={current.href} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 rounded border border-[#DC6521]/60 px-3 py-1.5 text-sm hover:bg-[#DC6521]/15">
            <MdOpenInNew /> {current.hrefLabel}
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="mt-12 scroll-mt-6">
    <h2 className="border-b border-white/10 pb-2 text-2xl font-bold">{title}</h2>
    <div className="mt-4 flex flex-col gap-3 text-sm leading-relaxed opacity-90">{children}</div>
  </section>
);

export type DemoButton = { label: string; note: string; href: string; color: string; icon: React.ReactNode };

/**
 * Les quatre portes de l'aide, calquées sur la ligne de profils de l'accueil.
 *
 * Chacune ouvre la vraie page dans son mode DÉMONSTRATION (?visite=1) : la
 * visite guidée s'y lance, l'interface est celle d'un utilisateur autorisé,
 * et tout est inerte. Montrer l'écran réel vaut mieux que le décrire — mais
 * il ne fallait pas pour autant ouvrir des droits.
 */
export function DemoButtons({ titre, chapeau, boutons }: {
  titre: string; chapeau: string; boutons: DemoButton[];
}) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-bold">{titre}</h2>
      <p className="mt-1 text-sm opacity-70">{chapeau}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        {boutons.map(b => (
          <Link key={b.href} href={b.href}
            className="flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition hover:bg-tertiary"
            style={{ borderColor: `${b.color}66` }}>
            <span className="text-3xl" style={{ color: b.color }}>{b.icon}</span>
            <span className="text-sm font-bold">{b.label}</span>
            <span className="text-[11px] leading-tight opacity-60">{b.note}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
