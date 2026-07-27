import React from "react";
import { MdInfoOutline } from "react-icons/md";
import { useT } from "../i18n/useT";
import type { MotifAIAct } from "./useFournisseurs";

// POURQUOI CERTAINS FOURNISSEURS NE SONT PAS DANS LA LISTE — dit à l'endroit
// exact où on le constate, et nulle part ailleurs.
//
// LE SILENCE ÉTAIT LE DÉFAUT. Les fournisseurs écartés au titre de l'AI Act
// (Gemini, Grok, DeepSeek, Qwen, Kimi, GLM, MiniMax) disparaissent purement et
// simplement du menu. Rien ne le disait : celui qui les avait vus ailleurs les
// cherchait dans un menu qui ne les contenait plus, concluait à une panne, et
// écrivait au support. Une absence non expliquée se lit toujours comme un bug.
//
// DEUX MOTIFS, DEUX PHRASES — ET SURTOUT PAS UNE SEULE POUR LES DEUX.
//
//   « ecole » — on appelle depuis le réseau d'un établissement. AUCUN compte ne
//     lève ce refus : ni une identification, ni une majorité certifiée, ni une
//     clé personnelle. C'est l'engagement pris devant une direction, « sur
//     votre réseau, ces modèles n'existent pas ». Écrire ici « faites-vous
//     certifier » enverrait chercher une heure durant un réglage sans effet —
//     et serait, littéralement, faux. On CONSTATE, on n'oriente pas.
//
//   « certification » — on est ailleurs, et la majorité du compte n'a pas été
//     vérifiée. Là, et là seulement, il y a quelque chose à faire.
//
// CE QU'ON N'ESSAIE PAS D'ARRANGER (décision du client). On ne concilie pas sur
// un même compte le travail d'enseignant et l'usage personnel de ces
// fournisseurs : qui veut les deux se fait un SECOND COMPTE, certifié pour
// lui-même. La note le dit franchement plutôt que de laisser chercher un
// arrangement qui n'existe pas — mais UNIQUEMENT sous le motif
// « certification » : c'est le seul cas où un second compte change quelque
// chose. Sur le réseau de l'école, il n'ouvrirait rien, et le conseil mentirait.

// LA PAGE « DUEL » A UN ABSENT DE PLUS, et la note doit le nommer.
//
// Ailleurs, la certification ne retient que les fournisseurs écartés. Sur
// « duel », le modèle s'écrit à la main : OpenRouter cesse d'être un
// intermédiaire vers l'échelle réglée par l'administration et sort lui aussi de
// la liste (DUEL_PUBLIC_PROVIDER_IDS). Le serveur le dit déjà, mais APRÈS coup
// — ERR_ADULT_REQUIRED, sur une requête forgée. Sans cette phrase, l'écran
// énumérerait sept absents sur huit et laisserait le huitième passer pour une
// panne : exactement le silence que ce composant existe pour rompre.

export default function NoteAIAct({ motif, duel }: { motif: MotifAIAct; duel?: boolean }) {
  const t = useT();
  if (!motif) return null;
  return (
    <p className="flex items-start gap-2 rounded border border-white/15 bg-secondary p-2 text-xs opacity-80">
      <MdInfoOutline className="mt-0.5 shrink-0 text-[#DC6521]" />
      {/* Une clé par proposition, jamais une phrase d'un bloc : la première
          CONSTATE, la suivante ORIENTE (ou refuse d'orienter). Les garder
          séparées est ce qui empêche qu'une retouche de traduction fasse
          glisser un conseil du bon cas vers le mauvais. */}
      <span>
        {motif === 'ecole'
          ? <>{t("fournisseurs.ecoleEcarte")} {t("fournisseurs.horsEcole")}</>
          : <>
              {t("fournisseurs.certification")}
              {duel ? <> {t("fournisseurs.duelIntermediaire")}</> : null}
              {" "}{t("fournisseurs.secondCompte")}
            </>}
      </span>
    </p>
  );
}
