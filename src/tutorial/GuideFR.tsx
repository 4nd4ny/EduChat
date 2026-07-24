import Link from "next/link";
import React from "react";
import { MdSchool, MdTour } from "react-icons/md";
import { GuidedWalk, Mindmap, Profile, Section, WalkStep } from "./shared";

// Guide d'EduChat — VERSION FRANÇAISE (référence). Les trois autres langues
// (GuideEN/IT/DE) suivent exactement la même structure : toute évolution du
// contenu se fait ici d'abord, puis se répercute dans les traductions.

const PROFILES: Profile[] = [
  { color: "#4FC3F7", topic: "Élève · Visiteur", anchor: "#eleves", leaves: [
    ["Choisir un tuteur", "#eleves"], ["Chatter (clé perso)", "#eleves"],
    ["Favoris & notes", "#eleves"], ["Exporter son profil", "#eleves"] ] },
  { color: "#DC6521", topic: "Promptagogue", anchor: "#promptagogues", leaves: [
    ["Vérifier son email", "#promptagogues"], ["Publier un tuteur", "#promptagogues"],
    ["Tester par lien secret", "#validation"], ["Duel & variantes", "#promptagogues"] ] },
  { color: "#81C784", topic: "Enseignant", anchor: "/etablissements", leaves: [
    ["Déverrouiller /school", "/etablissements"], ["Déployer sur la classe", "/etablissements"],
    ["Compte par email", "/etablissements"] ] },
  { color: "#BA68C8", topic: "Établissement", anchor: "/etablissements", leaves: [
    ["Horaires en libre-service", "/etablissements"], ["Quota par élève", "/etablissements"],
    ["Budget mensuel", "/etablissements"], ["Parcours (schémas)", "/etablissements"] ] },
  { color: "#FFD54F", topic: "Administrateur", anchor: "#admin", leaves: [
    ["Valider les tuteurs", "#validation"], ["Gérer les établissements", "/etablissements"],
    ["Facturer (CSV)", "/etablissements"] ] },
];

