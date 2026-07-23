import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState } from "react";
import { MdArrowBack, MdArrowForward, MdOpenInNew, MdSchool } from "react-icons/md";

// Tutoriel d'EduChat — page volontairement autonome et en FRANÇAIS uniquement
// (la traduction viendra quand la version française sera stabilisée).
// Point d'entrée : une mindmap interactive des fonctionnalités par profil.
// La documentation spécifique aux ÉTABLISSEMENTS vit sur sa propre page
// (/etablissements) : elle n'intéresse pas les autres utilisateurs.

// ---------------------------------------------------------------------------
// Mindmap — disposition « en colonnes » : les nœuds de profil sont près des
// bords, leurs items s'écrivent VERS LE CENTRE, ce qui garantit qu'aucun
// libellé n'est tronqué par les bords du dessin (défaut de la version radiale).
// Un item dont l'ancre commence par « / » ouvre une autre page ; sinon il fait
// défiler vers la section correspondante.
// ---------------------------------------------------------------------------

type Leaf = { label: string; anchor: string };
type Branch = { label: string; color: string; side: "left" | "right"; y: number; anchor: string; leaves: Leaf[] };

const BRANCHES: Branch[] = [
  { label: "Élève · Visiteur", color: "#4FC3F7", side: "left", y: 120, anchor: "#eleves", leaves: [
    { label: "Choisir un tuteur", anchor: "#eleves" },
    { label: "Chatter (clé perso)", anchor: "#eleves" },
    { label: "Favoris & notes", anchor: "#eleves" },
    { label: "Exporter son profil", anchor: "#eleves" },
  ] },
  { label: "Enseignant", color: "#81C784", side: "left", y: 300, anchor: "/etablissements", leaves: [
    { label: "Déverrouiller /school", anchor: "/etablissements" },
    { label: "Déployer sur la classe", anchor: "/etablissements" },
    { label: "Compte par email", anchor: "/etablissements" },
  ] },
  { label: "Établissement", color: "#BA68C8", side: "left", y: 468, anchor: "/etablissements", leaves: [
    { label: "Horaires en libre-service", anchor: "/etablissements" },
    { label: "Quota par élève", anchor: "/etablissements" },
    { label: "Budget mensuel", anchor: "/etablissements" },
    { label: "Parcours (schémas)", anchor: "/etablissements" },
  ] },
  { label: "Promptagogue", color: "#DC6521", side: "right", y: 150, anchor: "#promptagogues", leaves: [
    { label: "Vérifier son email", anchor: "#promptagogues" },
    { label: "Publier un tuteur", anchor: "#promptagogues" },
    { label: "Tester par lien secret", anchor: "#validation" },
    { label: "Versions & variantes", anchor: "#promptagogues" },
  ] },
  { label: "Administrateur", color: "#FFD54F", side: "right", y: 400, anchor: "#admin", leaves: [
    { label: "Valider les tuteurs", anchor: "#validation" },
    { label: "Gérer les établissements", anchor: "/etablissements" },
    { label: "Facturer (CSV)", anchor: "/etablissements" },
  ] },
];

const CX = 520, CY = 285, R = 56;
const LEFT_X = 152, RIGHT_X = 888;   // centres des nœuds
const NODE_HALF = 75;                // demi-largeur du rectangle de nœud
const LEAF_GAP = 25;

