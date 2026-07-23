import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import { MdArrowBack } from "react-icons/md";
import { getAccount, storeToken, clearToken } from "../utils/account";

// Vérification d'adresse email, sans mot de passe : nom + email → code à deux
// fois trois chiffres reçu par email → jeton de compte en localStorage.
// Le lien reçu par email arrive ici avec le code en FRAGMENT (#123-456) :
// le fragment n'atteint jamais le serveur ni aucun journal.
export default function VerifierPage() {
  const router = useRouter();
  const [step, setStep] = useState<"request" | "confirm" | "done">("request");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [syncOptin, setSyncOptin] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const account = typeof window !== "undefined" ? getAccount() : null;

  // Code pré-rempli depuis le fragment d'URL (lien de l'email).
  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    if (/^\d{3}-?\d{3}$/.test(fragment)) {
      setCode(fragment);
      setStep("confirm");
    }
  }, []);

  const errorLabels: Record<string, string> = {
    ERR_EMAIL_INVALID: "Cette adresse email ne semble pas valide.",
    ERR_CODE_INVALID: "Le code doit comporter six chiffres (ex. 123-456).",
    ERR_CODE_EXPIRED: "Ce code a expiré ou n'existe pas : redemandez-en un.",
    ERR_CODE_WRONG: "Code incorrect.",
    ERR_TOO_MANY_ATTEMPTS: "Trop d'essais : redemandez un nouveau code.",
    ERR_RATE_LIMIT: "Trop de tentatives rapprochées : patientez une minute.",
  };

  const request = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    const response = await fetch("/api/verify/request", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    setBusy(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(errorLabels[data?.error?.code] || "La demande a échoué.");
      return;
    }
    setStep("confirm");
  };

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    const response = await fetch("/api/verify/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, syncOptin }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(errorLabels[data?.error?.code] || "La vérification a échoué.");
      return;
    }
    storeToken(data.token);
    setStep("done");
  };

  return (
    <div className="mx-auto max-w-md px-4 pb-16 text-primary">
      <Head><title>Vérification — EduChat</title></Head>
      <nav className="pt-6 pb-4">
        <Link href="/" className="flex w-fit items-center gap-1 text-sm opacity-70 hover:opacity-100">
          <MdArrowBack /> Catalogue
        </Link>
      </nav>

      <h1 className="text-2xl font-bold">Vérifier mon adresse email</h1>
      <p className="mt-2 text-sm opacity-80">
        Aucun mot de passe : un simple code reçu par email vous identifie comme
        auteur (« promptagogue »). Nécessaire uniquement pour publier des prompts.
      </p>

      {account && step !== "done" && (
        <p className="mt-4 rounded border border-white/10 bg-secondary p-3 text-sm">
          Déjà vérifié : <b>{account.name || account.email}</b>{" "}
          <button onClick={() => { clearToken(); router.reload(); }} className="underline opacity-70">
            se déconnecter
          </button>
        </p>
      )}

      {step === "request" && (
        <form onSubmit={request} className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">Votre nom (public, affiché comme auteur)
            <input value={name} onChange={e => setName(e.target.value)} required maxLength={80}
              className="rounded bg-tertiary p-2" autoComplete="name" />
          </label>
          <label className="flex flex-col gap-1 text-sm">Votre email (jamais affiché publiquement)
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="rounded bg-tertiary p-2" autoComplete="email" />
          </label>
          <button type="submit" disabled={busy}
            className="mt-2 rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90 disabled:opacity-50">
            {busy ? "Envoi…" : "Recevoir mon code"}
          </button>
        </form>
      )}

      {step === "confirm" && (
        <form onSubmit={confirm} className="mt-6 flex flex-col gap-3">
          <p className="text-sm opacity-80">
            Un code à six chiffres vient d'être envoyé{email ? <> à <b>{email}</b></> : ""} (validité : 15 minutes).
          </p>
          {!email && (
            <label className="flex flex-col gap-1 text-sm">Votre email
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="rounded bg-tertiary p-2" autoComplete="email" />
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">Code reçu
            <input value={code} onChange={e => setCode(e.target.value)} required placeholder="123-456"
              inputMode="numeric" className="rounded bg-tertiary p-2 text-center text-xl tracking-widest" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={syncOptin} onChange={e => setSyncOptin(e.target.checked)} />
            Synchroniser mon profil entre navigateurs (option, stocké sur le serveur)
          </label>
          <button type="submit" disabled={busy}
            className="mt-2 rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90 disabled:opacity-50">
            {busy ? "Vérification…" : "Confirmer"}
          </button>
          <button type="button" onClick={() => { setStep("request"); setCode(""); }}
            className="text-sm underline opacity-70">
            Redemander un code
          </button>
        </form>
      )}

      {step === "done" && (
        <div className="mt-6 flex flex-col gap-4">
          <p className="rounded border border-green-500/40 bg-green-500/10 p-3">
            Adresse vérifiée — bienvenue{name ? `, ${name}` : ""} ! Vous pouvez maintenant publier des prompts socratiques.
          </p>
          <Link href="/publier" className="rounded bg-[#DC6521] px-4 py-2 text-center font-bold hover:opacity-90">
            Publier un prompt
          </Link>
          <Link href="/" className="text-center text-sm underline opacity-70">Retour au catalogue</Link>
        </div>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
    </div>
  );
}
