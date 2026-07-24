import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { MdClose, MdPause, MdPlayArrow, MdSkipNext, MdSkipPrevious } from "react-icons/md";
import { useT } from "../i18n/useT";

// Visite guidée de l'INTERFACE du chat (exerciseur du tutoriel).
//
// Un voile opacifie tout l'écran sauf une « fenêtre » (rectangle arrondi ou
// cercle) découpée sur l'élément présenté — l'astuce : une div posée sur
// l'élément avec une ombre portée géante (box-shadow 0 0 0 9999px) qui noircit
// tout le reste. Chaque étape reste ~3 s (barre de progression), avec pause,
// précédent/suivant, et sortie à tout moment. Le texte s'affiche en SOUS-TITRE
// en bas d'écran : blanc sur fond noir, bien lisible.
//
// Les cibles sont les attributs data-tour posés dans les composants du chat ;
// une étape dont l'élément est absent (ex. trombone sans clé) est sautée.

type TourStep = { target: string; shape: "rect" | "circle"; textKey: string };

const STEPS: TourStep[] = [
  { target: "tutor", shape: "rect", textKey: "tour.tutor" },
  { target: "messages", shape: "rect", textKey: "tour.messages" },
  { target: "history", shape: "rect", textKey: "tour.history" },
  { target: "provider", shape: "rect", textKey: "tour.provider" },
  { target: "model", shape: "rect", textKey: "tour.model" },
  { target: "reasoning", shape: "rect", textKey: "tour.reasoning" },
  { target: "apikey", shape: "rect", textKey: "tour.apikey" },
  { target: "composer", shape: "rect", textKey: "tour.composer" },
  { target: "attach", shape: "circle", textKey: "tour.attach" },
  { target: "voice", shape: "circle", textKey: "tour.voice" },
  { target: "send", shape: "circle", textKey: "tour.send" },
  { target: "tokens", shape: "rect", textKey: "tour.tokens" },
];

const STEP_MS = 3200; // ~3 s par élément (exigence : 2-3 s de focus)

type Box = { top: number; left: number; width: number; height: number };

function measure(target: string): Box | null {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return null; // invisible (mobile...)
  const margin = 6;
  return {
    top: rect.top - margin,
    left: rect.left - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}

export default function InterfaceTour({ onClose }: { onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  // Étapes réellement disponibles sur CET écran (éléments présents).
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [paused, setPaused] = useState(false);
  const [progressTick, setProgressTick] = useState(0); // relance l'animation CSS
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Petite latence : laisse l'interface se peindre avant de mesurer.
    const handle = setTimeout(() => {
      setSteps(STEPS.filter(step => measure(step.target) !== null));
    }, 350);
    return () => clearTimeout(handle);
  }, []);

  const current = steps[index] ?? null;

  const goTo = useCallback((next: number) => {
    setIndex(previous => {
      const value = typeof next === "number" ? next : previous;
      return Math.max(0, Math.min(steps.length - 1, value));
    });
    setProgressTick(tick => tick + 1);
  }, [steps.length]);

  const advance = useCallback(() => {
    setIndex(previous => {
      if (previous + 1 >= steps.length) { onClose(); return previous; }
      return previous + 1;
    });
    setProgressTick(tick => tick + 1);
  }, [steps.length, onClose]);

  // Mesure de l'élément courant + suivi du redimensionnement.
  useEffect(() => {
    if (!current) return;
    const update = () => setBox(measure(current.target));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [current]);

  // Avance automatique (sauf pause).
  useEffect(() => {
    if (paused || !current) return;
    timerRef.current = setTimeout(advance, STEP_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [paused, current, index, advance, progressTick]);

  // Échap pour sortir.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") advance();
      else if (event.key === "ArrowLeft") goTo(index - 1);
      else if (event.key === " ") { event.preventDefault(); setPaused(p => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, goTo, index, onClose]);

  const radius = current?.shape === "circle"
    ? Math.max(box?.width ?? 0, box?.height ?? 0) / 2 + 8
    : 10;

  if (!steps.length) return null;

  return (
    <div className="fixed inset-0 z-[999]" role="dialog" aria-label={t("tour.title")}
      onClick={advance}>
      {/* Fenêtre du projecteur : son ombre géante opacifie tout le reste. */}
      {box && (
        <div aria-hidden
          className="absolute transition-all duration-500 ease-in-out"
          style={{
            top: current?.shape === "circle" ? box.top + box.height / 2 - radius : box.top,
            left: current?.shape === "circle" ? box.left + box.width / 2 - radius : box.left,
            width: current?.shape === "circle" ? radius * 2 : box.width,
            height: current?.shape === "circle" ? radius * 2 : box.height,
            borderRadius: current?.shape === "circle" ? "9999px" : "10px",
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.82)",
            border: "2px solid rgba(220, 101, 33, 0.9)",
          }}
        />
      )}

      {/* Commandes (coin supérieur droit). */}
      <div className="absolute right-3 top-3 flex items-center gap-1 rounded bg-black/80 p-1 text-white"
        onClick={event => event.stopPropagation()}>
        <button onClick={() => goTo(index - 1)} disabled={index === 0} aria-label={t("tour.prev")}
          className="rounded p-2 hover:bg-white/20 disabled:opacity-30"><MdSkipPrevious /></button>
        <button onClick={() => setPaused(p => !p)} aria-label={paused ? t("tour.resume") : t("tour.pause")}
          className="rounded p-2 hover:bg-white/20">{paused ? <MdPlayArrow /> : <MdPause />}</button>
        <button onClick={advance} aria-label={t("tour.next")}
          className="rounded p-2 hover:bg-white/20"><MdSkipNext /></button>
        <span className="px-2 text-xs opacity-80">{index + 1}/{steps.length}</span>
        <button onClick={onClose} aria-label={t("tour.quit")}
          className="rounded p-2 hover:bg-white/20"><MdClose /></button>
      </div>

      {/* Sous-titre : blanc sur fond noir, en bas de l'écran. */}
      <div className="absolute inset-x-0 bottom-6 flex justify-center px-4"
        onClick={event => event.stopPropagation()}>
        <div className="max-w-2xl rounded-lg bg-black px-6 py-4 text-center shadow-2xl">
          <p className="text-lg font-medium leading-relaxed text-white">
            {current ? t(current.textKey as any) : ""}
          </p>
          {/* Barre de progression de l'étape (~3 s). */}
          <div className="mt-3 h-1 overflow-hidden rounded bg-white/20">
            <div key={`${index}-${progressTick}-${paused}`}
              className="h-full bg-[#DC6521]"
              style={{
                animation: paused ? "none" : `tourProgress ${STEP_MS}ms linear forwards`,
                width: paused ? "40%" : undefined,
              }} />
          </div>
          <p className="mt-2 text-xs text-white/60">{t("tour.hint")}</p>
        </div>
      </div>

      <style jsx global>{`
        @keyframes tourProgress { from { width: 0 } to { width: 100% } }
      `}</style>
    </div>
  );
}
