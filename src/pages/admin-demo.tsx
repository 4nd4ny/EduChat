import Head from "next/head";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { MdArchive, MdCheck, MdEdit, MdPublish, MdVisibilityOff } from "react-icons/md";
import InterfaceTour from "../chat/InterfaceTour";
import { useT } from "../i18n/useT";

// VITRINE de l'interface d'administration — accessible à tous, sans compte.
//
// Ce n'est PAS la page /admin avec un drapeau : c'est une copie statique,
// écrite à part. Le choix est délibéré. Une page réelle mise en « mode démo »
// reste à un oubli près de servir de vraies données ; ici il n'y a aucun
// appel réseau, aucune authentification, rien à filtrer — donc rien à faire
// fuiter. On peut la montrer à une institution sans ouvrir le compte
// d'administration, et sans lui exposer les emails, les IP ni la
// consommation d'écoles qui ne la regardent pas.
//
// Toutes les données ci-dessous sont inventées : établissements imaginaires,
// adresses en example.org, et plages IP de documentation (203.0.113.0/24,
// réservée à cet usage par la RFC 5737 — jamais routée sur Internet).
//
// Les tableaux ne portent plus que des CODES pour tout ce qui est montré à un
// humain (statut d'un prompt, oui/non, rôles) : le libellé vient du
// dictionnaire au moment du rendu, la page étant publiée en quatre langues.
// Restent en clair les seules vraies données : noms inventés, adresses en
// example.org, plages IP de documentation, identifiants de modèles.

const BTN = "flex items-center gap-1 rounded border border-white/20 px-2 py-0.5 text-xs opacity-60";

const PROMPTS = [
  { name: "Socrate", version: 3, status: "published", uses: 1284, tokens: "412 k" },
  { name: "Hypatie", version: 1, status: "published", uses: 517, tokens: "168 k" },
  { name: "Montaigne", version: 2, status: "retired", uses: 96, tokens: "31 k" },
];

const COMPTES = [
  { email: "claire.martin@example.org", nom: "claire.martin", roles: "both", etab: "Collège de la Démonstration" },
  { email: "pierre.dubois@example.org", nom: "Pierre D.", roles: "promptagogue", etab: "—" },
  { email: "ecole.exemple@example.org", nom: "ecole.exemple", roles: "both", etab: "Lycée des Exemples" },
];

const ETABS = [
  { nom: "Collège de la Démonstration", ips: "203.0.113.0/24", respire: true, quota: "3 000 000", conso: "412 350" },
  { nom: "Lycée des Exemples", ips: "198.51.100.7", respire: false, quota: "1 000 000", conso: "87 900" },
];

// gratuit : true / false / null (« — », sans objet pour la démo publique).
const FACTURE = [
  { etab: "Collège de la Démonstration", gratuit: true, ip: "203.0.113.0/24", fournisseur: "mistral", req: 1240, tokens: "318 900" },
  { etab: "Lycée des Exemples", gratuit: false, ip: "198.51.100.7", fournisseur: "anthropic", req: 210, tokens: "87 900" },
  { etab: null, gratuit: null, ip: "—", fournisseur: "openrouter", req: 64, tokens: "18 240" },
];

