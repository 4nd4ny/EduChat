import Head from "next/head";
import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import InterfaceTour from "../chat/InterfaceTour";
import { useT } from "../i18n/useT";
import { authHeaders, getAccount } from "../utils/account";
import { useLargeurPage, useListeSeule } from "../site/ListePaginee";
import SelecteurEcole, { ecolesDemo, useEcoles } from "../site/SelecteurEcole";
import { ZoneAdmin, ZoneEnseignant } from "../administration/commun";
import { ModerationCommentaires, ModerationTuteurs } from "../administration/Moderation";
import { providerDefaults, SCHOOL_PROVIDER_IDS, type ProviderId } from "../shared/providers";
import { MdLockOpen, MdLockOutline, MdSchool, MdWifiTethering } from "react-icons/md";

// L'ESPACE ENSEIGNANT — LA CLASSE.
//
// Ici, un enseignant OUVRE l'accès à la clé API de l'école pour tous les
// élèves connectés depuis l'IP de l'établissement : le déverrouillage vaut
// pour la salle entière, pour la durée choisie, sans qu'aucun élève n'ait de
// compte ni de clé. Il peut aussi refermer avant l'heure et déployer un
// tuteur socratique sur la classe.
//
// Le mot de passe de salle est la preuve enseignante (modèle de confiance de
// la classe) : la page est donc publique, mais toute action en exige un.
//
// DEUX PUBLICS SUR UNE MÊME PAGE (décision A). Le haut — ouvrir la salle,
// déployer un tuteur, choisir les fournisseurs du jour — est ouvert à TOUT
// enseignant. Le bas — valider les tuteurs proposés, modérer les commentaires
// — demande le rang d'administrateur de l'ÉCOLE ACTIVE, et le dit : liseré
// orange et pastille (ZoneAdmin). Sans cette marque, un enseignant ordinaire
// lirait la page comme si tout lui était ouvert et découvrirait la limite en
// heurtant un refus.
//
// L'ancienne URL /session reste servie : elle réexporte cette page (les quatre
// guides et la tuile d'accueil y mènent, ?visite=1 compris).

