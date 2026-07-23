import React from "react";
import Link from "next/link";
import { MdArrowBack, MdSchool } from "react-icons/md";
import { useRouter } from "next/router";
import { useAnthropic } from "../context/AnthropicProvider";
import { useT } from "../i18n/useT";

type Props = {};

// Écran d'attente d'une conversation vide. Le tuteur socratique choisi au
// catalogue est mis en avant : c'est lui le cœur de l'expérience (pivot v3).
export default function ChatPlaceholder({}: Props) {
  const { promptName } = useAnthropic();
  const { pathname } = useRouter();
  const t = useT();
  const isSchool = pathname.startsWith("/school");

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

        <p className="mt-10 text-xs opacity-50">{t("chat.placeholder.local")}</p>
      </div>
    </div>
  );
}
