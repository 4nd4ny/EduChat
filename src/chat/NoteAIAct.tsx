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
// IL N'Y A PLUS QU'UN MOTIF, ET C'EST TOUT CE QUI RESTE À DIRE : « ecole ».
// On appelle depuis le réseau d'un établissement, qui écarte ces fournisseurs
// de ses élèves — c'est l'engagement pris devant une direction : « sur votre
// réseau, ces modèles n'existent pas ». Un compte qui apporte SES PROPRES
// moyens de paiement, associés avant de venir, en sort ; rien de ce qui se
// tape dans cette page ne le fera. On CONSTATE, on n'oriente pas vers un
// réglage qui n'existe pas.
//
// CE QUI A DISPARU AVEC LA CERTIFICATION D'ÂGE. La seconde branche disait
// « faites certifier votre majorité », et à l'anonyme hors campus elle
// énumérait sept fournisseurs qu'il n'aurait de toute façon pas eus. Cette
// personne ne se voit plus RETIRER quoi que ce soit : elle reçoit la
// démonstration gratuite, et rien d'autre ne lui a jamais été promis. Un cadre
// d'avertissement au-dessus de sa liste lui décrirait un droit qu'elle n'a pas
// demandé — l'invitation à ouvrir un compte se dit ailleurs, et sans alarme
// (ChatPlaceholder, et l'étiquette « démonstration gratuite » du menu).
//
// D'où l'abandon, aussi, du drapeau « duel » que ce composant portait : il ne
// servait qu'à nommer l'absent supplémentaire de cette page — OpenRouter, hors
// de la liste publique d'un duel — sous le motif « certification », le seul où
// il changeait quelque chose. Sur le réseau d'une école, la phrase mentait
// déjà ; il n'y a plus de cas où elle dise vrai.

export default function NoteAIAct({ motif }: { motif: MotifAIAct }) {
  const t = useT();
  if (!motif) return null;
  return (
    <p className="flex items-start gap-2 rounded border border-white/15 bg-secondary p-2 text-xs opacity-80">
      <MdInfoOutline className="mt-0.5 shrink-0 text-[#DC6521]" />
      {/* Une clé par proposition, jamais une phrase d'un bloc : la première
          CONSTATE le retrait, la seconde dit ce qui le lève et ce qui ne le
          lève pas. Les garder séparées est ce qui empêche qu'une retouche de
          traduction fasse glisser une exception dans le constat. */}
      <span>{t("fournisseurs.ecoleEcarte")} {t("fournisseurs.horsEcole")}</span>
    </p>
  );
}