function Mindmap() {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);

  const go = (anchor: string) => {
    if (anchor.startsWith("/")) { router.push(anchor); return; }
    const el = document.querySelector(anchor);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const dim = (label: string) => (hovered && hovered !== label ? 0.28 : 1);

  return (
    <svg viewBox="0 60 1040 460" role="img" aria-label="Carte des fonctionnalités par profil"
      className="w-full rounded-lg border border-white/10 bg-secondary">
      {/* Connecteurs centre → nœuds */}
      {BRANCHES.map(b => {
        const nx = b.side === "left" ? LEFT_X + NODE_HALF : RIGHT_X - NODE_HALF;
        return (
          <path key={"c" + b.label}
            d={`M ${CX} ${CY} Q ${(CX + nx) / 2} ${(CY + b.y) / 2} ${nx} ${b.y}`}
            fill="none" stroke={b.color} strokeWidth={hovered === b.label ? 3 : 1.5} opacity={dim(b.label) * 0.8} />
        );
      })}

      {/* Items (vers le centre) */}
      {BRANCHES.map(b => {
        const inner = b.side === "left" ? LEFT_X + NODE_HALF : RIGHT_X - NODE_HALF;
        const textX = b.side === "left" ? LEFT_X + NODE_HALF + 13 : RIGHT_X - NODE_HALF - 13;
        return b.leaves.map((leaf, i) => {
          const ly = b.y + (i - (b.leaves.length - 1) / 2) * LEAF_GAP;
          return (
            <g key={b.label + leaf.label} onClick={() => go(leaf.anchor)} className="cursor-pointer"
              onMouseEnter={() => setHovered(b.label)} onMouseLeave={() => setHovered(null)} opacity={dim(b.label)}>
              <line x1={inner} y1={b.y} x2={b.side === "left" ? textX - 6 : textX + 6} y2={ly}
                stroke={b.color} strokeWidth="1" opacity="0.5" />
              <text x={textX} y={ly + 4} textAnchor={b.side === "left" ? "start" : "end"}
                fontSize="12.5" fill="rgb(222,222,222)"
                style={{ textDecoration: hovered === b.label ? "underline" : "none" }}>
                {leaf.label}
              </text>
            </g>
          );
        });
      })}

      {/* Nœuds de profil */}
      {BRANCHES.map(b => {
        const nx = b.side === "left" ? LEFT_X : RIGHT_X;
        return (
          <g key={"n" + b.label} onClick={() => go(b.anchor)} className="cursor-pointer"
            onMouseEnter={() => setHovered(b.label)} onMouseLeave={() => setHovered(null)}>
            <rect x={nx - NODE_HALF} y={b.y - 17} width={NODE_HALF * 2} height="34" rx="17"
              fill={b.color} opacity={hovered === b.label ? 1 : 0.85} />
            <text x={nx} y={b.y + 5} textAnchor="middle" fontSize="14" fontWeight="bold" fill="#111">{b.label}</text>
          </g>
        );
      })}

      {/* Centre */}
      <g onClick={() => go("#visite")} className="cursor-pointer">
        <circle cx={CX} cy={CY} r={R} fill="#1F2937" stroke="#DC6521" strokeWidth="3" />
        <text x={CX} y={CY - 3} textAnchor="middle" fontSize="19" fontWeight="bold" fill="#fff">EduChat</text>
        <text x={CX} y={CY + 17} textAnchor="middle" fontSize="10.5" fill="#DC6521">visite guidée ↓</text>
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Visite guidée : un pas = une explication + un lien vers la vraie page.
// ---------------------------------------------------------------------------

const TOUR: Array<{ title: string; text: string; href?: string; hrefLabel?: string }> = [
  {
    title: "Le catalogue, cœur du site",
    text: "L'accueil liste les tuteurs socratiques publiés. Recherchez, triez (recommandés, plus utilisés, mieux notés...), mettez en favori (l'étoile — vos favoris remontent en tête). Chaque tuteur est un prompt système qui transforme l'IA en pédagogue qui questionne au lieu de donner les réponses.",
    href: "/", hrefLabel: "Ouvrir le catalogue",
  },
  {
    title: "La fiche d'un tuteur",
    text: "Cliquez sur un nom pour lire sa fiche : description, statistiques, notes, et le texte INTÉGRAL du prompt — tout est public, l'école est gratuite. C'est ici qu'on note (1 à 5 étoiles), qu'on copie le lien pour recommander, et qu'on propose une variante.",
    href: "/p/Socrate", hrefLabel: "Voir la fiche de Socrate",
  },
  {
    title: "Essayer un tuteur",
    text: "« Essayer » ouvre le chat avec ce tuteur aux commandes (bandeau en haut). Sur le site public, saisissez votre clé API personnelle (champ « Clé personnelle ») : elle reste dans la page, jamais stockée. Vos conversations, elles, restent dans votre navigateur — exportables depuis l'historique.",
    href: "/chat?tuteur=Socrate", hrefLabel: "Essayer Socrate",
  },
  {
    title: "Proposer votre propre tuteur",
    text: "Le formulaire « Proposer un tuteur » part d'un gabarit socratique : donnez un nom propre unique, une description, adaptez les règles. Vous pouvez publier sous votre nom (email vérifié en 30 secondes, sans mot de passe) ou anonymement.",
    href: "/publier", hrefLabel: "Ouvrir le formulaire",
  },
  {
    title: "Tester avant de soumettre",
    text: "Votre prompt naît « en construction » : une URL secrète permet de le lire, le modifier et le TESTER dans le chat — partagez ce lien à des collègues pour avis, il n'est pas verrouillé. Quand il est prêt : « Soumettre pour publication ».",
  },
  {
    title: "La validation",
    text: "Un tuteur soumis passe en file d'attente. Un administrateur — ou n'importe quel promptagogue vérifié — le relit et le publie : il apparaît alors au catalogue. Ce filtre a priori protège les élèves ; il est détaillé plus bas.",
  },
  {
    title: "Vous représentez une école ?",
    text: "Les établissements ont leur propre guide : accès sans compte pour les élèves, déploiement d'un tuteur sur la classe, horaires et budgets en libre-service, facturation. Tout y est expliqué avec des schémas de parcours.",
    href: "/etablissements", hrefLabel: "Guide des établissements",
  },
];

function GuidedTour() {
  const [step, setStep] = useState(0);
  const current = TOUR[step];
  return (
    <div className="rounded-lg border border-white/10 bg-secondary p-5">
      <div className="flex items-center justify-between text-xs opacity-60">
        <span>Visite guidée</span>
        <span>{step + 1} / {TOUR.length}</span>
      </div>
      <div className="mt-1 flex gap-1">
        {TOUR.map((_, i) => (
          <button key={i} onClick={() => setStep(i)} aria-label={`Étape ${i + 1}`}
            className={`h-1.5 flex-grow rounded ${i <= step ? "bg-[#DC6521]" : "bg-white/15"}`} />
        ))}
      </div>
      <h3 className="mt-4 text-xl font-bold">{current.title}</h3>
      <p className="mt-2 text-sm leading-relaxed opacity-90">{current.text}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
          className="flex items-center gap-1 rounded border border-white/20 px-3 py-1.5 text-sm hover:bg-tertiary disabled:opacity-30">
          <MdArrowBack /> Précédent
        </button>
        <button onClick={() => setStep(Math.min(TOUR.length - 1, step + 1))} disabled={step === TOUR.length - 1}
          className="flex items-center gap-1 rounded bg-[#DC6521] px-3 py-1.5 text-sm font-bold hover:opacity-90 disabled:opacity-30">
          Suivant <MdArrowForward />
        </button>
        {current.href && (
          <Link href={current.href} target="_blank"
            className="flex items-center gap-1 rounded border border-[#DC6521]/60 px-3 py-1.5 text-sm hover:bg-[#DC6521]/15">
            <MdOpenInNew /> {current.hrefLabel}
          </Link>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La page
// ---------------------------------------------------------------------------

const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="mt-12 scroll-mt-6">
    <h2 className="border-b border-white/10 pb-2 text-2xl font-bold">{title}</h2>
    <div className="mt-4 flex flex-col gap-3 text-sm leading-relaxed opacity-90">{children}</div>
  </section>
);

export default function TutorielPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 text-primary">
      <Head><title>Guide — EduChat</title></Head>
      <nav className="pt-6 pb-4">
        <Link href="/" className="flex w-fit items-center gap-1 text-sm opacity-70 hover:opacity-100">
          <MdArrowBack /> Catalogue
        </Link>
      </nav>

      <h1 className="text-3xl font-bold">Guide d'EduChat</h1>
      <p className="mt-2 opacity-80">
        EduChat est un espace pour créer, comparer et déployer des <b>tuteurs socratiques</b> —
        des prompts qui transforment une IA en pédagogue qui questionne au lieu de répondre.
        Cliquez sur la carte pour explorer, ou suivez la visite guidée.
      </p>

      <div className="mt-6"><Mindmap /></div>

      <div id="visite" className="mt-8 scroll-mt-6"><GuidedTour /></div>

      {/* Renvoi vers le guide dédié aux établissements */}
      <Link href="/etablissements"
        className="mt-8 flex items-center gap-3 rounded-lg border border-[#BA68C8]/40 bg-[#BA68C8]/10 p-4 hover:bg-[#BA68C8]/15">
        <MdSchool className="text-2xl text-[#BA68C8]" />
        <span className="text-sm">
          <b>Vous représentez une école, ou vous êtes enseignant ?</b> Accès des élèves, déploiement d'un
          tuteur sur la classe, horaires et budgets, facturation, schémas de parcours :{" "}
          <span className="underline">consultez le guide des établissements →</span>
        </span>
      </Link>

      {/* ---------------- Index par profil (grand public) ---------------- */}

      <Section id="eleves" title="Élèves et visiteurs — apprendre">
        <ul className="list-inside list-disc space-y-1">
          <li><b>Choisir un tuteur</b> au <Link className="underline" href="/">catalogue</Link> : recherche, tris, fiche détaillée avec le prompt intégral.</li>
          <li><b>Essayer</b> : le chat s'ouvre avec le tuteur aux commandes ; sur le site public, votre <b>clé API personnelle</b> (jamais stockée) fait tourner la conversation, avec le fournisseur et le niveau de raisonnement de votre choix.</li>
          <li><b>Favoris</b> (étoile) et <b>notes</b> (1-5) : conservés dans votre navigateur, les favoris remontent en tête du catalogue.</li>
          <li><b>Historique</b> : vos conversations restent dans le navigateur. Renommage, suppression, export de chaque discussion (.md + .json), et <b>export du profil complet</b> (conversations + favoris + notes) réimportable ailleurs par glisser-déposer.</li>
          <li><b>Compteur de tokens</b> : le total consommé s'affiche sous la zone de saisie et dans le titre de l'onglet.</li>
          <li><b>Via une école</b> : sur <Link className="underline" href="/school">/school</Link>, aucun compte ni clé — voir le <Link className="underline" href="/etablissements">guide des établissements</Link>.</li>
          <li><b>Vie privée</b> : détaillée sur <Link className="underline" href="/rgpd">la page Confidentialité</Link> — les élèves n'ont jamais de compte.</li>
        </ul>
      </Section>

      <Section id="promptagogues" title="Promptagogues — créer un tuteur">
        <p>Un <b>promptagogue</b> (prompt + pédagogue) est l'auteur d'un tuteur. Tout le monde peut le devenir :</p>
        <ol className="list-inside list-decimal space-y-2">
          <li><b>Identifiez-vous</b> (facultatif mais recommandé) sur <Link className="underline" href="/verifier">/verifier</Link> : nom public + email, confirmé par un code à six chiffres reçu par email. <b>Aucun mot de passe, jamais.</b> Sans compte, la publication est anonyme — testable et soumissible via l'URL secrète, mais seule l'administration pourra la supprimer.</li>
          <li><b>Rédigez</b> sur <Link className="underline" href="/publier">/publier</Link> : un <b>nom propre unique</b> (Pythagore, Curie...), une description pour le catalogue, la langue, et le prompt lui-même — le gabarit fourni pose les règles socratiques de base (ne jamais donner la réponse, avancer par questions, encourager). Limites : 256 Ko par prompt, 1 Mo par auteur. Texte uniquement.</li>
          <li><b>Testez</b> : le brouillon « en construction » a une URL secrète — lecture, édition, test dans le chat, et invitation de testeurs par simple partage du lien.</li>
          <li><b>Soumettez</b>, puis laissez la validation faire son œuvre (section suivante).</li>
        </ol>
        <p><b>Ensuite :</b> une modification d'un tuteur publié crée une <b>nouvelle version</b> — les conversations en cours restent sur la leur et proposent la bascule, sans jamais l'imposer. Vous pouvez <b>dépublier ou supprimer vos</b> tuteurs à tout moment. « Proposer une variante » sur n'importe quelle fiche pré-remplit le formulaire avec le prompt existant : c'est la voie de la personnalisation. L'option <b>synchronisation</b> (cochée sur /verifier) sauvegarde votre profil sur le serveur pour retrouver vos conversations et favoris sur un autre navigateur.</p>
      </Section>

      <Section id="validation" title="Le processus de validation">
        <div className="overflow-x-auto">
          <p className="whitespace-nowrap rounded bg-tertiary p-3 font-mono text-xs">
            en construction (URL secrète) → soumis → <b className="text-green-400">publié</b> ⇄ dépublié — et suppression possible
          </p>
        </div>
        <ul className="list-inside list-disc space-y-1">
          <li><b>En construction</b> : invisible du catalogue, accessible uniquement par son URL secrète (128 bits aléatoires). Modifiable et testable librement.</li>
          <li><b>Soumis</b> : entre dans la file de validation, visible des validateurs seulement.</li>
          <li><b>Validation a priori</b> : un <b>administrateur ou n'importe quel promptagogue vérifié</b> relit le prompt et le publie. Ce choix communautaire protège les élèves (public mineur) tout en évitant le goulot d'un validateur unique — il filtre surtout les propositions anonymes.</li>
          <li><b>Publié</b> : au catalogue, utilisable par tous, compteurs actifs.</li>
          <li><b>Dépublié</b> : retiré du catalogue mais conservé (réversible). La <b>suppression</b> définitive appartient à l'auteur (pour ses tuteurs) ou à l'administration ; un prompt anonyme n'est supprimable que par l'administration.</li>
        </ul>
      </Section>

      <Section id="classement" title="Comment les meilleurs tuteurs sont mis en avant">
        <p>Le tri par défaut « <b>Recommandés</b> » calcule, en base de données, un score pour chaque tuteur publié :</p>
        <p className="overflow-x-auto rounded bg-tertiary p-3 font-mono text-xs">
          score = usages + 5 × moyenne des notes + 50 / (1 + âge en jours)
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li><b>usages</b> — chaque conversation démarrée avec le tuteur compte : la popularité réelle pèse.</li>
          <li><b>5 × moyenne des notes</b> — la qualité perçue (étoiles 1-5) pèse jusqu'à 25 points : un tuteur excellent mais récent peut dépasser un tuteur ancien moyennement apprécié.</li>
          <li><b>50 / (1 + âge)</b> — un bonus de fraîcheur, fort les premiers jours puis décroissant : les nouveaux tuteurs ont leur chance d'être vus, ce qui évite que les premiers publiés monopolisent la tête (« effet boule de neige »).</li>
        </ul>
        <p>Les autres tris sont des colonnes directes de la base : <b>plus utilisés</b> (usages), <b>mieux notés</b> (moyenne, départagée par le nombre d'avis), <b>plus récents</b> (date de création), <b>tokens générés</b> (volume produit), <b>nom</b> (alphabétique). Et vos <b>favoris</b> — purement locaux — sont toujours épinglés en tête, dans l'ordre du tri choisi.</p>
      </Section>

      <Section id="donnees" title="Ce qui est mémorisé — et où">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="uppercase opacity-60">
              <tr><th className="py-1 pr-2">Donnée</th><th className="pr-2">Où</th><th>Détail</th></tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Conversations, clé API personnelle, favoris, notes données</td><td className="pr-2"><b>Votre navigateur</b></td><td>Jamais sur le serveur (la clé personnelle ne quitte même pas la mémoire de la page). Export/import libres ; sync serveur uniquement si vous l'activez.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Tuteurs socratiques</td><td className="pr-2">Base de données</td><td>Texte intégral, versions successives, statut, compteurs anonymes (usages, tokens générés, somme et nombre des notes).</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Compte promptagogue / enseignant</td><td className="pr-2">Base de données</td><td>Nom public, email (jamais affiché), rôles, option de synchronisation. <b>Aucun mot de passe n'existe.</b></td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Établissements & consommation</td><td className="pr-2">Base de données</td><td>Détaillé dans le <Link className="underline" href="/etablissements#donnees">guide des établissements</Link> (IP, horaires, quotas, journal de consommation par IP — aucune donnée nominative d'élève).</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Profil synchronisé (option)</td><td className="pr-2">Base de données</td><td>Copie de votre profil de navigateur, supprimable à tout moment depuis /verifier.</td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="pages" title="Toutes les pages du site">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="uppercase opacity-60">
              <tr><th className="py-1 pr-2">Page</th><th className="pr-2">Pour qui</th><th>Rôle</th></tr>
            </thead>
            <tbody>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/">/</Link></td><td className="pr-2">Tout le monde</td><td>Catalogue des tuteurs — l'accueil</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2">/p/[nom]</td><td className="pr-2">Tout le monde</td><td>Fiche publique d'un tuteur (prompt intégral, notes, versions)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/chat">/chat</Link></td><td className="pr-2">Tout le monde</td><td>Chat en clé personnelle, avec ou sans tuteur</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/publier">/publier</Link></td><td className="pr-2">Promptagogues</td><td>Créer un tuteur (gabarit guidé, variantes)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2">/p/essai/[lien]</td><td className="pr-2">Promptagogues + invités</td><td>Atelier d'un brouillon : lire, éditer, tester, soumettre</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/verifier">/verifier</Link></td><td className="pr-2">Auteurs, enseignants, admins</td><td>Identification par code email, sans mot de passe</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/etablissements">/etablissements</Link></td><td className="pr-2">Écoles</td><td>Guide dédié : accès, quotas, facturation, parcours</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/school">/school</Link></td><td className="pr-2">Écoles</td><td>Chat sur clé interne, derrière le déverrouillage enseignant</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/etablissement">/etablissement</Link></td><td className="pr-2">Responsable d'établissement</td><td>Horaires, quotas et consommation en libre-service</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/admin">/admin</Link></td><td className="pr-2">Administration</td><td>Modération, établissements, enseignants, facturation</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/rgpd">/rgpd</Link></td><td className="pr-2">Tout le monde</td><td>Confidentialité (RGPD/nLPD), en 4 langues</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/tutoriel">/tutoriel</Link></td><td className="pr-2">Tout le monde</td><td>Ce guide</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2">/police</td><td className="pr-2">Enseignants</td><td>Outil indépendant de gestion de classe (hors chat)</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs opacity-60">Le site existe aussi en /en, /it et /de pour le parcours élève ; ce guide restera en français jusqu'à stabilisation de la version française.</p>
      </Section>
    </div>
  );
}
