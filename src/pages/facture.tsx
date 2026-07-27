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
              {/* SIX COLONNES, ET C'EST LE DOCUMENT ENTIER QUI CHANGE DE NATURE.
                  Le modèle est nommé, les jetons sont séparés, et chacun porte
                  le prix qu'on lui a appliqué. Une intendance rouvre le tarif
                  public du modèle, multiplie, et retrouve le montant : plus
                  rien ici ne se prend sur parole. Le tableau précédent donnait
                  un fournisseur, un total de jetons et UN prix — appliqué à
                  l'entrée comme à la sortie, là où l'éditeur en publie deux
                  dont le rapport va de 1 à 5. Aucun de ses chiffres ne se
                  retrouvait nulle part. */}
              <table className="mt-6 w-full text-left text-sm">
                <thead className="border-b border-black/20 text-xs uppercase opacity-60">
                  <tr>
                    <th className="py-1">{t("facture.col.model")}</th>
                    <th className="text-right">{t("facture.col.calls")}</th>
                    <th className="text-right">{t("facture.col.tokensIn")}</th>
                    <th className="text-right">{t("facture.col.priceIn")}</th>
                    <th className="text-right">{t("facture.col.tokensOut")}</th>
                    <th className="text-right">{t("facture.col.priceOut")}</th>
                    <th className="text-right">{t("facture.col.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {facture.lignes.length === 0 && (
                    <tr><td colSpan={7} className="py-2 opacity-60">{t("facture.emptyLines")}</td></tr>
                  )}
                  {/* AUCUN FILTRE ICI. Une ligne de cette table est de l'argent
                      déjà décompté : la retirer parce que le fournisseur n'est
                      plus servi aujourd'hui ferait un total que ses propres
                      lignes ne justifient plus. */}
                  {facture.lignes.map(l => (
                    /* LA CLÉ EST COMPOSITE, et il le faut : deux lignes peuvent
                       porter le même modèle si son prix a changé en cours de
                       mois — c'est même exactement ce qu'on veut montrer. */
                    <tr key={`${l.provider}·${l.modele}·${l.prixEntreeMtok}·${l.prixSortieMtok}`}
                      className="border-b border-black/10">
                      <td className="py-1">
                        {l.modele || l.provider}
                        <span className="block text-[10px] opacity-60">{l.provider}</span>
                        {/* CE QUI N'A PAS ÉTÉ FACTURÉ AU PRIX DU MODÈLE SE DIT
                            SUR LA FACTURE ELLE-MÊME. Un repli tu sur un
                            document comptable, c'est une approximation qu'on
                            fait passer pour une mesure.

                            LA MENTION EST TRADUITE, LA RAISON EXACTE EST AU
                            SURVOL — et l'ordre des deux n'est pas indifférent.
                            `l.repli` est une phrase composée par le serveur EN
                            FRANÇAIS et figée sur la ligne de journal le jour de
                            l'appel : l'afficher telle quelle mettait du français
                            dans le corps d'une facture qu'une direction
                            italienne ou alémanique doit pouvoir lire et
                            transmettre à son intendance. On dit donc DANS SA
                            LANGUE qu'un repli a joué — le fait, qui décide de la
                            lecture du chiffre — et on garde la phrase d'origine
                            en `title`, où elle nomme le barreau substitué sans
                            qu'on ait eu à retraduire un texte déjà écrit en
                            base. Même partage que dans l'administration
                            (Factures.tsx), pour que les deux écrans ne se
                            contredisent pas.

                            LA MENTION TRADUITE NE NOMME PAS LE SUBSTITUT, et
                            c'est délibéré : `l.repli` recouvre TROIS cas — le
                            barreau le plus cher du fournisseur, le prix unique
                            réglé à la main, et « aucun tarif connu », où rien
                            n'a été décompté. Une mention qui annoncerait le
                            premier des trois mentirait sur les deux autres, et
                            la troisième se lirait à côté d'un montant à 0.00 sur
                            la même ligne — une facture qui se contredit d'une
                            colonne à l'autre. On dit donc LE FAIT COMMUN aux
                            trois (aucun tarif n'était relevé pour ce modèle) et
                            on renvoie au survol pour lequel des trois a joué. */}
                        {(l.repli || l.ancien) && (
                          <span className="block text-[10px] italic opacity-70"
                            title={l.repli || undefined}>
                            {l.repli ? t("facture.line.fallback") : t("facture.line.legacy")}
                          </span>
                        )}
                      </td>
                      <td className="text-right">{l.appels.toLocaleString(router.locale || "fr-CH")}</td>
                      <td className="text-right">{l.tokensIn.toLocaleString(router.locale || "fr-CH")}</td>
                      <td className="text-right">{l.prixEntreeMtok.toFixed(2)} / M</td>
                      <td className="text-right">{l.tokensOut.toLocaleString(router.locale || "fr-CH")}</td>
                      <td className="text-right">{l.prixSortieMtok.toFixed(2)} / M</td>
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
                {/* LA PARTICIPATION N'EST PLUS UNE LIGNE DE FACTURE, parce
                    qu'elle n'est plus prélevée ici : elle l'est à la RECHARGE,
                    une seule fois, et figure au registre du porte-monnaie sous
                    sa propre date. La cacher serait grave ; l'imprimer à 0.00
                    sur un document comptable l'était tout autant, dans l'autre
                    sens — l'intendance y aurait lu un taux qu'on ne lui
                    applique pas. Reste la mention ci-dessous, qui dit ce que
                    ce total EST : le prix du fournisseur, sans marge. */}
                <div className="mt-1 flex justify-between border-t border-black/30 py-1 font-bold">
                  <dt>{t("admin.facture.total")}</dt>
                  <dd className="font-mono">{montant(facture.total, facture.devise)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-right text-xs opacity-70">{t("facture.prixCoutant")}</p>
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
