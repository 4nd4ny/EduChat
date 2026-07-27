import React, { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n/useT";
import { authHeaders } from "../utils/account";
import { BTN, type Compte, type MouvementRow } from "./commun";

// LE PORTE-MONNAIE D'UNE ÉCOLE — et sa lecture par le site.
//
// Un seul composant, deux variantes, parce que c'est UNE seule donnée :
//   « ecole » — l'école regarde le sien. Solde, autonomie estimée, taux de
//     contribution (le seul réglage financier qui lui appartienne), demande de
//     remboursement, et l'historique de ses mouvements.
//   « site »  — le super-administrateur les regarde tous, à la recherche de
//     celles qui sont À SEC : la seule chose que la plateforme ait à faire
//     d'un porte-monnaie qui n'est pas le sien.
//
// Les faire vivre dans deux fichiers aurait dupliqué le calcul du solde, la
// pastille « à sec » et la borne du taux : la prochaine correction se serait
// faite à un seul endroit sur deux.

type Bornes = { min: number; max: number; frais: number; paypal: boolean };

// LE PORTE-MONNAIE FICTIF DE LA DÉMONSTRATION (/etablissement?visite=1).
//
// La visite guidée ne peut désigner que ce qui est réellement peint : une
// étape dont l'ancre n'existe pas est sautée en silence, et le porte-monnaie
// serait resté le seul écran d'école que personne ne voit jamais avant d'y
// avoir droit. On montre donc l'écran, avec des chiffres qui n'appartiennent à
// aucune école — aucun appel au serveur, aucun bouton vivant.
const COMPTE_DEMO: Compte = {
  etablissementId: -1, etablissement: "", respire: false, solde: 128.4,
  devise: "CHF", billingEmail: "", depense30: 41.2, jours: 93,
  recharge: 100, aSec: false, contributionPct: 5,
};
const MOUVEMENTS_DEMO: MouvementRow[] = [
  { id: 3, ts: Date.UTC(2026, 4, 12), genre: "consommation", montant: -14.6, solde: 128.4, detail: "mistral", par: "" },
  { id: 2, ts: Date.UTC(2026, 3, 30), genre: "consommation", montant: -26.6, solde: 143.0, detail: "anthropic", par: "" },
  { id: 1, ts: Date.UTC(2026, 3, 2), genre: "recharge", montant: 169.6, solde: 169.6, detail: "virement", par: "" },
];

export default function PorteMonnaie({ ecole, variante, demo }: {
  /** École active — DÉCLENCHEUR de relecture (elle voyage dans l'en-tête). */
  ecole: number | null;
  variante: "ecole" | "site";
  demo?: boolean;
}) {
  const t = useT();
  const [comptes, setComptes] = useState<Compte[]>(demo ? [COMPTE_DEMO] : []);
  const [mouvements, setMouvements] = useState<MouvementRow[]>(demo ? MOUVEMENTS_DEMO : []);
  const [bornes, setBornes] = useState<Bornes>({ min: 3.5, max: 10, frais: 3.5, paypal: false });
  const [message, setMessage] = useState("");

  const relire = useCallback(() => {
    if (demo) return;
    fetch("/api/admin/credits", { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => {
        setComptes(d.comptes ?? []); setMouvements(d.mouvements ?? []);
        setBornes({
          min: d.contributionMin ?? 3.5, max: d.contributionMax ?? 10,
          frais: d.fraisPaypalPct ?? 3.5, paypal: !!d.paypalActif,
        });
      })
      .catch(() => { setComptes([]); setMouvements([]); });
  }, [demo]);

  useEffect(() => { relire(); }, [relire, ecole]);

  const reglerContribution = async (etablissementId: number, pct: number) => {
    await fetch("/api/admin/credits", {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ action: "contribution", etablissementId, pct }),
    });
    relire();
  };

  const rembourser = async (c: Compte) => {
    if (!bornes.paypal) { setMessage(t("admin.credit.refundOff")); return; }
    if (!window.confirm(t("admin.credit.refundConfirm", { montant: c.solde.toFixed(2), devise: c.devise }))) return;
    const r = await fetch("/api/admin/credits", {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ action: "rembourser", etablissementId: c.etablissementId }),
    });
    const d = await r.json().catch(() => ({}));
    setMessage(r.ok
      ? t("admin.credit.refundDone", { montant: Number(d.rembourse ?? 0).toFixed(2), devise: c.devise })
      : t("admin.credit.refundFailed"));
    relire();
  };

  const recharger = async (etablissementId: number, montant: number) => {
    const r = await fetch("/api/admin/credits", {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ etablissementId, montant, genre: "recharge" }),
    });
    if (!r.ok) { setMessage(t("admin.credit.failed")); return; }
    relire();
  };

  /**
   * LE TAUX EST À L'ÉCOLE. Un curseur plutôt qu'un champ : il montre d'un
   * coup d'œil où l'on se situe entre le plancher — qui ne couvre que les
   * frais PayPal — et le plafond. C'est ce choix laissé à l'école qui rend le
   * service difficile à copier.
   */
  const curseurTaux = (c: Compte) => (
    <label className="mt-1 flex items-center gap-2 text-xs opacity-70">
      <span>{t("admin.credit.rate")}</span>
      {/* En démonstration, le curseur se voit et se manipule, mais n'écrit
          rien : `disabled` l'aurait grisé au point de le rendre illisible,
          alors que c'est justement le réglage qu'on vient montrer. */}
      <input type="range" min={bornes.min} max={bornes.max} step={0.5}
        defaultValue={c.contributionPct}
        onMouseUp={e => { if (!demo) void reglerContribution(c.etablissementId, Number((e.target as HTMLInputElement).value)); }}
        onTouchEnd={e => { if (!demo) void reglerContribution(c.etablissementId, Number((e.target as HTMLInputElement).value)); }}
        className="w-28" />
      <span className="w-24 text-left font-mono">
        {c.contributionPct.toFixed(1)} %
        {c.contributionPct <= bornes.min && (
          <span className="ml-1 text-amber-300" title={t("admin.credit.rateFloor")}>⚠</span>
        )}
      </span>
    </label>
  );

  if (comptes.length === 0) {
    return <p className="mt-2 text-sm opacity-60">{t("admin.credit.empty")}</p>;
  }

  // ---- Variante ÉCOLE : un seul porte-monnaie, le sien, en grand. --------
  if (variante === "ecole") {
    // Le serveur ne rend à une école que SA ligne ; un super-administrateur,
    // lui, les reçoit toutes — on retient alors celle de l'école active,
    // faute de quoi il réglerait le taux de la première venue.
    const c = comptes.find(x => x.etablissementId === ecole) ?? comptes[0];
    return (
      <div className="mt-3">
        <p className="text-xs opacity-60">{t("admin.credit.help")}</p>
        <p className="mt-1 text-xs opacity-60">{t("admin.credit.rateHelp", { min: bornes.min, max: bornes.max })}</p>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <span>
            <span className="text-xs opacity-60">{t("admin.credit.balance")} </span>
            <b className={`font-mono text-lg ${c.aSec ? "text-red-300" : ""}`}>{c.solde.toFixed(2)} {c.devise}</b>
            {c.respire && <span className="ml-2 rounded bg-green-600/30 px-1 text-xs">{t("admin.credit.free")}</span>}
            {c.aSec && <span className="ml-2 rounded bg-red-600/40 px-1 text-xs">{t("admin.credit.dry")}</span>}
          </span>
          <span>
            <span className="text-xs opacity-60">{t("admin.credit.spent30")} </span>
            <span className="font-mono">{c.depense30.toFixed(2)}</span>
          </span>
          <span>
            <span className="text-xs opacity-60">{t("admin.credit.days")} </span>
            <span>{c.jours === null ? t("admin.credit.unknown") : t("admin.credit.daysValue", { n: c.jours })}</span>
          </span>
          {!c.respire && (
            <span title={t("admin.credit.suggestTitle")}>
              <span className="text-xs opacity-60">{t("admin.credit.suggest")} </span>
              <span className="font-mono">{c.recharge.toFixed(0)} {c.devise}</span>
            </span>
          )}
        </div>
        {!c.respire && curseurTaux(c)}
        {/* Le remboursement passe par PayPal, qui n'est pas ouvert : un bouton
            grisé dans une démonstration ne promet rien de bon. On ne le montre
            donc pas ici — l'école le trouvera le jour où il servira. */}
        {!demo && !c.respire && c.solde > 0 && (
          <button onClick={() => void rembourser(c)} disabled={!bornes.paypal}
            title={bornes.paypal ? t("admin.credit.refundTitle", { pct: bornes.frais }) : t("admin.credit.refundOff")}
            className={`${BTN} mt-3 disabled:opacity-40`}>
            {t("admin.credit.refund")}
          </button>
        )}
        {message && <p className="mt-2 text-sm opacity-80">{message}</p>}
        {mouvements.length > 0 && (
          <>
            <h4 className="mt-4 text-xs font-bold uppercase opacity-60">{t("admin.credit.movements")}</h4>
            <ul className="mt-1 flex flex-col gap-0.5 text-xs">
              {mouvements.slice(0, 12).map(m => (
                <li key={m.id} className="flex gap-3 opacity-70">
                  <span className="w-24 shrink-0">{new Date(m.ts).toLocaleDateString("fr-CH")}</span>
                  <span className={`w-20 shrink-0 text-right font-mono ${m.montant < 0 ? "" : "text-green-300"}`}>{m.montant.toFixed(2)}</span>
                  <span className="w-20 shrink-0 text-right font-mono opacity-60">{m.solde.toFixed(2)}</span>
                  <span className="truncate">{m.detail || m.genre}{m.par ? ` · ${m.par}` : ""}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  // ---- Variante SITE : toutes les écoles, pour repérer celles à sec. -----
  return (
    <div className="mt-3">
      {message && <p className="mb-2 text-sm text-red-400">{message}</p>}
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase opacity-60">
          <tr><th className="py-1">{t("admin.col.school")}</th>
            <th className="text-right">{t("admin.credit.balance")}</th>
            <th className="text-right">{t("admin.credit.spent30")}</th>
            <th className="text-right">{t("admin.credit.days")}</th>
            <th className="text-right" title={t("admin.credit.suggestTitle")}>{t("admin.credit.suggest")}</th>
            <th /></tr>
        </thead>
        <tbody>
          {comptes.map(c => (
            <tr key={c.etablissementId} className="border-b border-white/5">
              <td className="py-1">{c.etablissement}
                {c.respire && <span className="ml-1 rounded bg-green-600/30 px-1 text-xs">{t("admin.credit.free")}</span>}
                {c.aSec && <span className="ml-1 rounded bg-red-600/40 px-1 text-xs">{t("admin.credit.dry")}</span>}
              </td>
              <td className={`text-right font-mono ${c.aSec ? "text-red-300" : ""}`}>{c.solde.toFixed(2)} {c.devise}</td>
              <td className="text-right font-mono text-xs opacity-70">{c.depense30.toFixed(2)}</td>
              <td className="text-right text-xs">{c.jours === null ? t("admin.credit.unknown") : t("admin.credit.daysValue", { n: c.jours })}</td>
              <td className="text-right font-mono text-xs">{c.respire ? "—" : `${c.recharge.toFixed(0)} ${c.devise}`}</td>
              <td className="text-right">
                {!c.respire && (
                  <button onClick={() => { const v = Number(window.prompt(t("admin.credit.topUp"), String(c.recharge || 100)));
                    if (Number.isFinite(v) && v > 0) void recharger(c.etablissementId, v); }} className={BTN}>
                    {t("admin.credit.topUp")}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Le TAUX de chaque école reste réglable par le site : c'est le seul
          moyen de dépanner une direction qui ne trouve pas son curseur. */}
      <p className="mt-2 text-xs opacity-60">{t("admin.credit.rateHelp", { min: bornes.min, max: bornes.max })}</p>
    </div>
  );
}
