import React from "react";
import Link from "next/link";
import { MdArrowBack, MdSchool } from "react-icons/md";
import { useRouter } from "next/router";
import { useAnthropic } from "../context/AnthropicProvider";
import { useFournisseurs } from "./useFournisseurs";
import { useT } from "../i18n/useT";

type Props = {};

// Écran d'attente d'une conversation vide. Le tuteur socratique choisi au
// catalogue est mis en avant : c'est lui le cœur de l'expérience (pivot v3).
export default function ChatPlaceholder({}: Props) {
  const { promptName } = useAnthropic();
  const { pathname } = useRouter();
  const t = useT();
  const isSchool = pathname.startsWith("/school");
  // SANS COMPTE ET HORS DU RÉSEAU D'UNE ÉCOLE : le repli gratuit, et lui seul.
  // C'est ici que cette situation se dit, et pas dans la barre de réglages.
  // Trois raisons : la barre du haut est haute de 4 em et n'accueille aucun
  // paragraphe (la note « école » y est déjà réservée au panneau des petits
  // écrans, donc invisible sur grand écran — exactement le visiteur qu'on
  // laisserait sans explication) ; l'écran d'attente est vu par TOUT LE MONDE,
  // à toute largeur, avant le premier message ; et il disparaît dès qu'on
  // écrit, ce qui est la juste durée de vie d'une invitation.
  //
  // CE N'EST PAS UN AVERTISSEMENT, et le ton compte : cette personne n'a rien
  // à arbitrer, rien à réparer, aucun réglage à trouver. Elle dispose d'une
  // démonstration gratuite, on le lui dit ; un compte ouvre le reste avec sa
  // propre clé ou ses propres crédits, on le lui dit aussi. Rien de plus.
  const { demonstration } = useFournisseurs();

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="max-w-md p-4 text-center text-primary">
        <h1 className="text-4xl font-medium">EduChat</h1>

        {promptName ? (
          <>
            <p className="mt-6 text-sm uppercase tracking-wide opacity-60">{t("chat.placeholder.activeTutor")}</p>
            <p className="mt-1 text-3xl font-bold text-[#DC6521]">{promptName}</p>
            <p className="mt-4 text-sm opacity-80">{t("chat.placeholder.tutorHint")}</p>
          </>
        ) : (
          <>
            <p className="mt-4 text-lg">
              {isSchool ? t("chat.placeholder.school") : t("chat.placeholder.free")}
            </p>
            <p className="mt-6">
              <Link href="/" className="inline-flex items-center gap-2 rounded border border-white/20 px-4 py-2 text-sm hover:bg-tertiary">
                <MdArrowBack /> {t("chat.placeholder.browse")}
              </Link>
            </p>
          </>
        )}

        {isSchool && (
          <p className="mt-8 flex items-center justify-center gap-2 text-xs opacity-60">
            <MdSchool /> {t("chat.placeholder.schoolKey")}
          </p>
        )}

        {/* Deux phrases, deux clés : la première dit CE QU'IL A, la seconde CE
            QU'UN COMPTE OUVRIRAIT. Séparées, parce qu'une retouche de la
            seconde (le jour où les crédits personnels existeront) ne doit pas
            pouvoir déplacer la première. Même discrétion que la mention de
            stockage local juste en dessous : c'est un renseignement, pas une
            alerte — ni cadre, ni icône, ni couleur. */}
        {demonstration && (
          <p className="mt-8 text-xs opacity-70">
            {t("chat.placeholder.demo")} {t("chat.placeholder.demoCompte")}
          </p>
        )}

        <p className="mt-10 text-xs opacity-50">{t("chat.placeholder.local")}</p>
      </div>
    </div>
  );
}
