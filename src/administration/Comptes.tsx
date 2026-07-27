import React, { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n/useT";
import { authHeaders } from "../utils/account";
import { useListe, useListeSeule } from "../site/ListePaginee";
import { type AdminUser, type Etab } from "./commun";

// LES COMPTES DE L'ÉCOLE.
//
// Descendu de /admin vers /etablissement : gérer qui enseigne chez soi et qui
// y administre est une affaire d'école, pas de plateforme. Le SERVEUR n'a pas
// changé de règles — /api/admin/users filtre déjà sur la portée de l'appelant
// et refuse tout ce qui la déborde ; cet écran ne fait que se tenir là où la
// portée a un sens.
//
// LA CERTIFICATION DE MAJORITÉ A DISPARU DE CET ÉCRAN (décision du client), et
// avec elle la case « adulte », la colonne « majorité certifiée par » et son
// champ de garant. Elle ne commandait plus rien : l'accès aux fournisseurs
// écartés ne se lit plus sur l'âge attesté d'un compte mais sur LE RÉSEAU d'où
// l'on appelle (src/server/accesFournisseurs.ts). Un élève qui basculait son
// téléphone en 4G quittait le réseau de l'école et obtenait tout ; une
// restriction qu'un geste contourne ne protégeait personne, et faisait signer
// aux administrateurs d'école une attestation sans effet. Les colonnes
// users.adult_verified_at / adult_verified_by demeurent en base (migration
// additive), plus rien ne les lit.
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
                <th className="pr-2">{t("admin.col.school")}</th><th className="pr-2">{t("admin.col.prompts")}</th><th>{t("admin.col.createdAt")}</th></tr>
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
                        l'est. Reste donc ce qui se décide vraiment ici : qui
                        enseigne dans cette école, et qui l'administre. */}
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
                  {/* La colonne « majorité certifiée par » est partie avec la
                      règle qu'elle servait — en-tête ET cellule d'un même
                      geste : une colonne retirée d'un seul côté décalerait en
                      silence tout ce qui la suit. */}
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
