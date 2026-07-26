import Head from "next/head";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { MdAdd, MdDelete, MdSchool, MdSettings } from "react-icons/md";
import { useRouter } from "next/router";
import InterfaceTour from "../chat/InterfaceTour";
import { useT } from "../i18n/useT";
import { getAccount, authHeaders } from "../utils/account";
import { formatTokens } from "../utils/formatTokens";

type HourSlot = { day: number; start: string; end: string };
type Data = {
  etablissement: {
    name: string; ips: string; respire: boolean; hours: HourSlot[];
    quotaPerStudentDaily: number; tokenQuotaMonthly: number;
  };
  usage: { monthTokens: number; byProvider: Array<{ provider: string; requests: number; tokens: number }> };
};

// Les jours passent par le dictionnaire : l'index reste la valeur technique
// envoyée au serveur (0 = dimanche), seul le libellé est traduit.
const DAY_KEYS = [
  "etab.day.0", "etab.day.1", "etab.day.2", "etab.day.3",
  "etab.day.4", "etab.day.5", "etab.day.6",
] as const;

// Espace du responsable d'établissement — un enseignant, pas un informaticien.
// Parti pris d'interface : trois réglages seulement, expliqués en langage clair,
// avec un éditeur d'horaires visuel (pas de JSON). Les IP et la facturation
// sont montrées mais NON modifiables ici (ce sont des décisions administratives).
export default function EtablissementPage() {
  const t = useT();
  const account = typeof window !== "undefined" ? getAccount() : null;
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<"loading" | "auth" | "none" | "ready">("loading");
  const [hours, setHours] = useState<HourSlot[]>([]);
  const [perStudent, setPerStudent] = useState("");
  const [monthly, setMonthly] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // DÉMONSTRATION (?visite=1) : l'espace s'ouvre avec un établissement
  // FICTIF et tous les réglages inertes. Aucun appel au serveur : on montre
  // l'interface d'un responsable sans emprunter les données d'un vrai.
  const router = useRouter();
  const demo = router.query.visite === "1";
  const [tour, setTour] = useState(false);
  useEffect(() => { if (demo) setTour(true); }, [demo]);
  const fige = demo || busy;

  useEffect(() => {
    if (!router.isReady) return;   // ?visite=1 n'est lisible qu'ensuite
    if (demo) {
      setData({
        etablissement: {
          // Le nom de l'école fictive est traduit à l'affichage (voir le titre) :
          // on ne le fige pas ici, l'état ne doit pas dépendre de la langue.
          name: "", ips: "203.0.113.0/24", respire: true,
          hours: [{ day: 1, start: "08:00", end: "17:00" }, { day: 3, start: "08:00", end: "12:00" }],
          quotaPerStudentDaily: 20000, tokenQuotaMonthly: 3000000,
        },
        usage: { monthTokens: 412350, byProvider: [
          { provider: "mistral", requests: 1240, tokens: 318900 },
          { provider: "anthropic", requests: 210, tokens: 93450 },
        ] },
      });
      setHours([{ day: 1, start: "08:00", end: "17:00" }, { day: 3, start: "08:00", end: "12:00" }]);
      setPerStudent("20000"); setMonthly("3000000");
      setState("ready");
      return;
    }
    fetch("/api/etablissement", { headers: authHeaders() })
      .then(r => {
        if (r.status === 401) { setState("auth"); return null; }
        if (r.status === 403) { setState("none"); return null; }
        return r.json();
      })
      .then((d: Data | null) => {
        if (!d) return;
        setData(d);
        setHours(d.etablissement.hours);
        setPerStudent(d.etablissement.quotaPerStudentDaily ? String(d.etablissement.quotaPerStudentDaily) : "");
        setMonthly(d.etablissement.tokenQuotaMonthly ? String(d.etablissement.tokenQuotaMonthly) : "");
        setState("ready");
      })
      .catch(() => setState("auth"));
  }, [demo, router.isReady]);

  const addSlot = () => setHours([...hours, { day: 1, start: "08:00", end: "17:00" }]);
  const updateSlot = (i: number, patch: Partial<HourSlot>) =>
    setHours(hours.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const removeSlot = (i: number) => setHours(hours.filter((_, j) => j !== i));

  const save = async () => {
    setBusy(true); setMessage("");
    // Garde-fou côté client, doublé côté serveur : début < fin.
    for (const s of hours) {
      if (s.start >= s.end) { setBusy(false); setMessage(t("etab.hours.invalid", { day: t(DAY_KEYS[s.day]) })); return; }
    }
    const response = await fetch("/api/etablissement", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        hours,
        quotaPerStudentDaily: Number(perStudent) || 0,
        tokenQuotaMonthly: Number(monthly) || 0,
      }),
    });
    setBusy(false);
    setMessage(response.ok ? t("etab.saved") : t("etab.saveFailed"));
  };

  if (state === "loading") return <div className="py-16 text-center text-primary opacity-60">{t("common.loading")}</div>;

  if (state === "auth" || state === "none") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-primary">
        <Head><title>{`${t("etab.title")} — EduChat`}</title></Head>
        {/* Même allure que la garde d'accès de /duel, et l'engrenage de la
            tuile « Établissement » de l'accueil : une même porte doit se
            reconnaître d'une page à l'autre. */}
        <MdSettings className="mx-auto mb-4 text-5xl text-[#DC6521]" />
        <h1 className="text-2xl font-bold">{t("etab.locked.title")}</h1>
        {state === "auth" ? (
          <p className="mt-3 opacity-80">{t("etab.locked.auth")}</p>
        ) : (
          <p className="mt-3 opacity-80">{t("etab.locked.noSchool")}</p>
        )}
        {/* Mêmes boutons, même allure que sur /duel : deux pages qui refusent
            l'accès pour la même raison doivent se ressembler. */}
        <div className="mt-6 flex justify-center gap-3">
          {state === "auth" && (
            <Link href="/verifier" className="rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90">
              {t("compte.anonymousCta")}
            </Link>
          )}
          <Link href="/" className="rounded border border-white/20 px-4 py-2 hover:bg-tertiary">
            {t("etab.locked.back")}
          </Link>
        </div>
      </div>
    );
  }

  const etab = data!.etablissement;
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-20 text-primary">
      <Head><title>{`${t("etab.title")} — EduChat`}</title></Head>

      {demo && (
        <p className="mb-4 rounded-lg border border-[#DC6521]/50 bg-[#DC6521]/10 p-3 text-sm">
          <b>{t("etab.demo.label")}</b> {t("etab.demo.text")}
        </p>
      )}
      {tour && <InterfaceTour parcours="etablissement" onClose={() => setTour(false)} />}

      <h1 data-tour="etab-identite" className="flex items-center gap-2 text-2xl font-bold"><MdSchool /> {demo ? t("etab.demo.school") : etab.name}</h1>
      <p className="mt-1 text-xs opacity-60"><Link href="/etablissements" className="underline">{t("etab.guide.link")}</Link> — {t("etab.guide.hint")}</p>
      <p className="mt-1 text-sm opacity-70">
        {t("etab.intro", { source: etab.ips ? t("etab.intro.ips") : t("etab.intro.network") })}
      </p>

      {/* --- Horaires d'accès libre --- */}
      <section data-tour="etab-horaires" className="mt-8">
        <h2 className="text-lg font-bold">{t("etab.hours.title")}</h2>
        <p className="mt-1 text-sm opacity-70">{t("etab.hours.help")}</p>
        <div className="mt-3 flex flex-col gap-2">
          {hours.length === 0 && <p className="text-sm opacity-50">{t("etab.hours.empty")}</p>}
          {hours.map((slot, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <select disabled={fige} value={slot.day} onChange={e => updateSlot(i, { day: Number(e.target.value) })}
                className="rounded bg-tertiary p-2">
                {DAY_KEYS.map((cle, di) => <option key={di} value={di}>{t(cle)}</option>)}
              </select>
              <span className="opacity-60">{t("etab.hours.from")}</span>
              <input disabled={fige} type="time" value={slot.start} onChange={e => updateSlot(i, { start: e.target.value })}
                className="rounded bg-tertiary p-2" />
              <span className="opacity-60">{t("etab.hours.to")}</span>
              <input disabled={fige} type="time" value={slot.end} onChange={e => updateSlot(i, { end: e.target.value })}
                className="rounded bg-tertiary p-2" />
              <button disabled={fige} onClick={() => removeSlot(i)} aria-label={t("etab.hours.remove")}
                className="rounded p-2 text-red-400 hover:bg-red-500/10"><MdDelete /></button>
            </div>
          ))}
          <button disabled={fige} onClick={addSlot}
            className="flex w-fit items-center gap-1 rounded border border-white/20 px-3 py-1.5 text-sm hover:bg-tertiary">
            <MdAdd /> {t("etab.hours.add")}
          </button>
        </div>
      </section>

      {/* --- Limites de dépense --- */}
      <section data-tour="etab-quotas" className="mt-8">
        <h2 className="text-lg font-bold">{t("etab.quotas.title")}</h2>
        <p className="mt-1 text-sm opacity-70">{t("etab.quotas.help")}</p>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            {t("etab.quotas.perStudent")}
            <input disabled={fige} value={perStudent} onChange={e => setPerStudent(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric" placeholder={t("etab.quotas.perStudentPlaceholder")} className="rounded bg-tertiary p-2" />
            <span className="text-xs opacity-50">{t("etab.quotas.perStudentHint")}</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("etab.quotas.monthly")}
            <input disabled={fige} value={monthly} onChange={e => setMonthly(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric" placeholder={t("etab.quotas.monthlyPlaceholder")} className="rounded bg-tertiary p-2" />
            <span className="text-xs opacity-50">{t("etab.quotas.monthlyHint")}</span>
          </label>
        </div>
      </section>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={save} disabled={fige}
          className="rounded bg-[#DC6521] px-5 py-2 font-bold hover:opacity-90 disabled:opacity-50">
          {busy ? "…" : t("etab.save")}
        </button>
        {message && <span className="text-sm opacity-80">{message}</span>}
      </div>

      {/* --- Consommation du mois (lecture seule) --- */}
      <section data-tour="etab-conso" className="mt-10">
        <h2 className="text-lg font-bold">{t("etab.usage.title")}</h2>
        <p className="mt-1 text-sm opacity-80">
          {t("etab.usage.totalLabel")} <b>{formatTokens(data!.usage.monthTokens)}</b> {t("etab.usage.totalSuffix")}
        </p>
        {data!.usage.byProvider.length > 0 && (
          <table className="mt-2 w-full max-w-md text-left text-sm">
            <thead className="text-xs uppercase opacity-60"><tr><th className="py-1">{t("etab.usage.model")}</th><th className="text-right">{t("etab.usage.tokens")}</th></tr></thead>
            <tbody>
              {data!.usage.byProvider.map(p => (
                <tr key={p.provider} className="border-b border-white/5">
                  <td className="py-1">{p.provider}</td>
                  <td className="text-right">{p.tokens.toLocaleString("fr-CH")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* --- Informations gérées par l'administration --- */}
      <section className="mt-10 rounded-lg border border-white/10 bg-secondary p-4 text-sm">
        <h2 className="font-bold">{t("etab.admin.title")}</h2>
        <ul className="mt-2 space-y-1 opacity-80">
          <li>{t("etab.admin.ips")} <span className="font-mono text-xs">{etab.ips || t("etab.admin.noIps")}</span></li>
          <li>{t("etab.admin.status")} {etab.respire ? t("etab.admin.statusRespire") : t("etab.admin.statusBilled")}</li>
        </ul>
        <p className="mt-2 text-xs opacity-60">{t("etab.admin.contact")}</p>
      </section>
    </div>
  );
}
