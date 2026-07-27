import Head from "next/head";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { MdArrowBack, MdPrint } from "react-icons/md";
import { useT } from "../i18n/useT";
import { authHeaders } from "../utils/account";
import type { FactureRow } from "../administration/commun";

// LA FACTURE, IMPRIMABLE.
//
// POURQUOI UNE PAGE À PART. Une facture se transmet : elle part au secrétariat,
// à l'intendance, parfois à une commune. Ce qu'on transmet doit tenir sur une
// feuille, sans barre de navigation, sans bouton, sans fond sombre — et ce
// qu'on lit à l'écran doit être EXACTEMENT ce qui sortira de l'imprimante. D'où
// une feuille blanche à l'écran comme au papier, plutôt qu'un thème sombre
// retourné au dernier moment par une règle d'impression.
//
// CE QU'ELLE N'EST PAS. Ce document ne porte AUCUNE mention fiscale ou légale
// (TVA, numéro d'entreprise) : elles ne sont pas oubliées, elles sont refusées.
// Un papier qui se présente comme une facture officielle sans en avoir la
// validité est pire qu'un relevé — il fait croire à une comptabilité qu'il ne
// tient pas. Le gestionnaire complète ces mentions avant l'envoi.
//
// SÉCURITÉ. Aucune URL partageable ne sert ce document : la page est vide sans
// jeton, et /api/admin/factures rend la facture de l'ÉCOLE ACTIVE de qui
// signe — un identifiant écrit dans la barre d'adresse ne fait que CHOISIR
// parmi ce que le serveur a déjà consenti à envoyer.
export default function FacturePage() {
  const t = useT();
  const router = useRouter();
  const [facture, setFacture] = useState<FactureRow | null>(null);
  const [etat, setEtat] = useState<"loading" | "denied" | "none" | "ready">("loading");

  // La période vient de l'URL (« 2026-07 »), à défaut le mois courant : la page
  // s'ouvre depuis l'administration, mais doit rester lisible seule.
  const periode = typeof router.query.periode === "string" && /^\d{4}-\d{2}$/.test(router.query.periode)
    ? router.query.periode
    : `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
  const choix = Number(router.query.etablissement) || 0;

  useEffect(() => {
    if (!router.isReady) return;
    const [y, m] = periode.split("-");
    fetch(`/api/admin/factures?year=${y}&month=${Number(m)}`, { headers: authHeaders() })
      .then(r => {
        if (!r.ok) throw new Error("denied");
        return r.json();
      })
      .then((d: { factures?: FactureRow[] }) => {
        const liste = d.factures ?? [];
        // Un administrateur d'école n'en reçoit qu'une : le choix de l'URL ne
        // sert qu'au site, qui les reçoit toutes. S'il ne désigne rien de
        // connu, on ne devine pas — on le dit.
        const cible = choix ? liste.find(f => f.etablissementId === choix) : liste[0];
        if (!cible) { setEtat("none"); return; }
        setFacture(cible);
        setEtat("ready");
      })
      .catch(() => setEtat("denied"));
  }, [router.isReady, periode, choix]);

  const date = (ts: number | null) =>
    ts ? new Date(ts).toLocaleDateString(router.locale || "fr-CH") : "";
  const montant = (x: number, devise: string) => `${x.toFixed(2)} ${devise}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Head><title>{`${t("facture.title")} — EduChat`}</title></Head>

      {/* Une feuille blanche, à l'écran comme au papier : ce qu'on voit est ce
          qu'on imprime. Les règles @media n'ont donc plus qu'à effacer ce qui
          n'appartient pas au document (barre du site, boutons) et à rendre la
          page au papier — jamais à réinventer ses couleurs. */}
      <style>{`
        @media print {
          header, footer, .sans-impression { display: none !important; }
          html, body { background: #fff !important; }
          .feuille { box-shadow: none !important; margin: 0 !important; padding: 0 !important; }
          @page { margin: 18mm; }
        }
      `}</style>

      <div className="sans-impression mb-4 flex flex-wrap items-center gap-3 text-primary">
        {/* RETOUR EN ARRIÈRE, et non vers une page nommée : la facture s'ouvre
            depuis /etablissement pour une école et depuis /admin pour le site.
            Écrire l'une des deux renverrait l'autre devant une porte close. */}
        <button onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
          className="flex items-center gap-1 rounded border border-white/20 px-3 py-1.5 text-sm hover:bg-tertiary">
          <MdArrowBack /> {t("common.back")}
        </button>
        {etat === "ready" && (
          <button onClick={() => window.print()}
            className="flex items-center gap-1 rounded bg-[#DC6521] px-4 py-1.5 text-sm font-bold hover:opacity-90">
            <MdPrint /> {t("facture.print")}
          </button>
        )}
      </div>

      {etat === "loading" && <p className="text-primary opacity-60">{t("common.loading")}</p>}
      {etat === "denied" && <p className="text-primary">{t("facture.denied")}</p>}
      {etat === "none" && <p className="text-primary">{t("facture.notFound")}</p>}

      {etat === "ready" && facture && (
        <article className="feuille rounded bg-white p-8 text-black shadow-lg">
          {/* <div> et non <header> : la règle d'impression efface la barre du
              site en visant `header`, et le bloc de titre du document tomberait
              avec elle — une facture sans son titre ni sa période. Même raison
              pour le pied de page ci-dessous, qui porte l'avertissement sur
              l'absence de mentions légales : c'est justement lui qu'il ne faut
              JAMAIS perdre au passage à l'imprimante. */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/20 pb-4">
            <div>
              {/* « Facture » n'est écrit que si le site a ÉMIS : tant que le
                  montant peut encore bouger, le document dit ce qu'il est. */}
              <h1 className="text-2xl font-bold">
                {facture.emiseAt ? t("facture.title") : t("facture.titleDraft")}
              </h1>
              <p className="mt-1 text-sm">{t("admin.impayees.period")} : <b>{facture.periode}</b></p>
              {facture.emiseAt && <p className="text-sm">{t("facture.issuedOn", { date: date(facture.emiseAt) })}</p>}
              {facture.payeeAt && <p className="text-sm">{t("facture.paidOn", { date: date(facture.payeeAt) })}</p>}
            </div>
            <div className="text-right text-sm">
              <p className="font-bold">EduChat</p>
              {/* Aucune adresse, aucun numéro : voir l'avertissement en pied. */}
            </div>
          </div>

          <section className="mt-6 grid grid-cols-1 gap-6 text-sm sm:grid-cols-2">
            <div>
              <h2 className="text-xs font-bold uppercase opacity-60">{t("facture.billTo")}</h2>
              <p className="mt-1 font-bold">{facture.etablissement}</p>
              {/* L'adresse est rendue TELLE QUE SAISIE, retours à la ligne
                  compris : une adresse postale se lit sur plusieurs lignes. */}
              {facture.mentions?.adresse && (
                <p className="mt-1 whitespace-pre-line">{facture.mentions.adresse}</p>
              )}
              {facture.billingEmail && <p className="mt-1 opacity-70">{facture.billingEmail}</p>}
            </div>
            <div>
              {facture.mentions?.reference && (
                <>
                  <h2 className="text-xs font-bold uppercase opacity-60">{t("facture.reference")}</h2>
                  <p className="mt-1 whitespace-pre-line">{facture.mentions.reference}</p>
                </>
              )}
            </div>
          </section>

          {facture.respire ? (
            <p className="mt-6 rounded border border-black/20 p-3 text-sm">{t("facture.respire")}</p>
          ) : (
            <>
              <table className="mt-6 w-full text-left text-sm">
                <thead className="border-b border-black/20 text-xs uppercase opacity-60">
                  <tr>
                    <th className="py-1">{t("admin.col.provider")}</th>
                    <th className="text-right">{t("admin.col.tokens")}</th>
                    <th className="text-right">{t("facture.col.price")}</th>
                    <th className="text-right">{t("facture.col.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {facture.lignes.length === 0 && (
                    <tr><td colSpan={4} className="py-2 opacity-60">{t("facture.emptyLines")}</td></tr>
                  )}
                  {/* AUCUN FILTRE ICI. Une ligne de cette table est de l'argent
                      déjà décompté : la retirer parce que le fournisseur n'est
                      plus servi aujourd'hui ferait un total que ses propres
                      lignes ne justifient plus. */}
                  {facture.lignes.map(l => (
                    <tr key={l.provider} className="border-b border-black/10">
                      <td className="py-1">{l.provider}</td>
                      <td className="text-right">{l.tokens.toLocaleString(router.locale || "fr-CH")}</td>
                      <td className="text-right">{l.prixMtok.toFixed(2)} / M</td>
                      <td className="text-right">{l.montant.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <dl className="mt-4 ml-auto w-full max-w-xs text-sm">
                <div className="flex justify-between py-0.5">
                  <dt>{t("admin.facture.consumption")}</dt>
                  <dd className="font-mono">{montant(facture.consommation, facture.devise)}</dd>
                </div>
                {/* La participation est NOMMÉE, sur sa propre ligne : une
                    contribution qu'on cache n'est plus une contribution. */}
                <div className="flex justify-between py-0.5">
                  <dt>{t("admin.facture.share", { pct: facture.participationPct })}</dt>
                  <dd className="font-mono">{montant(facture.participation, facture.devise)}</dd>
                </div>
                <div className="mt-1 flex justify-between border-t border-black/30 py-1 font-bold">
                  <dt>{t("admin.facture.total")}</dt>
                  <dd className="font-mono">{montant(facture.total, facture.devise)}</dd>
                </div>
              </dl>
            </>
          )}

          {facture.mentions?.note && (
            <section className="mt-6 text-sm">
              <h2 className="text-xs font-bold uppercase opacity-60">{t("facture.note")}</h2>
              <p className="mt-1 whitespace-pre-line">{facture.mentions.note}</p>
            </section>
          )}

          <div className="mt-8 border-t border-black/20 pt-3 text-xs opacity-70">
            {!facture.emiseAt && <p className="mb-1 font-bold">{t("facture.notIssued")}</p>}
            <p>{t("facture.noLegal")}</p>
          </div>
        </article>
      )}
    </div>
  );
}
