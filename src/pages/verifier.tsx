import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import { getAccount, storeToken, clearToken } from "../utils/account";
import { deleteServerProfile, syncProfile } from "../utils/profileSync";
import { useT } from "../i18n/useT";

// Vérification d'adresse email, sans mot de passe : nom + email → code à deux
// fois trois chiffres reçu par email → jeton de compte en localStorage.
// Le lien reçu par email arrive ici avec le code en FRAGMENT (#123-456) :
// le fragment n'atteint jamais le serveur ni aucun journal.
export default function VerifierPage() {
  const router = useRouter();
  const t = useT();
  const [step, setStep] = useState<"request" | "confirm" | "done">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  // Mémorisation des conversations : cochée PAR DÉFAUT — c'est l'intérêt
  // premier d'avoir un compte (retrouver ses discussions ailleurs). Reste
  // décochable, et le profil serveur est supprimable à tout moment.
  const [syncOptin, setSyncOptin] = useState(true);
  const [isTeacher, setIsTeacher] = useState(false);
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
      body: JSON.stringify({ email }),
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
      body: JSON.stringify({ email, code, syncOptin, isTeacher }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(errorLabels[data?.error?.code] || "La vérification a échoué.");
      return;
    }
    storeToken(data.token);
    setStep("done");
    // Connexion réussie : si l'option est active, on synchronise dans la foulée
    // (récupère le profil d'un autre navigateur, puis pousse l'état fusionné).
    if (syncOptin) void syncProfile();
  };

  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-16 text-primary">
      <Head><title>Vérification — EduChat</title></Head>

      <h1 className="text-2xl font-bold">{t("verify.title")}</h1>
      {/* Le compte n'est jamais obligatoire : le dire ici, à l'endroit exact
          où la question se pose (et jamais aux élèves, qui n'en ont pas). */}
      <p className="mt-2 rounded border border-white/15 bg-secondary p-3 text-sm opacity-80">
        {t("nav.hint")}
      </p>
      <p className="mt-2 text-sm opacity-80">{t("verify.intro")}</p>

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
          <label className="flex flex-col gap-1 text-sm">{t("verify.email")}
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="rounded bg-tertiary p-2" autoComplete="email" />
          </label>
          <button type="submit" disabled={busy}
            className="mt-2 rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90 disabled:opacity-50">
            {busy ? "…" : t("verify.getCode")}
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
          <label className="flex flex-col gap-1 text-sm">{t("verify.code")}
            <input value={code} onChange={e => setCode(e.target.value)} required placeholder="123-456"
              inputMode="numeric" className="rounded bg-tertiary p-2 text-center text-xl tracking-widest" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={syncOptin} onChange={e => setSyncOptin(e.target.checked)} />
            {t("verify.sync")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isTeacher} onChange={e => setIsTeacher(e.target.checked)} />
            Je suis enseignant·e — je souhaite gérer des sessions de classe (rattachement à un établissement validé par l'admin)
          </label>
          <button type="submit" disabled={busy}
            className="mt-2 rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90 disabled:opacity-50">
            {busy ? "…" : t("verify.confirm")}
          </button>
          <button type="button" onClick={() => { setStep("request"); setCode(""); }}
            className="text-sm underline opacity-70">
            {t("verify.resend")}
          </button>
        </form>
      )}

      {step === "done" && (
        <div className="mt-6 flex flex-col gap-4">
          <p className="rounded border border-green-500/40 bg-green-500/10 p-3">
            Adresse vérifiée — bienvenue ! Vous pouvez maintenant publier des prompts socratiques.
            Votre nom d'affichage reprend pour l'instant le début de votre adresse ; il se
            personnalise depuis <Link href="/compte" className="underline">Mes données</Link>.
          </p>
          <Link href="/publier" className="rounded bg-[#DC6521] px-4 py-2 text-center font-bold hover:opacity-90">
            {t("verify.publish")}
          </Link>
          <Link href="/" className="text-center text-sm underline opacity-70">Retour au catalogue</Link>
          <button
            onClick={async () => {
              if (window.confirm("Supprimer définitivement votre profil synchronisé du serveur ?\n\nVos données locales sont conservées, et la sauvegarde automatique sera DÉSACTIVÉE — sans quoi vos navigateurs recréeraient le profil dans la minute. Vous pourrez la réactiver depuis « Mes données ».")) {
                alert((await deleteServerProfile())
                  ? "Profil serveur supprimé. La sauvegarde automatique est désactivée : la case se recoche depuis « Mes données »."
                  : "Échec de la suppression.");
              }
            }}
            className="text-center text-xs underline opacity-50 hover:opacity-100">
            Supprimer mon profil synchronisé du serveur
          </button>
          <Link href="/compte" className="text-center text-xs underline opacity-50 hover:opacity-100">
            Voir toutes mes données (consommation, clés, conversations, tuteurs)
          </Link>
        </div>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
    </div>
  );
}
