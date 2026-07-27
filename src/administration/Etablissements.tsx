import React, { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n/useT";
import { authHeaders } from "../utils/account";
import { useListe, useListeSeule } from "../site/ListePaginee";
import { formatTokens } from "../utils/formatTokens";
import { type Etab } from "./commun";

// LES ÉTABLISSEMENTS — CE QUI RESTE LA MAIN DU SITE.
//
// Créer une école, poser ses IP, ses quotas, son statut RESPIRE et son email
// de facturation : rien de tout cela ne peut appartenir à une école, sans quoi
// la première venue cocherait RESPIRE et se donnerait la gratuité. Cet écran
// reste donc dans /admin, tandis que ce qui relève d'une école — son
// catalogue, ses tuteurs, son porte-monnaie, sa facture — est descendu vers
// /etablissement.
//
// La SUPPRESSION n'existe pas (principe du 24 juillet) : effacer la ligne
// rendrait inattribuable la facture d'un mois passé. Pour fermer une école, on
// vide ses IP et son quota — elle ne correspond plus à rien, la ligne demeure.

export default function Etablissements() {
  const t = useT();
  const seule = useListeSeule();
  const [etabs, setEtabs] = useState<Etab[]>([]);
  const [form, setForm] = useState({ id: 0, name: "", ips: "", respire: false, quota: "", perStudent: "", billingEmail: "" });
  const [message, setMessage] = useState("");

  const relire = useCallback(() => {
    fetch("/api/admin/etablissements", { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => setEtabs(data.etablissements ?? []))
      .catch(() => setEtabs([]));
  }, []);

  useEffect(() => { relire(); }, [relire]);

  const listeEtabs = useListe("etablissements", etabs, {
    cherchable: e => `${e.name} ${e.ips}`,
    tris: [{ cle: "nom", label: t("admin.sort.name"), compare: (a, b) => a.name.localeCompare(b.name) }],
  });

  const saveEtab = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/admin/etablissements", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        id: form.id || undefined, name: form.name, ips: form.ips,
        respire: form.respire, tokenQuotaMonthly: Number(form.quota) || 0,
        quotaPerStudentDaily: Number(form.perStudent) || 0,
        billingEmail: form.billingEmail,
      }),
    });
    if (!response.ok) { setMessage(t("admin.msg.schoolSaveFailed")); return; }
    setForm({ id: 0, name: "", ips: "", respire: false, quota: "", perStudent: "", billingEmail: "" });
    relire();
  };

  if (seule && seule !== "etablissements") return null;

  return (
    <section data-tour="admin-etablissements" className="mt-10">
      <h2 className="text-lg font-bold">{t("admin.schools.heading")}{listeEtabs.barre}</h2>
      <p className="mt-1 text-xs opacity-60">{t("admin.schools.help")}</p>
      {message && <p className="mt-2 text-sm text-red-400">{message}</p>}
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {listeEtabs.visibles.map(e => (
          <li key={e.id} className="flex flex-wrap items-center gap-2 border-b border-white/5 py-1">
            <b>{e.name}</b>
            <span className="opacity-60">{e.ips || t("admin.schools.noIp")}</span>
            {!!e.respire && <span className="rounded bg-green-600/30 px-1.5 text-xs">{t("admin.schools.respire")}</span>}
            {/* Le catalogue OUVERT est réglé par l'école elle-même, sur
                /etablissement : on l'affiche ici sans le rendre modifiable —
                le site doit pouvoir constater, pas décider à sa place. */}
            {!!e.catalogue_ouvert && (
              <span className="rounded border border-white/20 px-1.5 text-xs opacity-70"
                title={t("admin.schools.catalogue.help")}>{t("admin.schools.catalogue.label")}</span>
            )}
            <span className="opacity-60">{t("admin.schools.quota", {
              v: e.token_quota_monthly > 0
                ? t("admin.schools.perMonth", { v: formatTokens(e.token_quota_monthly) })
                : t("admin.schools.unlimited"),
            })}</span>
            <span className="flex-grow" />
            <button onClick={() => setForm({ id: e.id, name: e.name, ips: e.ips, respire: !!e.respire, quota: String(e.token_quota_monthly || ""), perStudent: String(e.quota_per_student_daily || ""), billingEmail: e.billing_email })}
              className="rounded border border-white/20 px-2 py-0.5 text-xs hover:bg-tertiary">{t("admin.btn.edit")}</button>
          </li>
        ))}
      </ul>
      <form onSubmit={saveEtab} className="mt-3 grid grid-cols-1 gap-2 rounded border border-white/10 bg-secondary p-3 text-sm md:grid-cols-2">
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
          placeholder={t("admin.schools.namePlaceholder")} className="rounded bg-tertiary p-2" />
        <input value={form.ips} onChange={e => setForm({ ...form, ips: e.target.value })}
          placeholder={t("admin.schools.ipsPlaceholder")} className="rounded bg-tertiary p-2" />
        <input value={form.quota} onChange={e => setForm({ ...form, quota: e.target.value })}
          placeholder={t("admin.schools.quotaPlaceholder")} inputMode="numeric" className="rounded bg-tertiary p-2" />
        <input value={form.perStudent} onChange={e => setForm({ ...form, perStudent: e.target.value })}
          placeholder={t("admin.schools.perStudentPlaceholder")} inputMode="numeric" className="rounded bg-tertiary p-2" />
        <input value={form.billingEmail} onChange={e => setForm({ ...form, billingEmail: e.target.value })}
          placeholder={t("admin.schools.billingEmailPlaceholder")} type="email" className="rounded bg-tertiary p-2" />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.respire} onChange={e => setForm({ ...form, respire: e.target.checked })} />
          {t("admin.schools.respireLabel")}
        </label>
        <button type="submit" className="rounded bg-[#DC6521] px-3 py-2 font-bold hover:opacity-90">
          {form.id ? t("admin.schools.saveId", { id: form.id }) : t("admin.schools.add")}
        </button>
      </form>
    </section>
  );
}
