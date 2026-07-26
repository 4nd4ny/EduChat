import Head from "next/head";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { MdArchive, MdCheck, MdEdit, MdPublish, MdVisibilityOff } from "react-icons/md";
import InterfaceTour from "../chat/InterfaceTour";

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

const BTN = "flex items-center gap-1 rounded border border-white/20 px-2 py-0.5 text-xs opacity-60";

const PROMPTS = [
  { name: "Socrate", version: 3, status: "publié", uses: 1284, tokens: "412 k" },
  { name: "Hypatie", version: 1, status: "publié", uses: 517, tokens: "168 k" },
  { name: "Montaigne", version: 2, status: "dépublié", uses: 96, tokens: "31 k" },
];

const COMPTES = [
  { email: "claire.martin@example.org", nom: "claire.martin", roles: "promptagogue · enseignante", etab: "Collège de la Démonstration" },
  { email: "pierre.dubois@example.org", nom: "Pierre D.", roles: "promptagogue", etab: "—" },
  { email: "ecole.exemple@example.org", nom: "ecole.exemple", roles: "promptagogue · enseignante", etab: "Lycée des Exemples" },
];

const ETABS = [
  { nom: "Collège de la Démonstration", ips: "203.0.113.0/24", respire: true, quota: "3 000 000", conso: "412 350" },
  { nom: "Lycée des Exemples", ips: "198.51.100.7", respire: false, quota: "1 000 000", conso: "87 900" },
];

const FACTURE = [
  { etab: "Collège de la Démonstration", gratuit: "oui", ip: "203.0.113.0/24", fournisseur: "mistral", req: 1240, tokens: "318 900" },
  { etab: "Lycée des Exemples", gratuit: "non", ip: "198.51.100.7", fournisseur: "anthropic", req: 210, tokens: "87 900" },
  { etab: "(démo publique — non facturable)", gratuit: "—", ip: "—", fournisseur: "openrouter", req: 64, tokens: "18 240" },
];