const ECHELLE = [
  { fournisseur: "mistral", rungs: ["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest"], source: "native" },
  { fournisseur: "anthropic", rungs: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"], source: "native" },
  { fournisseur: "openai", rungs: ["gpt-5.4-mini", "gpt-5.5", "gpt-5.5-pro"], source: "native" },
];

export default function AdminDemoPage() {
  const t = useT();
  const [tour, setTour] = useState(false);
  useEffect(() => {
    // La visite se lance sur ?visite=1, comme les trois autres démonstrations.
    if (new URLSearchParams(window.location.search).get("visite") === "1") setTour(true);
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-6 text-primary">
      <Head><title>{`${t("admindemo.headTitle")} — EduChat`}</title></Head>
      {tour && <InterfaceTour parcours="admin" onClose={() => setTour(false)} />}

      <p className="rounded-lg border border-[#DC6521]/50 bg-[#DC6521]/10 p-3 text-sm">
        <b>{t("admindemo.banner.label")}</b> {t("admindemo.banner.intro")}{" "}
        <b>{t("admindemo.banner.fictitious")}</b>{t("admindemo.banner.details")}{" "}
        <code>example.org</code>{t("admindemo.banner.rest")}{" "}
        <Link href="/admin" className="underline">/admin</Link>{t("admindemo.banner.reserved")}
      </p>

      <h1 className="mt-6 text-2xl font-bold">{t("admindemo.title")}</h1>

      {/* --- File de validation --- */}
      <h2 className="mt-12 border-b-2 border-[#DC6521]/50 pb-1 text-xl font-bold uppercase tracking-wide text-[#DC6521]">{t("admindemo.section.prompts")}</h2>
      <section data-tour="admin-validation" className="mt-8">
        <h2 className="text-lg font-bold">{t("admindemo.validation.title", { n: 1 })}</h2>
        <p className="mt-1 text-xs opacity-60">
          {t("admindemo.validation.hint")}
        </p>
        <div className="mt-2 rounded border border-white/10 bg-secondary p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-amber-600/70 px-2 py-0.5 text-xs">{t("admindemo.status.submitted")}</span>
            <b>Ératosthène</b> <span className="opacity-60">{t("admindemo.version", { n: 1 })} · {t("admindemo.validation.anonymous")}</span>
            <span className="flex-grow" />
            <button disabled className="flex items-center gap-1 rounded bg-green-600/50 px-2 py-1 text-xs"><MdCheck /> {t("admindemo.publish")}</button>
            <button disabled className="flex items-center gap-1 rounded bg-gray-600/50 px-2 py-1 text-xs"><MdArchive /> {t("admindemo.archive")}</button>
          </div>
          <p className="mt-1 text-xs opacity-80">{t("admindemo.validation.description")}</p>
        </div>
      </section>

      {/* --- Tous les prompts --- */}
      <section data-tour="admin-prompts" className="mt-8">
        <h2 className="text-lg font-bold">{t("admindemo.prompts.title")}</h2>
        <p className="mt-1 text-xs opacity-60">
          {t("admindemo.prompts.hintIntro")}{" "}
          <b>{t("admindemo.prompts.publishedCap")}</b>{t("admindemo.prompts.hintPublished")}{" "}
          <b>{t("admindemo.prompts.retiredCap")}</b>{t("admindemo.prompts.hintRetired")}
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {PROMPTS.map(p => (
            <li key={p.name} className="flex flex-wrap items-center gap-2 border-b border-white/5 py-1">
              <span className={`rounded px-2 py-0.5 text-xs ${p.status === "published" ? "bg-green-700/60" : "bg-gray-600/60"}`}>
                {t(p.status === "published" ? "compte.prompts.status.published" : "compte.prompts.status.retired")}
              </span>
              <b>{p.name}</b> <span className="opacity-60">{t("admindemo.version", { n: p.version })}</span>
              <span className="opacity-60">{p.uses} {t("compte.prompts.uses")} · {p.tokens}</span>
              <span className="flex-grow" />
              {p.status === "published" ? (
                <>
                  <button disabled className={BTN}><MdVisibilityOff /> {t("compte.prompts.retire")}</button>
                  <button disabled className={BTN}><MdEdit /> {t("admindemo.edit")}</button>
                </>
              ) : (
                <>
                  <button disabled className={BTN}><MdPublish /> {t("compte.prompts.republish")}</button>
                  <button disabled className={BTN}><MdArchive /> {t("admindemo.archive")}</button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* --- Comptes --- */}
      <h2 className="mt-12 border-b-2 border-[#DC6521]/50 pb-1 text-xl font-bold uppercase tracking-wide text-[#DC6521]">{t("admindemo.section.comptes")}</h2>
      <section data-tour="admin-comptes" className="mt-10">
        <h2 className="text-lg font-bold">{t("admindemo.comptes.title", { n: COMPTES.length })}</h2>
        <p className="mt-1 text-xs opacity-60">
          {t("admindemo.comptes.hint")}
        </p>
        <table className="mt-2 w-full text-left text-xs">
          <thead className="uppercase opacity-60">
            <tr><th className="py-1">{t("admindemo.comptes.email")}</th><th>{t("compte.identity.name")}</th><th>{t("compte.other.roles")}</th><th>{t("compte.other.school")}</th></tr>
          </thead>
          <tbody>
            {COMPTES.map(c => (
              <tr key={c.email} className="border-b border-white/5">
                <td className="py-1">{c.email}</td><td>{c.nom}</td>
                <td>{c.roles === "both" ? t("admindemo.comptes.rolesBoth") : t("compte.other.promptagogue")}</td>
                <td>{c.etab}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* --- Facturation --- */}
      <section data-tour="admin-facturation" className="mt-10">
        <h2 className="text-lg font-bold">{t("admindemo.billing.title")}</h2>
        <p className="mt-1 text-xs opacity-60">
          {t("admindemo.billing.hint")}
        </p>
        <table className="mt-2 w-full text-left text-xs">
          <thead className="uppercase opacity-60">
            <tr><th className="py-1">{t("compte.other.school")}</th><th>{t("admindemo.billing.free")}</th><th>{t("admindemo.network")}</th><th>{t("chat.input.provider")}</th><th className="text-right">{t("admindemo.billing.requests")}</th><th className="text-right">{t("admindemo.billing.tokens")}</th></tr>
          </thead>
          <tbody>
            {FACTURE.map((f, i) => (
              <tr key={i} className="border-b border-white/5">
                <td className="py-1">{f.etab ?? t("admindemo.billing.publicDemo")}</td>
                <td>{f.gratuit === null ? "—" : t(f.gratuit ? "admindemo.yes" : "admindemo.no")}</td>
                <td>{f.ip}</td><td>{f.fournisseur}</td>
                <td className="text-right">{f.req}</td><td className="text-right">{f.tokens}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* --- Établissements --- */}
      <section data-tour="admin-etablissements" className="mt-10">
        <h2 className="text-lg font-bold">{t("admindemo.etabs.title")}</h2>
        <p className="mt-1 text-xs opacity-60">
          {t("admindemo.etabs.hint")}
        </p>
        <table className="mt-2 w-full text-left text-xs">
          <thead className="uppercase opacity-60">
            <tr><th className="py-1">{t("admindemo.etabs.name")}</th><th>{t("admindemo.etabs.addresses")}</th><th>RESPIRE</th><th className="text-right">{t("admindemo.etabs.quota")}</th><th className="text-right">{t("admindemo.etabs.used")}</th></tr>
          </thead>
          <tbody>
            {ETABS.map(e => (
              <tr key={e.nom} className="border-b border-white/5">
                <td className="py-1">{e.nom}</td><td>{e.ips}</td><td>{t(e.respire ? "admindemo.yes" : "admindemo.no")}</td>
                <td className="text-right">{e.quota}</td><td className="text-right">{e.conso}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* --- Échelle des modèles --- */}
      <h2 className="mt-12 border-b-2 border-[#DC6521]/50 pb-1 text-xl font-bold uppercase tracking-wide text-[#DC6521]">{t("admindemo.section.models")}</h2>
      <section data-tour="admin-echelle" className="mt-10">
        <h2 className="text-lg font-bold">{t("admindemo.echelle.title")}</h2>
        <p className="mt-1 text-xs opacity-60">
          {t("admindemo.echelle.hint")}
        </p>
        <table className="mt-2 w-full text-left text-xs">
          <thead className="uppercase opacity-60">
            <tr><th className="py-1">{t("chat.input.provider")}</th><th>{t("admindemo.echelle.rung1")}</th><th>{t("admindemo.echelle.rung2")}</th><th>{t("admindemo.echelle.rung3")}</th><th>{t("common.catalogue")}</th></tr>
          </thead>
          <tbody>
            {ECHELLE.map(l => (
              <tr key={l.fournisseur} className="border-b border-white/5">
                <td className="py-1"><b>{l.fournisseur}</b></td>
                {l.rungs.map(r => <td key={r} className="pr-2 font-mono">{r}</td>)}
                <td className="text-green-400">{l.source === "native" ? t("admindemo.echelle.native") : l.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="mt-8 text-xs opacity-60">
        {t("admindemo.footer.back")}{" "}
        <Link href="/tutoriel" className="underline">{t("admindemo.footer.guide")}</Link>.
      </p>
    </div>
  );
}
