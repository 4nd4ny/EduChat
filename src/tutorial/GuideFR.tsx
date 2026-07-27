import Link from "next/link";
import React from "react";
import { MdAccountCircle, MdAdminPanelSettings, MdChat, MdCoPresent, MdCompareArrows, MdSchool, MdSettings } from "react-icons/md";
import { DemoButtons, GuidedWalk, Mindmap, Profile, Section, WalkStep } from "./shared";

// Guide d'EduChat — VERSION FRANÇAISE (référence). Les trois autres langues
// (GuideEN/IT/DE) suivent exactement la même structure : toute évolution du
// contenu se fait ici d'abord, puis se répercute dans les traductions.

const PROFILES: Profile[] = [
  { color: "#4FC3F7", topic: "Élève · Visiteur", anchor: "#eleves", leaves: [
    ["Choisir un tuteur", "#eleves"], ["Démonstration ou clé perso", "#acces"],
    ["Favoris & notes", "#eleves"], ["Exporter son profil", "#eleves"] ] },
  { color: "#DC6521", topic: "Promptagogue", anchor: "#promptagogues", leaves: [
    ["Vérifier son email", "#promptagogues"], ["Publier un tuteur", "#promptagogues"],
    ["Tester par lien secret", "#validation"], ["Duel & variantes", "#promptagogues"] ] },
  { color: "#81C784", topic: "Enseignant", anchor: "#enseignants", leaves: [
    ["Ouvrir la salle", "#enseignants"], ["Déployer un tuteur", "#enseignants"],
    ["Relire les tuteurs de l'école", "#enseignants"] ] },
  { color: "#BA68C8", topic: "Établissement", anchor: "#etablissement", leaves: [
    ["Inscrire son école", "#etablissement"], ["Porte-monnaie prépayé", "#etablissement"],
    ["Contribution à la recharge", "#etablissement"], ["Ses tuteurs lui appartiennent", "#etablissement"] ] },
  { color: "#FFD54F", topic: "Administrateur", anchor: "#pages", leaves: [
    ["Valider les tuteurs", "#validation"], ["Créer les établissements", "#etablissement"],
    ["Tarifs et factures", "#etablissement"] ] },
];

