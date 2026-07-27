import React, { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n/useT";
import { authHeaders } from "../utils/account";
import { BTN, expliquer, type AdminPrompt, type Etab } from "./commun";

// LES TUTEURS DE L'ÉCOLE, ET SES DEUX PORTES.
//
//   ENTRANTE — « catalogue ouvert » : les élèves de l'école voient AUSSI les
//     tuteurs publics des autres. C'est le seul réglage d'établissement qu'une
//     école règle elle-même, parce qu'il ne décide que de ce que SES élèves
//     voient.
//   SORTANTE — tuteur par tuteur : ce que l'école laisse paraître au-dehors.
//     Fermé tant qu'elle ne l'a pas ouvert.
//
// Les deux vivent sur /etablissement (et non plus dans /admin) : LES TUTEURS
// D'UNE ÉCOLE LUI APPARTIENNENT. Le serveur ne rend à un administrateur
// d'école que les siens et ceux de la plateforme, et n'accepte de lui que
// l'action « catalogue » — l'affichage ci-dessous ne fait que suivre.

export default function TuteursEcole({ ecole, demo }: { ecole: number | null; demo?: boolean }) {
  const t = useT();
  const [etab, setEtab] = useState<Etab | null>(null);
  const [prompts, setPrompts] = useState<AdminPrompt[]>([]);
  const [message, setMessage] = useState("");

  const relire = useCallback(() => {
    if (demo) return;
    fetch("/api/admin/etablissements", { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => {
        const liste: Etab[] = d.etablissements ?? [];
        // Une école ne reçoit que SA ligne ; un super les reçoit toutes — on
        // retient alors celle de l'école active, jamais la première venue.
        setEtab(liste.find(e => e.id === ecole) ?? (liste.length === 1 ? liste[0] : null));
      })
      .catch(() => setEtab(null));
    fetch("/api/admin/prompts", { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setPrompts(d.prompts ?? []))
      .catch(() => setPrompts([]));
  }, [demo, ecole]);

  useEffect(() => { relire(); }, [relire]);

  /**
   * Ouvrir ou fermer le catalogue de l'école. Action à part, et non le grand
   * formulaire d'établissement : celui-ci porte les IP, les quotas et RESPIRE,
   * qui restent la main du site. Le serveur ignore l'identifiant envoyé quand
   * l'appelant n'est pas le site : on ne règle que chez soi.
   */
  const reglerCatalogue = async (id: number, ouvert: boolean) => {
    setMessage("");
    const response = await fetch("/api/admin/etablissements", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ action: "catalogue", id, catalogueOuvert: ouvert }),
    });
    if (!response.ok) { setMessage(t("admin.msg.schoolSaveFailed")); return; }
    relire();
  };

  const basculerPartage = async (p: AdminPrompt) => {
    setMessage("");
    const action = p.publie ? "reserver" : "partager";
    const response = await fetch(`/api/prompts/${encodeURIComponent(p.name)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(t("admin.msg.actionFailed", {
        action, name: p.name,
        reason: expliquer(t, String(data?.error?.code ?? response.status)),
      }));
      return;
    }
    relire();
  };

  if (!etab) return <p className="mt-2 text-sm opacity-60">{t("admin.schools.tutors.none")}</p>;

  // Les tuteurs RATTACHÉS à cette école. Le serveur ne renvoie à un
  // administrateur d'école que les siens et ceux de la plateforme : ce filtre
  // ne cache donc rien qu'il aurait le droit de voir.
  const siens = prompts.filter(p => p.etablissementId === etab.id);

  return (
    <div className="mt-3 text-sm">
      {message && <p className="mb-2 text-sm text-red-400">{message}</p>}

      {/* Réglage ENTRANT : ce que les élèves de l'école voient en plus. */}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={!!etab.catalogue_ouvert}
          onChange={ev => void reglerCatalogue(etab.id, ev.target.checked)} />
        {t("admin.schools.catalogue.label")}
      </label>
      <p className="mt-1 text-xs opacity-60">{t("admin.schools.catalogue.help")}</p>

      {/* Réglage SORTANT : tuteur par tuteur, ce que l'école laisse paraître. */}
      <div className="mt-4">
        <span className="text-xs opacity-60">{t("admin.schools.tutors.heading", { n: siens.length })}</span>
        {siens.length === 0 ? (
          <span className="ml-1 text-xs opacity-40">{t("admin.schools.tutors.none")}</span>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-xs">
            {siens.map(p => (
              <li key={p.name} className="flex flex-wrap items-center gap-2">
                <span>{p.name}</span>
                <span className={p.publie
                  ? "rounded border border-green-500/40 px-1 text-green-300"
                  : "rounded border border-white/20 px-1 opacity-70"}>
                  {p.publie ? t("admin.schools.tutors.public") : t("admin.schools.tutors.private")}
                </span>
                <button onClick={() => void basculerPartage(p)} className={BTN}>
                  {p.publie ? t("admin.schools.tutors.keep") : t("admin.schools.tutors.share")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
