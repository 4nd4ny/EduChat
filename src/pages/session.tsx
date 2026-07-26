import Head from "next/head";
import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import InterfaceTour from "../chat/InterfaceTour";
import { useT } from "../i18n/useT";
import { getAccount } from "../utils/account";
import { providerDefaults, SCHOOL_PROVIDER_IDS, type ProviderId } from "../shared/providers";
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
  /** Fournisseurs que la clé de l'école peut réellement servir : l'univers des cases. */
  schoolProviders: ProviderId[];
  settings: {
    promptName: string | null; webSearch: boolean;
    /** Fournisseurs cochés, quand une restriction est posée. */
    providers: ProviderId[];
    /** Une restriction EST posée. Liste vide + restriction = plus aucun. */
    providersRestricted: boolean;
    expiresAt: number;
  } | null;
};

type PromptOption = { name: string; description: string };

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });

export default function SessionPage() {
  // Traduction : le hook vient avant les retours anticipés (écran verrouillé,
  // chargement), qui affichent eux aussi du texte.
  const t = useT();
  const [status, setStatus] = useState<Status | null>(null);
  const [prompts, setPrompts] = useState<PromptOption[]>([]);
  const [password, setPassword] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [promptName, setPromptName] = useState("");
  const [webSearch, setWebSearch] = useState(false);
  // Fournisseurs COCHÉS. À l'écran, la liste est TOUJOURS explicite : sans
  // restriction en base, on coche tout plutôt que rien. Une case vide veut donc
  // dire ici ce qu'elle a l'air de dire — « celui-là, non » —, y compris quand
  // elles sont toutes vides : la séance ne laissera alors plus rien passer sur
  // la clé de l'école. C'est la lecture de l'enseignant, et le serveur
  // l'enregistre telle quelle (voir SEANCE_SANS_FOURNISSEUR).
  const [fournisseurs, setFournisseurs] = useState<ProviderId[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // Console d'enseignant : tant que personne n'est identifié, on affiche l'état
  // de la salle et rien d'autre. Le formulaire d'ouverture et le déploiement
  // d'un tuteur ne concernent pas un visiteur de passage.
  // null = on ne sait pas encore (premier rendu, identique côté serveur et
  // côté navigateur) ; sans cet état intermédiaire, la page afficherait un
  // instant « réservée aux enseignants » à un enseignant identifié.
  const [identifie, setIdentifie] = useState<boolean | null>(null);
  useEffect(() => { setIdentifie(!!getAccount()); }, []);

  // DÉMONSTRATION (?visite=1, lancée depuis l'aide) : la console s'ouvre à
  // qui n'y a pas droit, mais avec des données FICTIVES et tous les contrôles
  // inertes. Rien n'est chargé depuis le serveur, rien ne peut être déclenché
  // — on montre l'interface, on n'y touche pas.
  const router = useRouter();
  const demo = router.query.visite === "1";
  const [tour, setTour] = useState(false);
  useEffect(() => { if (demo) setTour(true); }, [demo]);
  const fige = demo || busy;

  const refresh = useCallback(() => {
    if (demo) {
      // Salle fictive : de quoi montrer chaque élément sans rien révéler.
      setStatus({
        ip: "203.0.113.10",
        etablissement: { name: t("session.demo.school"), hasOwnHours: true },
        open: false, lockExpiresAt: null, withinSchedule: true, maxUnlockMinutes: 240,
        // Salle fictive : on montre TOUTE la liste scolaire, sans regarder
        // quelles clés la plateforme détient réellement.
        schoolProviders: [...SCHOOL_PROVIDER_IDS],
        settings: null,
      });
      setFournisseurs([...SCHOOL_PROVIDER_IDS]);
      // Les NOMS des tuteurs fictifs restent tels quels : ce sont aussi les
      // valeurs des <option> et ce qui partirait au serveur. Seules leurs
      // descriptions, purement affichées, sont traduites.
      setPrompts([
        { name: "Socrate", description: t("session.demo.socrateDesc") },
        { name: "Hypatie", description: t("session.demo.hypatieDesc") },
      ]);
      return;
    }
    fetch("/api/session-status")
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: Status) => {
        setStatus(data);
        // Aucune séance en cours, ou séance sans restriction : tout est coché.
        // Les cases partent donc de l'état réel de la classe, jamais d'un
        // réglage par défaut qui ne serait celui de personne. On se fie au
        // DRAPEAU, pas à la longueur de la liste : une séance qui n'autorise
        // plus rien recocherait sinon tout au premier rechargement, et le
        // moindre enregistrement suivant rouvrirait ce que l'enseignant venait
        // de fermer.
        const univers = data.schoolProviders ?? [];
        setFournisseurs(data.settings?.providersRestricted ? (data.settings.providers ?? []) : univers);
        if (data.settings) {
          setPromptName(data.settings.promptName ?? "");
          setWebSearch(data.settings.webSearch);
        }
      })
      .catch(() => setError(t("session.error.statusUnavailable")));
  }, [demo, t]);

  useEffect(() => {
    if (!router.isReady) return;   // ?visite=1 n'est lisible qu'ensuite
    refresh();
    if (demo) return;              // en démonstration, rien ne vient du serveur
    fetch("/api/prompts?sort=uses")
      .then(r => r.json())
      .then(data => setPrompts((data.prompts ?? []).map((p: any) => ({ name: p.name, description: p.description }))))
      .catch(() => {});
  }, [refresh, router.isReady, demo]);

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
          ? t("session.error.tooManyAttempts")
          : t("session.error.badPassword"));
        return;
      }
      setMessage(t("session.msg.opened", { n: minutes }));
      setPassword("");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const closeAccess = async () => {
    if (!password.trim()) { setError(t("session.error.passwordNeededToClose")); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) { setError(t("session.error.badPassword")); return; }
      setMessage(t("session.msg.closed"));
      setPassword("");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const deployTutor = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      // On n'envoie `providers` QUE si les cases ont été proposées : sans
      // aucune clé interne, le bloc n'est pas affiché, et envoyer la liste vide
      // que porte alors l'état ferait enregistrer au serveur une restriction
      // « aucun fournisseur » que personne n'a demandée. Omettre le champ
      // reconduit la séance en cours — c'est le contrat de /api/session-settings.
      const proposeFournisseurs = (status?.schoolProviders?.length ?? 0) > 0;
      const response = await fetch("/api/session-settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptName, webSearch,
          ...(proposeFournisseurs ? { providers: fournisseurs } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error?.code === "ERR_NO_ETABLISSEMENT"
          ? t("session.error.noSchool")
          : data?.error?.code === "ERR_FORBIDDEN"
            ? t("session.error.forbidden")
            : t("session.error.deployFailed"));
        return;
      }
      setMessage(promptName
        ? t("session.msg.deployed", { name: promptName, time: clock(data.expiresAt) })
        : t("session.msg.deployedFree"));
      refresh();
    } finally {
      setBusy(false);
    }
  };

  // Page entièrement VERROUILLÉE tant que l'enseignant n'est pas identifié —
  // comme /duel et /etablissement. Montrer l'état de la salle à un visiteur de
  // passage n'apportait rien et laissait croire à une page à moitié ouverte.
  // Même garde d'accès que les trois autres : icône orange, titre, explication,
  // et les deux boutons.
  if (identifie === false && !demo) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-primary">
        <Head><title>{`${t("session.title")} — EduChat`}</title></Head>
        <MdSchool className="mx-auto mb-4 text-5xl text-[#DC6521]" />
        <h1 className="text-2xl font-bold">{t("session.locked.title")}</h1>
        <p className="mt-3 opacity-80">{t("session.locked.text")}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/verifier" className="rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90">
            {t("compte.anonymousCta")}
          </Link>
          <Link href="/" className="rounded border border-white/20 px-4 py-2 hover:bg-tertiary">
            {t("session.locked.back")}
          </Link>
        </div>
      </div>
    );
  }

  if ((identifie === null && !demo) || !status) {
    return <div className="py-16 text-center text-primary opacity-60">{t("common.loading")}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 text-primary">
      <Head><title>{`${t("session.title")} — EduChat`}</title></Head>

      {demo && (
        <p className="mt-5 rounded-lg border border-[#DC6521]/50 bg-[#DC6521]/10 p-3 text-sm">
          <b>{t("session.demo.badge")}</b> {t("session.demo.text")}
        </p>
      )}
      {tour && <InterfaceTour parcours="session" onClose={() => setTour(false)} />}

      <h1 className="flex items-center gap-2 pt-6 text-2xl font-bold">
        <MdSchool /> {t("session.title")}
      </h1>
      <p className="mt-2 text-sm opacity-80">{t("session.intro")}</p>

      {/* --- État courant --- */}
      <section data-tour="session-etat" className={`mt-5 rounded-lg border p-4 ${status.open
        ? "border-green-500/40 bg-green-500/10" : "border-white/15 bg-secondary"}`}>
        <h2 className="flex items-center gap-2 font-bold">
          {status.open ? <MdLockOpen className="text-green-400" /> : <MdLockOutline />}
          {status.open ? t("session.state.open") : t("session.state.closed")}
        </h2>
        <ul className="mt-2 space-y-1 text-sm opacity-90">
          {/* Le texte est enveloppé : dans un conteneur flex, chaque fragment
              deviendrait sinon un élément à part, et la phrase se disloquerait. */}
          <li className="flex items-start gap-2">
            <MdWifiTethering className="mt-0.5 shrink-0 opacity-60" />
            <span>
              {/* Phrases coupées autour de l'IP : chaque morceau confié au
                  dictionnaire reste une proposition entière, traduisible seule. */}
              {status.etablissement
                ? <>{t("session.state.roomKnown")} <b>{status.etablissement.name}</b> <span className="opacity-60">({status.ip})</span></>
                : <>{t("session.state.noSchoolBefore")} <span className="opacity-60">({status.ip})</span>{" "}
                    {t("session.state.noSchoolAfter")}</>}
            </span>
          </li>
          {status.lockExpiresAt && (
            <li>{t("session.state.unlockedUntil")} <b>{clock(status.lockExpiresAt)}</b>.</li>
          )}
          {!status.lockExpiresAt && status.withinSchedule && (
            <li>{t("session.state.scheduleBefore")} <b>{t("session.state.scheduleHours")}</b> {t("session.state.scheduleAfter")}</li>
          )}
          {!status.lockExpiresAt && !status.withinSchedule && (
            <li className="opacity-70">{t("session.state.outsideSchedule")}</li>
          )}
          {status.settings && (
            <li>
              {t("session.state.tutorDeployed")} <b>{status.settings.promptName ?? t("session.state.freeChat")}</b>
              {" · "}{t(status.settings.webSearch ? "session.state.webOn" : "session.state.webOff")}
              <span className="opacity-60">{" "}{t("session.state.until", { time: clock(status.settings.expiresAt) })}</span>
            </li>
          )}
          {/* Fournisseurs de la séance : ligne à part, car c'est la seule
              restriction que les élèves rencontreront sans explication — mieux
              vaut que l'enseignant la relise noir sur blanc. TROIS états, et
              non deux : aucune restriction (tous), une liste, et la liste vide
              d'une séance restreinte — qui ne laisse plus rien passer sur la
              clé de l'école. Confondre les deux derniers afficherait « tous »
              au moment précis où plus rien n'est autorisé. */}
          {status.settings && (
            <li>
              {t("session.state.providers")}{" "}
              <b>{!status.settings.providersRestricted
                ? t("session.state.providersAll")
                : status.settings.providers?.length
                  ? status.settings.providers.map(id => providerDefaults[id]?.label ?? id).join(", ")
                  : t("session.state.providersNone")}</b>
            </li>
          )}
        </ul>
      </section>

      {/* --- Ouvrir / fermer --- */}
      <section className="mt-5 rounded-lg border border-white/15 bg-secondary p-4">
        <h2 className="font-bold">{t("session.open.title")}</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            {t("session.open.password")}
            <input data-tour="session-motdepasse" disabled={fige} type="password" autoComplete="off" value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") void openAccess(); }}
              className="rounded bg-tertiary p-2" placeholder={t("session.open.passwordPlaceholder")} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("session.open.duration")}
            <select data-tour="session-duree" disabled={fige} value={minutes} onChange={e => setMinutes(Number(e.target.value))}
              className="rounded bg-tertiary p-2">
              {/* La valeur envoyée reste le nombre de minutes ; seul le libellé est traduit. */}
              {DURATIONS.filter(d => d <= status.maxUnlockMinutes).map(d => (
                <option key={d} value={d}>
                  {d < 60 ? t("session.open.minutes", { n: d }) : t("session.open.hours", { n: d / 60 })}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button data-tour="session-ouvrir" onClick={openAccess} disabled={fige || !password.trim()}
            className="rounded bg-[#DC6521] px-4 py-2 font-bold text-[#111827] hover:opacity-90 disabled:opacity-50">
            {t("session.open.cta")}
          </button>
          {status.lockExpiresAt && (
            <button onClick={closeAccess} disabled={fige}
              className="rounded border border-white/20 px-4 py-2 text-sm hover:bg-tertiary disabled:opacity-50">
              {t("session.open.closeNow")}
            </button>
          )}
        </div>
        <p className="mt-2 text-xs opacity-60">{t("session.open.cap", { n: status.maxUnlockMinutes })}</p>
      </section>

      {/* --- Déployer un tuteur --- */}
      <section className="mt-5 rounded-lg border border-white/15 bg-secondary p-4">
        <h2 className="font-bold">{t("session.deploy.title")}</h2>
        <p className="mt-1 text-xs opacity-70">{t("session.deploy.hint")}</p>
        <label className="mt-3 flex flex-col gap-1 text-sm">
          {t("session.deploy.tutor")}
          <select data-tour="session-tuteur" disabled={fige} value={promptName} onChange={e => setPromptName(e.target.value)} className="rounded bg-tertiary p-2">
            <option value="">{t("session.deploy.none")}</option>
            {prompts.map(p => (
              <option key={p.name} value={p.name}>{p.name} — {p.description.slice(0, 60)}</option>
            ))}
          </select>
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input data-tour="session-web" disabled={fige} type="checkbox" checked={webSearch} onChange={e => setWebSearch(e.target.checked)} />
          {t("session.deploy.web")}
        </label>

        {/* FOURNISSEURS DE LA SÉANCE. L'univers des cases vient du serveur
            (schoolProviders) : ce que la clé de l'école peut réellement servir,
            et rien d'autre — proposer une case qui produirait une erreur ne
            rend service à personne. Tout cocher revient à ne rien restreindre.
            Le filtre ne vaut QUE pour la clé de l'école : un élève qui apporte
            sa propre clé ne dépend pas de la séance, et le dire évite à
            l'enseignant de croire à un verrou plus large qu'il n'est.
            TOUT DÉCOCHER est un état légitime, et il ferme : la clé de l'école
            ne sert plus rien pendant la séance. Le texte d'aide le dit, parce
            que c'est la seule case dont l'effet ne se devine pas. */}
        {(status.schoolProviders?.length ?? 0) > 0 && (
          <fieldset className="mt-4">
            <legend className="text-sm">{t("session.deploy.providers")}</legend>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
              {status.schoolProviders.map(id => (
                <label key={id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={fige} checked={fournisseurs.includes(id)}
                    onChange={e => setFournisseurs(prev =>
                      e.target.checked ? [...prev, id] : prev.filter(other => other !== id))} />
                  {providerDefaults[id].label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs opacity-70">{t("session.deploy.providersHint")}</p>
          </fieldset>
        )}

        <button data-tour="session-deployer" onClick={deployTutor} disabled={fige || !status.etablissement}
          className="mt-3 rounded border border-[#DC6521]/60 bg-[#DC6521]/10 px-4 py-2 text-sm font-semibold hover:bg-[#DC6521]/20 disabled:opacity-40">
          {t("session.deploy.cta")}
        </button>
      </section>


      {message && <p className="mt-4 rounded bg-green-950/40 p-3 text-sm text-green-200">{message}</p>}
      {error && <p role="alert" className="mt-4 rounded bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}

      {/* Chaque fragment autour des deux liens est une phrase complète : la
          traduction reste libre de son ordre de mots. */}
      <p className="mt-6 border-t border-white/10 pt-3 text-xs opacity-60">
        {t("session.footer.intro")}{" "}
        <Link href="/etablissement" className="underline">{t("session.footer.page")}</Link>.{" "}
        {t("session.footer.middle")}{" "}
        <Link href="/etablissements" className="underline">{t("session.footer.guide")}</Link>.
      </p>
    </div>
  );
}
