import Head from "next/head";
import Link from "next/link";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  MdArchive, MdCheck, MdDownload,
  MdEdit, MdPublish, MdVisibilityOff, MdAdminPanelSettings, MdTranslate,
} from "react-icons/md";
import { authHeaders, getAccount } from "../utils/account";
import { useListe, useListeSeule } from "../site/ListePaginee";
import { formatTokens } from "../utils/formatTokens";
import { useT } from "../i18n/useT";

type EtatTraduction = {
  locale: string; state: "ok" | "pending" | "failed" | "absent";
  perimee: boolean; sourceVersion: number; detail: string; updatedAt: number; tokens: number;
};
type ResumeTraductions = {
  etats: EtatTraduction[]; pretes: number; total: number;
  aVerifier: boolean; enEchec: boolean; enCours: boolean;
};
type AdminPrompt = {
  name: string; authorEmail: string | null; authorName: string; language: string;
  description: string; body: string; version: number; status: string;
  usageCount: number; tokensTotal: number; sizeBytes: number;
  translations: ResumeTraductions;
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
  isSuper?: boolean; isSchoolAdmin?: boolean;
  email: string; name: string; isPromptagogue: number; isTeacher: number;
  etablissementId: number | null; etablissementName: string | null;
  syncOptin: number; createdAt: number; verifiedAt: number | null; promptCount: number;
  adultVerifiedAt: number | null; adultVerifiedBy: string | null;
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
//
// Toute phrase montrée ici passe par le dictionnaire (fr/en/it/de) : une
// direction d'établissement italienne ou alémanique administre dans sa langue.
// Ce qui reste en dur est technique — codes d'action envoyés au serveur,
// identifiants de modèles, noms de sources de catalogue.
/**
 * Traduire les refus du serveur en phrases qui disent quoi faire. Un code brut
 * (« ERR_NAME_TAKEN ») envoie chercher un prompt qui, s'il est archivé, est
 * invisible de cette liste : sans cette phrase, l'impasse est indéchiffrable.
 *
 * Le traducteur est passé en argument : la fonction vit hors du composant,
 * mais ses phrases vivent dans le dictionnaire.
 */
function expliquer(t: ReturnType<typeof useT>, code: string): string {
  switch (code) {
    case "ERR_NAME_TAKEN": return t("admin.err.nameTaken");
    case "ERR_NAME_INVALID": return t("admin.err.nameInvalid");
    case "ERR_RATE_LIMIT": return t("admin.err.rateLimit");
    case "ERR_ARCHIVED": return t("admin.err.archived");
    case "ERR_STATUS": return t("admin.err.status");
    case "ERR_FORBIDDEN": return t("admin.err.forbidden");
    case "ERR_BODY_TOO_SHORT": return t("admin.err.bodyTooShort");
    case "ERR_QUOTA_USER": return t("admin.err.quotaUser");
    case "ERR_UNKNOWN": return t("admin.err.unknown");
    default: return code;
  }
}

/**
 * L'état des traductions d'un tuteur, en un coup d'œil.
 *
 * Trois situations qui n'appellent pas la même réaction, d'où trois couleurs :
 * tout est à jour (vert, rien à faire), une modification a périmé les
 * traductions (orange — c'est à l'administration de vérifier puis de relancer),
 * une traduction a échoué (rouge, avec la raison au survol). Une traduction
 * périmée n'est PAS servie : le tuteur repasse à son texte d'origine.
 */
function BadgeTraductions({ resume }: { resume: ResumeTraductions }) {
  const t = useT();
  if (!resume || !resume.total) return null;
  const couleur = resume.enEchec ? "border-red-500/50 text-red-300"
    : resume.aVerifier ? "border-[#DC6521]/60 text-[#DC6521]"
      : resume.pretes === resume.total ? "border-green-500/40 text-green-300"
        : "border-white/20 opacity-60";
  const detail = resume.etats
    .map(e => `${e.locale.toUpperCase()} : ${e.perimee ? t("admin.tr.stale")
      : e.state === "ok" ? t("admin.tr.upToDate")
        : e.state === "pending" ? t("admin.tr.working")
          : e.state === "failed" ? `${t("admin.tr.failed")} — ${e.detail}`
            : t("admin.tr.none")}`)
    .join("\n");
  return (
    <span title={detail} className={`rounded border px-1.5 text-xs ${couleur}`}>
      <MdTranslate className="inline" />{" "}
      {resume.enEchec ? t("admin.tr.failed")
        : resume.aVerifier ? t("admin.tr.toCheck")
          : t("admin.tr.count", { n: resume.pretes, total: resume.total })}
    </span>
  );
}

const BTN = "flex items-center gap-1 rounded border border-white/20 px-2 py-0.5 text-xs hover:bg-tertiary";

type LigneFacture = { provider: string; tokens: number; prixMtok: number; montant: number };
type FactureRow = {
  etablissementId: number; etablissement: string; respire: boolean; periode: string;
  lignes: LigneFacture[]; jetons: number; consommation: number; participation: number;
  participationPct: number; total: number; devise: string;
  emiseAt: number | null; payeeAt: number | null; tarifChange: boolean;
};
type Impayee = { etablissementId: number; etablissement: string; periode: string;
  total: number; devise: string; emiseAt: number; billingEmail: string };
type Participation = { devise: string; pct: number; collectee: number; demo: number; respire: number; jetonsOfferts: number };
type TarifRow = { provider: string; prixMtok: number };

type CatalogueRow = { provider: string; source: string; count: number; at: number };
type LadderRow = {
  provider: string; rungs: string[]; suggested: string[]; custom: boolean;
  verifiable: boolean; unknown: string[]; catalogue: number;
};

export default function AdminPage() {
  const t = useT();
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
  // « name » = l'identifiant d'ORIGINE (celui que l'API doit cibler),
  // « nom » = ce que l'administration a tapé. Les distinguer est ce qui rend
  // le renommage possible depuis le formulaire.
  const [editing, setEditing] = useState<
    { name: string; nom: string; description: string; body: string } | null>(null);
  const [form, setForm] = useState({ id: 0, name: "", ips: "", respire: false, quota: "", perStudent: "", billingEmail: "" });
  const [catalogue, setCatalogue] = useState<CatalogueRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [ladders, setLadders] = useState<LadderRow[]>([]);
  const [ladderEdit, setLadderEdit] = useState<Record<string, string[]>>({});
  // Dernier code d'erreur renvoyé par act() : saveEdit en a besoin pour dire
  // POURQUOI un renommage a échoué, alors qu'il écrase le message de act().
  const dernierCode = useRef("");
  const [denied, setDenied] = useState(false);
  // SUPER-ADMINISTRATEUR ou administrateur d'ÉCOLE. Le serveur tranche — cet
  // état ne fait que masquer ce qui serait de toute façon refusé en 403.
  const [isSuper, setIsSuper] = useState(false);
  // Qui coche : sert de garant par défaut quand on atteste la majorité.
  const moi = account?.name || account?.email || "";

  // Dérivations remontées AVANT la garde d'accès : les hooks de liste en
  // dépendent, et un hook ne peut pas vivre après un retour conditionnel.
  const pending = prompts.filter(p => p.status === "pending");
  const others = prompts.filter(p => p.status !== "pending");
  const pendingComments = comments.filter(c => c.status === "pending");
  const moderatedComments = comments.filter(c => c.status !== "pending");

  // Huit lignes par liste ; « Tout voir » rouvre la page sur cette seule
  // liste, entière, avec recherche et tri. Les « cle » sont des identifiants
  // (ils voyagent dans l'URL) ; seuls les « label » sont traduits.
  const seule = useListeSeule();
  const listePrompts = useListe("prompts", others, {
    cherchable: p2 => `${p2.name} ${p2.description} ${p2.status}`,
    tris: [
      { cle: "nom", label: t("admin.sort.name"), compare: (a, b) => a.name.localeCompare(b.name) },
      { cle: "usages", label: t("home.sort.uses"), compare: (a, b) => b.usageCount - a.usageCount },
      { cle: "jetons", label: t("admin.sort.tokens"), compare: (a, b) => b.tokensTotal - a.tokensTotal },
      { cle: "etat", label: t("admin.sort.status"), compare: (a, b) => a.status.localeCompare(b.status) },
    ],
  });
  const listeCommentaires = useListe("commentaires", pendingComments, {
    cherchable: c => `${c.promptName} ${c.body}`,
    tris: [{ cle: "date", label: t("admin.sort.recent"), compare: (a, b) => b.createdAt - a.createdAt }],
  });
  const listeComptes = useListe("comptes", users, {
    cherchable: u => `${u.email} ${u.name} ${u.etablissementName ?? ""}`,
    tris: [
      { cle: "email", label: t("admin.sort.email"), compare: (a, b) => a.email.localeCompare(b.email) },
      { cle: "date", label: t("admin.sort.recent"), compare: (a, b) => (b.createdAt || 0) - (a.createdAt || 0) },
      { cle: "prompts", label: t("admin.sort.prompts"), compare: (a, b) => b.promptCount - a.promptCount },
    ],
  });
  const listeEtabs = useListe("etablissements", etabs, {
    cherchable: e => `${e.name} ${e.ips}`,
    tris: [{ cle: "nom", label: t("admin.sort.name"), compare: (a, b) => a.name.localeCompare(b.name) }],
  });
  const listeFacture = useListe("facturation", billing, {
    cherchable: r => `${r.etablissement} ${r.ip} ${r.provider}`,
    tris: [
      { cle: "jetons", label: t("admin.sort.jetons"), compare: (a, b) => b.tokens - a.tokens },
      { cle: "etab", label: t("admin.col.school"), compare: (a, b) => a.etablissement.localeCompare(b.etablissement) },
    ],
  });
  const [factures, setFactures] = useState<FactureRow[]>([]);
  const [impayees, setImpayees] = useState<Impayee[]>([]);
  const [participation, setParticipation] = useState<Participation | null>(null);
  const [tarifsListe, setTarifsListe] = useState<TarifRow[]>([]);
  const [message, setMessage] = useState("");

  const reload = useCallback(() => {
    fetch("/api/me", { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => setIsSuper(!!data.isSuper))
      .catch(() => {});
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
    fetch("/api/admin/tarifs", { headers: authHeaders() })
      .then(r => r.json()).then(d => setTarifsListe(d.tarifs ?? [])).catch(() => {});
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

  // Relance des traductions. Celle-ci est attendue (trois appels à Haiku),
  // là où la publication ne l'attend pas : ici, le résultat EST la réponse.
  const [traduisant, setTraduisant] = useState<string | null>(null);
  const retraduire = async (name: string, forcer = false) => {
    setTraduisant(name);
    try {
      const ok = await act(name, "retranslate", forcer ? { force: true } : {});
      if (ok) setMessage(t("admin.tr.done", { name }));
    } finally {
      setTraduisant(null);
    }
  };

  const act = async (name: string, action: string, extra: Record<string, unknown> = {}) => {
    setMessage("");
    const response = await fetch(`/api/prompts/${encodeURIComponent(name)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ action, ...extra }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const code = String(data?.error?.code ?? response.status);
      dernierCode.current = code;
      // « action » reste le code envoyé au serveur : c'est lui qu'on relit
      // dans les journaux quand on remonte un incident.
      setMessage(t("admin.msg.actionFailed", { action, name, reason: expliquer(t, code) }));
      return false;
    }
    dernierCode.current = "";
    reload();
    return true;
  };

  const ouvrirEdition = (p: AdminPrompt) =>
    setEditing(editing?.name === p.name
      ? null
      : { name: p.name, nom: p.name, description: p.description, body: p.body });

  /**
   * Dupliquer : un FORK, pas une version. Le nouveau tuteur naît en
   * brouillon, avec sa propre URL secrète, et garde la filiation « inspiré
   * de » — c'est ce qui distingue « faire évoluer » de « partir d'ici ».
   */
  const dupliquer = async () => {
    if (!editing) return;
    const nom = window.prompt(
      `${t("admin.duplicate.ask", { name: editing.name })}\n${t("admin.duplicate.askHint")}`,
      `${editing.name}-2`);
    if (!nom) return;
    setMessage("");
    const source = prompts.find(x => x.name === editing.name);
    const response = await fetch("/api/prompts", {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        name: nom.trim(), description: editing.description, body: editing.body,
        language: source?.language || "fr", inspiredBy: editing.name,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(t("admin.msg.duplicateFailed", { code: String(data?.error?.code ?? response.status) }));
      return;
    }
    setEditing(null);
    setMessage(t("admin.msg.duplicated", { name: nom.trim(), source: editing.name }));
    reload();
  };

  /**
   * Enregistrer : le CONTENU d'abord, le nom ensuite.
   *
   * Cet ordre n'est pas indifférent. Renommer d'abord ferait porter
   * l'édition suivante sur un identifiant qui vient de changer ; et si le
   * nouveau nom est déjà pris, on aurait renoncé au renommage APRÈS avoir
   * écrit le texte — au moins le travail de rédaction est sauvé.
   */
  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const nouveauNom = editing.nom.trim();
    // Statut RELU dans la liste, jamais figé à l'ouverture : le formulaire
    // reste ouvert si l'on dépublie depuis la ligne juste au-dessus, et
    // l'avertissement mentirait alors sur l'état réel.
    const publie = prompts.find(x => x.name === editing.name)?.status === "published";
    if (!nouveauNom) { setMessage(t("admin.msg.nameEmpty")); return; }

    if (nouveauNom !== editing.name && publie && !window.confirm(
      `${t("admin.confirm.rename", { name: editing.name, newName: nouveauNom })}\n\n` +
      t("admin.confirm.renameWarning"))) return;

    if (!await act(editing.name, "edit", { description: editing.description, body: editing.body })) return;
    if (nouveauNom !== editing.name && !await act(editing.name, "rename", { newName: nouveauNom })) {
      // Le texte est enregistré, le nom non. Deux choses à ne pas perdre ici :
      // la RAISON du refus (sans elle, « ça n'a pas marché » ne mène nulle
      // part) et le formulaire OUVERT, pour que le nom saisi reste corrigeable
      // au lieu d'être à retaper de mémoire.
      setMessage(t("admin.msg.renameFailed", {
        name: editing.name, newName: nouveauNom,
        reason: expliquer(t, dernierCode.current || "ERR_UNKNOWN"),
      }));
      return;
    }
    setEditing(null);
  };

  const archive = async (name: string) => {
    if (!window.confirm(
      `${t("admin.confirm.archive", { name })}\n${t("admin.confirm.archiveHint")}`)) return;
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
      setMessage(t("admin.msg.moderationFailed", {
        id: c.id, code: String(data?.error?.code ?? response.status),
      }));
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
      setMessage(t("admin.msg.userUpdateFailed", {
        email, code: String(data?.error?.code ?? response.status),
      }));
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
    if (!response.ok) { setMessage(t("admin.msg.schoolSaveFailed")); return; }
    setForm({ id: 0, name: "", ips: "", respire: false, quota: "", perStudent: "", billingEmail: "" });
    reload();
  };

  // La facture en MONNAIE, période par période. Le relevé en jetons plus haut
  // reste le détail ; ceci en est la traduction en francs, participation
  // comprise et nommée.
  useEffect(() => {
    const [y, m] = period.split("-");
    if (!y || !m) return;
    fetch(`/api/admin/factures?year=${y}&month=${Number(m)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { setFactures(d.factures ?? []); setImpayees(d.impayees ?? []); setParticipation(d.participation ?? null); })
      .catch(() => {});
  }, [period, isSuper]);

  const actionFacture = async (etablissementId: number, action: string, periode?: string) => {
    const [y, m] = period.split("-");
    const r = await fetch("/api/admin/factures", {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ action, etablissementId, periode, year: Number(y), month: Number(m) }),
    });
    if (!r.ok) { setMessage(t("admin.facture.failed")); return; }
    const [yy, mm] = period.split("-");
    fetch(`/api/admin/factures?year=${yy}&month=${Number(mm)}`, { headers: authHeaders() })
      .then(x => x.json()).then(d => { setFactures(d.factures ?? []); setImpayees(d.impayees ?? []); })
      .catch(() => {});
  };

  const reglerTarif = async (provider: string, prixMtok: number) => {
    const r = await fetch("/api/admin/tarifs", {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ provider, prixMtok }),
    });
    if (!r.ok) { setMessage(t("admin.tarif.failed")); return; }
    fetch("/api/admin/tarifs", { headers: authHeaders() })
      .then(x => x.json()).then(d => setTarifsListe(d.tarifs ?? [])).catch(() => {});
    const [y, m] = period.split("-");
    fetch(`/api/admin/factures?year=${y}&month=${Number(m)}`, { headers: authHeaders() })
      .then(x => x.json()).then(d => setFactures(d.factures ?? [])).catch(() => {});
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
    // Même garde d'accès que /duel, /etablissement et /session : quatre pages
    // qui refusent l'entrée doivent le faire de la même façon.
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-primary">
        <Head><title>{`${t("admin.title")} — EduChat`}</title></Head>
        <MdAdminPanelSettings className="mx-auto mb-4 text-5xl text-[#DC6521]" />
        <h1 className="text-2xl font-bold">{t("admin.denied.title")}</h1>
        <p className="mt-3 opacity-80">
          {account
            ? t("admin.denied.notAdmin", { email: account.email })
            : t("admin.denied.anonymous")}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {!account && (
            <Link href="/verifier" className="rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90">
              {t("compte.anonymousCta")}
            </Link>
          )}
          <Link href="/" className="rounded border border-white/20 px-4 py-2 hover:bg-tertiary">
            {t("admin.denied.backCatalogue")}
          </Link>
        </div>
      </div>
    );
  }

  // Les états d'un tuteur, dits à un humain. Le serveur, lui, garde ses
  // identifiants (published, draft, pending, retired) : ils ne changent pas.
  const libelleEtat = (status: string) => {
    switch (status) {
      case "published": return t("admin.status.published");
      case "draft": return t("admin.status.draft");
      case "pending": return t("admin.status.pending");
      case "retired": return t("admin.status.retired");
      default: return status;
    }
  };

  const statusBadge = (status: string) => (
    <span className={`rounded px-1.5 text-xs ${status === "published" ? "bg-green-600/30"
      : status === "draft" ? "bg-yellow-600/30" : status === "pending" ? "bg-orange-600/30" : "bg-gray-600/30"}`}>
      {libelleEtat(status)}
    </span>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-16 text-primary">
      <Head><title>{`${t("admin.title")} — EduChat`}</title></Head>
      <h1 className="text-2xl font-bold">{t("admin.title")}</h1>
      {message && <p className="mt-2 text-sm text-red-400">{message}</p>}

      {/* ---- Modération des prompts ---- */}

      {!seule && (<>
      {/* ─── Zone 1 : Prompts ─── */}
      <h2 className="mt-12 border-b-2 border-[#DC6521]/50 pb-1 text-xl font-bold uppercase tracking-wide text-[#DC6521]">
        {t("admin.zone.prompts")}
      </h2>
      </>)}
      {(!seule || seule === "prompts") && (
      <section className="mt-8">
        <h2 className="text-lg font-bold">{t("admin.prompts.toValidate", { n: pending.length })}</h2>
        {pending.length === 0 && <p className="mt-2 text-sm opacity-60">{t("admin.prompts.noneWaiting")}</p>}
        <ul className="mt-2 flex flex-col gap-2">
          {pending.map(p => (
            <li key={p.name} className="rounded border border-yellow-500/30 bg-secondary p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b>{p.name}</b>
                <span className="opacity-60">
                  {t("home.by")} {p.authorEmail ? `${p.authorName} <${p.authorEmail}>` : t("admin.anonymous")}
                </span>
                <span className="opacity-60">{t("admin.prompts.size", { n: (p.sizeBytes / 1024).toFixed(1) })}</span>
                <button onClick={() => setExpanded(expanded === p.name ? null : p.name)} className="underline opacity-70">
                  {expanded === p.name ? t("admin.prompts.collapse") : t("admin.prompts.read")}
                </button>
                <span className="flex-grow" />
                <button onClick={() => act(p.name, "approve")}
                  className="flex items-center gap-1 rounded bg-green-600/80 px-2 py-1 hover:bg-green-600"><MdCheck /> {t("admin.btn.publish")}</button>
                <button onClick={() => archive(p.name)} title={t("admin.prompts.refuseTitle")}
                  className="flex items-center gap-1 rounded bg-gray-600/70 px-2 py-1 hover:bg-gray-600"><MdArchive /> {t("admin.btn.archive")}</button>
              </div>
              <p className="mt-1 opacity-80">{p.description}</p>
              {expanded === p.name && (
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-tertiary p-3 text-xs">{p.body}</pre>
              )}
            </li>
          ))}
        </ul>

        <h2 className="mt-6 text-lg font-bold">{t("admin.prompts.allHeading")}{listePrompts.barre}</h2>
        {/* Le gras porte l'état ; le reste de la phrase suit dans la même
            langue — d'où le découpage en fragments plutôt qu'un seul texte. */}
        <p className="mt-1 text-xs opacity-60">
          {t("admin.prompts.helpNothingDeleted")}{" "}
          <b>{t("admin.prompts.helpPublished")}</b>{t("admin.prompts.helpPublishedRest")}{" "}
          <b>{t("admin.prompts.helpRetired")}</b>{t("admin.prompts.helpRetiredRest")}
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {listePrompts.visibles.map(p => (
            <li key={p.name} className="border-b border-white/5 py-1">
              <div className="flex flex-wrap items-center gap-2">
                {statusBadge(p.status)}
                <b>{p.name}</b> <span className="opacity-60">v{p.version}</span>
                <span className="opacity-60">{p.usageCount} {t("home.uses")} · {formatTokens(p.tokensTotal)}</span>
                {p.status === "published" && <BadgeTraductions resume={p.translations} />}
                <span className="flex-grow" />
                {/* Un état, un jeu d'actions — jamais de bouton désactivé :
                    « republier » et « dépublier » sont les deux faces d'une
                    même bascule, en montrer une seule dit déjà où l'on est.
                      publié           → dépublier · modifier
                      dépublié         → republier · archiver
                      brouillon/soumis → modifier · archiver
                    Un tuteur dépublié n'est pas modifiable : on le republie
                    d'abord (décision client). « Modifier » couvre le nom, la
                    description et le texte ; la publication d'un prompt soumis
                    se fait plus haut, dans la file de validation. */}
                {p.status === "published" ? (
                  <>
                    <button onClick={() => act(p.name, "retire")} title={t("admin.prompts.retireTitle")}
                      className={BTN}><MdVisibilityOff /> {t("compte.prompts.retire")}</button>
                    <button onClick={() => ouvrirEdition(p)} title={t("admin.prompts.editTitle")}
                      className={BTN}><MdEdit /> {t("admin.btn.edit")}</button>
                    {/* Le « en cas de validation » du cycle de traduction : tant
                        que ce bouton n'a pas été cliqué, une traduction périmée
                        n'est pas servie et l'élève lit l'original.
                        Il reste affiché MÊME quand les trois langues sont à
                        jour — le cacher ôtait le seul moyen de relancer une
                        traduction à la demande, donc de vérifier qu'elle
                        marche. Dans ce cas il force le refaire, sinon
                        traduireTuteur, qui est idempotent, ne ferait rien. */}
                    {(() => {
                      const tr = p.translations;
                      const aJour = !tr.aVerifier && !tr.enEchec && tr.pretes === tr.total;
                      return (
                        <button onClick={() => retraduire(p.name, aJour)} disabled={traduisant === p.name}
                          title={t(aJour ? "admin.tr.redoTitle" : "admin.tr.retranslateTitle")}
                          className="flex items-center gap-1 rounded border border-[#DC6521]/60 px-2 py-0.5 text-xs hover:bg-[#DC6521]/10 disabled:opacity-40">
                          <MdTranslate />{" "}
                          {traduisant === p.name ? t("admin.tr.working")
                            : tr.aVerifier ? t("admin.tr.checkAndRetranslate")
                              : aJour ? t("admin.tr.redo")
                                : t("admin.tr.translate")}
                        </button>
                      );
                    })()}
                  </>
                ) : p.status === "retired" ? (
                  <>
                    <button onClick={() => act(p.name, "republish")} title={t("admin.prompts.republishTitle")}
                      className="flex items-center gap-1 rounded border border-green-500/40 px-2 py-0.5 text-xs hover:bg-green-500/10"><MdPublish /> {t("compte.prompts.republish")}</button>
                    <button onClick={() => archive(p.name)} title={t("admin.prompts.archiveTitle")}
                      className="flex items-center gap-1 rounded border border-gray-500/40 px-2 py-0.5 text-xs hover:bg-gray-500/10"><MdArchive /> {t("admin.btn.archive")}</button>
                  </>
                ) : (
                  <>
                    {/* Cette branche ne reçoit que des BROUILLONS : la file du
                        haut retire déjà les prompts soumis de cette liste.
                        Un brouillon n'a pas d'autre chemin vers le catalogue —
                        « soumettre » appartient à son auteur, depuis son URL
                        secrète. L'administration publie donc directement. */}
                    {p.status === "draft" && (
                      <button onClick={() => act(p.name, "approve")} title={t("admin.prompts.approveTitle")}
                        className="flex items-center gap-1 rounded border border-green-500/40 px-2 py-0.5 text-xs hover:bg-green-500/10">
                        <MdCheck /> {t("admin.btn.publish")}
                      </button>
                    )}
                    <button onClick={() => ouvrirEdition(p)} title={t("admin.prompts.editTitle")}
                      className={BTN}><MdEdit /> {t("admin.btn.edit")}</button>
                    <button onClick={() => archive(p.name)} title={t("admin.prompts.archiveTitle")}
                      className="flex items-center gap-1 rounded border border-gray-500/40 px-2 py-0.5 text-xs hover:bg-gray-500/10"><MdArchive /> {t("admin.btn.archive")}</button>
                  </>
                )}
              </div>
              {editing?.name === p.name && (
                <form onSubmit={saveEdit} className="mt-2 flex flex-col gap-2 rounded border border-white/10 bg-secondary p-3">
                  <label className="flex flex-col gap-1 text-xs opacity-70">
                    {t("admin.edit.nameLabel")}
                    <input value={editing.nom}
                      onChange={e => setEditing({ ...editing, nom: e.target.value })}
                      maxLength={64} className="rounded bg-tertiary p-2 font-mono text-sm text-primary" />
                  </label>
                  {prompts.find(x => x.name === editing.name)?.status === "published" && editing.nom.trim() !== editing.name && (
                    <p className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                      {t("admin.edit.warnBefore")}{" "}
                      <b>{t("compte.prompts.status.published")}</b>{t("admin.edit.warnRest")}
                    </p>
                  )}
                  <input value={editing.description}
                    onChange={e => setEditing({ ...editing, description: e.target.value })}
                    maxLength={500} placeholder={t("admin.edit.descriptionPlaceholder")}
                    className="rounded bg-tertiary p-2 text-sm" />
                  <textarea value={editing.body}
                    onChange={e => setEditing({ ...editing, body: e.target.value })}
                    rows={12}
                    className="rounded bg-tertiary p-2 font-mono text-xs leading-relaxed" />
                  <div className="flex gap-2">
                    <button type="submit" className="rounded bg-[#DC6521] px-3 py-1.5 text-xs font-bold hover:opacity-90">
                      {t("compte.identity.save")}
                    </button>
                    <button type="button" onClick={() => void dupliquer()}
                      title={t("admin.edit.duplicateTitle")}
                      className="rounded border border-white/20 px-3 py-1.5 text-xs hover:bg-tertiary">
                      {t("admin.btn.duplicate")}
                    </button>
                    <button type="button" onClick={() => setEditing(null)}
                      className="rounded border border-white/20 px-3 py-1.5 text-xs hover:bg-tertiary">{t("admin.btn.cancel")}</button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
      )}

      {(!seule || seule === "commentaires") && (
      <section className="mt-10">
        <h2 className="text-lg font-bold">{t("admin.comments.heading", { n: pendingComments.length })}{listeCommentaires.barre}</h2>
        <p className="mt-1 text-xs opacity-60">{t("admin.comments.help")}</p>
        {pendingComments.length === 0 && <p className="mt-2 text-sm opacity-60">{t("admin.comments.empty")}</p>}
        <ul className="mt-2 flex flex-col gap-2">
          {listeCommentaires.visibles.map(c => (
            <li key={c.id} className="rounded border border-yellow-500/30 bg-secondary p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs opacity-70">
                <Link href={`/p/${encodeURIComponent(c.promptName)}`} className="font-bold underline">{c.promptName}</Link>
                <span>{new Date(c.createdAt).toLocaleString("fr-CH")}</span>
                {!c.promptAuthorEmail && <span className="rounded bg-orange-600/30 px-1.5">{t("admin.comments.anonymousTutor")}</span>}
                <span className="flex-grow" />
                <button onClick={() => moderateComment(c, "approve")}
                  className="flex items-center gap-1 rounded bg-green-600/80 px-2 py-1 hover:bg-green-600"><MdCheck /> {t("admin.btn.approve")}</button>
                <button onClick={() => moderateComment(c, "hide")}
                  className="flex items-center gap-1 rounded bg-gray-600/70 px-2 py-1 hover:bg-gray-600"><MdVisibilityOff /> {t("admin.btn.hide")}</button>
              </div>
              <p className="mt-2 whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
        {moderatedComments.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer opacity-70">
              {t("admin.comments.moderated", {
                n: moderatedTotal > moderatedComments.length
                  ? t("admin.comments.shownOf", { n: moderatedComments.length, total: moderatedTotal })
                  : moderatedComments.length,
              })}
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {moderatedComments.map(c => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 border-b border-white/5 py-1 text-xs">
                  <span className={`rounded px-1.5 ${c.status === "approved" ? "bg-green-600/30" : "bg-gray-600/30"}`}>
                    {c.status === "approved" ? t("admin.comments.approved") : t("admin.comments.hidden")}
                  </span>
                  <Link href={`/p/${encodeURIComponent(c.promptName)}`} className="underline">{c.promptName}</Link>
                  <span className="max-w-md truncate opacity-70">{c.body}</span>
                  <span className="flex-grow" />
                  <span className="opacity-50">{c.moderatedBy ?? ""}</span>
                  <button onClick={() => moderateComment(c, c.status === "approved" ? "hide" : "approve")}
                    className="rounded border border-white/20 px-2 py-0.5 hover:bg-tertiary">
                    {c.status === "approved" ? t("admin.btn.hide") : t("admin.btn.approve")}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      )}

      {!seule && (<>
      {/* ─── Zone 2 : Comptes ─── */}
      <h2 className="mt-12 border-b-2 border-[#DC6521]/50 pb-1 text-xl font-bold uppercase tracking-wide text-[#DC6521]">
        {t("admin.zone.accounts")}
      </h2>
      </>)}
      {(!seule || seule === "comptes") && (
      <section className="mt-10">
        <h2 className="text-lg font-bold">{t("admin.accounts.heading", { n: users.length })}{listeComptes.barre}</h2>
        <p className="mt-1 text-xs opacity-60">{t("admin.accounts.help")}</p>
        {users.length === 0 ? (
          <p className="mt-2 text-sm opacity-60">{t("admin.accounts.empty")}</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase opacity-60">
                <tr><th className="py-1 pr-2">{t("admin.col.account")}</th><th className="pr-2">{t("admin.col.roles")}</th>
                  <th className="pr-2">{t("admin.col.school")}</th><th className="pr-2">{t("admin.col.adultCertifiedBy")}</th><th className="pr-2">{t("admin.col.prompts")}</th><th>{t("admin.col.createdAt")}</th></tr>
              </thead>
              <tbody>
                {listeComptes.visibles.map(u => (
                  <tr key={u.email} className="border-b border-white/5 align-middle">
                    <td className="py-1.5 pr-2">
                      <b>{u.name || "—"}</b>
                      <span className="ml-1 opacity-60">{u.email}</span>
                      {!!u.syncOptin && <span className="ml-1 rounded bg-blue-600/30 px-1 text-xs" title={t("admin.accounts.syncTitle")}>{t("admin.accounts.sync")}</span>}
                    </td>
                    <td className="pr-2 whitespace-nowrap">
                      {/* Un SUPER-administrateur ne se règle pas d'ici : son rang
                          vient de SECRET_ADMIN_EMAILS, sur le serveur. Montrer
                          des cases qui répondront 403 serait une fausse promesse. */}
                      {u.isSuper ? (
                        <span className="rounded bg-[#DC6521]/25 px-1.5 text-xs text-[#DC6521]"
                          title={t("admin.accounts.superTitle")}>{t("admin.accounts.super")}</span>
                      ) : (<>
                      {/* « promptagogue » ne disait rien : tout compte vérifié
                          l'est. La case utile est celle de la majorité, qui
                          ouvre les fournisseurs écartés au titre de l'AI Act —
                          jamais depuis un réseau scolaire. Cocher sans nom de
                          garant vous désigne vous-même. */}
                      <label className="mr-2 text-xs" title={u.adultVerifiedAt
                        ? t("admin.accounts.adultOnTitle", {
                            date: new Date(u.adultVerifiedAt).toLocaleDateString("fr-CH"),
                            name: u.adultVerifiedBy ?? "",
                          })
                        : t("admin.accounts.adultOffTitle")}>
                        <input type="checkbox" checked={!!u.adultVerifiedAt}
                          onChange={e => updateUser(u.email, {
                            adultVerifiedBy: e.target.checked ? (u.adultVerifiedBy || moi || "administration") : "",
                          })} /> {t("admin.accounts.adult")}
                      </label>
                      <label className="text-xs">
                        <input type="checkbox" checked={!!u.isTeacher}
                          onChange={e => updateUser(u.email, { isTeacher: e.target.checked })} /> {t("admin.accounts.teacher")}
                      </label>
                      {/* Administrateur de SON école : valide les prompts, modère,
                          gère les comptes de l'école et lit sa facture. Un
                          administrateur d'école peut en nommer d'autres — chez
                          lui seulement (décision du client). */}
                      <label className="ml-2 text-xs" title={t("admin.accounts.schoolAdminTitle")}>
                        <input type="checkbox" checked={!!u.isSchoolAdmin}
                          disabled={!u.etablissementId}
                          onChange={e => updateUser(u.email, { isSchoolAdmin: e.target.checked })} /> {t("admin.accounts.schoolAdmin")}
                      </label>
                      </>)}
                    </td>
                    <td className="pr-2">
                      {u.isTeacher && isSuper ? (
                        <select value={u.etablissementId ?? ""}
                          onChange={e => updateUser(u.email, { etablissementId: e.target.value || null })}
                          className="rounded bg-tertiary p-1 text-xs">
                          <option value="">{t("admin.accounts.noSchool")}</option>
                          {etabs.map(e2 => <option key={e2.id} value={e2.id}>{e2.name}</option>)}
                        </select>
                      ) : <span className="text-xs opacity-60">{u.etablissementName ?? "—"}</span>}
                    </td>
                    <td className="pr-2 text-xs">
                      {/* Certification de majorité : le NOM du garant suffit.
                          Aucune pièce d'identité n'est demandée ni conservée —
                          l'entretien vidéo sert à décider, pas à archiver. */}
                      <input
                        defaultValue={u.adultVerifiedBy ?? ""}
                        placeholder={t("admin.accounts.certifiedByPlaceholder")}
                        title={u.adultVerifiedAt
                          ? t("admin.accounts.certifiedOnTitle", {
                              date: new Date(u.adultVerifiedAt).toLocaleDateString("fr-CH"),
                              name: u.adultVerifiedBy ?? "",
                            })
                          : t("admin.accounts.certifyHint")}
                        onBlur={e => {
                          if ((e.target.value.trim() || "") !== (u.adultVerifiedBy ?? "")) {
                            updateUser(u.email, { adultVerifiedBy: e.target.value.trim() });
                          }
                        }}
                        className={`w-36 rounded bg-tertiary px-1 py-0.5 text-xs ${u.adultVerifiedAt ? "ring-1 ring-green-600/60" : ""}`} />
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
      )}

      {(!seule || seule === "facturation") && (
      <section className="mt-10">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold">{t("admin.billing.heading")}{listeFacture.barre}</h2>
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
            className="rounded bg-tertiary p-1 text-sm" />
          <button onClick={downloadCsv}
            className="flex items-center gap-1 rounded border border-white/20 px-2 py-1 text-xs hover:bg-tertiary">
            <MdDownload /> {t("admin.billing.exportCsv")}
          </button>
        </div>
        {billing.length === 0 ? (
          <p className="mt-2 text-sm opacity-60">{t("admin.billing.empty")}</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs uppercase opacity-60">
              <tr><th className="py-1">{t("admin.col.school")}</th><th>{t("admin.col.ip")}</th><th>{t("admin.col.provider")}</th>
                <th className="text-right">{t("admin.col.requests")}</th><th className="text-right">{t("admin.col.tokens")}</th></tr>
            </thead>
            <tbody>
              {listeFacture.visibles.map((row, i) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="py-1">{row.etablissement}{!!row.respire && <span className="ml-1 rounded bg-green-600/30 px-1 text-xs">{t("admin.billing.free")}</span>}</td>
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
            <h3 className="mt-6 font-bold">{t("admin.billing.byTeacher")}</h3>
            <table className="mt-2 w-full text-left text-sm">
              <thead className="text-xs uppercase opacity-60">
                <tr><th className="py-1">{t("admin.col.teacher")}</th><th>{t("admin.col.school")}</th><th>{t("admin.col.provider")}</th>
                  <th className="text-right">{t("admin.col.requests")}</th><th className="text-right">{t("admin.col.tokens")}</th></tr>
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
        <p className="mt-2 text-xs opacity-50">{t("admin.billing.note")}</p>
      </section>
      )}

      {/* ─── LA FACTURE, EN MONNAIE, AVEC SA PARTICIPATION EN CLAIR ───
          Le relevé ci-dessus compte les jetons ; celui-ci les traduit au tarif
          et nomme les 10 % de frais de fonctionnement. C'est la ligne que
          l'école doit voir : une contribution qu'on cache n'est plus une
          contribution, c'est une marge. */}
      {(!seule || seule === "factures") && (
      <section className="mt-10">
        <h2 className="text-lg font-bold">{t("admin.facture.heading")}</h2>
        <p className="mt-1 text-xs opacity-60">{t("admin.facture.help")}</p>

        {factures.length === 0 ? (
          <p className="mt-2 text-sm opacity-60">{t("admin.facture.empty")}</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {factures.map(f => (
              <div key={f.etablissementId} className="rounded border border-white/10 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{f.etablissement}</b>
                  <span className="opacity-60">{f.periode}</span>
                  {f.respire && <span className="rounded bg-green-600/30 px-1.5 text-xs">{t("admin.facture.respire")}</span>}
                  {f.payeeAt && <span className="rounded bg-green-600/30 px-1.5 text-xs">{t("admin.facture.paid")}</span>}
                  {!f.payeeAt && f.emiseAt && <span className="rounded bg-amber-500/30 px-1.5 text-xs">{t("admin.facture.unpaid")}</span>}
                  {f.tarifChange && <span className="rounded bg-amber-500/30 px-1.5 text-xs" title={t("admin.facture.driftTitle")}>{t("admin.facture.drift")}</span>}
                  <span className="flex-grow" />
                  {isSuper && !f.respire && (
                    <>
                      <button onClick={() => actionFacture(f.etablissementId, "emettre")} className={BTN}>
                        {f.emiseAt ? t("admin.facture.reissue") : t("admin.facture.issue")}
                      </button>
                      {f.emiseAt && (
                        <button onClick={() => actionFacture(f.etablissementId, f.payeeAt ? "impayee" : "payee", f.periode)} className={BTN}>
                          {f.payeeAt ? t("admin.facture.markUnpaid") : t("admin.facture.markPaid")}
                        </button>
                      )}
                    </>
                  )}
                </div>
                {f.lignes.length > 0 && (
                  <table className="mt-2 w-full text-left text-xs">
                    <tbody>
                      {f.lignes.map(l => (
                        <tr key={l.provider} className="opacity-70">
                          <td className="py-0.5">{l.provider}</td>
                          <td className="text-right">{l.tokens.toLocaleString("fr-CH")} {t("admin.facture.tokens")}</td>
                          <td className="text-right">× {l.prixMtok.toFixed(2)} / M</td>
                          <td className="text-right">{l.montant.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <dl className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
                  <span><dt className="inline opacity-60">{t("admin.facture.consumption")} </dt>
                    <dd className="inline font-mono">{f.consommation.toFixed(2)} {f.devise}</dd></span>
                  <span title={t("admin.facture.shareTitle")}>
                    <dt className="inline opacity-60">{t("admin.facture.share", { pct: f.participationPct })} </dt>
                    <dd className="inline font-mono">{f.participation.toFixed(2)} {f.devise}</dd></span>
                  <span><dt className="inline font-bold">{t("admin.facture.total")} </dt>
                    <dd className="inline font-mono font-bold">{f.total.toFixed(2)} {f.devise}</dd></span>
                </dl>
              </div>
            ))}
          </div>
        )}

        {/* Le tarif : lisible par l'école qu'il facture, modifiable par le
            site seul — il vaut pour toutes, une seule ne peut pas le fixer. */}
        {tarifsListe.length > 0 && (
          <>
            <h3 className="mt-6 font-bold">{t("admin.tarif.heading")}</h3>
            <p className="mt-1 text-xs opacity-60">{isSuper ? t("admin.tarif.helpSuper") : t("admin.tarif.helpSchool")}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              {tarifsListe.map(tr => (
                <label key={tr.provider} className="flex items-center gap-1">
                  <span className="opacity-70">{tr.provider}</span>
                  <input type="number" min={0} step="0.01" defaultValue={tr.prixMtok} disabled={!isSuper}
                    onBlur={e => { const v = Number(e.target.value);
                      if (isSuper && Number.isFinite(v) && v !== tr.prixMtok) void reglerTarif(tr.provider, v); }}
                    className="w-20 rounded bg-tertiary p-1 text-right text-xs disabled:opacity-50" />
                </label>
              ))}
            </div>
          </>
        )}

        {/* Ce que la participation a rapporté, face à ce qu'elle a financé.
            Les mettre côte à côte est la seule façon de vérifier la promesse. */}
        {isSuper && participation && (
          <p className="mt-4 rounded border border-[#DC6521]/40 bg-[#DC6521]/10 p-2 text-xs">
            {t("admin.participation.summary", {
              pct: participation.pct,
              collectee: participation.collectee.toFixed(2),
              demo: participation.demo.toFixed(2),
              respire: participation.respire.toFixed(2),
              devise: participation.devise,
            })}
          </p>
        )}

        {isSuper && impayees.length > 0 && (
          <>
            <h3 className="mt-6 font-bold">{t("admin.impayees.heading", { n: impayees.length })}</h3>
            <table className="mt-2 w-full text-left text-sm">
              <thead className="text-xs uppercase opacity-60">
                <tr><th className="py-1">{t("admin.col.school")}</th><th>{t("admin.impayees.period")}</th>
                  <th>{t("admin.impayees.billingEmail")}</th><th className="text-right">{t("admin.facture.total")}</th><th /></tr>
              </thead>
              <tbody>
                {impayees.map(f => (
                  <tr key={`${f.etablissementId}-${f.periode}`} className="border-b border-white/5">
                    <td className="py-1">{f.etablissement}</td>
                    <td>{f.periode}</td>
                    <td className="text-xs opacity-70">{f.billingEmail || "—"}</td>
                    <td className="text-right font-mono">{f.total.toFixed(2)} {f.devise}</td>
                    <td className="text-right">
                      <button onClick={() => actionFacture(f.etablissementId, "payee", f.periode)} className={BTN}>
                        {t("admin.facture.markPaid")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
      )}

      {isSuper && (!seule || seule === "etablissements") && (
      <section className="mt-10">
        <h2 className="text-lg font-bold">{t("admin.schools.heading")}{listeEtabs.barre}</h2>
        <p className="mt-1 text-xs opacity-60">{t("admin.schools.help")}</p>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {listeEtabs.visibles.map(e => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 border-b border-white/5 py-1">
              <b>{e.name}</b>
              <span className="opacity-60">{e.ips || t("admin.schools.noIp")}</span>
              {!!e.respire && <span className="rounded bg-green-600/30 px-1.5 text-xs">{t("admin.schools.respire")}</span>}
              <span className="opacity-60">{t("admin.schools.quota", {
                v: e.token_quota_monthly > 0
                  ? t("admin.schools.perMonth", { v: formatTokens(e.token_quota_monthly) })
                  : t("admin.schools.unlimited"),
              })}</span>
              <span className="flex-grow" />
              <button onClick={() => setForm({ id: e.id, name: e.name, ips: e.ips, respire: !!e.respire, quota: String(e.token_quota_monthly || ""), perStudent: String((e as any).quota_per_student_daily || ""), billingEmail: e.billing_email })}
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
      )}

      {isSuper && !seule && (<>
      {/* ─── Zone 3 : Modèles ─── */}
      {/* Réservée au site : l'échelle et le catalogue valent pour TOUTES les
          écoles, donc pour aucune en particulier. */}
      <h2 className="mt-12 border-b-2 border-[#DC6521]/50 pb-1 text-xl font-bold uppercase tracking-wide text-[#DC6521]">
        {t("admin.zone.models")}
      </h2>
      </>)}
      {isSuper && (!seule || seule === "echelle") && (
      <section className="mt-10">
        <h2 className="text-lg font-bold">{t("admin.ladder.heading")}</h2>
        <p className="mt-1 text-xs opacity-60">{t("admin.ladder.help1")}</p>
        {/* Deux mots en gras au milieu de la phrase : découpés pour que chaque
            langue place le sien où sa syntaxe le veut. */}
        <p className="mt-1 text-xs opacity-60">
          {t("admin.ladder.help2a")}{" "}
          <b>{t("admin.ladder.suggestion")}</b>{" "}
          {t("admin.ladder.help2b")}{" "}
          <b>{t("admin.ladder.yourSetting")}</b>{t("admin.ladder.help2c")}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="uppercase opacity-60">
              <tr>
                <th className="py-1 pr-2">{t("admin.col.provider")}</th>
                <th className="pr-2">{t("admin.ladder.rung1")}</th>
                <th className="pr-2">{t("admin.ladder.rung2")}</th>
                <th className="pr-2">{t("admin.ladder.rung3")}</th>
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
                          ? <span className="block text-[10px] text-[#DC6521]">{t("admin.ladder.yourSetting")}</span>
                          : <span className="block text-[10px] opacity-50">{t("admin.ladder.suggestionFollowed")}</span>}
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
                            {t("admin.ladder.suggestionLine", { v: row.suggested[i] ?? "—" })}
                          </span>
                          {row.unknown.includes(valeurs[i]) && (
                            <span className="block text-[10px] text-red-400">{t("admin.ladder.notInCatalogue")}</span>
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
                            if (!response.ok) { setMessage(t("admin.msg.ladderSaveFailed", { provider: row.provider })); return; }
                            setMessage(t("admin.msg.ladderSaved", { provider: row.provider }));
                            setLadderEdit(prev => { const c = { ...prev }; delete c[row.provider]; return c; });
                            fetch("/api/admin/ladder", { headers: authHeaders() })
                              .then(r => r.json()).then(d => setLadders(d.ladders ?? [])).catch(() => {});
                          }}
                          className="rounded border border-white/20 px-2 py-1 hover:bg-tertiary">
                          {t("compte.identity.save")}
                        </button>
                        {!row.verifiable && (
                          <span className="block text-[10px] opacity-50">{t("admin.ladder.notVerifiable")}</span>
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
      )}

      {isSuper && (!seule || seule === "catalogue") && (
      <section className="mt-10">
        <h2 className="text-lg font-bold">{t("admin.catalogue.heading")}</h2>
        <p className="mt-1 text-xs opacity-60">{t("admin.catalogue.help")}</p>
        {/* native / openrouter / defaut sont les valeurs rendues par l'API :
            elles restent en dur, seule leur explication est traduite. */}
        <p className="mt-1 text-xs opacity-60">
          <b>native</b>{" = "}{t("admin.catalogue.sourceNative")}{" · "}
          <b>openrouter</b>{" = "}{t("admin.catalogue.sourceOpenrouter")}{" · "}
          <b>defaut</b>{" = "}{t("admin.catalogue.sourceDefaut")}
        </p>
        <button
          onClick={async () => {
            setRefreshing(true); setMessage("");
            try {
              const response = await fetch("/api/admin/models", { method: "POST", headers: authHeaders() });
              const data = await response.json();
              if (!response.ok) throw new Error();
              setCatalogue(data.catalogue ?? []);
              setMessage(t("admin.msg.catalogueRebuilt"));
            } catch {
              setMessage(t("admin.msg.catalogueFailed"));
            } finally {
              setRefreshing(false);
            }
          }}
          disabled={refreshing}
          className="mt-3 rounded bg-[#DC6521] px-3 py-1.5 text-sm font-bold text-[#111827] hover:opacity-90 disabled:opacity-50">
          {refreshing ? t("admin.catalogue.rebuilding") : t("admin.catalogue.refreshNow")}
        </button>
        {catalogue.length > 0 && (
          <table className="mt-3 w-full text-left text-xs">
            <thead className="uppercase opacity-60">
              <tr><th className="py-1">{t("admin.col.provider")}</th><th>{t("admin.col.source")}</th><th className="text-right">{t("admin.col.models")}</th><th className="text-right">{t("admin.col.updatedAt")}</th></tr>
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
      )}
    </div>
  );
}
