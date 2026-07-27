import React, { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n/useT";
import { authHeaders, getAccount } from "../utils/account";
import { useListe, useListeSeule } from "../site/ListePaginee";
import { type AdminUser, type Etab } from "./commun";

// LES COMPTES DE L'ÉCOLE.
//
// Descendu de /admin vers /etablissement : gérer qui enseigne chez soi, qui y
// administre et de qui l'on répond pour la majorité est une affaire d'école,
// pas de plateforme. Le SERVEUR n'a pas changé de règles — /api/admin/users
// filtre déjà sur la portée de l'appelant et refuse tout ce qui la déborde ;
// cet écran ne fait que se tenir là où la portée a un sens.
//
// LA LISTE SUIT L'ÉCOLE ACTIVE : le sélecteur du haut change l'en-tête, donc
// la portée que le serveur calcule, donc les lignes rendues. C'est la raison
// d'être de la dépendance à `ecole` — rien n'est filtré ici.

export default function Comptes({ ecole, isSuper, demo }: {
  ecole: number | null;
  /** Super-administrateur : lui seul déplace un compte d'une école à l'autre. */
  isSuper: boolean;
  demo?: boolean;
}) {
  const t = useT();
  const seule = useListeSeule();
  const account = typeof window !== "undefined" ? getAccount() : null;
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [etabs, setEtabs] = useState<Etab[]>([]);
  const [message, setMessage] = useState("");

  const relire = useCallback(() => {
    if (demo) return;
    fetch("/api/admin/users", { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => setUsers(data.users ?? []))
      .catch(() => setUsers([]));
    // La liste des écoles ne sert qu'au menu de rattachement, réservé au site.
    // Ne pas la demander autrement évite un 403 sans objet dans la console.
    if (!isSuper) return;
    fetch("/api/admin/etablissements", { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => setEtabs(data.etablissements ?? []))
      .catch(() => setEtabs([]));
  }, [demo, isSuper]);

  useEffect(() => { relire(); }, [relire, ecole]);

  const listeComptes = useListe("comptes", users, {
    cherchable: u => `${u.email} ${u.name} ${u.etablissementName ?? ""}`,
    tris: [
      { cle: "email", label: t("admin.sort.email"), compare: (a, b) => a.email.localeCompare(b.email) },
      { cle: "date", label: t("admin.sort.recent"), compare: (a, b) => (b.createdAt || 0) - (a.createdAt || 0) },
      { cle: "prompts", label: t("admin.sort.prompts"), compare: (a, b) => b.promptCount - a.promptCount },
    ],
  });

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
    relire();
  };

  // Qui coche : sert de garant par défaut quand on atteste la majorité.
  const moi = account?.name || account?.email || "";
  // SA PROPRE LIGNE. Un administrateur d'ÉCOLE ne certifie pas sa propre
  // majorité : le garant répond de quelqu'un d'autre, et depuis l'inscription
  // en libre-service ce rang s'obtient en trois champs — cocher sa case
  // ouvrirait seul les fournisseurs écartés au titre de l'AI Act. La règle
  // vit sur le SERVEUR (ERR_SELF_CERT_FORBIDDEN, src/pages/api/admin/users.ts) ;
  // ici on se contente de ne pas montrer une case qui répondrait 403 — même
  // honnêteté d'interface que pour les super-administrateurs.
  const sansAutoCertif = (email: string) =>
    !isSuper && !!account?.email && email.toLowerCase() === account.email.toLowerCase();

  if (seule && seule !== "comptes") return null;

  return (
    <div className="mt-3">
      {message && <p className="mb-2 text-sm text-red-400">{message}</p>}
      <h3 className="text-base font-bold">{t("admin.accounts.heading", { n: users.length })}{listeComptes.barre}</h3>
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
                    <label className={`mr-2 text-xs ${sansAutoCertif(u.email) ? "opacity-50" : ""}`}
                      title={sansAutoCertif(u.email)
                        ? t("admin.accounts.noSelfCert")
                        : u.adultVerifiedAt
                          ? t("admin.accounts.adultOnTitle", {
                              date: new Date(u.adultVerifiedAt).toLocaleDateString("fr-CH"),
                              name: u.adultVerifiedBy ?? "",
                            })
                          : t("admin.accounts.adultOffTitle")}>
                      <input type="checkbox" checked={!!u.adultVerifiedAt}
                        disabled={sansAutoCertif(u.email)}
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
                        lui seulement (décision du client).
                        La case porte le rang du LIEN de l'école active, que le
                        serveur a calculé : la décocher retire ce rang ICI et
                        nulle part ailleurs. */}
                    <label className="ml-2 text-xs" title={t("admin.accounts.schoolAdminTitle")}>
                      <input type="checkbox" checked={!!u.isSchoolAdmin}
                        disabled={isSuper && !u.etablissementId}
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
                      disabled={sansAutoCertif(u.email)}
                      title={sansAutoCertif(u.email)
                        ? t("admin.accounts.noSelfCert")
                        : u.adultVerifiedAt
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
    </div>
  );
}
