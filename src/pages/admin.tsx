import Head from "next/head";
import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import {
  MdArchive, MdCheck, MdDownload, MdDriveFileRenameOutline,
  MdEdit, MdPublish, MdVisibilityOff,
} from "react-icons/md";
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
  syncOptin: number; createdAt: number; verifiedAt: number | null; promptCount: number;
};
type AdminComment = {
  id: number; body: string; status: "pending" | "approved" | "hidden";
  createdAt: number; moderatedAt: number | null; moderatedBy: string | null;
  promptName: string; promptAuthorEmail: string | null;
};

// Administration : modération des prompts ET des commentaires, gestion des
// comptes et des établissements (« clients »), facturation mensuelle de la clé
// interne. L'accès est contrôlé côté serveur (SECRET_ADMIN_EMAILS relu à
// chaque requête) — cette page n'est qu'une vitrine sur ces API.
//
// PRINCIPE (décision client) : on ne SUPPRIME jamais rien ici. Dépublier est
// réversible (republier) ; archiver masque définitivement un prompt de cette
// interface, mais la ligne et ses compteurs restent en base (facturation).
type CatalogueRow = { provider: string; source: string; count: number; at: number };
type LadderRow = {
  provider: string; rungs: string[]; suggested: string[]; custom: boolean;
  verifiable: boolean; unknown: string[]; catalogue: number;
};

