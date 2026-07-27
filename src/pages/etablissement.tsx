import Head from "next/head";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { MdAdd, MdChatBubbleOutline, MdDelete, MdSchool, MdSettings, MdSupportAgent } from "react-icons/md";
import { useRouter } from "next/router";
import InterfaceTour from "../chat/InterfaceTour";
import { useT } from "../i18n/useT";
import { getAccount, authHeaders } from "../utils/account";
import { formatTokens } from "../utils/formatTokens";
import PourquoiEduChat from "../site/PourquoiEduChat";
import SelecteurEcole, { ecolesDemo, useEcoles } from "../site/SelecteurEcole";
import { ZoneAdmin } from "../administration/commun";
import Comptes from "../administration/Comptes";
import Factures from "../administration/Factures";
import PorteMonnaie from "../administration/PorteMonnaie";
import TuteursEcole from "../administration/TuteursEcole";

type HourSlot = { day: number; start: string; end: string };
type Data = {
  etablissement: {
    name: string; ips: string; respire: boolean; hours: HourSlot[];
    quotaPerStudentDaily: number; tokenQuotaMonthly: number;
    /**
     * L'atelier de promptagogue est-il proposé sur l'accueil, depuis le réseau
     * de l'école ? Masqué par défaut dans les murs d'un établissement ; ce
     * réglage le fait reparaître (src/pages/index.tsx pour l'effet).
     */
    atelierPromptagogue: boolean;
  };
  /**
   * LE SIGNATAIRE EST-IL ADMINISTRATEUR DE L'ÉCOLE ACTIVE ?
   *
   * Tranché en base par /api/etablissement (estAdminDe sur le lien), jamais
   * déduit ici. Cet écran s'adresse maintenant à deux publics : tout
   * enseignant rattaché y lit la consommation de son école, seul un
   * administrateur en règle les horaires, les quotas et tout le reste. La
   * réponse sert à MONTRER la limite — le serveur, lui, la fait respecter.
   */
  isAdmin: boolean;
  // `servi` : la clé de l'école peut-elle EMPLOYER ce fournisseur aujourd'hui ?
  // Le serveur n'énumère que ceux qu'elle peut employer (zéro compris) et n'y
  // ajoute que ceux qu'elle a réellement consommés et qui ne le sont plus —
  // marqués, jamais escamotés (src/server/etablissements.ts).
  usage: { monthTokens: number; byProvider: Array<{ provider: string; requests: number; tokens: number; servi: boolean }> };
};

// Ce que voit un visiteur NON RESPONSABLE : le nom de l'école dont son IP
// relève (ou null), et les tuteurs accessibles depuis ce réseau. Servi sans
// jeton par /api/etablissement/accueil — voir l'en-tête de cette route pour
// ce que l'absence de jeton n'ouvre PAS.
// LA LISTE NE CONTIENT PLUS QUE LES TUTEURS DE L'ÉCOLE : la marque « de votre
// école » a donc disparu avec la mixité qu'elle servait à débrouiller. Ceux de
// la plateforme restent sur l'accueil du site, où le visiteur les trouve déjà.
type Tuteur = {
  name: string; title: string; description: string;
  authorName: string; language: string;
};
type Accueil = { ecole: { name: string } | null; tuteurs: Tuteur[] };

// Les jours passent par le dictionnaire : l'index reste la valeur technique
// envoyée au serveur (0 = dimanche), seul le libellé est traduit.
const DAY_KEYS = [
  "etab.day.0", "etab.day.1", "etab.day.2", "etab.day.3",
  "etab.day.4", "etab.day.5", "etab.day.6",
] as const;

