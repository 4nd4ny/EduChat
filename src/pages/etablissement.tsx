import Head from "next/head";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { MdAdd, MdDelete, MdSchool, MdSettings } from "react-icons/md";
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

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

// Espace du responsable d'établissement — un enseignant, pas un informaticien.
// Parti pris d'interface : trois réglages seulement, expliqués en langage clair,
// avec un éditeur d'horaires visuel (pas de JSON). Les IP et la facturation
// sont montrées mais NON modifiables ici (ce sont des décisions administratives).
export default function EtablissementPage() {
  const account = typeof window !== "undefined" ? getAccount() : null;
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<"loading" | "auth" | "none" | "ready">("loading");
  const [hours, setHours] = useState<HourSlot[]>([]);
  const [perStudent, setPerStudent] = useState("");
  const [monthly, setMonthly] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
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
  }, []);

  const addSlot = () => setHours([...hours, { day: 1, start: "08:00", end: "17:00" }]);
  const updateSlot = (i: number, patch: Partial<HourSlot>) =>
    setHours(hours.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const removeSlot = (i: number) => setHours(hours.filter((_, j) => j !== i));

  const save = async () => {
    setBusy(true); setMessage("");
    // Garde-fou côté client, doublé côté serveur : début < fin.
    for (const s of hours) {
      if (s.start >= s.end) { setBusy(false); setMessage(`Créneau invalide (${DAYS[s.day]}) : l'heure de fin doit suivre l'heure de début.`); return; }
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
    setMessage(response.ok ? "Réglages enregistrés ✓" : "Échec de l'enregistrement.");
  };

  if (state === "loading") return <div className="py-16 text-center text-primary opacity-60">Chargement…</div>;

  if (state === "auth" || state === "none") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-primary">
        <Head><title>Mon établissement — EduChat</title></Head>
        {/* Même allure que la garde d'accès de /duel, et l'engrenage de la
            tuile « Établissement » de l'accueil : une même porte doit se
            reconnaître d'une page à l'autre. */}
        <MdSettings className="mx-auto mb-4 text-5xl text-[#DC6521]" />
        <h1 className="text-2xl font-bold">Espace responsable d'établissement</h1>
        {state === "auth" ? (
          <p className="mt-3 opacity-80">
            Identifiez-vous d'abord : un code reçu par email, sans mot de passe.
          </p>
        ) : (
          <p className="mt-3 opacity-80">
            Votre compte n'est rattaché à aucun établissement. Demandez à l'administrateur
            d'EduChat de vous désigner responsable de votre école — il lui suffit de vous
            rattacher depuis son interface (contact : blanvillain@harmonia.education).
          </p>
        )}
        {/* Mêmes boutons, même allure que sur /duel : deux pages qui refusent
            l'accès pour la même raison doivent se ressembler. */}
        <div className="mt-6 flex justify-center gap-3">
          {state === "auth" && (
            <Link href="/verifier" className="rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90">
              Vérifier mon email
            </Link>
          )}
          <Link href="/" className="rounded border border-white/20 px-4 py-2 hover:bg-tertiary">
            Retour au catalogue
          </Link>
        </div>
      </div>
    );
  }

  const etab = data!.etablissement;
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-20 text-primary">
      <Head><title>Mon établissement — EduChat</title></Head>

      <h1 className="flex items-center gap-2 text-2xl font-bold"><MdSchool /> {etab.name}</h1>
      <p className="mt-1 text-xs opacity-60"><Link href="/etablissements" className="underline">Guide des établissements</Link> — accès élèves, quotas, facturation, parcours.</p>
      <p className="mt-1 text-sm opacity-70">
        Vous êtes responsable de cet établissement. Vos élèves accèdent gratuitement à EduChat
        depuis {etab.ips ? "vos adresses réseau" : "le réseau de l'école"}, aux horaires et
        dans les limites que vous fixez ci-dessous — la plateforme gère les clés d'IA pour vous.
      </p>

      {/* --- Horaires d'accès libre --- */}
      <section className="mt-8">
        <h2 className="text-lg font-bold">Quand vos élèves peuvent-ils utiliser EduChat ?</h2>
        <p className="mt-1 text-sm opacity-70">
          En dehors de ces créneaux, l'accès gratuit par le réseau de l'école est fermé
          (un enseignant peut toujours ouvrir une session ponctuelle par mot de passe).
          Sans aucun créneau, l'accès suit le réglage global d'EduChat.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {hours.length === 0 && <p className="text-sm opacity-50">Aucun créneau défini.</p>}
          {hours.map((slot, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <select value={slot.day} onChange={e => updateSlot(i, { day: Number(e.target.value) })}
                className="rounded bg-tertiary p-2">
                {DAYS.map((d, di) => <option key={di} value={di}>{d}</option>)}
              </select>
              <span className="opacity-60">de</span>
              <input type="time" value={slot.start} onChange={e => updateSlot(i, { start: e.target.value })}
                className="rounded bg-tertiary p-2" />
              <span className="opacity-60">à</span>
              <input type="time" value={slot.end} onChange={e => updateSlot(i, { end: e.target.value })}
                className="rounded bg-tertiary p-2" />
              <button onClick={() => removeSlot(i)} aria-label="Supprimer ce créneau"
                className="rounded p-2 text-red-400 hover:bg-red-500/10"><MdDelete /></button>
            </div>
          ))}
          <button onClick={addSlot}
            className="flex w-fit items-center gap-1 rounded border border-white/20 px-3 py-1.5 text-sm hover:bg-tertiary">
            <MdAdd /> Ajouter un créneau
          </button>
        </div>
      </section>

      {/* --- Limites de dépense --- */}
      <section className="mt-8">
        <h2 className="text-lg font-bold">Limites de consommation</h2>
        <p className="mt-1 text-sm opacity-70">
          Les échanges consomment des « tokens » (l'unité de facturation de l'IA). Ces plafonds
          protègent votre budget : au-delà, l'accès gratuit se met en pause (les élèves peuvent
          toujours utiliser leur propre clé). Laissez vide pour « sans limite ».
        </p>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Par élève et par jour
            <input value={perStudent} onChange={e => setPerStudent(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric" placeholder="ex. 50000 (≈ 30 questions)" className="rounded bg-tertiary p-2" />
            <span className="text-xs opacity-50">Remis à zéro chaque jour. Empêche qu'un élève monopolise le budget.</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Total de l'établissement par mois
            <input value={monthly} onChange={e => setMonthly(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric" placeholder="ex. 5000000" className="rounded bg-tertiary p-2" />
            <span className="text-xs opacity-50">Plafond global mensuel, remis à zéro le 1er du mois.</span>
          </label>
        </div>
      </section>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={save} disabled={busy}
          className="rounded bg-[#DC6521] px-5 py-2 font-bold hover:opacity-90 disabled:opacity-50">
          {busy ? "…" : "Enregistrer mes réglages"}
        </button>
        {message && <span className="text-sm opacity-80">{message}</span>}
      </div>

      {/* --- Consommation du mois (lecture seule) --- */}
      <section className="mt-10">
        <h2 className="text-lg font-bold">Consommation du mois</h2>
        <p className="mt-1 text-sm opacity-80">
          Total : <b>{formatTokens(data!.usage.monthTokens)}</b> tokens sur la clé de la plateforme.
        </p>
        {data!.usage.byProvider.length > 0 && (
          <table className="mt-2 w-full max-w-md text-left text-sm">
            <thead className="text-xs uppercase opacity-60"><tr><th className="py-1">Modèle d'IA</th><th className="text-right">Tokens</th></tr></thead>
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
        <h2 className="font-bold">Géré par l'administration d'EduChat</h2>
        <ul className="mt-2 space-y-1 opacity-80">
          <li>Adresses réseau (IP) de reconnaissance de votre école : <span className="font-mono text-xs">{etab.ips || "aucune"}</span></li>
          <li>Statut : {etab.respire ? "École RESPIRE — accès gratuit" : "Facturé selon consommation"}</li>
        </ul>
        <p className="mt-2 text-xs opacity-60">
          Pour modifier vos adresses réseau ou vos conditions, contactez blanvillain@harmonia.education.
        </p>
      </section>
    </div>
  );
}