const ECHELLE = [
  { fournisseur: "mistral", rungs: ["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest"], source: "native" },
  { fournisseur: "anthropic", rungs: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"], source: "native" },
  { fournisseur: "openai", rungs: ["gpt-5.4-mini", "gpt-5.5", "gpt-5.5-pro"], source: "native" },
];

export default function AdminDemoPage() {
  const [tour, setTour] = useState(false);
  useEffect(() => {
    // La visite se lance sur ?visite=1, comme les trois autres démonstrations.
    if (new URLSearchParams(window.location.search).get("visite") === "1") setTour(true);
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-6 text-primary">
      <Head><title>Administration (démonstration) — EduChat</title></Head>
      {tour && <InterfaceTour parcours="admin" onClose={() => setTour(false)} />}

      <p className="rounded-lg border border-[#DC6521]/50 bg-[#DC6521]/10 p-3 text-sm">
        <b>Démonstration.</b> Voici l&apos;interface d&apos;administration telle qu&apos;elle se
        présente, avec des <b>données entièrement fictives</b> : établissements imaginaires,
        adresses en <code>example.org</code>, plages IP de documentation. Aucune donnée réelle
        n&apos;est chargée et aucun bouton n&apos;agit. La vraie page vit sur{" "}
        <Link href="/admin" className="underline">/admin</Link>, réservée à l&apos;administration.
      </p>

      <h1 className="mt-6 text-2xl font-bold">Administration</h1>

      {/* --- File de validation --- */}
      <section data-tour="admin-validation" className="mt-8">
        <h2 className="text-lg font-bold">À valider (1)</h2>
        <p className="mt-1 text-xs opacity-60">
          Un tuteur proposé attend une relecture. N&apos;importe quel promptagogue vérifié peut
          le publier — pas seulement l&apos;administration : c&apos;est ce qui évite le goulot
          d&apos;un validateur unique tout en protégeant un public mineur.
        </p>
        <div className="mt-2 rounded border border-white/10 bg-secondary p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-amber-600/70 px-2 py-0.5 text-xs">soumis</span>
            <b>Ératosthène</b> <span className="opacity-60">v1 · proposé anonymement</span>
            <span className="flex-grow" />
            <button disabled className="flex items-center gap-1 rounded bg-green-600/50 px-2 py-1 text-xs"><MdCheck /> Publier</button>
            <button disabled className="flex items-center gap-1 rounded bg-gray-600/50 px-2 py-1 text-xs"><MdArchive /> Archiver</button>
          </div>
          <p className="mt-1 text-xs opacity-80">Géométrie et mesure de la Terre, par le questionnement.</p>
        </div>
      </section>

      {/* --- Tous les prompts --- */}
      <section data-tour="admin-prompts" className="mt-8">
        <h2 className="text-lg font-bold">Tous les prompts</h2>
        <p className="mt-1 text-xs opacity-60">
          Rien n&apos;est jamais supprimé. <b>Publié</b> : dépublier · modifier.
          <b> Dépublié</b> : republier · archiver. « Modifier » couvre le nom, la description et
          le texte, et crée une nouvelle version.
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {PROMPTS.map(p => (
            <li key={p.name} className="flex flex-wrap items-center gap-2 border-b border-white/5 py-1">
              <span className={`rounded px-2 py-0.5 text-xs ${p.status === "publié" ? "bg-green-700/60" : "bg-gray-600/60"}`}>{p.status}</span>
              <b>{p.name}</b> <span className="opacity-60">v{p.version}</span>
              <span className="opacity-60">{p.uses} usages · {p.tokens}</span>
              <span className="flex-grow" />
              {p.status === "publié" ? (
                <>
                  <button disabled className={BTN}><MdVisibilityOff /> Dépublier</button>
                  <button disabled className={BTN}><MdEdit /> Modifier</button>
                </>
              ) : (
                <>
                  <button disabled className={BTN}><MdPublish /> Republier</button>
                  <button disabled className={BTN}><MdArchive /> Archiver</button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* --- Comptes --- */}
      <section data-tour="admin-comptes" className="mt-10">
        <h2 className="text-lg font-bold">Comptes ({COMPTES.length})</h2>
        <p className="mt-1 text-xs opacity-60">
          Aucun mot de passe n&apos;existe : l&apos;identité se prouve par un code reçu par email.
          Les rôles se cochent ici — c&apos;est aussi d&apos;ici qu&apos;un enseignant est rattaché
          à son établissement. Les élèves, eux, n&apos;ont jamais de compte.
        </p>
        <table className="mt-2 w-full text-left text-xs">
          <thead className="uppercase opacity-60">
            <tr><th className="py-1">Email</th><th>Nom affiché</th><th>Rôles</th><th>Établissement</th></tr>
          </thead>
          <tbody>
            {COMPTES.map(c => (
              <tr key={c.email} className="border-b border-white/5">
                <td className="py-1">{c.email}</td><td>{c.nom}</td><td>{c.roles}</td><td>{c.etab}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* --- Établissements --- */}
      <section data-tour="admin-etablissements" className="mt-10">
        <h2 className="text-lg font-bold">Établissements (clients)</h2>
        <p className="mt-1 text-xs opacity-60">
          Une école est reconnue par ses adresses réseau : ses élèves accèdent alors à EduChat
          sans compte ni clé. Les horaires et les quotas se règlent côté école ; l&apos;IP et la
          facturation restent des décisions administratives.
        </p>
        <table className="mt-2 w-full text-left text-xs">
          <thead className="uppercase opacity-60">
            <tr><th className="py-1">Nom</th><th>Adresses réseau</th><th>RESPIRE</th><th className="text-right">Quota / mois</th><th className="text-right">Consommé</th></tr>
          </thead>
          <tbody>
            {ETABS.map(e => (
              <tr key={e.nom} className="border-b border-white/5">
                <td className="py-1">{e.nom}</td><td>{e.ips}</td><td>{e.respire ? "oui" : "non"}</td>
                <td className="text-right">{e.quota}</td><td className="text-right">{e.conso}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* --- Échelle des modèles --- */}
      <section data-tour="admin-echelle" className="mt-10">
        <h2 className="text-lg font-bold">Échelle des modèles</h2>
        <p className="mt-1 text-xs opacity-60">
          Ce que l&apos;apprenant obtient quand il choisit un fournisseur. On part toujours du
          barreau 1, le plus économe ; « Régénérer » monte d&apos;un cran. Un barreau que le
          fournisseur ne publie plus est signalé en rouge.
        </p>
        <table className="mt-2 w-full text-left text-xs">
          <thead className="uppercase opacity-60">
            <tr><th className="py-1">Fournisseur</th><th>1 · rapide</th><th>2 · équilibré</th><th>3 · approfondi</th><th>Catalogue</th></tr>
          </thead>
          <tbody>
            {ECHELLE.map(l => (
              <tr key={l.fournisseur} className="border-b border-white/5">
                <td className="py-1"><b>{l.fournisseur}</b></td>
                {l.rungs.map(r => <td key={r} className="pr-2 font-mono">{r}</td>)}
                <td className="text-green-400">{l.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* --- Facturation --- */}
      <section data-tour="admin-facturation" className="mt-10">
        <h2 className="text-lg font-bold">Facturation du mois</h2>
        <p className="mt-1 text-xs opacity-60">
          Exprimée en jetons par fournisseur — le tarif appliqué reste à la main du
          gestionnaire. Seule la clé interne est facturée : l&apos;usage d&apos;une clé
          personnelle n&apos;est jamais journalisé. Export CSV, aussi par enseignant.
        </p>
        <table className="mt-2 w-full text-left text-xs">
          <thead className="uppercase opacity-60">
            <tr><th className="py-1">Établissement</th><th>Gratuit</th><th>Adresse réseau</th><th>Fournisseur</th><th className="text-right">Requêtes</th><th className="text-right">Jetons</th></tr>
          </thead>
          <tbody>
            {FACTURE.map((f, i) => (
              <tr key={i} className="border-b border-white/5">
                <td className="py-1">{f.etab}</td><td>{f.gratuit}</td><td>{f.ip}</td><td>{f.fournisseur}</td>
                <td className="text-right">{f.req}</td><td className="text-right">{f.tokens}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="mt-8 text-xs opacity-60">
        Retour au <Link href="/tutoriel" className="underline">guide</Link>.
      </p>
    </div>
  );
}