// Espace du responsable d'établissement — un enseignant, pas un informaticien.
// Parti pris d'interface : trois réglages seulement, expliqués en langage clair,
// avec un éditeur d'horaires visuel (pas de JSON). Les IP et la facturation
// sont montrées mais NON modifiables ici (ce sont des décisions administratives).
export default function EtablissementPage() {
  const t = useT();
  const account = typeof window !== "undefined" ? getAccount() : null;
  // LES ÉCOLES DU COMPTE, pour le sélecteur d'école active. Il commande tout
  // ce que cette page affiche : l'en-tête qu'il pose (x-educhat-ecole) est
  // relu et REVÉRIFIÉ par chaque garde serveur (src/server/appartenance.ts).
  const ecoles = useEcoles();
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<"loading" | "auth" | "none" | "ready">("loading");
  // L'accueil public, chargé en parallèle de la garde : c'est lui qui décide
  // entre « bienvenue chez vous » et « inscrivez votre établissement ».
  const [accueil, setAccueil] = useState<Accueil | null>(null);
  const [hours, setHours] = useState<HourSlot[]>([]);
  const [perStudent, setPerStudent] = useState("");
  const [monthly, setMonthly] = useState("");
  // L'atelier de promptagogue, proposé ou non sur l'accueil vu depuis le
  // réseau de l'école. Réglage à part entière : il s'enregistre avec les
  // horaires et les quotas, par le même bouton.
  const [atelier, setAtelier] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // --- INSCRIPTION EN LIBRE-SERVICE (écran verrouillé, cas « aucune école ») ---
  // Auparavant cet écran était une impasse : il invitait à nous écrire pour
  // être désigné responsable. Personne ne pouvait démarrer seul, et le service
  // ne pouvait pas se déployer sans nous. Le formulaire vit ICI, sur la même
  // page : une route dédiée n'apporterait qu'un aller-retour de plus entre le
  // refus d'accès et sa réparation.
  const [inscription, setInscription] = useState(false);
  const [nomEcole, setNomEcole] = useState("");
  const [nomAdmin, setNomAdmin] = useState("");
  const [inscriptionBusy, setInscriptionBusy] = useState(false);
  const [inscriptionErreur, setInscriptionErreur] = useState("");
  // Une fois l'inscription faite : l'adresse RÉELLEMENT enregistrée telle que
  // la route la renvoie (chaîne vide = école créée sans reconnaissance).
  const [inscriptionFaite, setInscriptionFaite] = useState<{ ip: string } | null>(null);

  // L'ADRESSE IP N'EST PLUS UN CHAMP, C'EST UNE INFORMATION.
  //
  // Elle se saisissait, et deux choses n'allaient pas. Personne ne sait ce
  // qu'est une adresse IP, et surtout : rien n'empêchait d'y écrire celle du
  // collège voisin, donc de s'attribuer ses élèves. La route prend désormais
  // l'adresse qu'elle VOIT. /api/ip renvoie exactement ce même getClientIp —
  // on l'affiche donc pour que le responsable sache SUR QUOI ses élèves seront
  // reconnus, sans lui demander de la taper.
  //
  // `null` = pas encore répondu ; `ip: ""` = le serveur n'a rien su lire.
  // `revendiquee` vient du SERVEUR (resolveEtablissementByIp), et non d'une
  // déduction d'écran : c'est lui qui décidera, et il doit dire la même chose.
  const [ipVisiteur, setIpVisiteur] = useState<{ ip: string; revendiquee: boolean } | null>(null);
  useEffect(() => {
    if (!inscription) return;
    fetch("/api/ip")
      .then(r => r.json())
      .then((d: { ip?: string; revendiquee?: boolean }) => setIpVisiteur({
        ip: d?.ip && d.ip !== "unknown" ? d.ip : "",
        revendiquee: !!d?.revendiquee,
      }))
      .catch(() => setIpVisiteur({ ip: "", revendiquee: false }));
  }, [inscription]);

  // DÉMONSTRATION (?visite=1) : l'espace s'ouvre avec un établissement
  // FICTIF et tous les réglages inertes. Aucun appel au serveur : on montre
  // l'interface d'un responsable sans emprunter les données d'un vrai.
  const router = useRouter();
  const demo = router.query.visite === "1";
  const [tour, setTour] = useState(false);
  useEffect(() => { if (demo) setTour(true); }, [demo]);
  // QUI RÈGLE, ET QUI SE CONTENTE DE LIRE (décision A). Tout enseignant
  // rattaché voit cet écran ; seul un administrateur de l'école y CHANGE
  // quelque chose. La démonstration, elle, montre l'écran complet — tous ses
  // contrôles sont de toute façon inertes (fige).
  const administre = demo || !!data?.isAdmin;
  const fige = demo || busy || !administre;

  useEffect(() => {
    if (!router.isReady) return;   // ?visite=1 n'est lisible qu'ensuite
    if (demo) {
      setData({
        isAdmin: true,
        etablissement: {
          // Le nom de l'école fictive est traduit à l'affichage (voir le titre) :
          // on ne le fige pas ici, l'état ne doit pas dépendre de la langue.
          name: "", ips: "203.0.113.0/24", respire: true,
          hours: [{ day: 1, start: "08:00", end: "17:00" }, { day: 3, start: "08:00", end: "12:00" }],
          quotaPerStudentDaily: 20000, tokenQuotaMonthly: 3000000,
          // L'école fictive a rouvert son atelier : une case cochée montre le
          // réglage dans son état le moins évident (le défaut, lui, est fermé),
          // et la démonstration est justement là pour faire voir qu'il existe.
          atelierPromptagogue: true,
        },
        usage: { monthTokens: 412350, byProvider: [
          { provider: "mistral", requests: 1240, tokens: 318900, servi: true },
          { provider: "anthropic", requests: 210, tokens: 93450, servi: true },
          // Un fournisseur à zéro fait partie de la démonstration : c'est ce
          // que voit une école qui n'a rien consommé chez celui-là ce mois-ci.
          { provider: "openai", requests: 0, tokens: 0, servi: true },
        ] },
      });
      setHours([{ day: 1, start: "08:00", end: "17:00" }, { day: 3, start: "08:00", end: "12:00" }]);
      setPerStudent("20000"); setMonthly("3000000"); setAtelier(true);
      setState("ready");
      return;
    }
    fetch("/api/etablissement", { headers: authHeaders() })
      .then(r => {
        if (r.status === 401) { setState("auth"); return null; }
        if (r.status === 403) { setState("none"); return null; }
        return r.json();
      })
      .then((d: Data | null) => {
        if (!d) return;
        setData(d);
        setHours(d.etablissement.hours);
        setPerStudent(d.etablissement.quotaPerStudentDaily ? String(d.etablissement.quotaPerStudentDaily) : "");
        setMonthly(d.etablissement.tokenQuotaMonthly ? String(d.etablissement.tokenQuotaMonthly) : "");
        setAtelier(!!d.etablissement.atelierPromptagogue);
        setState("ready");
      })
      .catch(() => setState("auth"));
    // `ecoles.active` n'est pas lu dans le corps de cet effet : il voyage dans
    // l'en-tête que pose authHeaders(). Il figure ici comme DÉCLENCHEUR —
    // changer d'école doit relire les horaires, les quotas et la consommation,
    // faute de quoi l'écran afficherait ceux de l'école précédente pendant que
    // les sections d'administration, elles, auraient déjà suivi.
  }, [demo, router.isReady, ecoles.active]);

  // L'ACCUEIL PUBLIC, chargé SANS ATTENDRE la réponse de la garde : les deux
  // requêtes partent ensemble, sinon un visiteur non identifié verrait
  // « Chargement… » le temps d'un 401 puis le temps d'un catalogue. La
  // démonstration ne le charge pas : elle ne doit toucher à rien de réel.
  useEffect(() => {
    if (!router.isReady || demo) return;
    // Le jeton et l'école active voyagent avec : hors du réseau de son
    // établissement, c'est la seule chose qui permette encore de le reconnaître.
    fetch(`/api/etablissement/accueil?locale=${router.locale ?? "fr"}`, { headers: authHeaders() })
      .then(r => r.json())
      .then((d: Accueil) => setAccueil({ ecole: d?.ecole ?? null, tuteurs: d?.tuteurs ?? [] }))
      // Un accueil qui échoue ne doit pas laisser la page en suspens : on
      // retombe sur « aucune école reconnue », c'est-à-dire l'inscription.
      .catch(() => setAccueil({ ecole: null, tuteurs: [] }));
    // `ecoles.active` déclenche la relecture : changer d'école dans le
    // sélecteur doit changer l'accueil affiché, pas seulement les réglages.
  }, [demo, router.isReady, router.locale, ecoles.active]);

  const addSlot = () => setHours([...hours, { day: 1, start: "08:00", end: "17:00" }]);
  const updateSlot = (i: number, patch: Partial<HourSlot>) =>
    setHours(hours.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const removeSlot = (i: number) => setHours(hours.filter((_, j) => j !== i));

  const save = async () => {
    setBusy(true); setMessage("");
    // Garde-fou côté client, doublé côté serveur : début < fin.
    for (const s of hours) {
      if (s.start >= s.end) { setBusy(false); setMessage(t("etab.hours.invalid", { day: t(DAY_KEYS[s.day]) })); return; }
    }
    const response = await fetch("/api/etablissement", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        hours,
        quotaPerStudentDaily: Number(perStudent) || 0,
        tokenQuotaMonthly: Number(monthly) || 0,
        atelierPromptagogue: atelier,
      }),
    });
    setBusy(false);
    setMessage(response.ok ? t("etab.saved") : t("etab.saveFailed"));
  };

  // Chaque refus du serveur a SA phrase. Un « échec » générique sur un 409
  // « votre compte est déjà rattaché » ferait recommencer indéfiniment
  // quelqu'un qui n'a, en réalité, plus rien à faire ici.
  const messageRefus = (code: string) => {
    switch (code) {
      case "ERR_ALREADY_ATTACHED": return t("etab.signup.err.attached");
      case "ERR_NAME_INVALID": return t("etab.signup.err.name");
      case "ERR_ADMIN_NAME_INVALID": return t("etab.signup.err.adminName");
      case "ERR_RATE_LIMIT": return t("etab.signup.err.rate");
      case "ERR_AUTH_REQUIRED": return t("etab.signup.err.auth");
      default: return t("etab.signup.err.generic");
    }
  };

  const inscrire = async (event: React.FormEvent) => {
    event.preventDefault();
    setInscriptionBusy(true); setInscriptionErreur("");
    const response = await fetch("/api/etablissement/inscription", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      // DEUX CHAMPS, ET RIEN D'AUTRE. Aucun statut — respire, solde et quotas
      // ne sont pas oubliés ici, ils n'appartiennent tout simplement pas à
      // l'inscrit (la route les refuserait : elle ne les lit pas). AUCUNE IP
      // non plus : la route prend celle qu'elle voit, précisément pour qu'on
      // ne puisse pas revendiquer le réseau d'autrui depuis ce formulaire.
      body: JSON.stringify({ name: nomEcole, adminName: nomAdmin }),
    }).catch(() => null);
    setInscriptionBusy(false);
    if (!response?.ok) {
      const data = await response?.json().catch(() => ({}));
      setInscriptionErreur(messageRefus(String(data?.error?.code ?? "")));
      return;
    }
    // On retient l'adresse RÉELLEMENT enregistrée : entre l'affichage du
    // formulaire et son envoi, une autre école a pu revendiquer la nôtre.
    const data = await response.json().catch(() => ({} as { ipRetenue?: string }));
    setInscriptionFaite({ ip: String(data?.ipRetenue ?? "") });
  };

  // On attend AUSSI l'accueil public tant qu'on n'est pas responsable : sans
  // lui, on ignore encore s'il faut souhaiter la bienvenue à une école ou
  // proposer d'en inscrire une. Les deux requêtes partent ensemble (voir plus
  // haut), l'attente n'est donc pas doublée.
  if (state === "loading" || (state !== "ready" && accueil === null)) {
    return <div className="py-16 text-center text-primary opacity-60">{t("common.loading")}</div>;
  }

  if (state === "auth" || state === "none") {
    // L'ÉCOLE RECONNUE PAR L'IP COMMANDE TOUT CET ÉCRAN.
    //
    // Reconnue : /etablissement n'est PAS une porte close, c'est la page
    // d'accueil de cette école — l'élève de la salle 12 y trouve les tuteurs
    // que son établissement lui ouvre, et n'a rien à vérifier ni à signer.
    // Inconnue : le réseau n'appartient à personne, et la seule chose utile à
    // proposer est d'inscrire l'établissement.
    const ecole = accueil!.ecole;

    // Une inscription exige une adresse vérifiée (la route la refuse sans
    // jeton). Le bouton annonce néanmoins CE QUE LE VISITEUR VIENT FAIRE —
    // inscrire son école — et l'identification n'apparaît qu'après le clic,
    // au moment où elle devient une étape et non un préalable décourageant.
    const ouvrirInscription = () => { setInscription(true); setInscriptionErreur(""); };

    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-primary">
        <Head><title>{`${ecole ? ecole.name : t("etab.title")} — EduChat`}</title></Head>

        {ecole ? (
          <>
            {/* --- ACCUEIL DE L'ÉCOLE (visiteur reconnu par le réseau) --- */}
            <header className="text-center">
              <MdSchool className="mx-auto mb-3 text-5xl text-[#DC6521]" />
              <h1 className="text-3xl font-bold">{ecole.name}</h1>
              {/* Le nom de l'école est déjà le titre : la phrase n'a pas à le
                  répéter, elle dit ce que le visiteur peut FAIRE. */}
              <p className="mt-2 opacity-80">{t("etab.public.welcome")}</p>
            </header>

            {/* LES TUTEURS DE L'ÉTABLISSEMENT, ET EUX SEULS. La phrase
                « ceux de votre établissement d'abord, puis ceux de la
                plateforme » a disparu avec la liste mêlée qu'elle décrivait :
                le catalogue commun est sur l'accueil du site, et l'y renvoyer
                une seconde fois noyait le peu que cette page dit en propre. */}
            <section className="mt-8">
              <h2 className="text-lg font-bold">{t("etab.public.tutorsTitle")}</h2>
              {accueil!.tuteurs.length === 0 ? (
                <p className="mt-4 text-sm opacity-60">{t("etab.public.tutorsEmpty")}</p>
              ) : (
                <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {accueil!.tuteurs.map(tuteur => (
                    <li key={tuteur.name}
                      className="flex flex-col gap-2 rounded-lg border border-white/10 bg-secondary p-4">
                      {/* Plus de marque « de votre école » : toutes le sont
                          désormais, et une marque que tout porte ne marque rien. */}
                      <Link href={`/p/${encodeURIComponent(tuteur.name)}`}
                        className="text-lg font-bold hover:underline">{tuteur.title}</Link>
                      <p className="flex-grow text-sm opacity-80">{tuteur.description}</p>
                      <div className="flex flex-wrap items-center gap-x-3 text-xs opacity-60">
                        <span>{t("home.by")} {tuteur.authorName || t("admin.anonymous")}</span>
                        <span className="uppercase">{tuteur.language}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/chat?tuteur=${encodeURIComponent(tuteur.name)}`}
                          className="flex items-center gap-1 rounded bg-[#DC6521] px-3 py-1.5 text-sm font-bold hover:opacity-90">
                          <MdChatBubbleOutline /> {t("home.use")}
                        </Link>
                        <Link href={`/p/${encodeURIComponent(tuteur.name)}`}
                          className="rounded border border-white/20 px-3 py-1.5 text-sm hover:bg-tertiary">
                          {t("home.view")}
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="mt-8"><PourquoiEduChat /></div>

            {/* PLUS DE « VOUS ENSEIGNEZ ICI ? / VÉRIFIER MON EMAIL » (décision
                du client). Le bloc proposait une formalité de compte sur une
                page qui s'adresse d'abord aux élèves de la salle 12, et il
                sous-entendait qu'un email vérifié suffirait à faire de vous un
                enseignant de cette école — or un rattachement se reçoit de
                l'administration, il ne se prend pas. La phrase ci-dessous, elle,
                s'adresse à qui EST identifié et n'a pourtant pas d'école : elle
                lui dit où aller, et c'est un renseignement, pas une invitation. */}
            {state === "none" && (
              <p className="mt-6 text-sm opacity-70">{t("etab.public.notMember")}</p>
            )}
            {!inscription && !inscriptionFaite && (
              // MÊME BOUTON QUE LES ACTIONS PRINCIPALES DU SITE (orange, texte
              // foncé, gras). Ce n'était qu'un lien souligné à demi effacé :
              // c'est pourtant le seul chemin de tout un établissement qui
              // s'inscrit depuis le réseau d'un autre, et personne ne le voyait.
              <div className="mt-6">
                <button onClick={ouvrirInscription}
                  className="flex items-center gap-1 rounded bg-[#DC6521] px-4 py-2 font-bold text-[#111827] hover:opacity-90">
                  <MdSchool /> {t("etab.public.otherSchool")}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {/* --- AUCUN ÉTABLISSEMENT DERRIÈRE CE RÉSEAU --- */}
            <div className="text-center">
              {/* Même engrenage que la tuile « Établissement » de l'accueil :
                  une même porte doit se reconnaître d'une page à l'autre. */}
              <MdSettings className="mx-auto mb-4 text-5xl text-[#DC6521]" />
              <h1 className="text-2xl font-bold">{t("etab.locked.title")}</h1>
              {/* PLUS D'INVITATION À « VÉRIFIER SON EMAIL D'ABORD » : elle
                  faisait passer une formalité pour le sujet de la page. Ce qui
                  est en jeu ici, c'est l'inscription d'un établissement — la
                  vérification n'apparaît qu'une fois le geste engagé. */}
              <p className="mt-3 opacity-80">{t("etab.public.noSchool")}</p>
              {/* Une seule phrase pour les deux visiteurs (identifié ou non) :
                  l'ancienne, « vous n'avez pas encore d'espace responsable »,
                  parlait d'un compte à quelqu'un qui n'en a peut-être pas. */}
              <p className="mt-2 text-sm opacity-70">{t("etab.public.signupInvite")}</p>
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {!inscription && !inscriptionFaite && (
                <button onClick={ouvrirInscription}
                  className="flex items-center gap-1 rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90">
                  <MdSchool /> {t("etab.signup.cta")}
                </button>
              )}
              {/* L'assistance figure AUSSI ici : c'est devant une porte fermée
                  qu'on a le plus besoin de joindre quelqu'un. La cacher derrière
                  la garde reviendrait à ne l'offrir qu'à ceux qui n'en ont pas
                  besoin. */}
              <Link href="/assistance" className="flex items-center gap-1 rounded border border-white/20 px-4 py-2 hover:bg-tertiary">
                <MdSupportAgent /> {t("assistance.button")}
              </Link>
              <Link href="/" className="rounded border border-white/20 px-4 py-2 hover:bg-tertiary">
                {t("etab.locked.back")}
              </Link>
            </div>

            {/* L'ARGUMENT AVANT LE GESTE, PAS PENDANT. Le bloc explique
                pourquoi une école passe par la plateforme : c'est ce qu'on lit
                POUR décider de s'inscrire. Une fois « Inscrire mon école »
                cliqué, la décision est prise et le formulaire est le sujet —
                laisser quatre paragraphes au-dessus des champs, c'est repousser
                la première ligne à remplir sous la ligne de flottaison. Même
                condition que le bouton ci-dessus : ils apparaissent et
                disparaissent ensemble. */}
            {!inscription && !inscriptionFaite && (
              <div className="mt-8"><PourquoiEduChat /></div>
            )}
          </>
        )}

        {/* --- L'identification, découverte APRÈS le geste --- */}
        {state === "auth" && inscription && (
          <div className="mt-8 rounded-lg border border-white/10 bg-secondary p-4 text-sm">
            <p className="opacity-90">{t("etab.signup.needAuth")}</p>
            <Link href="/verifier"
              className="mt-3 inline-block rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90">
              {t("compte.anonymousCta")}
            </Link>
          </div>
        )}

        {/* --- Formulaire d'inscription --- */}
        {state === "none" && inscription && !inscriptionFaite && (
          <form onSubmit={inscrire}
            className="mt-8 flex flex-col gap-4 rounded-lg border border-white/10 bg-secondary p-4 text-left text-sm">
            <h2 className="text-lg font-bold">{t("etab.signup.formTitle")}</h2>

            {/* L'ADRESSE DE RECONNAISSANCE, MONTRÉE ET NON DEMANDÉE.
                C'est le seul endroit du parcours où l'on peut expliquer, à
                l'avance et en une phrase, à quoi tient l'accès des élèves :
                à cette adresse-là. Elle n'est pas modifiable — le serveur
                prend celle qu'il voit, quoi que porte cet écran (voir
                src/pages/api/etablissement/inscription.ts). */}
            <div className="rounded border border-white/15 bg-tertiary p-3">
              <div className="text-xs uppercase opacity-60">{t("etab.signup.ipTitle")}</div>
              <div className="mt-1 break-all font-mono text-base">
                {ipVisiteur === null ? "…" : ipVisiteur.ip || t("etab.signup.ipUnknown")}
              </div>
              <p className="mt-2 text-xs opacity-70">
                {/* Trois situations, trois phrases — et surtout : celle de
                    l'adresse DÉJÀ PRISE se lit AVANT de valider. Découvrir
                    après coup qu'une école a été créée sans reconnaissance
                    serait une mauvaise surprise ; le lire ici est un choix. */}
                {ipVisiteur === null ? t("common.loading")
                  : !ipVisiteur.ip ? t("etab.signup.ipNone")
                    : ipVisiteur.revendiquee ? t("etab.signup.ipTaken")
                      : t("etab.signup.ipMine")}
              </p>
            </div>

            <label className="flex flex-col gap-1">
              {t("etab.signup.name")}
              <input value={nomEcole} onChange={e => setNomEcole(e.target.value)} required maxLength={120}
                placeholder={t("etab.signup.namePlaceholder")} className="rounded bg-tertiary p-2" />
            </label>

            {/* LE NOM DE LA PERSONNE RESPONSABLE. Côté école c'est ainsi qu'on
                le dit ; côté base, c'est ce compte-ci qui devient l'enseignant-
                administrateur. Le serveur ne l'écrit sur le compte que s'il n'y
                a pas déjà un nom : un nom choisi dans /compte n'est pas écrasé
                par un formulaire. */}
            <label className="flex flex-col gap-1">
              {t("etab.signup.adminName")}
              <input value={nomAdmin} onChange={e => setNomAdmin(e.target.value)} required maxLength={120}
                placeholder={t("etab.signup.adminNamePlaceholder")} className="rounded bg-tertiary p-2" />
              <span className="text-xs opacity-60">{t("etab.signup.adminNameHint")}</span>
            </label>

            {/* L'HONNÊTETÉ AVANT LA SIGNATURE, pas après : le porte-monnaie
                démarre à zéro, et aucun élève ne passera par la clé de l'école
                tant qu'il n'est pas rechargé. Le découvrir une fois inscrit
                serait une déception ; le lire ici est une décision informée. */}
            <p className="rounded border border-[#DC6521]/50 bg-[#DC6521]/10 p-3 text-xs">
              <b>{t("etab.signup.warningTitle")}</b> {t("etab.signup.warning")}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={inscriptionBusy}
                className="rounded bg-[#DC6521] px-5 py-2 font-bold hover:opacity-90 disabled:opacity-50">
                {inscriptionBusy ? "…" : t("etab.signup.submit")}
              </button>
              <button type="button" onClick={() => { setInscription(false); setInscriptionErreur(""); }}
                className="text-sm underline opacity-70">
                {t("etab.signup.cancel")}
              </button>
            </div>
            {inscriptionErreur && <p role="alert" className="text-sm text-red-400">{inscriptionErreur}</p>}
          </form>
        )}

        {/* --- Inscription faite --- */}
        {inscriptionFaite && (
          <div className="mt-8 rounded-lg border border-green-500/40 bg-green-500/10 p-4 text-left text-sm">
            <p className="font-bold">{t("etab.signup.doneTitle")}</p>
            <p className="mt-2 opacity-90">{t("etab.signup.done")}</p>
            {/* CE QUI A RÉELLEMENT ÉTÉ ENREGISTRÉ, dit par le serveur et non
                répété depuis le formulaire : entre l'affichage et l'envoi, une
                autre école a pu revendiquer cette adresse. */}
            <p className="mt-2 opacity-90">
              {inscriptionFaite.ip
                ? t("etab.signup.doneIp", { ip: inscriptionFaite.ip })
                : t("etab.signup.doneNoIp")}
            </p>
            {/* Répété APRÈS l'inscription : c'est maintenant que la question
                « et mes élèves, ils font comment ? » se pose vraiment. */}
            <p className="mt-2 opacity-90">{t("etab.signup.doneWallet")}</p>
            {/* Rechargement de la page plutôt que réémission du jeton : les
                rôles ne voyagent JAMAIS dans le jeton (src/server/token.ts),
                ils sont relus en base à chaque requête — celui du navigateur
                ouvre donc déjà la porte qui vient de s'installer. */}
            <button onClick={() => router.reload()}
              className="mt-4 rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90">
              {t("etab.signup.open")}
            </button>
          </div>
        )}
      </div>
    );
  }

  const etab = data!.etablissement;
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-20 text-primary">
      <Head><title>{`${t("etab.title")} — EduChat`}</title></Head>

      {demo && (
        <p className="mb-4 rounded-lg border border-[#DC6521]/50 bg-[#DC6521]/10 p-3 text-sm">
          <b>{t("etab.demo.label")}</b> {t("etab.demo.text")}
        </p>
      )}
      {tour && <InterfaceTour parcours="etablissement" onClose={() => setTour(false)} />}

      {/* LE SÉLECTEUR D'ÉCOLE ACTIVE, tout en haut : un compte peut enseigner
          dans deux collèges, et TOUT ce que cette page montre — horaires,
          consommation, porte-monnaie, comptes, facture — répond d'abord à la
          question « laquelle ? ». La poser une fois, visiblement, vaut mieux
          que de la laisser deviner section par section.
          En démonstration il est peint AUSSI, avec deux écoles fictives : la
          visite guidée ne peut désigner que ce qui existe à l'écran, et c'est
          la première chose qu'un responsable doit comprendre. */}
      <SelecteurEcole etat={demo ? ecolesDemo(t("etab.demo.school"), t("ecole.demo.second")) : ecoles} />

      <h1 data-tour="etab-identite" className="flex items-center gap-2 text-2xl font-bold"><MdSchool /> {demo ? t("etab.demo.school") : etab.name}</h1>
      <p className="mt-1 text-xs opacity-60"><Link href="/etablissements" className="underline">{t("etab.guide.link")}</Link> — {t("etab.guide.hint")}</p>
      <p className="mt-1 text-sm opacity-70">
        {t("etab.intro", { source: etab.ips ? t("etab.intro.ips") : t("etab.intro.network") })}
      </p>
      {/* L'enseignant NON administrateur n'a pas à découvrir la limite en
          heurtant un champ grisé sans explication : on la nomme, une fois, au
          début — et les sections réservées portent plus bas leur propre
          liseré. */}
      {!administre && (
        <p className="mt-3 rounded border border-white/15 bg-secondary p-3 text-sm opacity-80">
          {t("etab.readOnly")}
        </p>
      )}

      {/* --- Horaires d'accès libre --- */}
      <section data-tour="etab-horaires" className="mt-8">
        <h2 className="text-lg font-bold">{t("etab.hours.title")}</h2>
        <p className="mt-1 text-sm opacity-70">{t("etab.hours.help")}</p>
        <div className="mt-3 flex flex-col gap-2">
          {hours.length === 0 && <p className="text-sm opacity-50">{t("etab.hours.empty")}</p>}
          {hours.map((slot, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <select disabled={fige} value={slot.day} onChange={e => updateSlot(i, { day: Number(e.target.value) })}
                className="rounded bg-tertiary p-2">
                {DAY_KEYS.map((cle, di) => <option key={di} value={di}>{t(cle)}</option>)}
              </select>
              <span className="opacity-60">{t("etab.hours.from")}</span>
              <input disabled={fige} type="time" value={slot.start} onChange={e => updateSlot(i, { start: e.target.value })}
                className="rounded bg-tertiary p-2" />
              <span className="opacity-60">{t("etab.hours.to")}</span>
              <input disabled={fige} type="time" value={slot.end} onChange={e => updateSlot(i, { end: e.target.value })}
                className="rounded bg-tertiary p-2" />
              <button disabled={fige} onClick={() => removeSlot(i)} aria-label={t("etab.hours.remove")}
                className="rounded p-2 text-red-400 hover:bg-red-500/10"><MdDelete /></button>
            </div>
          ))}
          <button disabled={fige} onClick={addSlot}
            className="flex w-fit items-center gap-1 rounded border border-white/20 px-3 py-1.5 text-sm hover:bg-tertiary">
            <MdAdd /> {t("etab.hours.add")}
          </button>
        </div>
      </section>

      {/* --- Limites de dépense --- */}
      <section data-tour="etab-quotas" className="mt-8">
        <h2 className="text-lg font-bold">{t("etab.quotas.title")}</h2>
        <p className="mt-1 text-sm opacity-70">{t("etab.quotas.help")}</p>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            {t("etab.quotas.perStudent")}
            <input disabled={fige} value={perStudent} onChange={e => setPerStudent(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric" placeholder={t("etab.quotas.perStudentPlaceholder")} className="rounded bg-tertiary p-2" />
            <span className="text-xs opacity-50">{t("etab.quotas.perStudentHint")}</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("etab.quotas.monthly")}
            <input disabled={fige} value={monthly} onChange={e => setMonthly(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric" placeholder={t("etab.quotas.monthlyPlaceholder")} className="rounded bg-tertiary p-2" />
            <span className="text-xs opacity-50">{t("etab.quotas.monthlyHint")}</span>
          </label>
        </div>
      </section>

      {/* --- Ce que l'accueil propose depuis le réseau de l'école ---
          Dans les murs d'un établissement, l'accueil montre l'espace de
          l'enseignant et masque l'atelier de promptagogue : une salle de classe
          n'est pas un lieu où l'on vient écrire des tuteurs. Certaines écoles
          le veulent pourtant — voici la case qui le rouvre, et elle est FERMÉE
          tant que personne ne l'a cochée.
          NE PROMET RIEN DE PLUS QU'UNE TUILE : /duel et /publier gardent leurs
          propres gardes, cocher ou décocher ici n'ouvre ni ne ferme de porte. */}
      <section data-tour="etab-atelier" className="mt-8">
        <h2 className="text-lg font-bold">{t("etab.workshop.title")}</h2>
        <p className="mt-1 text-sm opacity-70">{t("etab.workshop.help")}</p>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" disabled={fige} checked={atelier}
            onChange={e => setAtelier(e.target.checked)} className="mt-1" />
          <span>{t("etab.workshop.label")}</span>
        </label>
      </section>

      {/* Le bouton d'enregistrement DISPARAÎT pour qui ne règle rien, au lieu
          de rester grisé : un bouton désactivé promet une action qu'aucun
          geste ne débloquera jamais ici. */}
      {administre && (
        <div className="mt-6 flex items-center gap-3">
          <button onClick={save} disabled={fige}
            className="rounded bg-[#DC6521] px-5 py-2 font-bold hover:opacity-90 disabled:opacity-50">
            {busy ? "…" : t("etab.save")}
          </button>
          {message && <span className="text-sm opacity-80">{message}</span>}
        </div>
      )}

      {/* --- Consommation du mois (lecture seule) --- */}
      <section data-tour="etab-conso" className="mt-10">
        <h2 className="text-lg font-bold">{t("etab.usage.title")}</h2>
        <p className="mt-1 text-sm opacity-80">
          {t("etab.usage.totalLabel")} <b>{formatTokens(data!.usage.monthTokens)}</b> {t("etab.usage.totalSuffix")}
        </p>
        {/* CE QUE LA LISTE ÉNUMÈRE, dit avant qu'on la lise : les fournisseurs
            que la clé de l'école peut employer, et eux seuls. Sans cette
            phrase, un zéro se lit « panne » au lieu de « rien consommé », et
            l'absence d'un fournisseur connu se lit « oubli » au lieu de
            « votre école ne peut pas l'utiliser ». */}
        <p className="mt-1 text-xs opacity-60">{t("etab.usage.scope")}</p>
        {data!.usage.byProvider.length > 0 && (
          <table className="mt-2 w-full max-w-md text-left text-sm">
            <thead className="text-xs uppercase opacity-60"><tr><th className="py-1">{t("etab.usage.model")}</th><th className="text-right">{t("etab.usage.tokens")}</th></tr></thead>
            <tbody>
              {data!.usage.byProvider.map(p => (
                <tr key={p.provider} className={`border-b border-white/5 ${p.servi ? "" : "opacity-60"}`}>
                  <td className="py-1">
                    {p.provider}
                    {/* Consommé hier, plus servi aujourd'hui : la ligne reste,
                        parce que ces jetons ont bel et bien été décomptés. */}
                    {!p.servi && (
                      <span className="ml-2 rounded border border-white/20 px-1 text-xs"
                        title={t("etab.usage.notServedTitle")}>{t("etab.usage.notServed")}</span>
                    )}
                  </td>
                  <td className="text-right">{p.tokens.toLocaleString("fr-CH")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ═══ L'ADMINISTRATION DE L'ÉCOLE ═══
          Descendue de /admin (décision A). Ces quatre sections ne relèvent ni
          du site — elles ne parlent que d'une école — ni de la classe : ce
          sont les décisions d'un établissement sur lui-même. Elles ne
          s'affichent qu'aux enseignants-ADMINISTRATEURS de l'école ACTIVE,
          et le disent (liseré orange + pastille de ZoneAdmin).
          En démonstration, trois d'entre elles ne sont pas montées : elles
          interrogeraient le serveur, ce qu'une page qui se dit fictive ne fait
          pas. Le PORTE-MONNAIE, lui, se montre avec des chiffres inventés
          (voir COMPTE_DEMO) : c'est la pièce que personne ne peut voir avant
          d'y avoir droit, et donc la seule qu'il fallait absolument peindre. */}
      {!demo && administre && (
        <>
          <ZoneAdmin titre={t("etab.zone.wallet")} tour="etab-portemonnaie">
            <PorteMonnaie ecole={ecoles.active} variante="ecole" />
          </ZoneAdmin>

          <ZoneAdmin titre={t("etab.zone.invoice")} tour="etab-facture">
            <Factures ecole={ecoles.active} variante="ecole" />
          </ZoneAdmin>

          <ZoneAdmin titre={t("etab.zone.accounts")} aide={t("etab.zone.accountsHelp")} tour="etab-comptes">
            <Comptes ecole={ecoles.active} isSuper={ecoles.isSuper} />
          </ZoneAdmin>

          <ZoneAdmin titre={t("etab.zone.tutors")} aide={t("etab.zone.tutorsHelp")} tour="etab-tuteurs">
            <TuteursEcole ecole={ecoles.active} />
          </ZoneAdmin>
        </>
      )}

      {demo && (
        <ZoneAdmin titre={t("etab.zone.wallet")} tour="etab-portemonnaie">
          <PorteMonnaie ecole={null} variante="ecole" demo />
        </ZoneAdmin>
      )}

      {/* --- Informations gérées par l'administration --- */}
      <section className="mt-10 rounded-lg border border-white/10 bg-secondary p-4 text-sm">
        <h2 className="font-bold">{t("etab.admin.title")}</h2>
        <ul className="mt-2 space-y-1 opacity-80">
          <li>{t("etab.admin.ips")} <span className="font-mono text-xs">{etab.ips || t("etab.admin.noIps")}</span></li>
          <li>{t("etab.admin.status")} {etab.respire ? t("etab.admin.statusRespire") : t("etab.admin.statusBilled")}</li>
        </ul>
        {/* La phrase portait une SECONDE adresse en dur (blanvillain@…), à un
            centimètre du bouton d'assistance qui en annonce une autre : deux
            guichets pour un même besoin, et l'un des deux finit par ne plus
            être relevé. Elle dit maintenant « écrivez-nous » sans nommer de
            boîte — le guichet unique est le bouton juste en dessous, et c'est
            /assistance qui détient l'adresse. */}
        <p className="mt-2 text-xs opacity-60">{t("etab.admin.contact")}</p>
      </section>

      {/* POURQUOI CE SITE EXISTE — ici aussi, et surtout ici : c'est le
          responsable qui devra l'expliquer à sa direction ou à son service
          informatique, et ces quatre phrases sont celles qu'il pourra reprendre
          telles quelles (le mécanisme du virement, et ce que le contrat d'API
          protège exactement).
          MAIS PAS EN DÉMONSTRATION. La visite guidée (?visite=1) commente les
          réglages un à un ; ce pavé de texte n'a aucune ancre `data-tour`, donc
          aucune étape ne s'y arrête — il ne fait qu'allonger la page que le
          voile doit faire défiler. Le lire suppose du reste d'être responsable
          d'une école, ce que le visiteur de la démonstration n'est pas. */}
      {!demo && <section className="mt-10"><PourquoiEduChat /></section>}

      {/* --- Contact / assistance ---
          Placé juste après le bloc « géré par l'administration » : c'est déjà
          l'endroit où la page renvoie vers des humains. Le bouton mène à une
          PAGE (et non à un panneau replié) parce que ce qu'elle contient —
          l'offre de serveur local — se transmet à une direction ou à un
          service informatique : il faut une adresse qu'on puisse coller dans
          un courriel et une page qui s'imprime. */}
      <section className="mt-6 flex flex-wrap items-center gap-3">
        <Link href="/assistance"
          className="flex items-center gap-2 rounded border border-[#DC6521]/60 px-4 py-2 font-bold hover:bg-[#DC6521]/10">
          <MdSupportAgent className="text-[#DC6521]" /> {t("assistance.button")}
        </Link>
        <span className="text-xs opacity-60">{t("assistance.buttonHint")}</span>
      </section>
    </div>
  );
}