const WALK: WalkStep[] = [
  {
    title: "Le catalogue, cœur du site",
    text: "L'accueil liste les tuteurs socratiques publiés. Recherchez, triez (recommandés, plus utilisés, mieux notés...), mettez en favori (l'étoile — vos favoris remontent en tête). Chaque tuteur est un prompt système qui transforme l'IA en pédagogue qui questionne au lieu de donner les réponses.",
    href: "/", hrefLabel: "Ouvrir le catalogue",
  },
  {
    title: "La fiche d'un tuteur",
    text: "Cliquez sur un nom pour lire sa fiche : description, statistiques, notes, filiation (« inspiré de »), et le texte INTÉGRAL du prompt — tout est public, l'école est gratuite. C'est ici qu'on note (1 à 5 étoiles), qu'on copie le lien pour recommander, et qu'on propose une variante.",
    href: "/p/Socrate", hrefLabel: "Voir la fiche de Socrate",
  },
  {
    title: "Essayer un tuteur",
    text: "« Essayer » ouvre le chat avec ce tuteur aux commandes (bandeau en haut). Sur le site public, saisissez votre clé API personnelle (champ « Clé personnelle ») : elle reste dans la page, jamais stockée — et elle débloque les pièces jointes (images, PDF) et le chat vocal. Les réponses s'affichent en direct, au fil de la génération.",
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
    title: "Comparer en duel",
    text: "Le mode Duel (réservé aux promptagogues) envoie la même question à deux colonnes : deux tuteurs sur le même modèle, ou le même tuteur sur deux modèles. C'est l'atelier d'affinage : observez ce que change une formulation, ou la robustesse de votre prompt d'un LLM à l'autre.",
    href: "/duel", hrefLabel: "Ouvrir le duel",
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

export default function GuideFR() {
  return (
    <>
      <h1 className="text-3xl font-bold">Guide d'EduChat</h1>
      <p className="mt-2 opacity-80">
        EduChat est un espace pour créer, comparer et déployer des <b>tuteurs socratiques</b> —
        des prompts qui transforment une IA en pédagogue qui questionne au lieu de répondre.
        Cliquez sur la carte pour explorer, ou suivez la visite guidée.
      </p>

      <div className="mt-6">
        <Mindmap profiles={PROFILES}
          caption="Carte interactive — cliquez sur une bulle, glissez pour déplacer, molette pour zoomer."
          ariaLabel="Carte des fonctionnalités par profil" />
      </div>

      {/* Exerciseur : visite interactive de la VRAIE interface du chat. */}
      <Link href="/chat?tuteur=Socrate&visite=1"
        className="mt-6 flex items-center gap-3 rounded-lg border border-[#DC6521]/50 bg-[#DC6521]/10 p-4 hover:bg-[#DC6521]/20">
        <MdTour className="text-2xl text-[#DC6521]" />
        <span className="text-sm">
          <b>Visite interactive de l'interface</b> — l'écran du chat s'ouvre et chaque élément
          (tuteur, fournisseur, clé, micro…) est présenté à tour de rôle, en 40 secondes.
        </span>
      </Link>

      <div id="visite" className="mt-8 scroll-mt-6">
        <GuidedWalk steps={WALK}
          labels={{ title: "Visite guidée", stepAria: "Étape", prev: "Précédent", next: "Suivant" }} />
      </div>

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
          <li><b>Essayer</b> : le chat s'ouvre avec le tuteur aux commandes ; sur le site public, votre <b>clé API personnelle</b> (jamais stockée) fait tourner la conversation, avec le fournisseur et le niveau de raisonnement de votre choix. Les réponses arrivent <b>en direct</b>, au fil de la génération.</li>
          <li><b>Pièces jointes</b> (clé personnelle) : joignez une <b>image ou un PDF</b> à votre question, selon le fournisseur choisi.</li>
          <li><b>Chat vocal</b> (clé personnelle, fournisseurs compatibles) : dictez votre question au micro, et le mode vocal lit les réponses — pratique sur smartphone.</li>
          <li><b>Favoris</b> (étoile) et <b>notes</b> (1-5) : conservés dans votre navigateur, les favoris remontent en tête du catalogue.</li>
          <li><b>Commentaires anonymes</b> sur chaque fiche : déposez un retour d'usage — il paraît après modération par l'auteur du tuteur ou l'administration.</li>
          <li><b>Historique</b> : vos conversations restent dans le navigateur. Renommage, suppression, export de chaque discussion (.md + .json), et <b>export du profil complet</b> (conversations + favoris + notes) réimportable ailleurs par glisser-déposer.</li>
          <li><b>Compteur de tokens</b> : le total consommé s'affiche sous la zone de saisie et dans le titre de l'onglet.</li>
          <li><b>Via une école</b> : sur <Link className="underline" href="/school">/school</Link>, aucun compte ni clé — voir le <Link className="underline" href="/etablissements">guide des établissements</Link>.</li>
          <li><b>Vie privée</b> : détaillée sur <Link className="underline" href="/rgpd">la page Confidentialité</Link> — les élèves n'ont jamais de compte.</li>
        </ul>
      </Section>

      <Section id="promptagogues" title="Promptagogues — créer un tuteur">
        <p>Un <b>promptagogue</b> (prompt + pédagogue) est l'auteur d'un tuteur. Tout le monde peut le devenir :</p>
        <ol className="list-inside list-decimal space-y-2">
          <li><b>Identifiez-vous</b> (facultatif mais recommandé) sur <Link className="underline" href="/verifier">/verifier</Link> : nom public + email, confirmé par un code à six chiffres reçu par email. <b>Aucun mot de passe, jamais.</b> Sans compte, la publication est anonyme — testable et soumissible via l'URL secrète, mais toute la modération (validation, dépublication, archivage) reviendra à l'administration.</li>
          <li><b>Rédigez</b> sur <Link className="underline" href="/publier">/publier</Link> : un <b>nom propre unique</b> (Pythagore, Curie...), une description pour le catalogue, la langue, et le prompt lui-même — le gabarit fourni pose les règles socratiques de base (ne jamais donner la réponse, avancer par questions, encourager). Limites : 256 Ko par prompt, 1 Mo par auteur. Texte uniquement.</li>
          <li><b>Testez</b> : le brouillon « en construction » a une URL secrète — lecture, édition, test dans le chat, et invitation de testeurs par simple partage du lien.</li>
          <li><b>Affinez en duel</b> sur <Link className="underline" href="/duel">/duel</Link> (réservé aux promptagogues) : la même question à deux tuteurs sur le même modèle — ou au même tuteur sur deux modèles — pour mesurer l'effet d'une formulation.</li>
          <li><b>Soumettez</b>, puis laissez la validation faire son œuvre (section suivante).</li>
        </ol>
        <p><b>Ensuite :</b> une modification d'un tuteur publié crée une <b>nouvelle version</b> — les conversations en cours restent sur la leur et proposent la bascule, sans jamais l'imposer. Vous pouvez <b>dépublier vos</b> tuteurs à tout moment depuis votre atelier (le lien secret), et les republier plus tard (rien n'est jamais supprimé : les compteurs restent intacts). Les <b>commentaires anonymes</b> déposés sur vos fiches vous attendent : vous les modérez (approuver ou masquer). « Proposer une variante » sur n'importe quelle fiche pré-remplit le formulaire avec le prompt existant et enregistre la <b>filiation</b> (« inspiré de », affichée sur les deux fiches) : c'est la voie de la personnalisation. L'option <b>synchronisation</b> (cochée sur /verifier) sauvegarde votre profil sur le serveur pour retrouver vos conversations et favoris sur un autre navigateur.</p>
      </Section>

      <Section id="validation" title="Le processus de validation">
        <div className="overflow-x-auto">
          <p className="whitespace-nowrap rounded bg-tertiary p-3 font-mono text-xs">
            en construction (URL secrète) → soumis → <b className="text-green-400">publié</b> ⇄ dépublié — rien n'est jamais supprimé
          </p>
        </div>
        <ul className="list-inside list-disc space-y-1">
          <li><b>En construction</b> : invisible du catalogue, accessible uniquement par son URL secrète (128 bits aléatoires). Modifiable et testable librement.</li>
          <li><b>Soumis</b> : entre dans la file de validation, visible des validateurs seulement.</li>
          <li><b>Validation a priori</b> : un <b>administrateur ou n'importe quel promptagogue vérifié</b> relit le prompt et le publie. Ce choix communautaire protège les élèves (public mineur) tout en évitant le goulot d'un validateur unique — il filtre surtout les propositions anonymes.</li>
          <li><b>Publié</b> : au catalogue, utilisable par tous, compteurs actifs.</li>
          <li><b>Dépublié</b> : retiré du catalogue mais conservé — l'auteur ou l'administration peut le <b>republier</b>, l'administration peut aussi l'<b>éditer, le renommer</b>, ou l'<b>archiver</b> (masqué définitivement de l'interface d'administration, mais conservé en base : rien n'est jamais supprimé, les statistiques de consommation restent exactes).</li>
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
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Conversations, clé API personnelle, favoris, notes données, pièces jointes</td><td className="pr-2"><b>Votre navigateur</b></td><td>Jamais sur le serveur (la clé personnelle ne quitte même pas la mémoire de la page ; les pièces jointes ne sont que relayées au fournisseur, jamais stockées). Export/import libres ; sync serveur uniquement si vous l'activez.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Tuteurs socratiques</td><td className="pr-2">Base de données</td><td>Texte intégral, versions successives, filiation (« inspiré de »), statut, compteurs anonymes (usages, tokens générés, somme et nombre des notes).</td></tr>
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
              <tr className="border-b border-white/5"><td className="py-1 pr-2">/p/[nom]</td><td className="pr-2">Tout le monde</td><td>Fiche publique d'un tuteur (prompt intégral, notes, versions, filiation)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/chat">/chat</Link></td><td className="pr-2">Tout le monde</td><td>Chat en clé personnelle, avec ou sans tuteur — streaming, pièces jointes, vocal</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/duel">/duel</Link></td><td className="pr-2">Promptagogues</td><td>Comparer 2 tuteurs sur 1 modèle, ou 1 tuteur sur 2 modèles</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/publier">/publier</Link></td><td className="pr-2">Promptagogues</td><td>Créer un tuteur (gabarit guidé, variantes avec filiation)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2">/p/essai/[lien]</td><td className="pr-2">Promptagogues + invités</td><td>Atelier d'un brouillon : lire, éditer, tester, soumettre</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/verifier">/verifier</Link></td><td className="pr-2">Auteurs, enseignants, admins</td><td>Identification par code email, sans mot de passe</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/etablissements">/etablissements</Link></td><td className="pr-2">Écoles</td><td>Guide dédié : accès, quotas, facturation, parcours</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/school">/school</Link></td><td className="pr-2">Écoles</td><td>Chat sur clé interne, derrière le déverrouillage enseignant</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/etablissement">/etablissement</Link></td><td className="pr-2">Responsable d'établissement</td><td>Horaires, quotas et consommation en libre-service</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/admin">/admin</Link></td><td className="pr-2">Administration</td><td>Modération, établissements, enseignants, facturation</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/rgpd">/rgpd</Link></td><td className="pr-2">Tout le monde</td><td>Confidentialité (RGPD/nLPD), en 4 langues</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/tutoriel">/tutoriel</Link></td><td className="pr-2">Tout le monde</td><td>Ce guide, en 4 langues</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2">/police</td><td className="pr-2">Enseignants</td><td>Outil indépendant de gestion de classe (hors chat)</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs opacity-60">Le site existe en français, anglais, italien et allemand — le sélecteur de langue est sur la page d'accueil.</p>
      </Section>
    </>
  );
}