export default function AdminPage() {
  const account = typeof window !== "undefined" ? getAccount() : null;
  const [prompts, setPrompts] = useState<AdminPrompt[]>([]);
  const [etabs, setEtabs] = useState<Etab[]>([]);
  const [billing, setBilling] = useState<BillingRow[]>([]);
  const [teacherBilling, setTeacherBilling] = useState<TeacherBillingRow[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [moderatedTotal, setModeratedTotal] = useState(0);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  // Éditeur de prompt (description + corps) — ouvert sur un nom de prompt.
  const [editing, setEditing] = useState<{ name: string; description: string; body: string } | null>(null);
  const [form, setForm] = useState({ id: 0, name: "", ips: "", respire: false, quota: "", perStudent: "", billingEmail: "" });
  const [catalogue, setCatalogue] = useState<CatalogueRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [ladders, setLadders] = useState<LadderRow[]>([]);
  const [ladderEdit, setLadderEdit] = useState<Record<string, string[]>>({});
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
    fetch("/api/admin/ladder", { headers: authHeaders() })
      .then(r => r.json()).then(data => setLadders(data.ladders ?? [])).catch(() => {});
    fetch("/api/admin/models", { headers: authHeaders() })
      .then(r => r.json()).then(data => setCatalogue(data.catalogue ?? [])).catch(() => {});
    fetch("/api/admin/comments", { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { setComments(data.comments ?? []); setModeratedTotal(data.moderatedTotal ?? 0); })
      .catch(() => {});
    const [y, m] = period.split("-").map(Number);
    fetch(`/api/admin/billing?year=${y}&month=${m}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { setBilling(data.rows ?? []); setTeacherBilling(data.teachers ?? []); })
      .catch(() => {});
  }, [period]);

  useEffect(() => { reload(); }, [reload]);

  const act = async (name: string, action: string, extra: Record<string, unknown> = {}) => {
    setMessage("");
    const response = await fetch(`/api/prompts/${encodeURIComponent(name)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ action, ...extra }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(`Échec de « ${action} » sur ${name} (${data?.error?.code ?? response.status}).`);
      return false;
    }
    reload();
    return true;
  };

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const ok = await act(editing.name, "edit", { description: editing.description, body: editing.body });
    if (ok) setEditing(null);
  };

  const rename = async (name: string) => {
    const newName = window.prompt(
      `Nouveau nom pour « ${name} » ?\n(Prévu pour les prompts dépubliés : les conversations en cours référencent l'ancien nom.)`,
      name);
    if (!newName || newName === name) return;
    await act(name, "rename", { newName });
  };

  const archive = async (name: string) => {
    if (!window.confirm(
      `Archiver « ${name} » ?\nLe prompt disparaît DÉFINITIVEMENT de cette interface, mais reste en base ` +
      `avec ses compteurs (rien n'est supprimé).`)) return;
    await act(name, "archive");
  };

  const moderateComment = async (c: AdminComment, action: "approve" | "hide") => {
    setMessage("");
    const response = await fetch(`/api/prompts/${encodeURIComponent(c.promptName)}/comments`, {
      method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ id: c.id, action }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(`Échec de modération du commentaire #${c.id} (${data?.error?.code ?? response.status}).`);
    }
    reload();
  };

  const updateUser = async (email: string, patch: Record<string, unknown>) => {
    setMessage("");
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ email, ...patch }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(`Échec de mise à jour du compte ${email} (${data?.error?.code ?? response.status}).`);
    }
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
        quotaPerStudentDaily: Number(form.perStudent) || 0,
        billingEmail: form.billingEmail,
      }),
    });
    if (!response.ok) { setMessage("Échec d'enregistrement de l'établissement."); return; }
    setForm({ id: 0, name: "", ips: "", respire: false, quota: "", perStudent: "", billingEmail: "" });
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
  const pendingComments = comments.filter(c => c.status === "pending");
  const moderatedComments = comments.filter(c => c.status !== "pending");

  const statusBadge = (status: string) => (
    <span className={`rounded px-1.5 text-xs ${status === "published" ? "bg-green-600/30"
      : status === "draft" ? "bg-yellow-600/30" : status === "pending" ? "bg-orange-600/30" : "bg-gray-600/30"}`}>
      {status === "retired" ? "dépublié" : status}
    </span>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-16 text-primary">
      <Head><title>Administration — EduChat</title></Head>
      <h1 className="text-2xl font-bold">Administration</h1>
      {message && <p className="mt-2 text-sm text-red-400">{message}</p>}

      {/* ---- Modération des prompts ---- */}
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
                <button onClick={() => archive(p.name)} title="Refuser : masquer définitivement de cette interface (conservé en base)"
                  className="flex items-center gap-1 rounded bg-gray-600/70 px-2 py-1 hover:bg-gray-600"><MdArchive /> Archiver</button>
              </div>
              <p className="mt-1 opacity-80">{p.description}</p>
              {expanded === p.name && (
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-tertiary p-3 text-xs">{p.body}</pre>
              )}
            </li>
          ))}
        </ul>

        <h2 className="mt-6 text-lg font-bold">Tous les prompts</h2>
        <p className="mt-1 text-xs opacity-60">
          Rien n'est jamais supprimé : dépublier ⇄ republier, éditer/renommer un prompt dépublié,
          archiver pour nettoyer cette liste (le prompt reste en base avec ses compteurs).
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {others.map(p => (
            <li key={p.name} className="border-b border-white/5 py-1">
              <div className="flex flex-wrap items-center gap-2">
                {statusBadge(p.status)}
                <b>{p.name}</b> <span className="opacity-60">v{p.version}</span>
                <span className="opacity-60">{p.usageCount} usages · {formatTokens(p.tokensTotal)}</span>
                <span className="flex-grow" />
                {p.status === "published" && (
                  <button onClick={() => act(p.name, "retire")} title="Dépublier (réversible : le prompt reste en base)"
                    className="flex items-center gap-1 rounded border border-white/20 px-2 py-0.5 text-xs hover:bg-tertiary"><MdVisibilityOff /> Dépublier</button>
                )}
                {p.status === "retired" && (
                  <>
                    <button onClick={() => act(p.name, "republish")} title="Republier au catalogue tel quel"
                      className="flex items-center gap-1 rounded border border-green-500/40 px-2 py-0.5 text-xs hover:bg-green-500/10"><MdPublish /> Republier</button>
                    <button onClick={() => setEditing(editing?.name === p.name ? null : { name: p.name, description: p.description, body: p.body })}
                      title="Modifier la description et le prompt"
                      className="flex items-center gap-1 rounded border border-white/20 px-2 py-0.5 text-xs hover:bg-tertiary"><MdEdit /> Modifier</button>
                    <button onClick={() => rename(p.name)} title="Renommer (prompt dépublié uniquement)"
                      className="flex items-center gap-1 rounded border border-white/20 px-2 py-0.5 text-xs hover:bg-tertiary"><MdDriveFileRenameOutline /> Renommer</button>
                  </>
                )}
                {p.status !== "published" && (
                  <button onClick={() => archive(p.name)} title="Masquer définitivement de cette interface (conservé en base)"
                    className="flex items-center gap-1 rounded border border-gray-500/40 px-2 py-0.5 text-xs hover:bg-gray-500/10"><MdArchive /> Archiver</button>
                )}
              </div>
              {editing?.name === p.name && (
                <form onSubmit={saveEdit} className="mt-2 flex flex-col gap-2 rounded border border-white/10 bg-secondary p-3">
                  <input value={editing.description}
                    onChange={e => setEditing({ ...editing, description: e.target.value })}
                    maxLength={500} placeholder="Description (catalogue)"
                    className="rounded bg-tertiary p-2 text-sm" />
                  <textarea value={editing.body}
                    onChange={e => setEditing({ ...editing, body: e.target.value })}
                    rows={12} className="rounded bg-tertiary p-2 font-mono text-xs leading-relaxed" />
                  <div className="flex gap-2">
                    <button type="submit" className="rounded bg-[#DC6521] px-3 py-1.5 text-xs font-bold hover:opacity-90">
                      Enregistrer (nouvelle version si publié)
                    </button>
                    <button type="button" onClick={() => setEditing(null)}
                      className="rounded border border-white/20 px-3 py-1.5 text-xs hover:bg-tertiary">Annuler</button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Commentaires (l'admin voit tout) ---- */}
      <section className="mt-10">
        <h2 className="text-lg font-bold">Commentaires à modérer ({pendingComments.length})</h2>
        <p className="mt-1 text-xs opacity-60">
          Les auteurs modèrent les commentaires de leurs propres tuteurs ; vous couvrez tout —
          en particulier les tuteurs anonymes. Masquer ne supprime jamais.
        </p>
        {pendingComments.length === 0 && <p className="mt-2 text-sm opacity-60">Aucun commentaire en attente.</p>}
        <ul className="mt-2 flex flex-col gap-2">
          {pendingComments.map(c => (
            <li key={c.id} className="rounded border border-yellow-500/30 bg-secondary p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs opacity-70">
                <Link href={`/p/${encodeURIComponent(c.promptName)}`} className="font-bold underline">{c.promptName}</Link>
                <span>{new Date(c.createdAt).toLocaleString("fr-CH")}</span>
                {!c.promptAuthorEmail && <span className="rounded bg-orange-600/30 px-1.5">tuteur anonyme — à vous</span>}
                <span className="flex-grow" />
                <button onClick={() => moderateComment(c, "approve")}
                  className="flex items-center gap-1 rounded bg-green-600/80 px-2 py-1 hover:bg-green-600"><MdCheck /> Approuver</button>
                <button onClick={() => moderateComment(c, "hide")}
                  className="flex items-center gap-1 rounded bg-gray-600/70 px-2 py-1 hover:bg-gray-600"><MdVisibilityOff /> Masquer</button>
              </div>
              <p className="mt-2 whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
        {moderatedComments.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer opacity-70">
              Commentaires déjà modérés ({moderatedTotal > moderatedComments.length
                ? `${moderatedComments.length} affichés sur ${moderatedTotal}`
                : moderatedComments.length})
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {moderatedComments.map(c => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 border-b border-white/5 py-1 text-xs">
                  <span className={`rounded px-1.5 ${c.status === "approved" ? "bg-green-600/30" : "bg-gray-600/30"}`}>
                    {c.status === "approved" ? "approuvé" : "masqué"}
                  </span>
                  <Link href={`/p/${encodeURIComponent(c.promptName)}`} className="underline">{c.promptName}</Link>
                  <span className="max-w-md truncate opacity-70">{c.body}</span>
                  <span className="flex-grow" />
                  <span className="opacity-50">{c.moderatedBy ?? ""}</span>
                  <button onClick={() => moderateComment(c, c.status === "approved" ? "hide" : "approve")}
                    className="rounded border border-white/20 px-2 py-0.5 hover:bg-tertiary">
                    {c.status === "approved" ? "Masquer" : "Approuver"}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* ---- Comptes ---- */}
      <section className="mt-10">
        <h2 className="text-lg font-bold">Comptes ({users.length})</h2>
        <p className="mt-1 text-xs opacity-60">
          Chacun peut se créer un compte sur /verifier (jamais obligatoire, jamais pour les élèves).
          Ici : rôles et rattachement d'un enseignant à son établissement. Retirer les deux rôles
          neutralise un compte sans le supprimer.
        </p>
        {users.length === 0 ? (
          <p className="mt-2 text-sm opacity-60">Aucun compte vérifié pour l'instant.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase opacity-60">
                <tr><th className="py-1 pr-2">Compte</th><th className="pr-2">Rôles</th>
                  <th className="pr-2">Établissement</th><th className="pr-2">Prompts</th><th>Créé le</th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.email} className="border-b border-white/5 align-middle">
                    <td className="py-1.5 pr-2">
                      <b>{u.name || "—"}</b>
                      <span className="ml-1 opacity-60">{u.email}</span>
                      {!!u.syncOptin && <span className="ml-1 rounded bg-blue-600/30 px-1 text-xs" title="Profil synchronisé sur le serveur">sync</span>}
                    </td>
                    <td className="pr-2 whitespace-nowrap">
                      <label className="mr-2 text-xs">
                        <input type="checkbox" checked={!!u.isPromptagogue}
                          onChange={e => updateUser(u.email, { isPromptagogue: e.target.checked })} /> promptagogue
                      </label>
                      <label className="text-xs">
                        <input type="checkbox" checked={!!u.isTeacher}
                          onChange={e => updateUser(u.email, { isTeacher: e.target.checked })} /> enseignant
                      </label>
                    </td>
                    <td className="pr-2">
                      {u.isTeacher ? (
                        <select value={u.etablissementId ?? ""}
                          onChange={e => updateUser(u.email, { etablissementId: e.target.value || null })}
                          className="rounded bg-tertiary p-1 text-xs">
                          <option value="">— aucun —</option>
                          {etabs.map(e2 => <option key={e2.id} value={e2.id}>{e2.name}</option>)}
                        </select>
                      ) : <span className="text-xs opacity-40">—</span>}
                    </td>
                    <td className="pr-2 text-xs">{u.promptCount || 0}</td>
                    <td className="text-xs opacity-60">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString("fr-CH") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---- Établissements ---- */}
      <section className="mt-10">
        <h2 className="text-lg font-bold">Établissements (clients)</h2>
        <p className="mt-1 text-xs opacity-60">Horaires, quota par élève et plafond mensuel sont aussi modifiables par le responsable rattaché depuis sa page « Mon établissement » (/etablissement).</p>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {etabs.map(e => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 border-b border-white/5 py-1">
              <b>{e.name}</b>
              <span className="opacity-60">{e.ips || "aucune IP"}</span>
              {!!e.respire && <span className="rounded bg-green-600/30 px-1.5 text-xs">RESPIRE — gratuit</span>}
              <span className="opacity-60">quota : {e.token_quota_monthly > 0 ? formatTokens(e.token_quota_monthly) + "/mois" : "illimité"}</span>
              <span className="flex-grow" />
              <button onClick={() => setForm({ id: e.id, name: e.name, ips: e.ips, respire: !!e.respire, quota: String(e.token_quota_monthly || ""), perStudent: String((e as any).quota_per_student_daily || ""), billingEmail: e.billing_email })}
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
          <input value={form.perStudent} onChange={e => setForm({ ...form, perStudent: e.target.value })}
            placeholder="Quota quotidien par élève (vide = illimité)" inputMode="numeric" className="rounded bg-tertiary p-2" />
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

      {/* ---- Facturation ---- */}
      <section className="mt-10">
        <h2 className="text-lg font-bold">Échelle des modèles</h2>
        <p className="mt-1 text-xs opacity-60">
          Ce que l&apos;apprenant obtient quand il choisit un fournisseur. On part TOUJOURS du
          barreau 1, le plus économe ; le bouton « Régénérer » d&apos;une réponse monte d&apos;un cran.
          Le nom du modèle n&apos;est plus montré aux apprenants — seuls les promptagogues gardent
          un champ Modèle explicite. Laisser les trois cases vides revient à la proposition
          d&apos;origine.
        </p>
        <p className="mt-1 text-xs opacity-60">
          La colonne <b>proposition</b> est celle du code, vérifiée contre les catalogues réels ;
          la ligne du dessous est <b>votre réglage</b>. Un barreau que le fournisseur ne publie
          plus est signalé en rouge : c&apos;est ainsi qu&apos;on évite un chat cassé en silence.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="uppercase opacity-60">
              <tr>
                <th className="py-1 pr-2">Fournisseur</th>
                <th className="pr-2">1 · rapide</th>
                <th className="pr-2">2 · équilibré</th>
                <th className="pr-2">3 · approfondi</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ladders.map(row => {
                const valeurs = ladderEdit[row.provider] ?? [row.rungs[0] ?? "", row.rungs[1] ?? "", row.rungs[2] ?? ""];
                return (
                  <React.Fragment key={row.provider}>
                    <tr className="border-t border-white/10">
                      <td className="py-1 pr-2 align-top">
                        <b>{row.provider}</b>
                        {row.custom
                          ? <span className="block text-[10px] text-[#DC6521]">votre réglage</span>
                          : <span className="block text-[10px] opacity-50">proposition suivie</span>}
                      </td>
                      {[0, 1, 2].map(i => (
                        <td key={i} className="pr-2 align-top">
                          <input
                            value={valeurs[i] ?? ""}
                            onChange={e => setLadderEdit(prev => {
                              const copie = [...(prev[row.provider] ?? valeurs)];
                              copie[i] = e.target.value;
                              return { ...prev, [row.provider]: copie };
                            })}
                            placeholder={row.suggested[i] ?? "—"}
                            className="w-44 rounded bg-tertiary px-1 py-0.5 text-xs" />
                          <span className="block text-[10px] opacity-50">
                            proposition : {row.suggested[i] ?? "—"}
                          </span>
                          {row.unknown.includes(valeurs[i]) && (
                            <span className="block text-[10px] text-red-400">absent du catalogue</span>
                          )}
                        </td>
                      ))}
                      <td className="align-top">
                        <button
                          onClick={async () => {
                            setMessage("");
                            const response = await fetch("/api/admin/ladder", {
                              method: "PUT",
                              headers: { "Content-Type": "application/json", ...authHeaders() },
                              body: JSON.stringify({ provider: row.provider, rungs: valeurs }),
                            });
                            if (!response.ok) { setMessage(`Échec de l'enregistrement pour ${row.provider}.`); return; }
                            setMessage(`Échelle de ${row.provider} enregistrée.`);
                            setLadderEdit(prev => { const c = { ...prev }; delete c[row.provider]; return c; });
                            fetch("/api/admin/ladder", { headers: authHeaders() })
                              .then(r => r.json()).then(d => setLadders(d.ladders ?? [])).catch(() => {});
                          }}
                          className="rounded border border-white/20 px-2 py-1 hover:bg-tertiary">
                          Enregistrer
                        </button>
                        {!row.verifiable && (
                          <span className="block text-[10px] opacity-50">catalogue non vérifiable (pas de clé serveur)</span>
                        )}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold">Catalogue des modèles</h2>
        <p className="mt-1 text-xs opacity-60">
          La liste proposée dans le champ « Modèle » du chat. Elle se reconstruit toute seule
          une fois par jour, à la première visite qui suit l&apos;échéance — il n&apos;y a pas de tâche
          planifiée : rien ne tourne quand personne ne vient. Le bouton force la reconstruction
          immédiate, utile après avoir ajouté une clé API dans educhat.env.
        </p>
        <p className="mt-1 text-xs opacity-60">
          <b>native</b> = la liste publiée par l&apos;éditeur lui-même (exacte) ·{" "}
          <b>openrouter</b> = déduite du catalogue public, pour les trois éditeurs dont
          l&apos;identifiant s&apos;en déduit exactement ·{" "}
          <b>defaut</b> = aucune clé côté serveur, seul le modèle par défaut est proposé —
          la liste se complète alors avec la clé personnelle du visiteur.
        </p>
        <button
          onClick={async () => {
            setRefreshing(true); setMessage("");
            try {
              const response = await fetch("/api/admin/models", { method: "POST", headers: authHeaders() });
              const data = await response.json();
              if (!response.ok) throw new Error();
              setCatalogue(data.catalogue ?? []);
              setMessage("Catalogue reconstruit.");
            } catch {
              setMessage("Échec de la reconstruction du catalogue.");
            } finally {
              setRefreshing(false);
            }
          }}
          disabled={refreshing}
          className="mt-3 rounded bg-[#DC6521] px-3 py-1.5 text-sm font-bold text-[#111827] hover:opacity-90 disabled:opacity-50">
          {refreshing ? "Reconstruction…" : "Rafraîchir maintenant"}
        </button>
        {catalogue.length > 0 && (
          <table className="mt-3 w-full text-left text-xs">
            <thead className="uppercase opacity-60">
              <tr><th className="py-1">Fournisseur</th><th>Source</th><th className="text-right">Modèles</th><th className="text-right">Mis à jour</th></tr>
            </thead>
            <tbody>
              {catalogue.map(row => (
                <tr key={row.provider} className="border-b border-white/5">
                  <td className="py-1">{row.provider}</td>
                  <td className={row.source === "native" ? "text-green-400" : row.source === "defaut" ? "opacity-60" : ""}>{row.source}</td>
                  <td className="text-right">{row.count}</td>
                  <td className="text-right opacity-70">{row.at ? new Date(row.at).toLocaleString("fr-CH") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

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
          Une alerte email part automatiquement dès qu'une IP dépasse le seuil quotidien
          de tokens sur la clé interne (SECRET_ALERT_IP_TOKENS_DAILY).
        </p>
      </section>
    </div>
  );
}
