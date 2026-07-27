import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useRef, useState } from "react";
import { getAccount, storeToken, clearToken, setEcoleActive } from "../utils/account";
import { deleteServerProfile, syncProfile } from "../utils/profileSync";
import { useT } from "../i18n/useT";

// Vérification d'adresse email, sans mot de passe : email → code à deux fois
// trois chiffres reçu par email → jeton de compte en localStorage.
//
// LE LIEN DU COURRIEL OUVRE LE COMPTE, IL NE ROUVRE PAS LE FORMULAIRE. Il
// arrive ici avec, en FRAGMENT, une charge signée qui porte l'adresse, le code
// et les choix faits à la demande (src/server/token.ts) : la page la poste
// telle quelle et la session s'ouvre. Le fragment, lui, n'atteint jamais le
// serveur — ni ses journaux, ni l'en-tête Referer.
//
// Les liens de l'ANCIENNE forme (#123-456, encore en vol dans des boîtes aux
// lettres au moment du déploiement) restent reconnus : ils pré-remplissent le
// code, comme avant, et demandent l'adresse.
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
  // L'ÉCOLE RECONNUE À L'INSTANT PAR L'IP (src/pages/api/verify/confirm.ts).
  // Le rattachement se faisait en silence : la personne héritait d'un sélecteur
  // d'école sans avoir jamais lu d'où il venait, et l'on ne pouvait pas
  // constater de l'extérieur que le mécanisme marchait. On l'annonce donc, une
  // fois, à l'écran même où il vient de se produire.
  const [ecoleReconnue, setEcoleReconnue] =
    useState<{ name: string; nouvelle: boolean } | null>(null);
  // Ouverture de session EN COURS depuis le lien du courriel : l'écran ne doit
  // montrer ni le formulaire (on ne redemande rien) ni le succès (rien n'est
  // encore acquis), mais l'attente elle-même.
  const [lienEnCours, setLienEnCours] = useState(false);
  // Le fragment n'est lu et posté QU'UNE FOIS. Sans ce verrou, le double appel
  // des effets (React en mode strict) enverrait deux confirmations : la seconde
  // trouverait le lien déjà consommé et afficherait un échec PAR-DESSUS une
  // connexion réussie — indiscernable, pour l'utilisateur, d'un vrai rejeu.
  const lienTraite = useRef(false);
  const account = typeof window !== "undefined" ? getAccount() : null;

  const errorLabels: Record<string, string> = {
    ERR_EMAIL_INVALID: "Cette adresse email ne semble pas valide.",
    ERR_CODE_INVALID: "Le code doit comporter six chiffres (ex. 123-456).",
    ERR_CODE_EXPIRED: "Ce code a expiré ou n'existe pas : redemandez-en un.",
    ERR_CODE_WRONG: "Code incorrect.",
    ERR_TOO_MANY_ATTEMPTS: "Trop d'essais : redemandez un nouveau code.",
    ERR_RATE_LIMIT: "Trop de tentatives rapprochées : patientez une minute.",
    // Signature invalide, lien expiré, lien déjà consommé : le serveur ne dit
    // pas laquelle des trois, et cette page n'a donc qu'une phrase à offrir.
    ERR_LIEN_INVALIDE: t("verify.lien.echec"),
  };

  const request = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    const response = await fetch("/api/verify/request", {
      method: "POST", headers: { "Content-Type": "application/json" },
      // Les deux choix partent DÈS LA DEMANDE : ils voyagent signés dans le
      // lien, et se retrouvent donc sur le téléphone qui ouvrira le courriel.
      body: JSON.stringify({ email, syncOptin, isTeacher }),
    });
    setBusy(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(errorLabels[data?.error?.code] || "La demande a échoué.");
      return;
    }
    setStep("confirm");
  };

  // Confirmation, quelle que soit la preuve apportée : le code recopié à la
  // main, ou le lien signé du courriel. Un seul appel, un seul traitement du
  // succès — le lien vaut le code, il n'y a donc pas deux façons d'entrer.
  const envoyerConfirmation = async (preuve: Record<string, unknown>) => {
    setBusy(true); setError("");
    const response = await fetch("/api/verify/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preuve),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false); setLienEnCours(false);
    if (!response.ok) {
      setError(errorLabels[data?.error?.code] || "La vérification a échoué.");
      return;
    }
    // Ouvert par un lien, ce navigateur n'a jamais vu ni l'adresse ni les cases
    // cochées à la demande du code : c'est la réponse du serveur qui les lui
    // apprend. `teacher` compte autant que l'adresse — c'est lui qui déclenche,
    // plus bas, la phrase disant ce que le rattachement à l'école N'OUVRE PAS.
    // Sans cela, l'enseignant qui coche sur son ordinateur et clique sur son
    // téléphone n'aurait jamais lu cet avertissement.
    if (data.email) setEmail(String(data.email));
    if (data.teacher) setIsTeacher(true);
    storeToken(data.token);
    if (data.ecole) {
      setEcoleReconnue({ name: String(data.ecole.name), nouvelle: !!data.ecole.nouvelle });
      // École ACTIVE posée sur celle qu'on vient de reconnaître, et seulement
      // quand le lien est NEUF : c'est là qu'on travaille, et le sélecteur doit
      // s'ouvrir dessus. Sur un lien déjà connu, on ne touche à rien — écraser
      // le choix d'un enseignant qui repasse par la vérification depuis un
      // autre collège lui déplacerait son école sous les doigts. Ce n'est
      // qu'une PRÉFÉRENCE : le serveur revérifie le lien à chaque requête
      // (src/server/appartenance.ts).
      if (data.ecole.nouvelle) setEcoleActive(Number(data.ecole.id));
    }
    setStep("done");
    // Connexion réussie : si l'option est active, on synchronise dans la foulée
    // (récupère le profil d'un autre navigateur, puis pousse l'état fusionné).
    // Le serveur RENVOIE le choix : ouvert par un lien, ce navigateur ignore ce
    // qui a été coché sur l'appareil d'où le code a été demandé.
    if (data.sync ?? syncOptin) void syncProfile();
  };

  const confirm = (event: React.FormEvent) => {
    event.preventDefault();
    void envoyerConfirmation({ email, code, syncOptin, isTeacher });
  };

  // LE LIEN DU COURRIEL, LU UNE FOIS ET AUSSITÔT EFFACÉ DE LA BARRE D'ADRESSE.
  //
  // Deux formes acceptées : la charge signée (base64url « charge.signature »),
  // qui ouvre le compte sans rien redemander, et l'ancien code nu (#123-456),
  // qui pré-remplit le formulaire comme avant — des courriels de l'ancienne
  // forme dorment encore dans des boîtes le jour du déploiement.
  //
  // L'effacement du fragment n'est pas de la coquetterie : ce lien VAUT le
  // code. On ne le laisse ni dans un signet, ni dans une capture d'écran de la
  // barre d'adresse, ni exposé à un rechargement de page — lequel rejouerait un
  // lien désormais consommé et afficherait un échec après une connexion pourtant
  // réussie. L'historique du navigateur en garde trace — et il faut le dire
  // exactement : la charge est SIGNÉE et ENCODÉE en base64url, pas CHIFFRÉE.
  // Elle ne se dicte pas au téléphone et ne se lit pas d'un coup d'œil, mais un
  // atob() dans une console rend l'adresse. Ce qu'on gagne ici est ailleurs :
  // la trace laissée est déjà consommée, donc sans valeur. La confidentialité
  // de l'adresse, elle, tient au FRAGMENT (jamais envoyé au serveur, absent des
  // journaux et de l'en-tête Referer), pas à un chiffrement qui n'existe pas.
  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    if (!fragment || lienTraite.current) return;
    lienTraite.current = true;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (/^\d{3}-?\d{3}$/.test(fragment)) {
      setCode(fragment);
      setStep("confirm");
      return;
    }
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(fragment)) {
      setLienEnCours(true);
      void envoyerConfirmation({ lien: fragment });
    }
    // Volontairement sans dépendances : ce fragment se lit au premier rendu, et
    // une seule fois — c'est le verrou lienTraite qui en répond, pas React.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-16 text-primary">
      <Head><title>{t("verifier.headTitle")}</title></Head>

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

      {/* OUVERTURE PAR LE LIEN : rien à remplir, rien à cliquer. On ne montre
          pas le formulaire pendant ce temps — le faire apparaître pour le
          remplacer aussitôt donnerait justement l'impression qu'on redemande
          ce que le serveur sait déjà. */}
      {lienEnCours && (
        <p className="mt-6 rounded border border-white/15 bg-secondary p-3 text-sm">
          {t("verify.lien.encours")}
        </p>
      )}

      {step === "request" && !lienEnCours && (
        <form onSubmit={request} className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">{t("verify.email")}
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="rounded bg-tertiary p-2" autoComplete="email" />
          </label>
          {/* LES DEUX CHOIX SE FONT ICI, AVANT L'ENVOI, et non plus à l'écran
              du code : le lien du courriel ouvre le compte directement, il n'y
              a plus d'écran intermédiaire où les poser. Ils partent signés dans
              le lien, donc ils suivent jusqu'au téléphone qui l'ouvrira. */}
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
          {/* LE CODE COURT RESTE SAISISSABLE À LA MAIN : qui lit ses courriels
              sur un autre appareil que celui où il travaille recopie six
              chiffres plutôt qu'une URL de deux cents caractères. Les deux
              cases ont migré à l'écran précédent (elles voyagent dans le lien) ;
              elles gardent ici la valeur qui y a été choisie. */}
          <label className="flex flex-col gap-1 text-sm">{t("verify.code")}
            <input value={code} onChange={e => setCode(e.target.value)} required placeholder="123-456"
              inputMode="numeric" className="rounded bg-tertiary p-2 text-center text-xl tracking-widest" />
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
          {/* LE RATTACHEMENT, DIT UNE FOIS, LÀ OÙ IL VIENT D'AVOIR LIEU.
              Deux phrases distinctes, parce que ce ne sont pas deux fois la
              même nouvelle : « vous venez d'être rattaché » s'annonce, « vous
              l'étiez déjà » se rappelle. Et la seconde ligne dit tout de suite
              ce que ce lien NE donne PAS — sans quoi l'enseignant croirait
              trouver sa console de classe et repartirait déçu. */}
          {ecoleReconnue && (
            <p className="rounded border border-white/15 bg-secondary p-3 text-sm">
              {ecoleReconnue.nouvelle
                ? <>{t("verify.ecole.rattache")} <b>{ecoleReconnue.name}</b>.</>
                : <>{t("verify.ecole.deja")} <b>{ecoleReconnue.name}</b>.</>}
              {/* CE QUE LE LIEN NE DONNE PAS — mais seulement à qui vient de
                  demander le rôle d'enseignant. Le rattachement lui-même
                  s'annonce à tout le monde (c'est un fait sur son compte) ;
                  la limite du rôle, elle, ne répond qu'à une question posée.
                  L'élève qui vérifie son adresse en classe n'a pas demandé de
                  console : lui expliquer qu'elle lui est fermée l'inviterait à
                  la réclamer. */}
              {isTeacher && (
                <>{" "}<span className="opacity-80">{t("verify.ecole.portee")}</span></>
              )}
            </p>
          )}
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
