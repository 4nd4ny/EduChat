import Link from "next/link";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { MdArchive, MdCheck, MdEdit, MdPublish, MdVisibilityOff, MdTranslate } from "react-icons/md";
import { useT } from "../i18n/useT";
import { authHeaders } from "../utils/account";
import { useListe, useListeSeule } from "../site/ListePaginee";
import { formatTokens } from "../utils/formatTokens";
import {
  BTN, BadgeTraductions, StatusBadge, expliquer,
  type AdminComment, type AdminPrompt,
} from "./commun";

// LA MODÉRATION — celle qui relève de l'ÉCOLE, donc de /enseignant.
//
// Valider le tuteur d'un collègue, relire un commentaire déposé sur une fiche :
// ce sont des gestes d'enseignement, quotidiens, qui se font là où l'on
// prépare sa classe. Ils demandent le rang d'administrateur de l'école — la
// page les enveloppe donc dans une ZoneAdmin — mais ils n'ont rien à faire
// dans l'administration du SITE, qui ne connaît pas les élèves.
//
// LA PORTÉE N'EST PAS ICI. /api/admin/prompts et /api/admin/comments ne
// rendent à un administrateur d'école que les tuteurs de SON école active et
// ceux de la plateforme ; ce composant affiche ce qu'il reçoit. Changer
// d'école dans le sélecteur change l'en-tête, donc la réponse : d'où la
// dépendance à `ecole` dans les effets de relecture.
//
// UNE SEULE EXCEPTION, ET C'EST UNE DEMANDE, PAS UN FILTRE : sur /enseignant,
// la requête porte `?portee=ecole`. Le SUPER-ADMINISTRATEUR est le seul dont
// la portée n'était bornée par rien — il lisait donc, sur la page où il
// prépare sa classe, les files de modération de tous les établissements du
// site. Le drapeau lui dit « borne-toi à l'école du sélecteur ». Il ne peut
// rien élargir, et le serveur reste seul à trancher (server/admin.ts).
// On ne coupe RIEN à l'affichage : ce qui n'a pas à être lu ne doit pas
// traverser le réseau.

/** Ce que les deux sections ont besoin de savoir de leur page d'accueil. */
type Props = {
  /** L'école active. Sert de CLÉ de relecture : elle change, tout se relit. */
  ecole: number | null;
  /** Démonstration (?visite=1) : aucun appel au serveur, aucune donnée réelle. */
  demo?: boolean;
  /**
   * Demander au serveur de se borner à l'école active (/enseignant).
   * Absent sur /admin, qui modère aussi le catalogue de la plateforme.
   */
  limiterAEcole?: boolean;
};

/**
 * Le suffixe de requête qui porte la demande de portée.
 *
 * La valeur doit rester égale à PORTEE_ECOLE (src/server/admin.ts). On ne
 * l'importe pas : ce module-là ouvre la base SQLite, et le faire entrer dans
 * un composant l'emmènerait dans le paquet du navigateur.
 */
const SUFFIXE_ECOLE = '?portee=ecole';