const WALK: WalkStep[] = [
  {
    title: "Le catalogue, cœur du site",
    text: "L'accueil liste les tuteurs socratiques publiés. Recherchez, triez (recommandés, plus utilisés, mieux notés...), mettez en favori (l'étoile — vos favoris remontent en tête). Chaque tuteur est un prompt système qui transforme l'IA en pédagogue qui questionne au lieu de donner les réponses.",
    href: "/", hrefLabel: "Ouvrir le catalogue",
  },
  {
    title: "La fiche d'un tuteur",
    text: "Cliquez sur un nom pour lire sa fiche : description, statistiques, notes, filiation (« inspiré de »), et le texte INTÉGRAL du prompt — un tuteur ne cache jamais ses règles. C'est ici qu'on note (1 à 5 étoiles), qu'on copie le lien pour recommander, et qu'on propose une variante.",
    href: "/p/Socrate", hrefLabel: "Voir la fiche de Socrate",
  },
  {
    title: "Essayer un tuteur",
    text: "« Essayer » ouvre le chat avec ce tuteur aux commandes (bandeau en haut). Sans compte, c'est la démonstration gratuite qui répond : un petit modèle, choisi par nous et imposé — largement de quoi juger un tuteur. Avec un compte vérifié, votre clé API personnelle (champ « Clé personnelle ») ouvre tous les fournisseurs : elle reste dans la page, n'est mémorisée que si vous le demandez, et débloque les pièces jointes (images, PDF) et le chat vocal. Les réponses s'affichent en direct, au fil de la génération.",
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
    text: "Une école s'inscrit elle-même : un nom, les adresses IP de son réseau, une adresse de facturation. Son porte-monnaie démarre à zéro, et une recharge se convient en nous écrivant : aucun moyen de paiement n'est encore branché sur le site, et rien n'est facturé aujourd'hui. Une fois provisionné, chaque appel y est décompté au prix exact du fournisseur, sans marge — la contribution de l'école, de 3,5 à 10 % qu'elle choisit, est retenue une seule fois, sur la recharge. L'accès se ferme seul quand le crédit est épuisé ; les élèves écrivent aux tuteurs sans compte ni clé. Le guide des établissements montre les parcours ; la section « Établissements » plus bas résume ce que l'école règle elle-même.",
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

      <DemoButtons
        titre="Les visites guidées"
        chapeau="Chaque bouton ouvre la VRAIE page, telle que la voit la personne concernée, et la commente élément par élément. Les interfaces réservées s'affichent déverrouillées mais inertes : rien ne peut y être déclenché."
        boutons={[
          { label: "Apprenant", note: "le chat, de la question à la réponse", href: "/chat?tuteur=Socrate&visite=1", color: "#4FC3F7", icon: <MdChat /> },
          { label: "Enseignant", note: "ouvrir la salle, déployer un tuteur", href: "/enseignant?visite=1", color: "#81C784", icon: <MdCoPresent /> },
          { label: "Établissement", note: "horaires, quotas, porte-monnaie", href: "/etablissement?visite=1", color: "#BA68C8", icon: <MdSettings /> },
          { label: "Promptagogue", note: "comparer deux tuteurs en duel", href: "/duel?visite=1", color: "#DC6521", icon: <MdCompareArrows /> },
          { label: "Mes données", note: "ce que le serveur conserve de vous", href: "/compte?visite=1", color: "#4DB6AC", icon: <MdAccountCircle /> },
          { label: "Administration", note: "valider, facturer, gérer les écoles", href: "/admin-demo?visite=1", color: "#FFD54F", icon: <MdAdminPanelSettings /> },
        ]} />


      <div id="visite" className="mt-8 scroll-mt-6">
        <GuidedWalk steps={WALK}
          labels={{ title: "Visite guidée", stepAria: "Étape", prev: "Précédent", next: "Suivant" }} />
      </div>

      <Link href="/etablissements"
        className="mt-8 flex items-center gap-3 rounded-lg border border-[#BA68C8]/40 bg-[#BA68C8]/10 p-4 hover:bg-[#BA68C8]/15">
        <MdSchool className="text-2xl text-[#BA68C8]" />
        <span className="text-sm">
          <b>Vous représentez une école, ou vous êtes enseignant ?</b> Inscription de l'établissement,
          accès des élèves sans compte, déploiement d'un tuteur sur la classe, horaires, porte-monnaie
          et facturation :{" "}
          <span className="underline">consultez le guide des établissements →</span>
        </span>
      </Link>

      {/* ---------------- Index par profil (grand public) ---------------- */}

      <Section id="tuteurs" title="Gérer les tuteurs : chercher, trier, partager">
        <p dangerouslySetInnerHTML={{ __html: `<b>Chercher</b> : le champ de recherche de l'accueil interroge le nom et la description de tous les tuteurs publiés. Trois lettres suffisent le plus souvent.` }} />
        <p dangerouslySetInnerHTML={{ __html: `<b>Trier</b> : « Recommandés » mêle popularité, notes et fraîcheur, pour qu'un bon tuteur récent ne soit pas écrasé par un ancien. Les autres tris sont bruts — les plus utilisés, les mieux notés, les plus récents, les plus gros consommateurs de jetons, ou l'ordre alphabétique. Vos favoris remontent toujours en tête, et ne regardent que vous : ils vivent dans votre navigateur.` }} />
        <p dangerouslySetInnerHTML={{ __html: `<b>Partager à la communauté</b> : « Proposer un tuteur » part d'un modèle socratique. Le brouillon naît avec une URL secrète — partagez-la à des collègues pour recueillir leurs avis, testez-le dans le chat, puis soumettez-le. Un administrateur ou n'importe quel promptagogue vérifié le publie, et il paraît au catalogue.` }} />
        <p dangerouslySetInnerHTML={{ __html: `<b>Une fois publié</b>, un tuteur n'est jamais supprimé : vous pouvez le dépublier — il quitte le catalogue — puis l'y remettre, les compteurs restant intacts.` }} />
        <p dangerouslySetInnerHTML={{ __html: `<b>À qui appartient un tuteur</b> : un tuteur écrit depuis un compte rattaché à une école appartient à cette école, et reste réservé à ses élèves tant qu'elle ne décide pas de le partager au-dehors. Les tuteurs sans école — dont les tuteurs d'origine — forment le catalogue de la plateforme, visible de tous. La section « Établissements » plus bas détaille ces deux portes.` }} />
        <p dangerouslySetInnerHTML={{ __html: `<b>Proposer une variante</b> depuis n'importe quelle fiche recopie le prompt existant et inscrit la filiation « inspiré de » sur les deux fiches : c'est le chemin normal de la personnalisation.` }} />
      </Section>

      <Section id="eleves" title="Élèves et visiteurs — apprendre">
        <ul className="list-inside list-disc space-y-1">
          <li><b>Choisir un tuteur</b> au <Link className="underline" href="/">catalogue</Link> : recherche, tris, fiche détaillée avec le prompt intégral.</li>
          <li><b>Essayer</b> : le chat s'ouvre avec le tuteur aux commandes. <b>Sans compte</b>, c'est la <b>démonstration gratuite</b> qui répond — un petit modèle, imposé, de quoi juger un tuteur. <b>Avec un compte vérifié</b>, votre <b>clé API personnelle</b> (jamais stockée, sauf si vous demandez à la mémoriser) fait tourner la conversation, chez le fournisseur de votre choix. Les réponses arrivent <b>en direct</b>, au fil de la génération. Les quatre situations sont détaillées <a className="underline" href="#acces">un peu plus bas</a>.</li>
          <li><b>Pièces jointes</b> (compte + clé personnelle) : joignez une <b>image ou un PDF</b> à votre question, selon le fournisseur choisi.</li>
          <li><b>Chat vocal</b> (compte + clé personnelle, fournisseurs compatibles) : dictez votre question au micro, et le mode vocal lit les réponses — pratique sur smartphone.</li>
          <li><b>Favoris</b> (étoile) et <b>notes</b> (1-5) : conservés dans votre navigateur, les favoris remontent en tête du catalogue.</li>
          <li><b>Commentaires anonymes</b> sur chaque fiche : déposez un retour d'usage — il paraît après modération par l'auteur du tuteur ou l'administration.</li>
          <li><b>Historique</b> : vos conversations restent dans le navigateur. Renommage, suppression, export de chaque discussion (.md + .json), et <b>export du profil complet</b> (conversations + favoris + notes) réimportable ailleurs par glisser-déposer.</li>
          <li><b>Compteur de tokens</b> : le total consommé s'affiche sous la zone de saisie et dans le titre de l'onglet.</li>
          <li><b>Via une école</b> : sur <Link className="underline" href="/school">/school</Link>, aucun compte ni clé — c'est la clé de l'établissement qui fait tourner la conversation, dans les horaires et les quotas qu'il a fixés. Depuis le réseau de son école, <Link className="underline" href="/etablissement">/etablissement</Link> affiche directement le nom de l'établissement et les tuteurs qu'il ouvre à ses élèves.</li>
          <li><b>Vie privée</b> : détaillée sur <Link className="underline" href="/rgpd">la page Confidentialité</Link> — les élèves n'ont jamais de compte.</li>
        </ul>
      </Section>

      <Section id="acces" title="Quel fournisseur d'IA, pour qui">
        <p><b>Deux questions, et deux seulement.</b> Ce que la liste des fournisseurs vous propose dépend d'où vous appelez — le réseau d'un établissement, ou n'importe où ailleurs — et de si vous avez un compte. Quatre situations, donc, et pas une de plus.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="uppercase opacity-60">
              <tr><th className="py-1 pr-2">Vous appelez…</th><th className="pr-2">Sans compte</th><th>Avec un compte vérifié</th></tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2"><b>De n'importe où</b> (maison, téléphone, café)</td><td className="pr-2">La démonstration gratuite, et elle seule.</td><td>Tous les fournisseurs, avec votre propre clé.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2"><b>Du réseau d'une école</b></td><td className="pr-2">Les fournisseurs conformes que l'école accepte, sur sa clé.</td><td>Ceux de l'école — sauf si votre clé personnelle est déjà associée à votre compte : alors tous.</td></tr>
            </tbody>
          </table>
        </div>
        <p><b>La démonstration gratuite.</b> Sans compte et hors d'une école, le site répond avec un petit modèle gratuit que nous choisissons : le fournisseur affiché n'est qu'un intermédiaire, le modèle est imposé, la recherche web et les pièces jointes n'y sont pas. C'est de quoi poser trois questions et juger ce qu'est un tuteur socratique. Rien de personnel n'a sa place dans une démonstration publique — <Link className="underline" href="/rgpd">la page Confidentialité</Link> le dit déjà, et cela vaut ici plus qu'ailleurs.</p>
        <p><b>Ce qu'un compte change.</b> Hors d'une école, un compte vérifié ouvre toute la liste, avec votre propre clé : vous êtes identifiable, vous payez vos appels, vous en répondez. Les trois vont ensemble, et c'est pourquoi une clé collée par un visiteur anonyme ne suffit plus : on ne peut rien demander à personne. La vérification prend trente secondes sur <Link className="underline" href="/verifier">/verifier</Link> — un nom, une adresse, un code à six chiffres, et <b>jamais de mot de passe</b>.</p>
        <p><b>Sur le réseau d'une école.</b> Là, l'établissement répond de ses élèves, et sa règle s'applique à tout le monde, compte ou pas : seuls les fournisseurs conformes sont proposés, et la clé de l'école ne paie jamais les autres. Une exception, une seule : un compte dont la clé personnelle a été <b>associée avant de venir</b> retrouve toute la liste — ce qu'un adulte paie lui-même ne regarde pas l'école. Une clé simplement tapée dans le champ, sur place, ne lève rien : sans cela, une clé trouvée sur un forum rouvrirait en classe ce que l'établissement a écarté.</p>
        <p><b>Ce qui a disparu, et pourquoi.</b> Il fallait naguère faire « certifier sa majorité » pour atteindre les fournisseurs écartés. Or un élève qui basculait son téléphone en 4G quittait le réseau de l'école et obtenait tout : la restriction se contournait d'un geste, et une restriction qu'un geste contourne n'est pas une protection, c'est un décor — un décor qui coûtait en complexité ce qu'il ne rapportait pas en sécurité. La certification a donc été retirée du site : la case, le champ et les mentions qui en parlaient. Ce qui protège vraiment, c'est le réseau de l'école, où un mineur est sous la responsabilité de l'institution ; c'est l'engagement qu'EduChat tient devant une direction, et il n'a pas bougé.</p>
      </Section>

      <Section id="enseignants" title="Enseignants — la classe">
        <p>L'espace enseignant, sur <Link className="underline" href="/enseignant">/enseignant</Link>, demande un compte vérifié et ne parle que de la salle où vous vous trouvez. L'ancienne adresse /session y mène toujours.</p>
        <ul className="list-inside list-disc space-y-1">
          <li><b>Ouvrir la salle</b> : le mot de passe de salle déverrouille la clé de l'école pour toutes les personnes connectées depuis le réseau de l'établissement, pour la durée que vous choisissez. Aucun élève n'a de compte ni de clé à saisir. Vous pouvez refermer avant l'heure.</li>
          <li><b>Déployer un tuteur</b> : le tuteur choisi arrive pré-sélectionné chez chaque élève de la salle, avec ou sans recherche web. Vous pouvez aussi restreindre les fournisseurs de la séance ; tout décocher est un choix valable, et il ferme — la clé de l'école ne sert alors plus rien. Le filtre ne vaut que pour cette clé : un élève qui apporte la sienne n'en dépend pas. Il reste en revanche dans le périmètre de l'école : sur ce réseau, sa clé ne lui ouvre que les fournisseurs conformes, à moins qu'elle ne soit déjà associée à son compte.</li>
          <li><b>La séance vise la salle, pas votre compte</b> : elle est reconnue par l'adresse IP du réseau. Un enseignant venu donner cours dans un autre établissement y ouvre la salle de cet établissement-là, et non la sienne.</li>
          <li><b>Relire les tuteurs de l'école</b> : les tuteurs proposés par des collègues et les commentaires déposés sur ces fiches se modèrent ici. C'est ouvert aux administrateurs de l'école et à tout enseignant dont c'est l'école principale — celle qu'une administration lui a attribuée. Le rang d'administrateur n'est pas nécessaire : valider le tuteur d'un collègue est un geste d'enseignement.</li>
          <li><b>Plusieurs écoles</b> : un compte peut enseigner dans plusieurs établissements. Un sélecteur, en haut de la page, dit de laquelle on parle — la modération et l'espace établissement le suivent.</li>
        </ul>
      </Section>

      <Section id="etablissement" title="Établissements — l'école chez elle">
        <p><b>Pourquoi ce site existe.</b> Une école ne peut pas ouvrir un contrat d'API chez un fournisseur d'IA : il y faut une carte d'entreprise, un paiement à l'usage et une facture en dollars. Elle sait en revanche régler une facture par virement. L'obstacle est dans le moyen de paiement, pas dans le budget : EduChat signe ce contrat à sa place et se tient entre l'école et les fournisseurs.</p>
        <p><b>S'inscrire seule.</b> Depuis <Link className="underline" href="/etablissement">/etablissement</Link>, avec une adresse email vérifiée : un nom, les adresses IP du réseau de l'école, une adresse de facturation. Personne n'a besoin de nous écrire pour commencer. Le porte-monnaie démarre à zéro, et le formulaire le dit avant la signature : rien ne passe par la clé de l'école tant qu'il n'est pas provisionné.</p>
        <p><b>L'accueil de l'école.</b> /etablissement n'est plus une porte close. Qui arrive depuis le réseau de son établissement y voit le nom de son école et les tuteurs qu'elle lui ouvre, sans compte ni mot de passe. Depuis un réseau que personne n'a déclaré, la page propose d'inscrire un établissement.</p>
        <p><b>Le porte-monnaie prépayé.</b> L'école provisionne une somme ; chaque appel passé sur la clé de la plateforme y est décompté <b>au prix exact publié par le fournisseur</b> — Anthropic, OpenAI, Mistral — sans un centime de marge. C'est le point important, et il est vérifiable : ouvrez leur tarif, refaites le calcul, vous retrouvez notre chiffre. Un service qui se tient entre une école et des fournisseurs n'a rien de mieux à offrir qu'un relevé que l'école peut recalculer elle-même ; une marge fondue dans le prix du jeton, à l'inverse, se vérifie mal et se soupçonne bien. L'accès se ferme seul quand le crédit est épuisé, et le contrôle a lieu avant l'appel : une réponse déjà commencée se paie, le dépassement est donc borné par une réponse. L'écran montre le solde, la dépense des trente derniers jours, l'autonomie estimée en jours, la recharge suggérée, et l'historique daté des mouvements — recharge, consommation, ajustement. <b>Aujourd'hui, rien n'est encore facturé</b> : aucun moyen de paiement n'est branché sur le site, et une recharge se convient en nous écrivant. En attendant, chacun peut apporter sa propre clé d'IA.</p>
        <p><b>La contribution aux frais : à la recharge, et une seule fois.</b> Elle ne s'ajoute plus à chaque jeton — elle est retenue sur le versement, au taux que l'école a choisi entre 3,5 et 10 % avec un curseur, et jamais moins de 0.50 par recharge, parce que les frais d'encaissement ont une part fixe qu'un petit versement ne couvrirait pas. Recharger 100 laisse donc 90 d'utilisables à 10 %, 96.50 à 3,5 %. Le registre inscrit les deux mouvements séparément, le versement puis la retenue : un solde net dont on ne voit pas la ligne de commission est un chiffre qu'on ne peut pas recalculer, et c'est précisément ce qu'on veut éviter. Le plancher ne couvre que les frais de paiement : à ce niveau, la plateforme paie le serveur de sa poche. Tant qu'une école n'a rien choisi, le réglage du site s'applique.</p>
        <p><b>Ce que nous n'avons pas repris, et l'effet de bord.</b> La règle vient d'OpenRouter, qui ne prend aucune marge sur l'inférence et se rémunère à l'achat de crédit. Deux de leurs usages sont restés dehors : <b>aucune commission sur les clés personnelles</b> — la mesurer supposerait de journaliser l'usage d'une clé privée, et <Link className="underline" href="/rgpd">la page Confidentialité</Link> promet noir sur blanc le contraire ; et <b>aucune expiration des crédits</b> — sur un budget scolaire voté puis dépensé lentement, ce serait une confiscation. Reste un effet de bord, qu'il vaut mieux lire ici que découvrir : une école qui recharge et ne consomme pas a payé la contribution pour rien. Le remboursement du solde est prévu — il passera par le moyen de paiement, qui n'est pas encore ouvert — et il rend le crédit restant, moins les frais que le prestataire de paiement ne rend pas ; il ne rend pas la contribution déjà retenue.</p>
        <p><b>Les tuteurs de l'école lui appartiennent.</b> Un tuteur écrit depuis un compte rattaché à l'établissement lui est rattaché, et n'est pas public par défaut : écrire un tuteur pour ses élèves ne revient pas à le publier pour le monde entier. C'est l'école qui l'ouvre au-dehors, tuteur par tuteur. Dans l'autre sens, elle décide si ses élèves voient aussi les tuteurs publics des autres écoles — fermé tant qu'elle ne l'a pas ouvert. Le catalogue de la plateforme, lui, reste visible dans tous les cas.</p>
        <p><b>Ce que l'école règle, et qui le règle.</b> Horaires d'accès libre, quota quotidien par élève, plafond mensuel en jetons, et la consommation du mois par fournisseur. Tout enseignant rattaché lit cet écran ; seul un administrateur de l'école y change quelque chose, et la page le dit au lieu de le laisser découvrir. Les adresses IP et le statut de facturation restent la main du site.</p>
        <p><b>Les comptes et la facture.</b> Un collègue rejoint l'école en vérifiant son adresse email depuis le réseau de l'établissement : personne n'a à l'inscrire à la main, et il arrive sans droit d'administration. Un administrateur de l'école le reconnaît ensuite enseignant et en nomme d'autres administrateurs de la même école. Rattacher un compte à une école, ou l'en déplacer, reste la main du site. Il complète aussi les mentions administratives de la facture — adresse exacte, référence ou numéro de commande interne, note libre. Aucune de ces mentions n'entre dans le calcul : le montant reste celui du porte-monnaie. La facture d'un mois s'ouvre en page imprimable, sur <Link className="underline" href="/facture">/facture</Link>.</p>
        <p><b>Les fournisseurs écartés.</b> Au titre du règlement européen sur l'IA, Grok, Gemini et les fournisseurs chinois ne sont proposés à personne sur le réseau d'un établissement, et la clé de l'école ne les paie jamais — pas davantage pour un enseignant que pour un élève. OpenRouter, lui, porte un drapeau d'avertissement plutôt qu'une exclusion : il n'est qu'un intermédiaire vers des modèles conformes, et c'est aussi le moteur de la démonstration gratuite ; une école, en revanche, ne le paie jamais. Ce qu'un adulte choisit pour lui-même, avec son compte et sa clé, ne passe pas par le porte-monnaie de l'établissement et ne l'engage pas — la section <a className="underline" href="#acces">« Quel fournisseur d'IA, pour qui »</a> donne la règle entière.</p>
        <p><b>Sur les données, nous restons exacts.</b> Le contrat d'API payant garantit que les échanges ne servent pas à entraîner les modèles, mais ils demeurent une trentaine de jours chez le fournisseur, pour la lutte contre les abus. Écrire « aucune donnée conservée » serait faux — et une promesse fausse est exactement ce qui met une école en défaut le jour d'un contrôle. <Link className="underline" href="/rgpd">La page Confidentialité</Link> le détaille, <Link className="underline" href="/etablissements">le guide des établissements</Link> montre les parcours, et <Link className="underline" href="/assistance">la page Assistance</Link> — lisible sans compte — donne l'adresse d'un humain, ainsi que ce que serait un serveur installé dans l'école.</p>
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
          <li><b>Dépublié</b> : retiré du catalogue mais conservé — l'auteur ou l'administration peut le <b>republier</b>, et l'administration l'<b>archiver</b> — pour le retoucher, il faut d'abord le republier (masqué définitivement de l'interface d'administration, mais conservé en base : rien n'est jamais supprimé, les statistiques de consommation restent exactes).</li>
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
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Conversations, clé API personnelle, favoris, notes données, pièces jointes</td><td className="pr-2"><b>Votre navigateur</b></td><td>Jamais sur le serveur (les pièces jointes ne sont que relayées au fournisseur). La clé personnelle est conservée dans CE navigateur pour ne pas la retaper — voyez <Link className="underline" href="/rgpd">la page Confidentialité</Link>. Deux exceptions : la sauvegarde du profil pour les comptes, et la clé mémorisée sur le serveur, sur demande.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Tuteurs socratiques</td><td className="pr-2">Base de données</td><td>Texte intégral, versions successives, filiation (« inspiré de »), statut, école propriétaire s'il y en a une et le fait qu'elle l'ait ou non partagé au-dehors, traductions automatiques dans les trois autres langues avec la version dont elles sont issues, compteurs anonymes (usages, tokens générés, somme et nombre des notes).</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Compte promptagogue / enseignant</td><td className="pr-2">Base de données</td><td>Nom public, email (jamais affiché), rôles, option de synchronisation, et les <b>écoles auxquelles le compte appartient</b> — plusieurs sont possibles, avec le droit d'administration lien par lien et une école principale. Vérifier son adresse depuis le réseau d'une école y rattache le compte, <b>sans aucun droit d'administration</b>. La consommation faite sur la clé d'une école retient l'email de l'enseignant qui a ouvert la salle. <b>Aucun mot de passe n'existe.</b></td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Établissements & consommation</td><td className="pr-2">Base de données</td><td>Nom, adresses IP du réseau, horaires d'accès libre, quotas, taux de contribution choisi par l'école, adresse de facturation, ouverture ou non du catalogue des autres écoles, et le journal de consommation par IP d'établissement — aucune donnée nominative d'élève. Détaillé dans le <Link className="underline" href="/etablissements#donnees">guide des établissements</Link>.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Porte-monnaie et factures</td><td className="pr-2">Base de données</td><td>Le solde de chaque école, et le registre daté de tous ses mouvements : recharge, consommation ou ajustement, montant signé, solde après coup, et qui l'a passé. La contribution prélevée sur une recharge y figure comme une ligne à part, nommée et datée, pour que le compte se refasse à la main. Une facture émise fige son montant, pour qu'un changement de tarif ne réécrive pas le passé ; les mentions administratives que l'école y ajoute vivent à part, afin qu'une réémission ne les efface jamais.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Profil synchronisé (option)</td><td className="pr-2">Base de données</td><td>Copie de votre profil de navigateur, supprimable à tout moment depuis /verifier.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Clé API mémorisée (sur demande, comptes)</td><td className="pr-2">Base de données</td><td>Uniquement si vous cochez « Mémoriser ma clé » dans le chat : votre clé y est conservée <b>chiffrée</b> (AES-256-GCM), ne redescend jamais vers le navigateur, et disparaît dès que vous décochez.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Compteur « en ligne » de l'accueil</td><td className="pr-2">Base de données</td><td>Une empreinte technique non réversible du navigateur (jamais l'IP en clair) et l'heure de la dernière activité, effacées après quinze minutes.</td></tr>
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
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/chat">/chat</Link></td><td className="pr-2">Tout le monde</td><td>Le chat, avec ou sans tuteur : démonstration gratuite sans compte, clé personnelle avec un compte — streaming, pièces jointes, vocal</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/duel">/duel</Link></td><td className="pr-2">Promptagogues</td><td>Comparer 2 tuteurs sur 1 modèle, ou 1 tuteur sur 2 modèles</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/publier">/publier</Link></td><td className="pr-2">Promptagogues</td><td>Créer un tuteur (gabarit guidé, variantes avec filiation)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2">/p/essai/[lien]</td><td className="pr-2">Promptagogues + invités</td><td>Atelier d'un brouillon : lire, éditer, tester, soumettre</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/verifier">/verifier</Link></td><td className="pr-2">Auteurs, enseignants, admins</td><td>Identification par code email, sans mot de passe</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/compte">/compte</Link></td><td className="pr-2">Comptes</td><td>Le COMPTE : consommation, clés, conversations, tuteurs — tout exporter ou effacer</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/enseignant">/enseignant</Link></td><td className="pr-2">Enseignants</td><td>La CLASSE : ouvrir la salle, déployer un tuteur, relire les tuteurs de son école (l'ancienne adresse /session y mène)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/school">/school</Link></td><td className="pr-2">Élèves d'une école</td><td>Chat sur la clé de l'école, derrière le déverrouillage enseignant</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/etablissement">/etablissement</Link></td><td className="pr-2">Écoles</td><td>L'ÉCOLE : accueil pour qui vient de son réseau, inscription d'un établissement, et — pour ses administrateurs — horaires, quotas, porte-monnaie, comptes, tuteurs et facture</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/etablissements">/etablissements</Link></td><td className="pr-2">Écoles</td><td>Guide dédié : accès, quotas, facturation, parcours</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/facture">/facture</Link></td><td className="pr-2">Écoles, site</td><td>La facture d'un mois, en page imprimable (vide sans compte)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/assistance">/assistance</Link></td><td className="pr-2">Tout le monde</td><td>Nous joindre, et ce que serait un serveur installé dans l'école — lisible sans compte</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/admin">/admin</Link></td><td className="pr-2">Super-administrateurs</td><td>LA PLATEFORME : créer les établissements, tarifs, factures impayées, porte-monnaie de toutes les écoles, échelle des modèles. Leur liste vit dans la configuration du serveur — aucune interface n'en crée</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/admin-demo">/admin-demo</Link></td><td className="pr-2">Tout le monde</td><td>Vitrine de l'administration, entièrement inventée : aucune donnée réelle</td></tr>
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
