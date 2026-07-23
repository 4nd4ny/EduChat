import React from "react";
import Link from "next/link";
import { MdArrowBack, MdSchool } from "react-icons/md";
import { useRouter } from "next/router";
import { useAnthropic } from "../context/AnthropicProvider";

type Props = {};

// Écran d'attente d'une conversation vide. Le tuteur socratique choisi au
// catalogue est mis en avant : c'est lui le cœur de l'expérience (pivot v3).
export default function ChatPlaceholder({}: Props) {
  const { promptName } = useAnthropic();
  const { pathname } = useRouter();
  const isSchool = pathname.startsWith("/school");

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="max-w-md p-4 text-center text-primary">
        <h1 className="text-4xl font-medium">EduChat</h1>

        {promptName ? (
          <>
            <p className="mt-6 text-sm uppercase tracking-wide opacity-60">Tuteur actif</p>
            <p className="mt-1 text-3xl font-bold text-[#DC6521]">{promptName}</p>
            <p className="mt-4 text-sm opacity-80">
              Ce tuteur ne donnera pas les réponses : il vous guidera par des questions.
              Posez la vôtre pour commencer.
            </p>
          </>
        ) : (
          <>
            <p className="mt-4 text-lg">
              {isSchool
                ? "Espace établissement — choisissez un tuteur ou posez votre question."
                : "Chat libre — pensez à choisir un tuteur socratique au catalogue."}
            </p>
            <p className="mt-6">
              <Link href="/" className="inline-flex items-center gap-2 rounded border border-white/20 px-4 py-2 text-sm hover:bg-tertiary">
                <MdArrowBack /> Parcourir les tuteurs
              </Link>
            </p>
          </>
        )}

        {isSchool && (
          <p className="mt-8 flex items-center justify-center gap-2 text-xs opacity-60">
            <MdSchool /> Les réponses utilisent la clé de la plateforme, financée par votre établissement.
          </p>
        )}

        <p className="mt-10 text-xs opacity-50">
          Vos conversations restent dans ce navigateur. Exportez-les depuis l'historique
          pour les conserver ou les transférer.
        </p>
      </div>
    </div>
  );
}