export function ModerationTuteurs({ ecole, demo, limiterAEcole }: Props) {
  const t = useT();
  const seule = useListeSeule();
  const [prompts, setPrompts] = useState<AdminPrompt[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [traduisant, setTraduisant] = useState<string | null>(null);
  // Éditeur de prompt (description + corps) — ouvert sur un nom de prompt.
  // « name » = l'identifiant d'ORIGINE (celui que l'API doit cibler),
  // « nom » = ce que l'administration a tapé. Les distinguer est ce qui rend
  // le renommage possible depuis le formulaire.
  const [editing, setEditing] = useState<
    { name: string; nom: string; description: string; body: string } | null>(null);
  // Dernier code d'erreur renvoyé par act() : saveEdit en a besoin pour dire
  // POURQUOI un renommage a échoué, alors qu'il écrase le message de act().
  const dernierCode = useRef("");

  const reload = useCallback(() => {
    if (demo) return;
    fetch(`/api/admin/prompts${limiterAEcole ? SUFFIXE_ECOLE : ""}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => setPrompts(data.prompts ?? []))
      .catch(() => setPrompts([]));
  }, [demo, limiterAEcole]);

  // `ecole` n'est pas lu dans le corps de l'effet — il voyage dans l'en-tête
  // que pose authHeaders(). Il figure ici comme DÉCLENCHEUR : changer d'école
  // doit relire la liste, sans quoi l'écran garderait les tuteurs de l'autre.
  useEffect(() => { reload(); }, [reload, ecole]);

  const pending = prompts.filter(p => p.status === "pending");
  const others = prompts.filter(p => p.status !== "pending");

  // Huit lignes par liste ; « Tout voir » rouvre la page sur cette seule
  // liste, entière, avec recherche et tri. Les « cle » sont des identifiants
  // (ils voyagent dans l'URL) ; seuls les « label » sont traduits.
  const listePrompts = useListe("prompts", others, {
    cherchable: p2 => `${p2.name} ${p2.description} ${p2.status}`,
    tris: [
      { cle: "nom", label: t("admin.sort.name"), compare: (a, b) => a.name.localeCompare(b.name) },
      { cle: "usages", label: t("home.sort.uses"), compare: (a, b) => b.usageCount - a.usageCount },
      { cle: "jetons", label: t("admin.sort.tokens"), compare: (a, b) => b.tokensTotal - a.tokensTotal },
      { cle: "etat", label: t("admin.sort.status"), compare: (a, b) => a.status.localeCompare(b.status) },
    ],
  });

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

  // Relance des traductions. Celle-ci est attendue (trois appels à Haiku),
  // là où la publication ne l'attend pas : ici, le résultat EST la réponse.
  const retraduire = async (name: string, forcer = false) => {
    setTraduisant(name);
    try {
      const ok = await act(name, "retranslate", forcer ? { force: true } : {});
      if (ok) setMessage(t("admin.tr.done", { name }));
    } finally {
      setTraduisant(null);
    }
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

  if (seule && seule !== "prompts") return null;

  return (
    <>
      {message && <p className="mt-2 text-sm text-red-400">{message}</p>}
      <section className="mt-6">
        <h3 className="text-base font-bold">{t("admin.prompts.toValidate", { n: pending.length })}</h3>
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

        <h3 className="mt-6 text-base font-bold">{t("admin.prompts.allHeading")}{listePrompts.barre}</h3>
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
                <StatusBadge status={p.status} />
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
    </>
  );
}

export function ModerationCommentaires({ ecole, demo, limiterAEcole }: Props) {
  const t = useT();
  const seule = useListeSeule();
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [moderatedTotal, setModeratedTotal] = useState(0);
  const [message, setMessage] = useState("");

  const reload = useCallback(() => {
    if (demo) return;
    fetch(`/api/admin/comments${limiterAEcole ? SUFFIXE_ECOLE : ""}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => { setComments(data.comments ?? []); setModeratedTotal(data.moderatedTotal ?? 0); })
      .catch(() => { setComments([]); setModeratedTotal(0); });
  }, [demo, limiterAEcole]);

  useEffect(() => { reload(); }, [reload, ecole]);

  const pendingComments = comments.filter(c => c.status === "pending");
  const moderatedComments = comments.filter(c => c.status !== "pending");

  const listeCommentaires = useListe("commentaires", pendingComments, {
    cherchable: c => `${c.promptName} ${c.body}`,
    tris: [{ cle: "date", label: t("admin.sort.recent"), compare: (a, b) => b.createdAt - a.createdAt }],
  });

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

  if (seule && seule !== "commentaires") return null;

  return (
    <section className="mt-8">
      {message && <p className="mb-2 text-sm text-red-400">{message}</p>}
      <h3 className="text-base font-bold">{t("admin.comments.heading", { n: pendingComments.length })}{listeCommentaires.barre}</h3>
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
  );
}
