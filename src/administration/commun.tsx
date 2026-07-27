import React from "react";
import { MdAdminPanelSettings, MdTranslate } from "react-icons/md";
import { useT } from "../i18n/useT";

// LE VOCABULAIRE COMMUN DES TROIS ADMINISTRATIONS.
//
// Depuis la répartition par niveau (décision A), une même section peut vivre
// sur /etablissement, sur /enseignant ou sur /admin selon qui la regarde. Les
// TYPES que les API renvoient, les phrases qui traduisent leurs refus et les
// pastilles qui disent l'état d'un tuteur n'appartiennent donc plus à une
// page : les recopier d'un écran à l'autre garantissait qu'une correction se
// ferait un jour à un seul endroit sur trois.

// ---------------------------------------------------------------- types API

export type EtatTraduction = {
  locale: string; state: "ok" | "pending" | "failed" | "absent";
  perimee: boolean; sourceVersion: number; detail: string; updatedAt: number; tokens: number;
};
export type ResumeTraductions = {
  etats: EtatTraduction[]; pretes: number; total: number;
  aVerifier: boolean; enEchec: boolean; enCours: boolean;
};
export type AdminPrompt = {
  name: string; authorEmail: string | null; authorName: string; language: string;
  description: string; body: string; version: number; status: string;
  usageCount: number; tokensTotal: number; sizeBytes: number;
  translations: ResumeTraductions;
  // École propriétaire (null = catalogue de la plateforme) et sortie hors de
  // ses murs. Ces deux champs ne quittent JAMAIS l'administration : la carte
  // publique ne dit pas quelle école a écrit quel tuteur.
  etablissementId: number | null; publie: number;
};
export type Etab = {
  id: number; name: string; ips: string; respire: number;
  token_quota_monthly: number; quota_per_student_daily: number;
  active_provider: string; billing_email: string;
  /** Les élèves voient AUSSI les tuteurs publics des autres écoles. */
  catalogue_ouvert: number;
};
export type BillingRow = {
  etablissement: string; respire: number; ip: string; provider: string;
  requests: number; tokens: number;
};
export type TeacherBillingRow = {
  teacherEmail: string; etablissement: string; provider: string;
  requests: number; tokens: number;
};
export type AdminUser = {
  isSuper?: boolean; isSchoolAdmin?: boolean;
  email: string; name: string; isPromptagogue: number; isTeacher: number;
  etablissementId: number | null; etablissementName: string | null;
  syncOptin: number; createdAt: number; verifiedAt: number | null; promptCount: number;
  adultVerifiedAt: number | null; adultVerifiedBy: string | null;
};
export type AdminComment = {
  id: number; body: string; status: "pending" | "approved" | "hidden";
  createdAt: number; moderatedAt: number | null; moderatedBy: string | null;
  promptName: string; promptAuthorEmail: string | null;
};
export type LigneFacture = { provider: string; tokens: number; prixMtok: number; montant: number };
/**
 * Les mentions administratives d'un mois : ce que l'école ajoute pour que sa
 * comptabilité puisse payer. AUCUNE n'entre dans un calcul — le montant reste
 * celui du porte-monnaie, et c'est ce qui permet d'en confier la saisie à
 * l'école sans réserve (src/server/facturation.ts).
 */
export type MentionsFacture = {
  adresse: string; reference: string; note: string;
  /** L'adresse affichée vient du profil de l'école, faute de saisie pour ce mois. */
  adresseParDefaut: boolean;
  updatedAt: number | null; par: string;
};
export type FactureRow = {
  etablissementId: number; etablissement: string; respire: boolean; periode: string;
  lignes: LigneFacture[]; jetons: number; consommation: number; participation: number;
  participationPct: number; total: number; devise: string;
  emiseAt: number | null; payeeAt: number | null; tarifChange: boolean;
  billingEmail: string; mentions: MentionsFacture;
};
export type Compte = {
  etablissementId: number; etablissement: string; respire: boolean; solde: number;
  devise: string; billingEmail: string; depense30: number; jours: number | null;
  recharge: number; aSec: boolean; contributionPct: number;
};
export type MouvementRow = { id: number; ts: number; genre: string; montant: number; solde: number; detail: string; par: string };
export type Participation = { devise: string; pct: number; collectee: number; demo: number; respire: number; jetonsOfferts: number };
export type PropositionTarif = {
  modele: string; entreeMtok: number; sortieMtok: number;
  melangeMtok: number; devise: string; detail: string; at: number;
};
export type TarifRow = { provider: string; prixMtok: number; proposition: PropositionTarif | null };
export type CatalogueRow = { provider: string; source: string; count: number; at: number };
export type LadderRow = {
  provider: string; rungs: string[]; suggested: string[]; custom: boolean;
  verifiable: boolean; unknown: string[]; catalogue: number;
};

