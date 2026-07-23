import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import { MdArrowBack } from "react-icons/md";
import { getAccount, authHeaders } from "../utils/account";

// Gabarit socratique guidé : abaisse la barrière d'entrée et homogénéise la
// qualité du catalogue. [EXEMPLES À INTÉGRER : le client fournira ses propres
// exemples de prompts socratiques pour enrichir ce gabarit et le guide.]
const TEMPLATE = `Tu es [NomDuTuteur], tuteur socratique de [matière] pour [niveau scolaire].

Règles absolues :
1. Ne donne JAMAIS directement la réponse, même si l'élève insiste.
2. Avance par petites questions : termine chaque réponse par UNE question qui fait progresser d'un pas.
3. Pars de ce que l'élève sait : demande-lui d'abord ce qu'il comprend.
4. En cas d'erreur, propose un contre-exemple plutôt qu'une correction.
5. Quand l'élève trouve, fais-lui reformuler le raisonnement complet.
6. Souligne chaque progrès dans une balise <encouragement>.
7. Expose une piste sans la résoudre dans une balise <thinking>.
8. Ne collecte jamais d'informations personnelles.
9. Ton : [bienveillant / exigeant / humoristique...].

Spécificités de [matière] :
- [règle propre à la discipline]
- [outils autorisés : LaTeX pour les maths, etc.]`;

const errorLabels: Record<string, string> = {
  ERR_NAME_INVALID: "Le nom doit être un nom propre : 2 à 64 caractères (lettres, chiffres, espaces, tirets). « essai » est réservé.",
  ERR_NAME_TAKEN: "Ce nom est déjà pris — chaque tuteur a un nom propre unique.",
  ERR_BODY_TOO_SHORT: "Le prompt est trop court pour être un vrai tuteur.",
  ERR_BODY_TOO_LARGE: "Le prompt dépasse 256 Ko.",
  ERR_QUOTA_USER: "Votre quota total de 1 Mo est atteint : supprimez d'anciens prompts.",
  ERR_RATE_LIMIT: "Trop de créations rapprochées : patientez une minute.",
};

// Publier = créer un brouillon « en construction », testable et partageable
// par URL secrète, puis le soumettre à validation. Ouvert à tous : signé
// (compte vérifié) ou anonyme (validé et géré par l'admin uniquement).
export default function PublierPage() {
  const router = useRouter();
  const account = typeof window !== "undefined" ? getAccount() : null;

  const [name, setName] = useState("");
  const [language, setLanguage] = useState("fr");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState(TEMPLATE);
  const [webSearch, setWebSearch] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Sans compte vérifié, la publication est nécessairement anonyme.
  useEffect(() => {
    if (!account) setAnonymous(true);
  }, [account?.email]);

  // « Proposer une variante » : personnalisation d'un tuteur existant
  // (fonctionnalité pivot v3 : éditer, personnaliser — ouverte à tous).
  useEffect(() => {
    if (!router.isReady) return;
    const source = typeof router.query.variante === "string" ? router.query.variante : "";
    if (!source) return;
    fetch(`/api/prompts/${encodeURIComponent(source)}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => {
        setBody(data.prompt.body);
        setDescription(`Variante de « ${data.prompt.name} » : ${data.prompt.description}`.slice(0, 500));
        setLanguage(data.prompt.language);
      })
      .catch(() => {});
  }, [router.isReady, router.query.variante]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!anonymous) Object.assign(headers, authHeaders());
    const response = await fetch("/api/prompts", {
      method: "POST", headers,
      body: JSON.stringify({ name, language, description, body, webSearch }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(errorLabels[data?.error?.code] || "La création a échoué.");
      return;
    }
    router.push(`/p/essai/${data.shareToken}`);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 text-primary">
      <Head><title>Publier un tuteur — EduChat</title></Head>
      <nav className="pt-6 pb-4">
        <Link href="/" className="flex w-fit items-center gap-1 text-sm opacity-70 hover:opacity-100">
          <MdArrowBack /> Catalogue
        </Link>
      </nav>

      <h1 className="text-2xl font-bold">Proposer un tuteur socratique</h1>
      <p className="mt-2 text-sm opacity-80">
        Votre prompt naît « en construction » : vous le testez dans le chat, vous partagez son
        lien secret à des collègues pour avis, puis vous le soumettez. Il paraîtra au catalogue
        après validation. Le texte des tuteurs publiés est public — l'école est gratuite.
      </p>

      <div className="mt-4 rounded border border-white/10 bg-secondary p-3 text-sm">
        {account ? (
          <>Publication au nom de <b>{account.name || account.email}</b>.{" "}
            <label className="ml-2"><input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} /> publier anonymement</label>
            {anonymous && <span className="block pt-1 text-xs opacity-70">Anonyme : seul un administrateur pourra le supprimer ; gardez précieusement l'URL secrète.</span>}
          </>
        ) : (
          <>Vous publiez <b>anonymement</b> (seul un admin pourra supprimer le prompt, et l'URL
            secrète sera votre seul accès). Pour publier sous votre nom :{" "}
            <Link href="/verifier" className="underline">vérifiez votre adresse email</Link> — sans mot de passe, 30 secondes.
          </>
        )}
      </div>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">Nom propre du tuteur (unique)
            <input value={name} onChange={e => setName(e.target.value)} required maxLength={64}
              placeholder="Ex. Pythagore, Curie, Erasmus…" className="rounded bg-tertiary p-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">Langue principale
            <select value={language} onChange={e => setLanguage(e.target.value)} className="rounded bg-tertiary p-2">
              <option value="fr">Français</option><option value="en">English</option>
              <option value="it">Italiano</option><option value="de">Deutsch</option>
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">Description (matière, niveau, approche — visible au catalogue)
          <input value={description} onChange={e => setDescription(e.target.value)} required maxLength={500}
            placeholder="Ex. Tuteur de physique pour la maturité : fait construire les raisonnements par l'expérience de pensée."
            className="rounded bg-tertiary p-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Le prompt système (256 Ko max — le gabarit ci-dessous est un point de départ, adaptez tout)
          <textarea value={body} onChange={e => setBody(e.target.value)} required rows={18}
            className="rounded bg-tertiary p-3 font-mono text-sm leading-relaxed" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={webSearch} onChange={e => setWebSearch(e.target.checked)} />
          Autoriser la recherche web pour ce tuteur (déconseillé pour un tuteur de raisonnement — coûte des tokens)
        </label>
        <button type="submit" disabled={busy}
          className="rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90 disabled:opacity-50">
          {busy ? "Création…" : "Créer le brouillon (testable avant publication)"}
        </button>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      </form>
    </div>
  );
}
