import React, { useCallback, useEffect, useState } from "react";
import { MdDownload } from "react-icons/md";
import { useT } from "../i18n/useT";
import { authHeaders } from "../utils/account";
import { useListe, useListeSeule } from "../site/ListePaginee";
import { type BillingRow, type CatalogueRow, type LadderRow, type TeacherBillingRow } from "./commun";

// L'ÉCHELLE, LE CATALOGUE ET LE RELEVÉ EN JETONS — LE SITE, ET RIEN QUE LUI.
//
// Ces trois écrans partagent une propriété : ils valent pour TOUTES les écoles,
// donc pour aucune en particulier. L'échelle des modèles décide de ce qu'un
// fournisseur sert à qui, le catalogue dit ce que les API ont répondu, et le
// relevé compte les jetons par IP. Aucun de ces objets n'a de version « d'une
// école » : les descendre vers /etablissement n'aurait pas eu de sens.

export function EchelleModeles() {
  const t = useT();
  const seule = useListeSeule();
  const [ladders, setLadders] = useState<LadderRow[]>([]);
  const [ladderEdit, setLadderEdit] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState("");

  const relire = useCallback(() => {
    fetch("/api/admin/ladder", { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setLadders(d.ladders ?? []))
      .catch(() => setLadders([]));
  }, []);

  useEffect(() => { relire(); }, [relire]);

  if (seule && seule !== "echelle") return null;

  return (
    <section data-tour="admin-echelle" className="mt-10">
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
      {message && <p className="mt-2 text-sm text-red-400">{message}</p>}
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
                          relire();
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
  );
}

export function CatalogueModeles() {
  const t = useT();
  const seule = useListeSeule();
  const [catalogue, setCatalogue] = useState<CatalogueRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/models", { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setCatalogue(d.catalogue ?? []))
      .catch(() => setCatalogue([]));
  }, []);

  if (seule && seule !== "catalogue") return null;

  return (
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
      {message && <p className="mt-2 text-sm opacity-80">{message}</p>}
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
  );
}

/**
 * LE RELEVÉ EN JETONS, par école, par IP et par fournisseur.
 *
 * C'est le DÉTAIL derrière chaque facture, et l'export dont la comptabilité a
 * besoin. Il reste au site : une école y verrait les IP des autres.
 */
export function ConsommationSite() {
  const t = useT();
  const seule = useListeSeule();
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const [billing, setBilling] = useState<BillingRow[]>([]);
  const [teacherBilling, setTeacherBilling] = useState<TeacherBillingRow[]>([]);

  useEffect(() => {
    const [y, m] = period.split("-").map(Number);
    fetch(`/api/admin/billing?year=${y}&month=${m}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => { setBilling(data.rows ?? []); setTeacherBilling(data.teachers ?? []); })
      .catch(() => { setBilling([]); setTeacherBilling([]); });
  }, [period]);

  const listeFacture = useListe("facturation", billing, {
    cherchable: r => `${r.etablissement} ${r.ip} ${r.provider}`,
    tris: [
      { cle: "jetons", label: t("admin.sort.jetons"), compare: (a, b) => b.tokens - a.tokens },
      { cle: "etab", label: t("admin.col.school"), compare: (a, b) => a.etablissement.localeCompare(b.etablissement) },
    ],
  });

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

  if (seule && seule !== "facturation") return null;

  return (
    <section data-tour="admin-facturation" className="mt-10">
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
  );
}
