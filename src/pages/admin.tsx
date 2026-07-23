import Head from "next/head";
import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { MdArrowBack, MdCheck, MdDelete, MdDownload, MdVisibilityOff } from "react-icons/md";
import { authHeaders, getAccount } from "../utils/account";
import { formatTokens } from "../utils/formatTokens";

type AdminPrompt = {
  name: string; authorEmail: string | null; authorName: string; language: string;
  description: string; body: string; version: number; status: string;
  usageCount: number; tokensTotal: number; sizeBytes: number;
};
type Etab = {
  id: number; name: string; ips: string; respire: number;
  token_quota_monthly: number; active_provider: string; billing_email: string;
};
type BillingRow = {
  etablissement: string; respire: number; ip: string; provider: string;
  requests: number; tokens: number;
};
type TeacherBillingRow = {
  teacherEmail: string; etablissement: string; provider: string;
  requests: number; tokens: number;
};
type AdminUser = {
  email: string; name: string; isPromptagogue: number; isTeacher: number;
  etablissementId: number | null; etablissementName: string | null;
};

// Administration : modération des prompts, gestion des établissements
// (« clients »), facturation mensuelle de la clé interne. L'accès est
// contrôlé côté serveur (SECRET_ADMIN_EMAILS relu à chaque requête) — cette
// page n'est qu'une vitrine sur ces API.
export default function AdminPage() {
  const account = typeof window !== "undefined" ? getAccount() : null;
  const [prompts, setPrompts] = useState<AdminPrompt[]>([]);
  const [etabs, setEtabs] = useState<Etab[]>([]);
  const [billing, setBilling] = useState<BillingRow[]>([]);
  const [teacherBilling, setTeacherBilling] = useState<TeacherBillingRow[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ id: 0, name: "", ips: "", respire: false, quota: "", billingEmail: "" });
  const [denied, setDenied] = useState(false);
  const [message, setMessage] = useState("");

  const reload = useCallback(() => {
    fetch("/api/admin/prompts", { headers: authHeaders() })
      .then(r => { if (r.status === 403) throw new Error("denied"); return r.json(); })
      .then(data => setPrompts(data.prompts ?? []))
      .catch(() => setDenied(true));
    fetch("/api/admin/etablissements", { headers: authHeaders() })
      .then(r => r.json()).then(data => setEtabs(data.etablissements ?? [])).catch(() => {});
    fetch("/api/admin/users", { headers: authHeaders() })
      .then(r => r.json()).then(data => setUsers(data.users ?? [])).catch(() => {});
    const [y, m] = period.split("-").map(Number);
    fetch(`/api/admin/billing?year=${y}&month=${m}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { setBilling(data.rows ?? []); setTeacherBilling(data.teachers ?? []); })
      .catch(() => {});
  }, [period]);

  useEffect(() => { reload(); }, [reload]);

  const act = async (name: string, action: string, method = "PATCH") => {
    setMessage("");
    const response = await fetch(`/api/prompts/${encodeURIComponent(name)}`, {
      method,
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: method === "DELETE" ? undefined : JSON.stringify({ action }),
    });
    if (!response.ok) { setMessage(`Échec de « ${action} » sur ${name}.`); return; }
    reload();
  };

  const saveEtab = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/admin/etablissements", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        id: form.id || undefined, name: form.name, ips: form.ips,
        respire: form.respire, tokenQuotaMonthly: Number(form.quota) || 0,
        billingEmail: form.billingEmail,
      }),
    });
    if (!response.ok) { setMessage("Échec d'enregistrement de l'établissement."); return; }
    setForm({ id: 0, name: "", ips: "", respire: false, quota: "", billingEmail: "" });
    reload();
  };

  const downloadCsv = () => {
    const [y, m] = period.split("-").map(Number);
    // authHeaders ne passe pas par un lien direct : on télécharge via fetch.
    fetch(`/api/admin/billing?year=${y}&month=${m}&format=csv`, { headers: authHeaders() })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `educhat-facturation-${period}.csv`; a.click();
        URL.revokeObjectURL(url);
      });
  };

  if (!account || denied) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-primary">
        <Head><title>Administration — EduChat</title></Head>
        <p>Espace réservé aux administrateurs (liste définie sur le serveur).</p>
        <p className="mt-4 text-sm opacity-70">
          {account
            ? `Le compte ${account.email} n'est pas administrateur.`
            : <>Identifiez-vous d'abord : <Link href="/verifier" className="underline">vérifier mon email</Link></>}
        </p>
        <Link href="/" className="mt-6 inline-block underline">Retour au catalogue</Link>
      </div>
    );
  }

  const pending = prompts.filter(p => p.status === "pending");
  const others = prompts.filter(p => p.status !== "pending");

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 text-primary">
      <Head><title>Administration — EduChat</title></Head>
      <nav className="pt-6 pb-4">
        <Link href="/" className="flex w-fit items-center gap-1 text-sm opacity-70 hover:opacity-100">
          <MdArrowBack /> Catalogue
        </Link>
      </nav>
      <h1 className="text-2xl font-bold">Administration</h1>
      {message && <p className="mt-2 text-sm text-red-400">{message}</p>}

      {/* ---- Modération ---- */}
      <section className="mt-8">
        <h2 className="text-lg font-bold">À valider ({pending.length})</h2>
        {pending.length === 0 && <p className="mt-2 text-sm opacity-60">Aucun prompt en attente.</p>}
        <ul className="mt-2 flex flex-col gap-2">
          {pending.map(p => (
            <li key={p.name} className="rounded border border-yellow-500/30 bg-secondary p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b>{p.name}</b>
                <span className="opacity-60">par {p.authorEmail ? `${p.authorName} <${p.authorEmail}>` : "Anonyme"}</span>
                <span className="opacity-60">{(p.sizeBytes / 1024).toFixed(1)} Ko</span>
                <button onClick={() => setExpanded(expanded === p.name ? null : p.name)} className="underline opacity-70">
                  {expanded === p.name ? "replier" : "lire le prompt"}
                </button>
                <span className="flex-grow" />
                <button onClick={() => act(p.name, "approve")}
                  className="flex items-center gap-1 rounded bg-green-600/80 px-2 py-1 hover:bg-green-600"><MdCheck /> Publier</button>
                <button onClick={() => { if (confirm(`Supprimer définitivement « ${p.name} » ?`)) act(p.name, "", "DELETE"); }}
                  className="flex items-center gap-1 rounded bg-red-600/70 px-2 py-1 hover:bg-red-600"><MdDelete /> Supprimer</button>
              </div>
              <p className="mt-1 opacity-80">{p.description}</p>
              {expanded === p.name && (
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-tertiary p-3 text-xs">{p.body}</pre>
              )}
            </li>
          ))}
        </ul>

        <h2 className="mt-6 text-lg font-bold">Tous les prompts</h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {others.map(p => (
            <li key={p.name} className="flex flex-wrap items-center gap-2 border-b border-white/5 py-1">
              <span className={`rounded px-1.5 text-xs ${p.status === "published" ? "bg-green-600/30" : p.status === "draft" ? "bg-yellow-600/30" : "bg-gray-600/30"}`}>{p.status}</span>
              <b>{p.name}</b> <span className="opacity-60">v{p.version}</span>
              <span className="opacity-60">{p.usageCount} usages · {formatTokens(p.tokensTotal)}</span>
              <span className="flex-grow" />
              {p.status === "published" && (
                <button onClick={() => act(p.name, "retire")} title="Dépublier (réversible : le prompt reste en base)"
                  className="flex items-center gap-1 rounded border border-white/20 px-2 py-0.5 text-xs hover:bg-tertiary"><MdVisibilityOff /> Dépublier</button>
              )}
              <button onClick={() => { if (confirm(`Supprimer définitivement « ${p.name} » ?`)) act(p.name, "", "DELETE"); }}
                className="flex items-center gap-1 rounded border border-red-500/40 px-2 py-0.5 text-xs hover:bg-red-500/10"><MdDelete /></button>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Établissements ---- */}
      <section className="mt-10">
        <h2 className="text-lg font-bold">Établissements (clients)</h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {etabs.map(e => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 border-b border-white/5 py-1">
              <b>{e.name}</b>
              <span className="opacity-60">{e.ips || "aucune IP"}</span>
              {!!e.respire && <span className="rounded bg-green-600/30 px-1.5 text-xs">RESPIRE — gratuit</span>}
              <span className="opacity-60">quota : {e.token_quota_monthly > 0 ? formatTokens(e.token_quota_monthly) + "/mois" : "illimité"}</span>
              <span className="flex-grow" />
              <button onClick={() => setForm({ id: e.id, name: e.name, ips: e.ips, respire: !!e.respire, quota: String(e.token_quota_monthly || ""), billingEmail: e.billing_email })}
                className="rounded border border-white/20 px-2 py-0.5 text-xs hover:bg-tertiary">Modifier</button>
            </li>
          ))}
        </ul>
        <form onSubmit={saveEtab} className="mt-3 grid grid-cols-1 gap-2 rounded border border-white/10 bg-secondary p-3 text-sm md:grid-cols-2">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
            placeholder="Nom de l'établissement" className="rounded bg-tertiary p-2" />
          <input value={form.ips} onChange={e => setForm({ ...form, ips: e.target.value })}
            placeholder="IPs, séparées par des virgules" className="rounded bg-tertiary p-2" />
          <input value={form.quota} onChange={e => setForm({ ...form, quota: e.target.value })}
            placeholder="Quota mensuel de tokens (vide = illimité)" inputMode="numeric" className="rounded bg-tertiary p-2" />
          <input value={form.billingEmail} onChange={e => setForm({ ...form, billingEmail: e.target.value })}
            placeholder="Email de facturation" type="email" className="rounded bg-tertiary p-2" />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.respire} onChange={e => setForm({ ...form, respire: e.target.checked })} />
            École RESPIRE (gratuite — financée par les autres revenus)
          </label>
          <button type="submit" className="rounded bg-[#DC6521] px-3 py-2 font-bold hover:opacity-90">
            {form.id ? `Enregistrer #${form.id}` : "Ajouter l'établissement"}
          </button>
        </form>
      </section>

      {/* ---- Enseignants ---- */}
      <section className="mt-10">
        <h2 className="text-lg font-bold">Enseignants (rattachement aux établissements)</h2>
        {users.filter(u => u.isTeacher).length === 0 ? (
          <p className="mt-2 text-sm opacity-60">Aucun compte enseignant pour l'instant.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {users.filter(u => u.isTeacher).map(u => (
              <li key={u.email} className="flex flex-wrap items-center gap-2 border-b border-white/5 py-1">
                <b>{u.name || u.email}</b>
                <span className="opacity-60">{u.email}</span>
                <span className="flex-grow" />
                <select
                  value={u.etablissementId ?? ""}
                  onChange={async e => {
                    await fetch("/api/admin/users", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", ...authHeaders() },
                      body: JSON.stringify({ email: u.email, etablissementId: e.target.value || null }),
                    });
                    reload();
                  }}
                  className="rounded bg-tertiary p-1 text-xs"
                >
                  <option value="">— aucun établissement —</option>
                  {etabs.map(e2 => <option key={e2.id} value={e2.id}>{e2.name}</option>)}
                </select>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- Facturation ---- */}
      <section className="mt-10">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold">Facturation de la clé interne</h2>
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
            className="rounded bg-tertiary p-1 text-sm" />
          <button onClick={downloadCsv}
            className="flex items-center gap-1 rounded border border-white/20 px-2 py-1 text-xs hover:bg-tertiary">
            <MdDownload /> Export CSV
          </button>
        </div>
        {billing.length === 0 ? (
          <p className="mt-2 text-sm opacity-60">Aucune consommation sur la clé interne pour cette période.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs uppercase opacity-60">
              <tr><th className="py-1">Établissement</th><th>IP</th><th>Fournisseur</th>
                <th className="text-right">Requêtes</th><th className="text-right">Tokens</th></tr>
            </thead>
            <tbody>
              {billing.map((row, i) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="py-1">{row.etablissement}{!!row.respire && <span className="ml-1 rounded bg-green-600/30 px-1 text-xs">gratuit</span>}</td>
                  <td className="font-mono text-xs">{row.ip}</td>
                  <td>{row.provider}</td>
                  <td className="text-right">{row.requests}</td>
                  <td className="text-right">{row.tokens.toLocaleString("fr-CH")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {teacherBilling.length > 0 && (
          <>
            <h3 className="mt-6 font-bold">Par enseignant (sessions de classe)</h3>
            <table className="mt-2 w-full text-left text-sm">
              <thead className="text-xs uppercase opacity-60">
                <tr><th className="py-1">Enseignant</th><th>Établissement</th><th>Fournisseur</th>
                  <th className="text-right">Requêtes</th><th className="text-right">Tokens</th></tr>
              </thead>
              <tbody>
                {teacherBilling.map((row, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="py-1">{row.teacherEmail}</td>
                    <td>{row.etablissement}</td>
                    <td>{row.provider}</td>
                    <td className="text-right">{row.requests}</td>
                    <td className="text-right">{row.tokens.toLocaleString("fr-CH")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <p className="mt-2 text-xs opacity-50">
          Montants exprimés en tokens par fournisseur — le tarif appliqué à la facture reste à votre main.
          Les établissements RESPIRE apparaissent pour information, à 0.
        </p>
      </section>
    </div>
  );
}