/** Bouton discret des listes d'administration — une seule allure pour tous. */
export const BTN = "flex items-center gap-1 rounded border border-white/20 px-2 py-0.5 text-xs hover:bg-tertiary";

// ------------------------------------------------------------- traductions

/**
 * Traduire les refus du serveur en phrases qui disent quoi faire. Un code brut
 * (« ERR_NAME_TAKEN ») envoie chercher un prompt qui, s'il est archivé, est
 * invisible de cette liste : sans cette phrase, l'impasse est indéchiffrable.
 *
 * Le traducteur est passé en argument : la fonction vit hors du composant,
 * mais ses phrases vivent dans le dictionnaire.
 */
export function expliquer(t: ReturnType<typeof useT>, code: string): string {
  switch (code) {
    case "ERR_NAME_TAKEN": return t("admin.err.nameTaken");
    case "ERR_NAME_INVALID": return t("admin.err.nameInvalid");
    case "ERR_RATE_LIMIT": return t("admin.err.rateLimit");
    case "ERR_ARCHIVED": return t("admin.err.archived");
    case "ERR_STATUS": return t("admin.err.status");
    case "ERR_FORBIDDEN": return t("admin.err.forbidden");
    case "ERR_BODY_TOO_SHORT": return t("admin.err.bodyTooShort");
    case "ERR_QUOTA_USER": return t("admin.err.quotaUser");
    case "ERR_NOT_SCHOOL_OWNED": return t("admin.err.notSchoolOwned");
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
export function BadgeTraductions({ resume }: { resume: ResumeTraductions }) {
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

/**
 * Les états d'un tuteur, dits à un humain. Le serveur, lui, garde ses
 * identifiants (published, draft, pending, retired) : ils ne changent pas.
 */
export function libelleEtat(t: ReturnType<typeof useT>, status: string): string {
  switch (status) {
    case "published": return t("admin.status.published");
    case "draft": return t("admin.status.draft");
    case "pending": return t("admin.status.pending");
    case "retired": return t("admin.status.retired");
    default: return status;
  }
}

export function StatusBadge({ status }: { status: string }) {
  const t = useT();
  return (
    <span className={`rounded px-1.5 text-xs ${status === "published" ? "bg-green-600/30"
      : status === "draft" ? "bg-yellow-600/30" : status === "pending" ? "bg-orange-600/30" : "bg-gray-600/30"}`}>
      {libelleEtat(t, status)}
    </span>
  );
}

// ------------------------------------------------- le rang, rendu visible

/**
 * L'ENCADRÉ DES SECTIONS RÉSERVÉES AUX ADMINISTRATEURS.
 *
 * L'espace enseignant mêle désormais deux publics sur une même page : ce que
 * TOUT enseignant de l'école peut faire, et ce qui demande le rang
 * d'administrateur. Sans marque visible, un enseignant ordinaire lirait la
 * page comme si tout lui était ouvert et découvrirait la limite en heurtant un
 * 403 ; un administrateur, lui, ne saurait pas ce qu'il montre à ses collègues
 * quand il projette son écran. D'où un liseré orange et une pastille : la même
 * partout, pour qu'elle se reconnaisse sans être relue.
 */
export function ZoneAdmin({ titre, aide, children }: {
  titre: string; aide?: string; children: React.ReactNode;
}) {
  const t = useT();
  return (
    <section className="mt-8 rounded-lg border border-[#DC6521]/40 bg-[#DC6521]/[0.04] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{titre}</h2>
        <span className="flex items-center gap-1 rounded bg-[#DC6521]/25 px-1.5 text-xs text-[#DC6521]"
          title={t("zone.adminOnlyTitle")}>
          <MdAdminPanelSettings /> {t("zone.adminOnly")}
        </span>
      </div>
      {aide && <p className="mt-1 text-xs opacity-60">{aide}</p>}
      {children}
    </section>
  );
}

/** Une section ouverte à TOUT enseignant de l'école — sans liseré ni pastille. */
export function ZoneEnseignant({ titre, aide, tour, children }: {
  titre: string; aide?: string; tour?: string; children: React.ReactNode;
}) {
  return (
    <section data-tour={tour} className="mt-8 rounded-lg border border-white/15 bg-secondary p-4">
      <h2 className="text-lg font-bold">{titre}</h2>
      {aide && <p className="mt-1 text-xs opacity-60">{aide}</p>}
      {children}
    </section>
  );
}