type Status = {
  ip: string;
  /** LA SALLE, reconnue par l'IP : le lieu d'où part la requête. */
  etablissement: { name: string; hasOwnHours: boolean } | null;
  /**
   * L'ÉCOLE DONT ON S'OCCUPE — l'école active du compte quand il a un titre
   * d'enseignement, la salle sinon. C'est elle que décrivent `settings` et
   * `schoolProviders`, et c'est elle que visera le déploiement.
   */
  ecole: { id: number; name: string } | null;
  /** Est-on physiquement sur le réseau de `ecole` ? */
  surPlace: boolean;
  open: boolean;
  /**
   * Une salle peut-elle être ouverte DEPUIS CETTE ADRESSE ? Le mot de passe ne
   * suffit plus : le verrou porte l'école du réseau appelant, et hors d'un
   * réseau scolaire il n'y a rien à ouvrir. Vrai aussi pour une adresse
   * d'amorçage, qui n'a pourtant pas de nom (`etablissement` reste null).
   */
  salleOuvrable: boolean;
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

export default function EnseignantPage() {
  // Traduction : le hook vient avant les retours anticipés (écran verrouillé,
  // chargement), qui affichent eux aussi du texte.
  const t = useT();
  const ecoles = useEcoles();
  const seule = useListeSeule();
  // Une liste seule prend TOUTE la largeur : voir useLargeurPage.
  const largeur = useLargeurPage("max-w-3xl");
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
  // — on montre l'interface, on n'y touche pas. Les sections d'administration,
  // elles, ne sont pas montées du tout : elles interrogeraient le serveur.
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
        ecole: { id: 1, name: t("session.demo.school") }, surPlace: true, salleOuvrable: true,
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
    // AVEC LE JETON ET L'ÉCOLE ACTIVE. Sans eux, le serveur ne connaît que la
    // salle : l'enseignant qui prépare sa leçon chez lui verrait « aucun
    // établissement reconnu » et perdrait la séance de son école. La route rend
    // les DEUX (la salle et l'école de travail) et l'écran les distingue.
    fetch("/api/session-status", { headers: authHeaders() })
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
    // LES TUTEURS DE L'ÉCOLE, et pas seulement le catalogue public : le jeton
    // porte l'école active, et /api/prompts y ajoute alors les tuteurs réservés
    // de l'établissement (porteeAppelant, src/server/prompts.ts). C'est
    // précisément la liste dans laquelle on choisit ce qu'on déploie ; sans
    // elle, l'enseignant ne trouvait pas le tuteur écrit par son collègue.
    fetch("/api/prompts?sort=uses", { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setPrompts((data.prompts ?? []).map((p: any) => ({ name: p.name, description: p.description }))))
      .catch(() => {});
    // `ecoles.active` est un DÉCLENCHEUR : il ne figure pas dans le corps de
    // l'effet, il voyage dans l'en-tête que pose authHeaders(). Changer d'école
    // dans le sélecteur doit relire l'état ET la liste des tuteurs, sans quoi
    // l'écran garderait la séance de l'autre établissement.
  }, [refresh, router.isReady, demo, ecoles.active]);

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
        // QUATRE REFUS, QUATRE PHRASES. « Hors réseau » n'est pas « mot de
        // passe faux » : le second se corrige en retapant, le premier ne se
        // corrige pas du tout depuis là où l'on est. Et « l'état n'a pas pu
        // s'écrire » n'est ni l'un ni l'autre — le mot de passe était bon, le
        // réseau aussi, c'est le serveur qui a échoué et il faut réessayer. Les
        // confondre enverrait un enseignant vérifier un mot de passe correct
        // pendant que sa classe attend.
        setError(data?.error?.code === "ERR_NO_ETABLISSEMENT"
          ? t("session.error.openNeedsSchoolNetwork")
          : data?.error?.code === "ERR_LOCK_WRITE"
            ? t("session.error.lockWrite")
            : response.status === 429
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
      if (!response.ok || !data.success) {
        // LE CAS QUI COMPTE LE PLUS ICI. Une fermeture qui échoue laisse la
        // salle OUVERTE jusqu'à son échéance : c'est l'unique message de cet
        // écran qu'il ne faut surtout pas confondre avec « mot de passe
        // incorrect », lequel laisse croire que rien n'a bougé alors que tout
        // est resté comme avant — ouvert.
        setError(data?.error?.code === "ERR_NO_ETABLISSEMENT"
          ? t("session.error.openNeedsSchoolNetwork")
          : data?.error?.code === "ERR_LOCK_WRITE"
            ? t("session.error.closeFailed")
            : t("session.error.badPassword"));
        return;
      }
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
      //
      // AVEC LE JETON ET L'ÉCOLE ACTIVE — décision de cette vague, et elle
      // renverse la précédente. La séance visait la salle reconnue par son IP ;
      // elle vise désormais l'ÉCOLE que montre le sélecteur, dès que le compte
      // a un titre d'enseignement pour elle (/api/session-settings, qui garde
      // l'IP comme repli pour le chemin sans compte : le mot de passe de salle).
      //
      // POURQUOI : préparer la classe du lendemain depuis chez soi est l'usage
      // même de cette page. Sans le jeton, l'enseignant chez lui écrivait dans
      // le vide — « aucun établissement reconnu » — alors qu'il voyait juste
      // au-dessous le nom de son école.
      //
      // CE QU'ON ACCEPTE EN ÉCHANGE, dit franchement : l'enseignant ITINÉRANT,
      // venu donner cours dans un autre établissement, déploie sur l'école de
      // son sélecteur et non sur la salle où il se tient. C'est pour cela que
      // l'écran affiche cette école EN TOUTES LETTRES juste au-dessus du bouton
      // et signale, quand il n'est pas sur son réseau, qu'il travaille à
      // distance. Ce qui est visible se corrige ; ce qui est implicite, non.
      const proposeFournisseurs = (status?.schoolProviders?.length ?? 0) > 0;
      const response = await fetch("/api/session-settings", {
        method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() },
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

  // QUI MODÈRE LES TUTEURS DE L'ÉCOLE : tout ENSEIGNANT de l'école active, et
  // pas seulement ses administrateurs — c'est le contrat de
  // requireGestionTuteurs (src/server/admin.ts), qui borne alors la liste aux
  // tuteurs de cette école (un administrateur voit en plus ceux de la
  // plateforme).
  //
  // LA CONDITION RECOPIE CELLE DU SERVEUR, terme pour terme :
  // « estAdminDe OU estEnseignantDe », où estEnseignantDe exige is_teacher ET
  // que cette école soit la PRINCIPALE — c'est-à-dire un rattachement posé par
  // une administration, jamais ramassé au passage d'une adresse IP. La
  // recopier évite d'afficher une section qui reviendrait vide sur un 403,
  // sans rien autoriser au passage : le serveur reste seul juge.
  //
  // Jamais en DÉMONSTRATION : ces sections interrogeraient le serveur au nom
  // d'une page qui annonce des données fictives.
  const ecoleCourante = ecoles.ecoles.find(e => e.id === ecoles.active);
  const peutModerer = !demo && !!ecoleCourante
    && (ecoleCourante.isAdmin || (ecoles.isTeacher && ecoleCourante.principale));
  const administre = !demo && ecoles.administre;

  // RATTACHÉ, MAIS PAS ENCORE RECONNU ENSEIGNANT ICI — le cas qu'il faut DIRE,
  // sous peine de laisser croire à une panne.
  //
  // Vérifier son adresse depuis le réseau d'un collège rattache le compte à ce
  // collège (src/pages/api/verify/confirm.ts) : c'est un lien d'APPARTENANCE,
  // et il ne donne rien de plus, exprès — élèves compris. Le TITRE
  // d'enseignant, lui, se pose par une administration (estEnseignantDe :
  // is_teacher ET école principale). Entre les deux moments, l'enseignant voit
  // son école dans le sélecteur et aucune des sections qui vont avec : sans
  // cette ligne, il conclut que le site est cassé et il a raison de le croire.
  //
  // ET C'EST POURQUOI LA PHRASE EST RÉSERVÉE À QUI S'EST DÉCLARÉ ENSEIGNANT.
  // `ecoles.isTeacher` (users.is_teacher) n'autorise rien — c'est une case
  // cochée sur /verifier —, mais il dit exactement à QUI ce texte s'adresse.
  // Sans lui, tout ÉLÈVE ayant vérifié son adresse sur le wifi du collège
  // lirait « demandez votre rattachement d'enseignant » : on inviterait des
  // centaines de mineurs à écrire à leur direction pour un rôle qui ne les
  // concerne pas, et le lien par IP existe précisément pour ne rien leur
  // donner. Qui n'a pas coché la case ne voit rien, et c'est très bien ainsi.
  const rattacheSansTitre = !demo && ecoles.identifie && ecoles.isTeacher
    && !!ecoleCourante && !peutModerer;

  return (
    <div className={`${largeur} px-4 pb-16 text-primary`}>
      <Head><title>{`${t("session.title")} — EduChat`}</title></Head>

      {demo && (
        <p className="mt-5 rounded-lg border border-[#DC6521]/50 bg-[#DC6521]/10 p-3 text-sm">
          <b>{t("session.demo.badge")}</b> {t("session.demo.text")}
        </p>
      )}
      {tour && <InterfaceTour parcours="enseignant" onClose={() => setTour(false)} />}

      <h1 className="flex items-center gap-2 pt-6 text-2xl font-bold">
        <MdSchool /> {t("session.title")}
      </h1>

      {/* LE SÉLECTEUR D'ÉCOLE ACTIVE, en haut de l'espace enseignant : c'est
          lui qui décide de quelle école parle TOUTE la page — la séance qu'on
          déploie, la modération plus bas, l'espace /etablissement. Depuis cette
          vague, l'école du compte l'emporte sur celle de l'IP : l'enseignant
          retrouve son établissement de chez lui, et ce sélecteur est le seul
          endroit où il voit lequel. Ce qui dépend encore du LIEU, et qui ne
          bougera pas — l'ouverture de la salle, la clé interne qui paie —
          s'affiche à part, dans l'état ci-dessous.
          En démonstration, deux écoles fictives : c'est là qu'on comprend
          qu'un même compte peut enseigner dans plusieurs établissements. */}
      <div className="mt-4">
        <SelecteurEcole etat={demo ? ecolesDemo(t("session.demo.school"), t("ecole.demo.second")) : ecoles} />
      </div>

      {/* Rattaché sans titre : on explique, et on ne montre pas de section vide. */}
      {rattacheSansTitre && (
        <p className="mt-1 rounded-lg border border-white/15 bg-secondary p-3 text-sm opacity-90">
          {t("ecole.pasEncoreEnseignant", { ecole: ecoleCourante!.name })}
        </p>
      )}

      {/* NI CONSOLE, NI PAGE BLANCHE. Depuis que la console est réservée au
          titre, qui ne l'a pas verrait le sélecteur d'école et plus rien —
          c'est-à-dire un écran cassé, et c'est ainsi qu'on remplit une boîte de
          réception de messages inquiets.
          Ce mot-ci ne remplace PAS `ecole.pasEncoreEnseignant` : celui-là
          s'adresse à qui s'est déclaré enseignant et attend son rattachement,
          et il invite à le demander. Celui-ci s'adresse à tous les autres —
          élèves compris — et n'invite à RIEN : dire à des mineurs de réclamer
          un titre d'enseignant à leur direction est exactement ce qu'on veut
          éviter. Il constate, et il rouvre la porte du catalogue. */}
      {!demo && !peutModerer && !rattacheSansTitre && (
        <div className="mt-1 rounded-lg border border-white/15 bg-secondary p-3 text-sm">
          <p className="opacity-90">{t("ens.denied.notTeacher")}</p>
          <Link href="/" className="mt-3 inline-block rounded border border-white/20 px-4 py-2 hover:bg-tertiary">
            {t("admin.denied.backCatalogue")}
          </Link>
        </div>
      )}

      {/* LA CONSOLE DE SÉANCE NE SE LIT PAS PAR-DESSUS L'ÉPAULE DU PROFESSEUR.
          Elle s'affichait à quiconque ouvrait cette adresse depuis le réseau
          d'une école — élèves compris. Rien ne s'y écrivait, /api/session-settings
          refuse un compte sans titre (403), mais on montrait à un élève le
          tuteur déployé, les fournisseurs cochés et l'état de sa salle : une
          réponse à une question qu'il n'avait pas à poser, et le moyen de
          savoir ce que son professeur venait de changer.
          MÊME CONDITION QUE LA MODÉRATION ci-dessous (`peutModerer` : titre posé
          par une administration, jamais ramassé au passage d'une IP), pour que
          les deux moitiés de cet écran s'accordent. Qui n'a pas le titre voit
          désormais le sélecteur d'école et la phrase qui lui explique où il en
          est — et rien d'autre. */}
      {!seule && (peutModerer || demo) && (<>
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
          {/* HORS DES MURS. Deux faits que l'écran doit tenir séparés : l'école
              dont on s'occupe (celle du sélecteur) et la salle d'où l'on écrit.
              Quand elles diffèrent, le dire est la seule façon d'empêcher deux
              contresens symétriques — croire que « fermé » parle de son école
              alors qu'il parle du salon, et croire qu'ouvrir ici ouvrirait
              là-bas. La clé de l'école ne se dépense que sur son réseau : c'est
              une règle du serveur (mayUseServerKeys), pas une limite d'écran. */}
          {status.ecole && !status.surPlace && (
            <li className="flex items-start gap-2">
              <MdSchool className="mt-0.5 shrink-0 text-[#DC6521]" />
              <span>
                {t("session.state.remoteBefore")} <b>{status.ecole.name}</b>{" "}
                {t("session.state.remoteAfter")}
              </span>
            </li>
          )}
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
        {/* JUSQU'OÙ PORTE CE QU'ON S'APPRÊTE À OUVRIR, écrit avant le champ de
            mot de passe et non après le refus. Le verrou ne vaut que pour
            l'école du réseau appelant : le dire ici est ce qui distingue
            « ouvrir sa salle » de « ouvrir le site », et l'enseignant a le droit
            de savoir ce que son geste engage avant de le faire.
            Quand aucune salle n'est ouvrable — on écrit de chez soi, ou d'un
            réseau non déclaré —, on l'annonce et on désactive le bouton :
            laisser tenter, c'est laisser conclure qu'on a mal retenu le mot de
            passe. Le cas de l'amorçage (salle ouvrable, mais aucune école
            nommée en base) a sa propre phrase : promettre un nom qu'on n'a pas
            serait pire que de n'en promettre aucun.
            UNE SEULE CLÉ, COUPÉE SUR SON GABARIT — et non deux moitiés de
            phrase encadrant le nom. Deux moitiés figent l'ordre des mots du
            français : en allemand le nom d'école ne tombe pas au même endroit
            de la phrase, et le traducteur n'aurait eu aucun moyen de le
            déplacer. Le gras survit parce qu'on découpe sur « {name} » plutôt
            que d'interpoler — et le découpage reste en ES5 (pas de flatMap) :
            ce sont des postes de salle de classe qui affichent cette page. */}
        {status.salleOuvrable
          ? (status.etablissement
              ? (() => {
                  // Une seule occurrence attendue ; `?? ""` couvre le jour où
                  // une traduction oublierait le gabarit — la phrase s'affiche
                  // alors sans le nom, plutôt que « undefined ».
                  const morceaux = t("session.open.scope").split("{name}");
                  return <p className="mt-1 text-sm">
                    {morceaux[0]}<b>{status.etablissement.name}</b>{morceaux[1] ?? ""}
                  </p>;
                })()
              : <p className="mt-1 text-sm">{t("session.open.scopeUnnamed")}</p>)
          : <p className="mt-2 rounded border border-[#DC6521]/50 bg-[#DC6521]/10 p-3 text-sm">
              {t("session.open.noScope")}
            </p>}
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
          <button data-tour="session-ouvrir" onClick={openAccess}
            disabled={fige || !password.trim() || !status.salleOuvrable}
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
        {/* LA CIBLE, ÉCRITE EN TOUTES LETTRES au-dessus du bouton. Le
            déploiement ne vise plus la salle mais l'école du sélecteur : dire
            laquelle est ce qui rend le renversement sûr pour l'enseignant
            itinérant, qui verrait sinon sa séance partir dans un autre
            établissement sans qu'aucun mot ne l'en avertisse. */}
        {status.ecole && (
          <p className="mt-1 text-sm">
            {t("session.deploy.cible")} <b>{status.ecole.name}</b>
          </p>
        )}
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
          <fieldset data-tour="session-fournisseurs" className="mt-4">
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

        {/* Le bouton suit l'ÉCOLE DE TRAVAIL, non la salle : sans école active
            ni établissement reconnu, il n'y a rien à viser et le geste n'a pas
            de sens. Avec une école, il en a un, même de chez soi. */}
        <button data-tour="session-deployer" onClick={deployTutor} disabled={fige || !status.ecole}
          className="mt-3 rounded border border-[#DC6521]/60 bg-[#DC6521]/10 px-4 py-2 text-sm font-semibold hover:bg-[#DC6521]/20 disabled:opacity-40">
          {t("session.deploy.cta")}
        </button>
      </section>

      {message && <p className="mt-4 rounded bg-green-950/40 p-3 text-sm text-green-200">{message}</p>}
      {error && <p role="alert" className="mt-4 rounded bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}
      </>)}

      {/* ─── CE QUI RELÈVE DE L'ÉCOLE, ET QUE TOUT ENSEIGNANT PEUT FAIRE ───
          La modération descend ici depuis /admin : valider le tuteur d'un
          collègue et relire un commentaire déposé sur une fiche sont des
          gestes d'enseignement, pas d'exploitation de plateforme.

          `limiterAEcole` DIT AU SERVEUR DE S'EN TENIR À L'ÉCOLE DU SÉLECTEUR,
          et c'est ce qui rend ces deux listes utilisables. Elles étaient déjà
          bornées pour un enseignant et pour un administrateur d'école ; le
          super-administrateur, lui, recevait ici la modération de TOUS les
          établissements du site — la file de son collège noyée dans celle des
          autres, sous le nom d'une seule école affiché juste au-dessus. Le
          filtre part donc AVEC la requête : rien à trier à l'écran, rien
          d'inutile sur le réseau. */}
      {peutModerer && (
        <ZoneEnseignant titre={t("ens.moderation.title")} aide={t("ens.moderation.help")} tour="ens-moderation">
          <ModerationTuteurs ecole={ecoles.active} limiterAEcole />
          <ModerationCommentaires ecole={ecoles.active} limiterAEcole />
        </ZoneEnseignant>
      )}

      {/* ─── CE QUI DEMANDE LE RANG D'ADMINISTRATEUR — AILLEURS, ET DIT ICI ───
          Le porte-monnaie, les comptes, la facture et le partage des tuteurs
          hors des murs vivent sur /etablissement (décision A). Les taire aurait
          laissé un administrateur les chercher sur la page où ils étaient
          hier ; les copier ici aurait fait deux écrans à corriger. On les
          nomme, avec leur porte.
          En démonstration, ce panneau est peint lui aussi : il ne contient
          qu'un lien, il n'interroge rien, et c'est la réponse à la question
          que se pose tout responsable en découvrant cette console — « et
          l'argent, et les comptes, ils sont où ? ». */}
      {(administre || demo) && !seule && (
        <ZoneAdmin titre={t("ens.school.title")} aide={t("ens.school.help")} tour="ens-etablissement">
          <Link href="/etablissement"
            className="mt-3 inline-block rounded bg-[#DC6521] px-4 py-2 text-sm font-bold hover:opacity-90">
            {t("ens.school.cta")}
          </Link>
        </ZoneAdmin>
      )}

      {!seule && (
        /* Chaque fragment autour des deux liens est une phrase complète : la
           traduction reste libre de son ordre de mots. */
        <p className="mt-6 border-t border-white/10 pt-3 text-xs opacity-60">
          {t("session.footer.intro")}{" "}
          <Link href="/etablissement" className="underline">{t("session.footer.page")}</Link>.{" "}
          {t("session.footer.middle")}{" "}
          <Link href="/etablissements" className="underline">{t("session.footer.guide")}</Link>.
        </p>
      )}
    </div>
  );
}
