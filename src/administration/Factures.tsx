import React, { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n/useT";
import { authHeaders } from "../utils/account";
import { BTN, type BarreauSansTarif, type FactureRow, type Participation, type RepliObserve,
  type TarifRow } from "./commun";
import { MentionsFacture } from "./MentionsFacture";
import TarifEcole from "./TarifEcole";

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
  // CE QUI MANQUE POUR FACTURER, ET CE QUI A DÉJÀ ÉTÉ FACTURÉ SANS. Les deux
  // séparément : le premier prévient avant qu'une classe consomme, le second
  // constate après que l'argent a bougé. Fondre les deux en un seul compteur
  // ferait disparaître celui qui prévient dès que le second est vide.
  const [manquants, setManquants] = useState<BarreauSansTarif[]>([]);
  const [replis, setReplis] = useState<RepliObserve[]>([]);
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
    // LE TABLEAU DES TARIFS N'EST PLUS DEMANDÉ QUE PAR LE SITE. Servie à une
    // école, cette route ne rend plus la même chose (les barreaux de son seul
    // fournisseur, sans tarif retenu ni mélange) : c'est TarifEcole qui la lit
    // alors, et lire deux fois la même réponse pour n'en afficher qu'une
    // moitié à chaque endroit brouillerait qui montre quoi.
    if (!site) { setTarifsListe([]); setManquants([]); setReplis([]); return; }
    fetch("/api/admin/tarifs", { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => {
        setTarifsListe(d.tarifs ?? []);
        setManquants(d.manquants ?? []);
        setReplis(d.replis ?? []);
      })
      .catch(() => { setTarifsListe([]); setManquants([]); setReplis([]); });
  }, [demo, period, site]);

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
      // La sonde ÉCRIT désormais les prix : la liste des barreaux sans tarif
      // doit se relire dans la foulée, sans quoi l'écran continuerait d'alerter
      // sur un trou que le bouton vient de combler.
      setManquants(d.manquants ?? []);
      setReplis(d.replis ?? []);
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
              {/* UNE LIGNE PAR MODÈLE, avec les deux jeux de jetons et les deux
                  prix appliqués : c'est ce qui rend le total refaisable à la
                  main. La clé est composite — un même modèle peut apparaître
                  deux fois si son prix a changé en cours de mois, et c'est
                  précisément ce qu'on veut rendre visible. */}
              {f.lignes.length > 0 && (
                <table className="mt-2 w-full text-left text-xs">
                  <tbody>
                    {f.lignes.map(l => (
                      <tr key={`${l.provider}·${l.modele}·${l.prixEntreeMtok}·${l.prixSortieMtok}`} className="opacity-70">
                        <td className="py-0.5">
                          {l.modele || l.provider}
                          <span className="ml-1 opacity-50">{l.provider}</span>
                          {/* LE REPLI SE VOIT, ou il ne sert à rien. Une ligne
                              facturée au prix d'un autre modèle ne doit pas
                              ressembler à une ligne mesurée. */}
                          {l.repli && (
                            <span className="ml-1 rounded bg-amber-500/25 px-1 text-amber-200" title={l.repli}>
                              {t("admin.facture.fallback")}
                            </span>
                          )}
                          {l.ancien && !l.repli && (
                            <span className="ml-1 rounded bg-white/10 px-1" title={t("admin.facture.legacyTitle")}>
                              {t("admin.facture.legacy")}
                            </span>
                          )}
                        </td>
                        {/* LE NOMBRE D'APPELS EST CE QUI EXPLIQUE L'ÉCART entre
                            le produit jetons × prix et le montant : l'arrondi
                            monte appel par appel, jamais plus d'un centime
                            chacun. Sans ce chiffre, qui refait le calcul trouve
                            moins et croit à une erreur. */}
                        <td className="text-right whitespace-nowrap">
                          {t("admin.facture.calls", { n: l.appels })}
                        </td>
                        <td className="text-right whitespace-nowrap">
                          {l.tokensIn.toLocaleString("fr-CH")} × {l.prixEntreeMtok.toFixed(2)}
                        </td>
                        <td className="text-right whitespace-nowrap">
                          {l.tokensOut.toLocaleString("fr-CH")} × {l.prixSortieMtok.toFixed(2)}
                        </td>
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

      {/* ─── LE PRIX DES JETONS, ET IL NE SE DIT PAS PAREIL DES DEUX CÔTÉS ───
          Une ÉCOLE lit six chiffres : entrée et sortie des trois barreaux de
          SON fournisseur actif (TarifEcole). Elle y lisait naguère le tableau
          ci-dessous, tronqué — tarif retenu, mélange, une ligne par
          fournisseur, la plupart vides. Trois défauts, et le premier suffit :
          le mélange suppose un rapport entrée/sortie que personne ne mesure,
          donc il ne se vérifie pas ; les dix autres fournisseurs ne concernent
          pas cette école ; et le champ « retenu » y était grisé, c'est-à-dire
          qu'on montrait un réglage pour dire qu'il n'était pas à elle.
          Le SITE, lui, garde tout : c'est ICI que l'échelle s'arbitre, et on
          n'arbitre pas entre des niveaux dont on ne voit qu'un prix. */}
      {!site && !demo && <TarifEcole ecole={ecole} />}

      {/* Le tarif du site : une ligne par fournisseur, modifiable par lui
          seul — il vaut pour toutes les écoles, une seule ne peut pas le fixer. */}
      {site && tarifsListe.length > 0 && (
        <>
          <h3 className="mt-6 font-bold">{t("admin.tarif.heading")}</h3>
          <p className="mt-1 text-xs opacity-60">{t("admin.tarif.helpSuper")}</p>
          <button onClick={() => void sonder()} disabled={sondeEnCours} className={`${BTN} mt-2`}>
            {sondeEnCours ? t("admin.sonde.working") : t("admin.sonde.run")}
          </button>
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
                <React.Fragment key={tr.provider}>
                  <tr className="border-b border-white/5">
                    <td className="py-1">
                      {tr.provider}
                      {/* RECOUPER EN UN CLIC. Un tarif qu'on ne peut pas
                          vérifier est un tarif qu'il faut croire : ce lien
                          ouvre la page même où la sonde a lu ce prix. */}
                      {tr.verifier && (
                        <a href={tr.verifier} target="_blank" rel="noopener noreferrer"
                          className="ml-1 text-[10px] underline opacity-60 hover:opacity-100">
                          {t("admin.sonde.verify")}
                        </a>
                      )}
                    </td>
                    <td className="text-right">
                      {/* Plus de `disabled={!site}` : ce tableau ne s'affiche
                          plus que pour le site. Le serveur, lui, garde sa
                          garde — /api/admin/tarifs refuse le POST à quiconque
                          n'est pas super-administrateur, et c'est elle qui
                          protège, pas l'attribut. */}
                      <input type="number" min={0} step="0.01" defaultValue={tr.prixMtok}
                        onBlur={e => { const v = Number(e.target.value);
                          if (Number.isFinite(v) && v !== tr.prixMtok) void reglerTarif(tr.provider, v); }}
                        className="w-20 rounded bg-tertiary p-1 text-right text-xs" />
                    </td>
                    {/* LA PROPOSITION, à côté du choix — jamais à sa place. La
                        sonde l'a DÉJÀ convertie dans la monnaie de facturation
                        (elle reste en dollars le jour où le taux de change est
                        injoignable, et le dit alors dans `devise`) : ce qui
                        reste un geste humain, c'est de l'appliquer, pas de la
                        convertir. La devise affichée est celle de la mesure. */}
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
                  {/* LES TROIS BARREAUX, ET LEUR PRIX. L'échelle décide du
                      niveau d'intelligence ET du coût par élève : on n'arbitre
                      pas entre trois niveaux dont un seul montre son prix. Le
                      tarif proposé reste celui du barreau le plus haut — dit en
                      clair sous les trois lignes, parce que « le plus haut »
                      n'est plus « le plus cher » (Mistral Large 2512 coûte
                      moins que Mistral Medium 3.5). */}
                  {(tr.proposition?.barreaux?.length ?? 0) > 0 && tr.proposition!.barreaux.map(b => (
                    <tr key={`${tr.provider}-${b.rang}`} className="text-xs opacity-70">
                      {/* Le rang ET le nom du barreau dans UNE seule clé : le
                          séparateur n'est pas une ponctuation universelle, et
                          l'ordre des deux appartient à la langue. */}
                      <td className="py-0.5 pl-4 font-mono">
                        {t("admin.sonde.rung", { n: b.rang, barreau: b.barreau })}
                      </td>
                      <td></td>
                      <td className="text-right font-mono">{b.entreeMtok.toFixed(2)}</td>
                      <td className="text-right font-mono">{b.sortieMtok.toFixed(2)}</td>
                      {/* Le mélange PORTE SA MONNAIE, comme celui de la ligne
                          du dessus : c'est le seul montant de ce tableau qu'on
                          recopie dans le champ « Retenu », et un nombre qu'on
                          recopie sans son unité est un nombre qu'on convertit
                          deux fois, ou pas du tout. */}
                      <td className="text-right font-mono">
                        {b.detail ? "—" : `${b.melangeMtok.toFixed(2)} ${tr.proposition!.devise}`}
                      </td>
                      <td>
                        {b.detail
                          ? <span className="rounded bg-amber-500/25 px-1 text-amber-200" title={b.detail}>{t("admin.sonde.notFound")}</span>
                          : <span className="opacity-80">{b.modele}</span>}
                      </td>
                    </tr>
                  ))}
                  {(tr.proposition?.rangRetenu ?? 0) > 0 && (
                    <tr className="border-b border-white/5 text-xs">
                      <td colSpan={6} className="pb-1 pl-4 opacity-70">
                        {t("admin.sonde.retainedRung", {
                          n: tr.proposition!.rangRetenu,
                          barreau: tr.proposition!.barreaux[tr.proposition!.barreaux.length - 1]?.barreau ?? tr.proposition!.modele,
                        })}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs opacity-50">{t("admin.sonde.caveat")}</p>
        </>
      )}

      {/* ─── LES DEUX TRACES DU REPLI, ET ELLES NE DISENT PAS LA MÊME CHOSE ───
          Un modèle sans prix relevé n'arrête rien : il est facturé au prix du
          barreau le plus cher connu de son fournisseur, ce qui protège le
          budget dans le bon sens et laisse une classe finir sa séance. Mais un
          décompte approximatif qui ne se voit pas est un décompte faux qu'on
          découvre à la fin de l'année. D'où deux blocs, jamais fondus en un :
          celui-ci PRÉVIENT — un barreau de l'échelle sans prix, avant même
          qu'une classe consomme dedans. */}
      {site && manquants.length > 0 && (
        <div className="mt-6 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
          <b>{t("admin.tarif.missingHeading", { n: manquants.length })}</b>
          <p className="mt-1 opacity-80">{t("admin.tarif.missingHelp")}</p>
          <ul className="mt-1 list-inside list-disc font-mono opacity-90">
            {manquants.map(m => <li key={`${m.provider}·${m.barreau}`}>{m.provider} · {m.barreau}</li>)}
          </ul>
        </div>
      )}

      {/* … et celui-là CONSTATE : de l'argent déjà prélevé au prix d'un autre
          modèle. Le montant est là parce que c'est lui qui dit si le trou est
          une curiosité ou un problème. */}
      {site && replis.length > 0 && (
        <div className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
          <b>{t("admin.tarif.fallbackHeading", { n: replis.length })}</b>
          <p className="mt-1 opacity-80">{t("admin.tarif.fallbackHelp")}</p>
          <table className="mt-1 w-full text-left">
            <tbody>
              {replis.map(r => (
                <tr key={`${r.provider}·${r.modele}·${r.repli}`} className="align-top">
                  <td className="py-0.5 pr-2 font-mono">{r.provider} · {r.modele}</td>
                  <td className="pr-2 text-right">{t("admin.tarif.fallbackCalls", { n: r.appels })}</td>
                  <td className="pr-2 text-right font-mono">{r.montant.toFixed(2)}</td>
                  {/* LA RAISON EN CLAIR, telle qu'elle a été écrite sur la
                      ligne de journal et sur le registre du porte-monnaie :
                      trois endroits, une seule phrase, aucun décalage possible. */}
                  <td className="opacity-70">{r.repli}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
