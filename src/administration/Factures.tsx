import React, { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n/useT";
import { authHeaders } from "../utils/account";
import { BTN, type FactureRow, type Participation, type TarifRow } from "./commun";
import { MentionsFacture } from "./MentionsFacture";

// LA FACTURE, EN MONNAIE, AVEC SA PARTICIPATION EN CLAIR.
//
// Le relevé en jetons (administration du site) compte des unités ; celui-ci
// les traduit au tarif et NOMME les frais de fonctionnement. C'est la ligne
// que l'école doit voir : une contribution qu'on cache n'est plus une
// contribution, c'est une marge.
//
// Deux variantes d'un même écran :
//   « ecole » — sa facture du mois, et le tarif auquel elle est facturée, en
//     lecture seule. Le tarif vaut pour toutes les écoles : une seule ne peut
//     pas le fixer, mais toutes ont le droit de le lire.
//   « site »  — toutes les factures, l'émission, les IMPAYÉES, le bilan de la
//     participation et le réglage des tarifs. Réservé au super-administrateur.

type Impayee = {
  etablissementId: number; etablissement: string; periode: string;
  total: number; devise: string; emiseAt: number; billingEmail: string;
};

export default function Factures({ ecole, variante, demo }: {
  /** École active — DÉCLENCHEUR de relecture (elle voyage dans l'en-tête). */
  ecole: number | null;
  variante: "ecole" | "site";
  demo?: boolean;
}) {
  const t = useT();
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const [factures, setFactures] = useState<FactureRow[]>([]);
  const [impayees, setImpayees] = useState<Impayee[]>([]);
  const [participation, setParticipation] = useState<Participation | null>(null);
  const [tarifsListe, setTarifsListe] = useState<TarifRow[]>([]);
  const [sondeEnCours, setSondeEnCours] = useState(false);
  const [message, setMessage] = useState("");
  const site = variante === "site";

  const relire = useCallback(() => {
    if (demo) return;
    const [y, m] = period.split("-");
    if (!y || !m) return;
    fetch(`/api/admin/factures?year=${y}&month=${Number(m)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => {
        setFactures(d.factures ?? []);
        setImpayees(d.impayees ?? []);
        setParticipation(d.participation ?? null);
      })
      .catch(() => { setFactures([]); setImpayees([]); setParticipation(null); });
    fetch("/api/admin/tarifs", { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setTarifsListe(d.tarifs ?? []))
      .catch(() => setTarifsListe([]));
  }, [demo, period]);

  useEffect(() => { relire(); }, [relire, ecole]);

  const actionFacture = async (etablissementId: number, action: string, periode?: string) => {
    const [y, m] = period.split("-");
    const r = await fetch("/api/admin/factures", {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ action, etablissementId, periode, year: Number(y), month: Number(m) }),
    });
    if (!r.ok) { setMessage(t("admin.facture.failed")); return; }
    relire();
  };

  const reglerTarif = async (provider: string, prixMtok: number) => {
    const r = await fetch("/api/admin/tarifs", {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ provider, prixMtok }),
    });
    if (!r.ok) { setMessage(t("admin.tarif.failed")); return; }
    relire();
  };

  // Relancer la sonde à la main. Elle tourne d'elle-même dès qu'une liste de
  // modèles change ; ce bouton sert à la voir travailler.
  const sonder = async () => {
    setSondeEnCours(true);
    try {
      await fetch("/api/admin/tarifs", {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action: "sonder" }),
      });
      const d = await fetch("/api/admin/tarifs", { headers: authHeaders() }).then(r => r.json());
      setTarifsListe(d.tarifs ?? []);
    } finally { setSondeEnCours(false); }
  };

  return (
    <div className="mt-3">
      {message && <p className="mb-2 text-sm text-red-400">{message}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
          aria-label={t("admin.impayees.period")} className="rounded bg-tertiary p-1 text-sm" />
        <span className="text-xs opacity-60">{t("admin.facture.help")}</span>
      </div>

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
                {f.tarifChange && <span className="rounded bg-amber-500/30 px-1.5 text-xs" title={t("admin.facture.driftTitle")}>{t("admin.facture.drift")}</span>}
                <span className="flex-grow" />
                {site && !f.respire && (
                  <button onClick={() => actionFacture(f.etablissementId, "emettre")} className={BTN}>
                    {f.emiseAt ? t("admin.facture.reissue") : t("admin.facture.issue")}
                  </button>
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
              {/* PLUS DE LIGNE « PARTICIPATION » : elle vaudrait 0.00 à jamais.
                  La contribution de l'école est prélevée à la RECHARGE, une
                  seule fois (src/server/porteMonnaie.ts), et s'inscrit au
                  registre du porte-monnaie ; la facture, elle, est au prix
                  coûtant. Afficher « Participation aux frais (10 %) — 0.00 »
                  en dessous d'une consommation, c'était affirmer un taux qui
                  ne s'applique pas là, avec un montant qui le dément : la
                  seule lecture possible était « on nous a oublié quelque
                  chose ». Le total est désormais la consommation, et il se
                  recalcule au tarif public du fournisseur. */}
              <dl className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
                <span><dt className="inline opacity-60">{t("admin.facture.consumption")} </dt>
                  <dd className="inline font-mono">{f.consommation.toFixed(2)} {f.devise}</dd></span>
                <span><dt className="inline font-bold">{t("admin.facture.total")} </dt>
                  <dd className="inline font-mono font-bold">{f.total.toFixed(2)} {f.devise}</dd></span>
              </dl>
              {/* CE QUE L'ÉCOLE AJOUTE POUR POUVOIR PAYER — adresse du service,
                  référence interne, note du mois — et l'impression. Aucune de
                  ces mentions n'entre dans un calcul : c'est ce qui permet de
                  les laisser à l'école alors que tout le reste de la facture
                  reste la main du site. */}
              <MentionsFacture facture={f} onSaved={relire} />
            </div>
          ))}
        </div>
      )}

      {/* LES IMPAYÉES — toutes périodes confondues, et c'est le point : une
          facture oubliée n'est visible d'aucun mois en particulier. Le site
          seul les reçoit du serveur (portée « super »). */}
      {site && impayees.length > 0 && (
        <>
          {/* Clé distincte de « admin.facture.unpaid », qui est la PASTILLE
              d'une facture (« émise, impayée ») : un titre de liste et une
              étiquette de ligne ne se traduisent pas de la même façon. */}
          <h3 className="mt-6 font-bold">{t("admin.facture.unpaidHeading", { n: impayees.length })}</h3>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-xs uppercase opacity-60">
              <tr><th className="py-1">{t("admin.col.school")}</th><th>{t("admin.impayees.period")}</th>
                <th>{t("admin.facture.billingEmail")}</th>
                <th className="text-right">{t("admin.facture.total")}</th><th /></tr>
            </thead>
            <tbody>
              {impayees.map(f => (
                <tr key={`${f.etablissementId}-${f.periode}`} className="border-b border-white/5">
                  <td className="py-1">{f.etablissement}</td>
                  <td className="opacity-70">{f.periode}</td>
                  <td className="text-xs opacity-60">{f.billingEmail || "—"}</td>
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

      {/* Le tarif : lisible par l'école qu'il facture, modifiable par le
          site seul — il vaut pour toutes, une seule ne peut pas le fixer. */}
      {tarifsListe.length > 0 && (
        <>
          <h3 className="mt-6 font-bold">{t("admin.tarif.heading")}</h3>
          <p className="mt-1 text-xs opacity-60">{site ? t("admin.tarif.helpSuper") : t("admin.tarif.helpSchool")}</p>
          {site && (
            <button onClick={() => void sonder()} disabled={sondeEnCours} className={`${BTN} mt-2`}>
              {sondeEnCours ? t("admin.sonde.working") : t("admin.sonde.run")}
            </button>
          )}
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-xs uppercase opacity-60">
              <tr><th className="py-1">{t("admin.col.provider")}</th>
                <th className="text-right">{t("admin.tarif.retained")}</th>
                <th className="text-right">{t("admin.sonde.in")}</th>
                <th className="text-right">{t("admin.sonde.out")}</th>
                <th className="text-right">{t("admin.sonde.blend")}</th>
                <th>{t("admin.sonde.source")}</th></tr>
            </thead>
            <tbody>
              {tarifsListe.map(tr => (
                <tr key={tr.provider} className="border-b border-white/5">
                  <td className="py-1">{tr.provider}</td>
                  <td className="text-right">
                    <input type="number" min={0} step="0.01" defaultValue={tr.prixMtok} disabled={!site}
                      onBlur={e => { const v = Number(e.target.value);
                        if (site && Number.isFinite(v) && v !== tr.prixMtok) void reglerTarif(tr.provider, v); }}
                      className="w-20 rounded bg-tertiary p-1 text-right text-xs disabled:opacity-50" />
                  </td>
                  {/* LA PROPOSITION, à côté du choix — jamais à sa place. Elle
                      est en DOLLARS et le tarif retenu dans la monnaie du
                      gestionnaire : la conversion reste un geste humain. */}
                  <td className="text-right font-mono text-xs opacity-70">{tr.proposition?.entreeMtok?.toFixed(2) ?? "—"}</td>
                  <td className="text-right font-mono text-xs opacity-70">{tr.proposition?.sortieMtok?.toFixed(2) ?? "—"}</td>
                  <td className="text-right font-mono text-xs">
                    {tr.proposition && !tr.proposition.detail
                      ? `${tr.proposition.melangeMtok.toFixed(2)} ${tr.proposition.devise}` : "—"}
                  </td>
                  <td className="text-xs">
                    {tr.proposition?.detail
                      ? <span className="rounded bg-amber-500/25 px-1 text-amber-200" title={tr.proposition.detail}>{t("admin.sonde.notFound")}</span>
                      : <span className="opacity-60">{tr.proposition?.modele || "—"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs opacity-50">{t("admin.sonde.caveat")}</p>
        </>
      )}

      {/* Ce que la participation a rapporté, face à ce qu'elle a financé.
          Les mettre côte à côte est la seule façon de vérifier la promesse. */}
      {site && participation && (
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
    </div>
  );
}
