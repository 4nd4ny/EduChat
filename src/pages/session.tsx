import Head from "next/head";
import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { getAccount } from "../utils/account";
import { MdLockOpen, MdLockOutline, MdSchool, MdWifiTethering } from "react-icons/md";

// Console de SESSION DE CLASSE (enseignant).
//
// Ici, un enseignant OUVRE l'accès à la clé API de l'école pour tous les
// élèves connectés depuis l'IP de l'établissement : le déverrouillage vaut
// pour la salle entière, pour la durée choisie, sans qu'aucun élève n'ait de
// compte ni de clé. Il peut aussi refermer avant l'heure et déployer un
// tuteur socratique sur la classe.
//
// Le mot de passe de salle est la preuve enseignante (modèle de confiance de
// la classe) : la page est donc publique, mais toute action en exige un.

type Status = {
  ip: string;
  etablissement: { name: string; hasOwnHours: boolean } | null;
  open: boolean;
  lockExpiresAt: number | null;
  withinSchedule: boolean;
  maxUnlockMinutes: number;
  settings: { promptName: string | null; webSearch: boolean; expiresAt: number } | null;
};

type PromptOption = { name: string; description: string };

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });

export default function SessionPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [prompts, setPrompts] = useState<PromptOption[]>([]);
  const [password, setPassword] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [promptName, setPromptName] = useState("");
  const [webSearch, setWebSearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // Console d'enseignant : tant que personne n'est identifié, on affiche l'état
  // de la salle et rien d'autre. Le formulaire d'ouverture et le déploiement
  // d'un tuteur ne concernent pas un visiteur de passage.
  const [identifie, setIdentifie] = useState(false);
  useEffect(() => { setIdentifie(!!getAccount()); }, []);

  const refresh = useCallback(() => {
    fetch("/api/session-status")
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: Status) => {
        setStatus(data);
        if (data.settings) {
          setPromptName(data.settings.promptName ?? "");
          setWebSearch(data.settings.webSearch);
        }
      })
      .catch(() => setError("État de la session indisponible."));
  }, []);

  useEffect(() => {
    refresh();
    fetch("/api/prompts?sort=uses")
      .then(r => r.json())
      .then(data => setPrompts((data.prompts ?? []).map((p: any) => ({ name: p.name, description: p.description }))))
      .catch(() => {});
  }, [refresh]);

  // Ouvrir : le mot de passe porte la durée en suffixe (convention de
  // /api/auth, plafonnée côté serveur par SECRET_MAX_UNLOCK_MINUTES).
  const openAccess = async () => {
    if (!password.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: `${password}${minutes}` }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        setError(response.status === 429
          ? "Trop de tentatives échouées : patientez quelques minutes."
          : "Mot de passe incorrect.");
        return;
      }
      setMessage(`Accès ouvert pour ${minutes} minutes — les élèves de cette salle peuvent utiliser la clé de l'école.`);
      setPassword("");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const closeAccess = async () => {
    if (!password.trim()) { setError("Le mot de passe est nécessaire pour refermer l'accès."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) { setError("Mot de passe incorrect."); return; }
      setMessage("Accès refermé : la clé de l'école n'est plus utilisable depuis cette salle.");
      setPassword("");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const deployTutor = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/session-settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptName, webSearch }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error?.code === "ERR_NO_ETABLISSEMENT"
          ? "Cette IP n'est rattachée à aucun établissement : impossible de déployer un tuteur sur la classe."
          : data?.error?.code === "ERR_FORBIDDEN"
            ? "Ouvrez d'abord l'accès (mot de passe) : c'est lui qui vous identifie comme enseignant."
            : "Le déploiement a échoué.");
        return;
      }
      setMessage(promptName
        ? `« ${promptName} » est déployé sur la classe jusqu'à ${clock(data.expiresAt)}.`
        : "Chat libre déployé sur la classe (aucun tuteur imposé).");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return <div className="py-16 text-center text-primary opacity-60">Chargement…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 text-primary">
      <Head><title>Session de classe — EduChat</title></Head>

      <h1 className="flex items-center gap-2 pt-6 text-2xl font-bold">
        <MdSchool /> Session de classe
      </h1>
      <p className="mt-2 text-sm opacity-80">
        Ouvrez l'accès à la clé API de l'école pour tous les élèves connectés depuis cette salle :
        aucun compte, aucune clé personnelle à saisir de leur côté. L'accès se referme tout seul
        à la fin de la durée choisie.
      </p>

      {/* --- État courant --- */}
      <section className={`mt-5 rounded-lg border p-4 ${status.open
        ? "border-green-500/40 bg-green-500/10" : "border-white/15 bg-secondary"}`}>
        <h2 className="flex items-center gap-2 font-bold">
          {status.open ? <MdLockOpen className="text-green-400" /> : <MdLockOutline />}
          {status.open ? "Accès ouvert" : "Accès fermé"}
        </h2>
        <ul className="mt-2 space-y-1 text-sm opacity-90">
          {/* Le texte est enveloppé : dans un conteneur flex, chaque fragment
              deviendrait sinon un élément à part, et la phrase se disloquerait. */}
          <li className="flex items-start gap-2">
            <MdWifiTethering className="mt-0.5 shrink-0 opacity-60" />
            <span>
              {status.etablissement
                ? <>Salle reconnue : <b>{status.etablissement.name}</b> <span className="opacity-60">({status.ip})</span></>
                : <>Cette IP <span className="opacity-60">({status.ip})</span> n&apos;est rattachée à <b>aucun établissement</b> —
                    l&apos;ouverture par mot de passe fonctionne, mais le déploiement d&apos;un tuteur sur la classe non.</>}
            </span>
          </li>
          {status.lockExpiresAt && (
            <li>Déverrouillage en cours jusqu'à <b>{clock(status.lockExpiresAt)}</b>.</li>
          )}
          {!status.lockExpiresAt && status.withinSchedule && (
            <li>Accès libre en cours grâce aux <b>horaires de l'établissement</b> — inutile d'ouvrir quoi que ce soit.</li>
          )}
          {!status.lockExpiresAt && !status.withinSchedule && (
            <li className="opacity-70">Hors des plages horaires libres : ouvrez l'accès ci-dessous pour votre cours.</li>
          )}
          {status.settings && (
            <li>
              Tuteur déployé : <b>{status.settings.promptName ?? "chat libre"}</b>
              {status.settings.webSearch ? " · recherche web autorisée" : " · recherche web coupée"}
              <span className="opacity-60"> (jusqu'à {clock(status.settings.expiresAt)})</span>
            </li>
          )}
        </ul>
      </section>

      {!identifie && (
        <div className="mt-6 text-center">
          <p className="text-sm opacity-80">
            Identifiez-vous pour ouvrir l'accès de la salle et déployer un tuteur sur la classe :
            un code reçu par email, sans mot de passe.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Link href="/verifier" className="rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90">
              Vérifier mon email
            </Link>
            <Link href="/" className="rounded border border-white/20 px-4 py-2 hover:bg-tertiary">
              Retour au catalogue
            </Link>
          </div>
        </div>
      )}

      {identifie && (<>
      {/* --- Ouvrir / fermer --- */}
      <section className="mt-5 rounded-lg border border-white/15 bg-secondary p-4">
        <h2 className="font-bold">Ouvrir l'accès pour la salle</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            Mot de passe de salle
            <input type="password" autoComplete="off" value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") void openAccess(); }}
              className="rounded bg-tertiary p-2" placeholder="Le mot de passe fourni par l'établissement" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Durée
            <select value={minutes} onChange={e => setMinutes(Number(e.target.value))}
              className="rounded bg-tertiary p-2">
              {DURATIONS.filter(d => d <= status.maxUnlockMinutes).map(d => (
                <option key={d} value={d}>{d < 60 ? `${d} minutes` : `${d / 60} h`}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={openAccess} disabled={busy || !password.trim()}
            className="rounded bg-[#DC6521] px-4 py-2 font-bold text-[#111827] hover:opacity-90 disabled:opacity-50">
            Ouvrir l'accès
          </button>
          {status.lockExpiresAt && (
            <button onClick={closeAccess} disabled={busy}
              className="rounded border border-white/20 px-4 py-2 text-sm hover:bg-tertiary disabled:opacity-50">
              Refermer maintenant
            </button>
          )}
        </div>
        <p className="mt-2 text-xs opacity-60">
          Plafond fixé par l'établissement : {status.maxUnlockMinutes} minutes. La consommation est
          journalisée par IP d'établissement pour la facturation — jamais par élève.
        </p>
      </section>

      {/* --- Déployer un tuteur --- */}
      <section className="mt-5 rounded-lg border border-white/15 bg-secondary p-4">
        <h2 className="font-bold">Déployer un tuteur sur la classe</h2>
        <p className="mt-1 text-xs opacity-70">
          Le tuteur choisi arrive pré-sélectionné chez tous les élèves de la salle, le temps de la session.
        </p>
        <label className="mt-3 flex flex-col gap-1 text-sm">
          Tuteur socratique
          <select value={promptName} onChange={e => setPromptName(e.target.value)} className="rounded bg-tertiary p-2">
            <option value="">(aucun — chat libre)</option>
            {prompts.map(p => (
              <option key={p.name} value={p.name}>{p.name} — {p.description.slice(0, 60)}</option>
            ))}
          </select>
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={webSearch} onChange={e => setWebSearch(e.target.checked)} />
          Autoriser la recherche web pendant la session (coûte des tokens)
        </label>
        <button onClick={deployTutor} disabled={busy || !status.etablissement}
          className="mt-3 rounded border border-[#DC6521]/60 bg-[#DC6521]/10 px-4 py-2 text-sm font-semibold hover:bg-[#DC6521]/20 disabled:opacity-40">
          Appliquer à ma classe
        </button>
      </section>

      </>)}

      {message && <p className="mt-4 rounded bg-green-950/40 p-3 text-sm text-green-200">{message}</p>}
      {error && <p role="alert" className="mt-4 rounded bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}

      <p className="mt-6 border-t border-white/10 pt-3 text-xs opacity-60">
        Responsable de l'établissement ? Horaires d'accès libre, quotas et consommation se règlent sur{" "}
        <Link href="/etablissement" className="underline">votre page dédiée</Link>. Le parcours complet
        est décrit dans le <Link href="/etablissements" className="underline">guide des établissements</Link>.
      </p>
    </div>
  );
}
