import Link from "next/link";
import React, { useEffect, useState } from "react";
import { MdClose, MdScience } from "react-icons/md";
import { useAnthropic } from "../context/AnthropicProvider";
import { useT } from "../i18n/useT";
import { currentLocale } from "../i18n/useT";

// Bandeau du tuteur actif, épinglé en haut du chat :
// - nom du tuteur + version de la conversation ;
// - si une version plus récente est publiée : proposition de bascule,
//   EXPLICITE et jamais automatique (décision client n°9) ;
// - mode « essai » quand on teste un brouillon par URL secrète.
export default function TutorBanner() {
  const { promptName, setPromptName, promptVersion, switchPromptVersion, shareToken, messages } = useAnthropic();
  const t = useT();
  const [latestVersion, setLatestVersion] = useState(0);

  useEffect(() => {
    setLatestVersion(0);
    if (!promptName) return;
    fetch(`/api/prompts/${encodeURIComponent(promptName)}?locale=${currentLocale()}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => setLatestVersion(Number(data.prompt?.version) || 0))
      .catch(() => {});
  }, [promptName]);

  if (shareToken) {
    return (
      <div className="flex items-center justify-center gap-2 border-b border-yellow-500/30 bg-yellow-500/10 px-3 py-1.5 text-xs text-primary">
        <MdScience /> {t("chat.banner.trial")}
      </div>
    );
  }
  if (!promptName) return null;

  const hasNewer = latestVersion > 0 && promptVersion > 0 && latestVersion > promptVersion;

  return (
    <div data-tour="tutor" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-white/10 bg-secondary px-3 py-1.5 text-xs text-primary">
      <span>
        {t("chat.banner.tutor")} <Link href={`/p/${encodeURIComponent(promptName)}`} className="font-bold text-[#DC6521] hover:underline">{promptName}</Link>
        {promptVersion > 0 && <span className="opacity-60"> (v{promptVersion})</span>}
      </span>
      {hasNewer && (
        <button
          onClick={() => switchPromptVersion(latestVersion)}
          className="rounded border border-[#DC6521]/60 px-2 py-0.5 hover:bg-[#DC6521]/20"
          title="La conversation continue avec la nouvelle version du tuteur"
        >
          {t("chat.banner.newVersion", { v: latestVersion })}
        </button>
      )}
      {messages.length === 0 && (
        <button onClick={() => setPromptName("")}
          className="flex items-center gap-1 opacity-60 hover:opacity-100" title="Chat libre, sans tuteur">
          <MdClose /> {t("chat.banner.remove")}
        </button>
      )}
    </div>
  );
}
