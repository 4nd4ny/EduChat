import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";

// Politique de confidentialité — l'état RÉEL de la plateforme : site public en
// démonstration gratuite (une clé personnelle n'y ouvre QUE le fournisseur de
// cette démonstration — src/server/accesFournisseurs.ts, perimetreFournisseurs,
// motif 'demo', et la garde de src/pages/api/completion.ts), espace
// établissement /school en clé interne facturée par IP, comptes email pour les
// seuls auteurs et administrateurs, JAMAIS de compte élève.
//
// Contenu écrit EN DUR dans les quatre langues : cette page NE PASSE PAS par
// src/i18n/dictionaries.ts. Toute correction est donc quatre corrections — une
// phrase rectifiée en français seul laisse trois pages fausses.

type Section = { title: string; body: string[] };

/**
 * Les paragraphes sont du texte simple — jamais du HTML, pour qu'aucune
 * balise ne puisse s'y glisser. Les adresses web y sont donc écrites en
 * clair, et rendues cliquables ici.
 */
function avecLiens(texte: string): React.ReactNode {
  const morceaux = texte.split(/(https?:\/\/[^\s,)]+)/g);
  return morceaux.map((morceau, i) =>
    /^https?:\/\//.test(morceau)
      ? <a key={i} href={morceau} target="_blank" rel="noreferrer" className="underline">{morceau}</a>
      : <React.Fragment key={i}>{morceau}</React.Fragment>);
}
type Content = { title: string; intro: string; sections: Section[] };

const CONTENT: Record<string, Content> = {
  fr: {
    title: "Confidentialité (RGPD / nLPD)",
    intro: "EduChat est conçu pour fonctionner avec le minimum absolu de données personnelles. Cette page décrit exactement ce qui est stocké, où, et pourquoi.",
    sections: [
      {
        title: "Les élèves n'ont jamais de compte",
        body: [
          "Aucune inscription, aucun identifiant, aucun mot de passe n'est demandé aux élèves. Sur le site public, on écrit sans rien saisir : c'est la démonstration gratuite qui répond, quand elle est en service. Employer sa PROPRE clé API n'y ouvre que le fournisseur de cette démonstration : hors du réseau d'une école, une clé collée par un visiteur anonyme n'atteint aucun autre fournisseur. Via l'espace établissement (/school), l'accès est ouvert par un enseignant (mot de passe de session) ou automatiquement depuis l'adresse IP de l'établissement pendant les plages horaires convenues.",
          "Vos conversations sont stockées UNIQUEMENT dans votre navigateur (localStorage). Elles ne transitent par le serveur que le temps d'obtenir la réponse du fournisseur d'IA, et n'y sont jamais conservées. Videz les données de votre navigateur et elles disparaissent — pensez à les exporter avant.",
        ],
      },
      {
        title: "Les clés API personnelles",
        body: [
          "Votre clé API n'est JAMAIS mémorisée sans votre accord — ni dans le navigateur, ni sur le serveur. La taper ne la garde nulle part : elle transite chiffrée (HTTPS) le temps d'une requête, le serveur la relaie au fournisseur d'IA sans la conserver, et tout disparaît en fermant l'onglet. Ce choix est délibéré : une clé API est un moyen de paiement, elle ne se garde pas par commodité.",
          "Si vous cochez « Mémoriser ma clé » — le seul geste qui l'enregistre — sa destination dépend de votre situation. Sans compte : dans CE navigateur uniquement, et il faut le savoir, elle y est alors lisible par tout script s'exécutant sur cet appareil, comme un mot de passe enregistré. Avec un compte : sur le serveur, CHIFFRÉE (AES-256-GCM), ce qui vous la restitue d'un appareil à l'autre — elle ne redescend jamais vers le navigateur, le serveur la déchiffre le temps d'appeler le fournisseur.",
          "Deux moyens de l'effacer, au choix. Depuis le chat : videz le champ de la clé, quittez-le, et cochez « Oublier ma clé » — le navigateur et le serveur sont nettoyés d'un même geste. Depuis la page Mes données : « Oublier cette clé » retire celle d'un fournisseur, « Retirer mon accord et tout effacer » supprime le consentement et toutes les clés d'un coup.",
          "Élèves passant par leur école : aucune clé personnelle n'est requise, ni même utile. C'est la clé de l'établissement qui répond, ouverte par l'enseignant pour la salle et pour une durée limitée ; la consommation est facturée à l'école, et rien n'est demandé à l'élève — ni compte, ni clé.",
          "SEULE EXCEPTION, à votre demande : si vous avez un compte et que vous cochez « Mémoriser ma clé » dans le chat, elle est conservée CHIFFRÉE (AES-256-GCM) sur le serveur, pour vous éviter de la retaper. Elle ne redescend jamais vers le navigateur : le serveur la déchiffre uniquement le temps d'appeler le fournisseur. Décocher la case l'efface immédiatement. Les élèves, qui n'ont pas de compte, ne sont jamais concernés.",
        ],
      },
      {
        title: "Ce que le serveur stocke",
        body: [
          "1. Les prompts socratiques publiés, avec leurs compteurs anonymes (usages, tokens, notes) — aucun lien avec un individu.",
          "1 bis. Pour une proposition déposée depuis le réseau d'un établissement, y compris ANONYME : le nom de cet établissement, et lui seul. Jamais l'adresse IP, jamais l'identité de la personne qui dépose — l'adresse sert à reconnaître l'école le temps de la requête, puis elle est oubliée. Sans cette mention, un tuteur proposé anonymement dans une école n'aurait pour relecteur que l'administration du site ; grâce à elle, ce sont les enseignants de l'établissement qui relisent, corrigent, valident et modèrent ce qui a été proposé chez eux.",
          "2. Les comptes des AUTEURS et administrateurs uniquement : nom public et adresse email, vérifiée par un code à usage unique — saisi à la main, ou apporté par le lien du même courriel. Ce lien porte le code dans le FRAGMENT de l'URL, la partie qui n'est jamais transmise au serveur : elle n'entre ni dans ses journaux, ni dans l'en-tête Referer d'un site tiers. Aucun mot de passe n'existe.",
          "3. Pour la facturation de la clé interne : la consommation par adresse IP d'ÉTABLISSEMENT (adresse d'une école, pas d'une personne), avec fournisseur et volume de tokens. Les usages en clé personnelle ne sont jamais journalisés avec votre IP.",
          "4. Si vous avez un compte : une copie de votre profil (conversations, favoris), sauvegardée automatiquement — c'est l'intérêt même du compte. L'option se décoche à la création du compte, et le profil serveur s'efface en un clic — en entier ou conversation par conversation — depuis la page Mes données.",
          "5. Pour le compteur de fréquentation affiché en bas de l'accueil : une empreinte technique NON RÉVERSIBLE de votre navigateur (jamais votre adresse IP en clair) avec l'heure de votre dernière activité, effacée automatiquement après quinze minutes. Elle ne sert qu'à afficher un nombre de personnes en ligne et n'est reliée à rien d'autre.",
          "6. Si vous le demandez explicitement (case « Mémoriser ma clé » dans le chat, réservée aux comptes) : votre clé API, CHIFFRÉE (AES-256-GCM). Elle ne redescend jamais vers le navigateur — le serveur la déchiffre uniquement le temps d'appeler le fournisseur — et décocher la case l'efface immédiatement.",
          "8. Suivi de la plateforme : l'administration reçoit copie des messages de service et, pour chaque demande de code de vérification, un avis indiquant l'adresse concernée et l'heure — jamais le code, ni le lien qui l'accompagne : sans mot de passe sur EduChat, l'un comme l'autre suffirait à ouvrir votre compte.",
          "7. Si vous modérez les commentaires anonymes — sur vos propres fiches de tuteurs, ou, comme enseignant, sur celles des tuteurs de votre établissement : votre adresse email est inscrite à côté de chaque commentaire approuvé ou masqué, avec la date. Les commentaires n'étant jamais supprimés, cette trace est conservée ; elle figure sur votre page Mes données et dans son export.",
          "9. Si vous provisionnez un porte-monnaie personnel (page Mes données) : le relevé nominatif de ce porte-monnaie — recharges, contribution prélevée, et une ligne par appel payé sur ce crédit, avec le fournisseur, le modèle et le montant. C'est un document comptable : il n'est pas supprimé, et vous le retrouvez en entier dans l'export de la page Mes données. Il n'apparaît PAS dans le journal de consommation du point 3 : celui-ci ne reçoit, pour un appel payé sur un crédit personnel, ni votre adresse email ni votre adresse IP.",
        ],
      },
      {
        title: "Les modèles d'IA et le RGPD",
        body: [
          "Le respect du RGPD ne dépend pas du modèle lui-même, mais de l'entreprise qui traite vos données (le sous-traitant) : où sont hébergés ses serveurs, si vos échanges servent à entraîner le modèle, et quel contrat (DPA) encadre le tout.",
          "Modèles chinois (DeepSeek, Qwen, Kimi, GLM, MiniMax) : ils portent dans l'interface un drapeau ROUGE « WRNG ». Leur éditeur est établi hors UE/EEE, sans cadre de transfert reconnu : vos échanges peuvent y être conservés, réutilisés pour l'entraînement et rendus accessibles aux autorités locales. Ils restent disponibles avec VOTRE clé, depuis un compte vérifié, pour des contenus non personnels (exercices génériques, code, traduction de textes publics) — jamais pour des travaux d'élèves identifiables, et jamais sur la clé interne d'un établissement ni sur un crédit personnel : quel que soit le payeur, la clé de la plateforme les refuse. Sur le réseau d'une école, ils ne figurent dans aucune liste, à une seule exception près : le compte qui a déjà associé ses propres moyens de paiement (clé mémorisée ou crédit personnel) les retrouve dans sa liste, l'établissement ne payant rien pour lui — mais un crédit ne suffit pas à les employer : il y faut SA PROPRE clé. Sans compte, ils ne sont pas proposés du tout : une clé collée par un visiteur anonyme n'y donne plus accès.",
          "Repli gratuit et modèles « chinois » : quand le site répond sans clé personnelle (mode démo, modèles gratuits via l'agrégateur OpenRouter) ou avec des modèles édités hors UE et États-Unis, nous NE pouvons PAS garantir le respect du RGPD — les données peuvent quitter l'UE et être réutilisées. À réserver à des contenus non personnels.",
          "Avec votre propre clé, en offre commerciale, un vrai cadre RGPD devient possible. Le plus solide est Mistral (sous-traitant français, hébergement dans l'UE, engagement de non-entraînement sur les données de l'API). Claude (Anthropic) et ChatGPT (OpenAI) offrent aussi un cadre réel via leur API commerciale (contrat de traitement, pas d'entraînement sur les données de l'API), mais conditionnel : les transferts UE→États-Unis sont encadrés par des clauses contractuelles types.",
          "Le petit tag « RGPD » affiché dans le sélecteur de fournisseur signale cette POSSIBILITÉ de conformité avec votre propre clé — jamais une garantie automatique. Gemini (clé gratuite AI Studio, susceptible d'entraîner sur les données) et Grok n'en bénéficient pas.",
          "Ces options conformes coûtent plus cher au token : c'est le prix de la liberté et du contrôle sur vos données. Nous ne sommes pas juristes ; pour tout usage impliquant des données personnelles, vérifiez le contrat de traitement (DPA) du fournisseur et signez-le si nécessaire.",
        ],
      },
      {
        title: "Vos droits",
        body: [
          "Accès et portabilité : la page Mes données (icône de compte, en haut à gauche) montre tout ce que le serveur conserve à votre sujet et l'exporte en un fichier. Effacement libre-service : vos conversations sauvegardées, une par une ou toutes, et vos clés API mémorisées.",
          "Vos tuteurs publiés, eux, ne sont JAMAIS supprimés : une fois parus au catalogue ils appartiennent au domaine public d'EduChat. Vous les DÉPUBLIEZ — ils quittent le catalogue, et vous pouvez les republier. L'archivage définitif se demande à l'administration.",
          "Suppression du compte lui-même : par simple demande à l'administrateur, blanvillain@harmonia.education (vos tuteurs publiés restent au catalogue, sous un auteur anonymisé).",
          "Le code du site est public et auditable : https://github.com/4nd4ny/EduChat — vous pouvez y vérifier chacune des affirmations de cette page. Aucun cookie n'est utilisé, aucune donnée n'est cédée à des tiers ; les messages envoyés aux fournisseurs d'IA sont soumis à leurs politiques respectives.",
        ],
      },
    ],
  },
  en: {
    title: "Privacy (GDPR)",
    intro: "EduChat is designed to run on the absolute minimum of personal data. This page describes exactly what is stored, where, and why.",
    sections: [
      {
        title: "Students never have accounts",
        body: [
          "No sign-up, no username, no password is ever asked of students. On the public site you write without entering anything: the free demonstration answers, when it is in service. Using your OWN API key there opens that demonstration's provider and nothing else: outside a school network, a key pasted by an anonymous visitor reaches no other provider. Through the school area (/school), access is opened by a teacher (session password) or automatically from the school's IP address during agreed hours.",
          "Your conversations are stored ONLY in your browser (localStorage). They pass through the server just long enough to get the AI provider's answer and are never kept there. Clear your browser data and they are gone — export them first.",
        ],
      },
      {
        title: "Personal API keys",
        body: [
          "Your API key is NEVER remembered without your consent — neither in the browser nor on the server. Typing it stores it nowhere: it travels encrypted (HTTPS) for the length of one request, the server relays it to the AI provider without keeping it, and everything disappears when you close the tab. This is deliberate: an API key is a means of payment, not something to keep out of convenience.",
          "If you tick « Remember my key » — the only gesture that stores it — where it goes depends on your situation. Without an account: in THIS browser only, and you should know it is then readable by any script running on this device, like a saved password. With an account: on the server, ENCRYPTED (AES-256-GCM), which gives it back to you on any device — it never travels back to the browser, the server decrypts it only to call the provider.",
          "Two ways to erase it. From the chat: clear the key field, leave it, and tick « Forget my key » — browser and server are cleaned in one gesture. From the My data page: « Forget this key » removes one provider's, « Withdraw my consent and erase everything » removes the consent and every key at once.",
          "Pupils going through their school: no personal key is required, nor even useful. The school's key answers, opened by the teacher for the room and for a limited time; usage is billed to the school, and nothing is asked of the pupil — no account, no key.",
          "THE ONLY EXCEPTION, at your request: if you have an account and tick « Remember my key » in the chat, it is kept ENCRYPTED (AES-256-GCM) on the server so you do not have to retype it. It never travels back to the browser: the server decrypts it only to call the provider. Unticking the box erases it immediately. Students, who have no account, are never concerned.",
        ],
      },
      {
        title: "What the server stores",
        body: [
          "1. Published Socratic prompts, with anonymous counters (uses, tokens, ratings) — no link to any individual.",
          "1b. For a proposal submitted from a school's network, ANONYMOUS ones included: the name of that school, and nothing else. Never the IP address, never the identity of the person submitting — the address only serves to recognise the school for the length of the request, then it is forgotten. Without this note, a tutor proposed anonymously inside a school would have no reviewer but the site's administration; with it, the school's own teachers review, correct, approve and moderate what was proposed on their premises.",
          "2. Accounts for AUTHORS and administrators only: public name and email address, verified by a single-use code — typed in by hand, or carried by the link in the same email. That link holds the code in the URL FRAGMENT, the part that is never sent to the server: it enters neither its logs nor the Referer header of a third-party site. No passwords exist.",
          "3. For internal-key billing: consumption per SCHOOL IP address (a school's address, not a person's), with provider and token volume. Personal-key usage is never logged with your IP.",
          "4. If you have an account: a copy of your profile (conversations, favourites), saved automatically — that is what an account is for. The option can be unticked when creating the account, and the server profile is erased in one click — entirely or conversation by conversation — from the My data page.",
          "5. For the visitor counter shown at the bottom of the home page: a NON-REVERSIBLE technical fingerprint of your browser (never your IP address in clear) with the time of your last activity, automatically erased after fifteen minutes. It only feeds a number of people online and is linked to nothing else.",
          "6. If you explicitly ask for it (« Remember my key » box in the chat, accounts only): your API key, ENCRYPTED (AES-256-GCM). It never travels back to the browser — the server decrypts it only to call the provider — and unchecking the box erases it immediately.",
          "8. Platform monitoring: the administration receives copies of service messages and, for each verification-code request, a notice giving the address concerned and the time — never the code, nor the link that goes with it: with no password on EduChat, either of them would be enough to open your account.",
          "7. If you moderate anonymous comments — on your own tutor pages, or, as a teacher, on those of your school's tutors: your email address is recorded next to each approved or hidden comment, with the date. As comments are never deleted, that trace is kept; it appears on your My data page and in its export.",
          "9. If you fund a personal wallet (My data page): the named statement of that wallet — top-ups, the contribution withheld, and one line per call paid from that credit, with the provider, the model and the amount. It is an accounting document: it is not deleted, and you get all of it in the export from the My data page. It does NOT appear in the usage log of point 3: for a call paid from personal credit, that log receives neither your email address nor your IP address.",
        ],
      },
      {
        title: "AI models and GDPR",
        body: [
          "GDPR compliance does not depend on the model itself, but on the company that processes your data (the processor): where its servers are, whether your exchanges are used to train the model, and what contract (DPA) governs it all.",
          "Chinese models (DeepSeek, Qwen, Kimi, GLM, MiniMax) carry a RED « WRNG » flag in the interface: their publisher is established outside the EU/EEA with no recognised transfer framework, so exchanges may be kept, reused for training and made available to local authorities. They stay available with YOUR key, from a verified account, for non-personal content (generic exercises, code, translation of public texts) — never for identifiable student work, and never on a school's internal key nor on personal credit: whoever is paying, the platform's own key refuses them. On a school network they appear in no list, with a single exception: an account that has already attached its own means of payment (a remembered key or personal credit) finds them back in its list, the school paying nothing for it — but credit alone is not enough to use them: that takes YOUR OWN key. Without an account they are not offered at all: a key pasted by an anonymous visitor no longer opens them.",
          "Free fallback and « Chinese » models: when the site answers without a personal key (demo mode, free models via the OpenRouter aggregator) or with models published outside the EU and United States, we CANNOT guarantee GDPR compliance — data may leave the EU and be reused. Reserve this for non-personal content.",
          "With your own key, on a commercial plan, a real GDPR framework becomes possible. The strongest is Mistral (French processor, EU hosting, commitment not to train on API data). Claude (Anthropic) and ChatGPT (OpenAI) also offer a real framework through their commercial API (data-processing agreement, no training on API data), but a conditional one: EU→US transfers are covered by standard contractual clauses.",
          "The small « GDPR » tag shown in the provider selector flags this POSSIBILITY of compliance with your own key — never an automatic guarantee. Gemini (free AI Studio key, which may train on data) and Grok do not carry it.",
          "These compliant options cost more per token: that is the price of freedom and of control over your data. We are not lawyers; for any use involving personal data, check the provider's data-processing agreement (DPA) and sign it where required.",
        ],
      },
      {
        title: "Your rights",
        body: [
          "Access and portability: the My data page (account icon, top left) shows everything the server keeps about you and exports it as a single file. Self-service erasure: your saved conversations, one by one or all of them, and your remembered API keys.",
          "Your published tutors are NEVER deleted: once in the catalogue they belong to the EduChat public domain. You UNPUBLISH them — they leave the catalogue, and you may republish them. Permanent archiving is requested from the administration.",
          "Deleting the account itself: on request to the administrator, blanvillain@harmonia.education (your published tutors stay in the catalogue, under an anonymised author).",
          "The site's code is public and auditable: https://github.com/4nd4ny/EduChat — you can check every claim on this page against it. No cookies are used, no data is sold or shared; messages sent to AI providers are subject to their respective policies.",
        ],
      },
    ],
  },
  it: {
    title: "Privacy (GDPR)",
    intro: "EduChat è progettato per funzionare con il minimo assoluto di dati personali. Questa pagina descrive esattamente cosa viene memorizzato, dove e perché.",
    sections: [
      {
        title: "Gli studenti non hanno mai un account",
        body: [
          "Nessuna registrazione, nessun identificativo, nessuna password viene richiesta agli studenti. Sul sito pubblico si scrive senza inserire nulla: risponde la dimostrazione gratuita, quando è in servizio. Usare la PROPRIA chiave API vi apre soltanto il fornitore di quella dimostrazione: fuori dalla rete di una scuola, una chiave incollata da un visitatore anonimo non raggiunge alcun altro fornitore. Nell'area istituti (/school), l'accesso è aperto da un insegnante (password di sessione) o automaticamente dall'indirizzo IP della scuola negli orari concordati.",
          "Le conversazioni sono memorizzate SOLO nel Suo browser (localStorage). Transitano dal server solo il tempo di ottenere la risposta del fornitore di IA e non vi vengono mai conservate. Se cancella i dati del browser scompaiono — le esporti prima.",
        ],
      },
      {
        title: "Le chiavi API personali",
        body: [
          "La Sua chiave API non viene MAI memorizzata senza il Suo consenso — né nel browser, né sul server. Digitarla non la conserva da nessuna parte: viaggia cifrata (HTTPS) per il tempo di una richiesta, il server la inoltra al fornitore di IA senza conservarla, e tutto sparisce chiudendo la scheda. È una scelta deliberata: una chiave API è un mezzo di pagamento, non si conserva per comodità.",
          "Se spunta « Memorizza la mia chiave » — l'unico gesto che la registra — la destinazione dipende dalla Sua situazione. Senza account: solo in QUESTO browser, e va saputo che lì è leggibile da qualsiasi script in esecuzione sul dispositivo, come una password salvata. Con un account: sul server, CIFRATA (AES-256-GCM), il che Gliela restituisce da un dispositivo all'altro — non torna mai al browser, il server la decifra solo per chiamare il fornitore.",
          "Due modi per cancellarla. Dalla chat: svuoti il campo della chiave, esca dal campo e spunti « Dimentica la mia chiave » — browser e server vengono puliti con lo stesso gesto. Dalla pagina I miei dati: « Dimentichi questa chiave » rimuove quella di un fornitore, « Ritiri il consenso e cancelli tutto » elimina il consenso e tutte le chiavi in una volta.",
          "Allievi che passano dalla loro scuola: nessuna chiave personale è richiesta, né utile. Risponde la chiave dell'istituto, aperta dall'insegnante per l'aula e per una durata limitata; il consumo è fatturato alla scuola e all'allievo non si chiede nulla — né account, né chiave.",
          "UNICA ECCEZIONE, su Sua richiesta: se ha un account e spunta « Memorizza la mia chiave » nella chat, viene conservata CIFRATA (AES-256-GCM) sul server per non doverla riscrivere. Non torna mai al browser: il server la decifra solo per chiamare il fornitore. Togliendo la spunta viene cancellata subito. Gli studenti, che non hanno account, non sono mai coinvolti.",
        ],
      },
      {
        title: "Cosa memorizza il server",
        body: [
          "1. I prompt socratici pubblicati, con contatori anonimi (usi, token, valutazioni) — nessun legame con una persona.",
          "1 bis. Per una proposta depositata dalla rete di un istituto, comprese quelle ANONIME: il nome di quell'istituto, e nient'altro. Mai l'indirizzo IP, mai l'identità di chi deposita — l'indirizzo serve solo a riconoscere la scuola per la durata della richiesta, poi viene dimenticato. Senza questa indicazione, un tutor proposto anonimamente in una scuola non avrebbe altro revisore che l'amministrazione del sito; grazie a essa, sono gli insegnanti dell'istituto a rileggere, correggere, approvare e moderare ciò che è stato proposto da loro.",
          "2. Gli account dei soli AUTORI e amministratori: nome pubblico e indirizzo email, verificato con un codice monouso — digitato a mano oppure portato dal link della stessa email. Quel link contiene il codice nel FRAMMENTO dell'URL, la parte che non viene mai trasmessa al server: non finisce né nei suoi registri né nell'intestazione Referer di un sito terzo. Non esistono password.",
          "3. Per la fatturazione della chiave interna: il consumo per indirizzo IP dell'ISTITUTO (l'indirizzo di una scuola, non di una persona), con fornitore e volume di token. Gli usi con chiave personale non vengono mai registrati con il Suo IP.",
          "4. Se ha un account: una copia del Suo profilo (conversazioni, preferiti), salvata automaticamente — è proprio a questo che serve l'account. L'opzione si può togliere alla creazione dell'account e il profilo sul server si cancella con un clic — per intero o conversazione per conversazione — dalla pagina I miei dati.",
          "5. Per il contatore di frequentazione mostrato in fondo alla home: un'impronta tecnica NON REVERSIBILE del Suo browser (mai il Suo indirizzo IP in chiaro) con l'ora della Sua ultima attività, cancellata automaticamente dopo quindici minuti. Serve solo a mostrare un numero di persone online e non è collegata a nient'altro.",
          "6. Se lo chiede esplicitamente (casella « Memorizza la mia chiave » nella chat, solo per account): la Sua chiave API, CIFRATA (AES-256-GCM). Non torna mai al browser — il server la decifra solo per chiamare il fornitore — e togliendo la spunta viene cancellata subito.",
          "8. Monitoraggio della piattaforma: l'amministrazione riceve copia dei messaggi di servizio e, per ogni richiesta di codice di verifica, un avviso con l'indirizzo interessato e l'ora — mai il codice né il link che lo accompagna: senza password su EduChat, l'uno come l'altro basterebbe ad aprire il Suo account.",
          "7. Se modera i commenti anonimi — sulle schede dei Suoi tutor oppure, in quanto insegnante, su quelle dei tutor del Suo istituto: il Suo indirizzo email viene registrato accanto a ogni commento approvato o nascosto, con la data. Poiché i commenti non vengono mai eliminati, questa traccia resta; compare nella pagina I miei dati e nella sua esportazione.",
          "9. Se alimenta un portafoglio personale (pagina I miei dati): l'estratto conto nominativo di quel portafoglio — ricariche, contributo trattenuto e una riga per ogni chiamata pagata con quel credito, con il fornitore, il modello e l'importo. È un documento contabile: non viene eliminato e lo ritrova per intero nell'esportazione della pagina I miei dati. NON compare nel registro dei consumi del punto 3: per una chiamata pagata con credito personale, quel registro non riceve né il Suo indirizzo email né il Suo indirizzo IP.",
        ],
      },
      {
        title: "I modelli di IA e il GDPR",
        body: [
          "Il rispetto del GDPR non dipende dal modello in sé, ma dall'azienda che tratta i Suoi dati (il responsabile del trattamento): dove sono i suoi server, se i Suoi scambi servono ad addestrare il modello e quale contratto (DPA) regola il tutto.",
          "I modelli cinesi (DeepSeek, Qwen, Kimi, GLM, MiniMax) portano nell'interfaccia una bandiera ROSSA « WRNG »: il loro editore ha sede fuori dall'UE/SEE, senza quadro di trasferimento riconosciuto, quindi gli scambi possono essere conservati, riutilizzati per l'addestramento e resi accessibili alle autorità locali. Restano disponibili con la SUA chiave, da un account verificato, per contenuti non personali (esercizi generici, codice, traduzione di testi pubblici) — mai per lavori di studenti identificabili, e mai con la chiave interna di un istituto né con un credito personale: chiunque paghi, la chiave della piattaforma li rifiuta. Sulla rete di una scuola non compaiono in alcun elenco, con una sola eccezione: l'account che ha già associato i propri mezzi di pagamento (chiave memorizzata o credito personale) li ritrova nel proprio elenco, e l'istituto non paga nulla per lui — ma un credito non basta a usarli: occorre la SUA chiave. Senza account non sono proposti affatto: una chiave incollata da un visitatore anonimo non vi dà più accesso.",
          "Ripiego gratuito e modelli « cinesi »: quando il sito risponde senza chiave personale (modalità demo, modelli gratuiti tramite l'aggregatore OpenRouter) o con modelli editi fuori dall'UE e dagli Stati Uniti, NON possiamo garantire il rispetto del GDPR — i dati possono lasciare l'UE ed essere riutilizzati. Da riservare a contenuti non personali.",
          "Con la Sua chiave, in un piano commerciale, un vero quadro GDPR diventa possibile. Il più solido è Mistral (responsabile francese, hosting nell'UE, impegno a non addestrare sui dati dell'API). Claude (Anthropic) e ChatGPT (OpenAI) offrono anch'essi un quadro reale tramite la loro API commerciale (contratto di trattamento, nessun addestramento sui dati dell'API), ma condizionato: i trasferimenti UE→USA sono coperti da clausole contrattuali standard.",
          "Il piccolo tag « GDPR » mostrato nel selettore del fornitore segnala questa POSSIBILITÀ di conformità con la Sua chiave — mai una garanzia automatica. Gemini (chiave gratuita AI Studio, che può addestrare sui dati) e Grok non lo riportano.",
          "Queste opzioni conformi costano di più per token: è il prezzo della libertà e del controllo sui Suoi dati. Non siamo giuristi; per ogni uso che coinvolge dati personali, verifichi il contratto di trattamento (DPA) del fornitore e lo firmi se necessario.",
        ],
      },
      {
        title: "I Suoi diritti",
        body: [
          "Accesso e portabilità: la pagina I miei dati (icona dell'account, in alto a sinistra) mostra tutto ciò che il server conserva su di Lei e lo esporta in un unico file. Cancellazione in autonomia: le conversazioni salvate, una per una o tutte, e le chiavi API memorizzate.",
          "I Suoi tutor pubblicati non vengono MAI eliminati: una volta nel catalogo appartengono al dominio pubblico di EduChat. Li DEPUBBLICA — escono dal catalogo e può ripubblicarli. L'archiviazione definitiva si chiede all'amministrazione.",
          "Cancellazione dell'account: su semplice richiesta all'amministratore, blanvillain@harmonia.education (i Suoi tutor pubblicati restano nel catalogo, con autore reso anonimo).",
          "Il codice del sito è pubblico e verificabile: https://github.com/4nd4ny/EduChat — può controllarvi ogni affermazione di questa pagina. Nessun cookie, nessuna cessione di dati a terzi; i messaggi inviati ai fornitori di IA sono soggetti alle loro rispettive politiche.",
        ],
      },
    ],
  },
  de: {
    title: "Datenschutz (DSGVO)",
    intro: "EduChat ist so konzipiert, dass es mit einem absoluten Minimum an personenbezogenen Daten auskommt. Diese Seite beschreibt genau, was wo und warum gespeichert wird.",
    sections: [
      {
        title: "Schülerinnen und Schüler haben nie ein Konto",
        body: [
          "Keine Registrierung, kein Benutzername, kein Passwort wird von Lernenden verlangt. Auf der öffentlichen Website schreibt man, ohne etwas einzugeben: Es antwortet die kostenlose Demonstration, sofern sie in Betrieb ist. Der EIGENE API-Schlüssel öffnet dort nur den Anbieter dieser Demonstration: ausserhalb eines Schulnetzes erreicht ein von einer anonymen Person eingefügter Schlüssel keinen anderen Anbieter. Im Schulbereich (/school) öffnet eine Lehrperson den Zugang (Sitzungspasswort) oder er öffnet sich automatisch von der IP-Adresse der Schule während der vereinbarten Zeiten.",
          "Ihre Gespräche werden NUR in Ihrem Browser gespeichert (localStorage). Sie durchlaufen den Server nur für die Dauer der KI-Antwort und werden dort nie aufbewahrt. Löschen Sie Ihre Browserdaten, sind sie weg — exportieren Sie sie vorher.",
        ],
      },
      {
        title: "Persönliche API-Schlüssel",
        body: [
          "Ihr API-Schlüssel wird NIE ohne Ihre Zustimmung gespeichert — weder im Browser noch auf dem Server. Ihn einzutippen bewahrt ihn nirgends auf: Er wird für die Dauer einer Anfrage verschlüsselt (HTTPS) übertragen, der Server reicht ihn ohne Speicherung an den KI-Anbieter weiter, und alles verschwindet mit dem Schliessen des Tabs. Das ist Absicht: Ein API-Schlüssel ist ein Zahlungsmittel und wird nicht aus Bequemlichkeit aufbewahrt.",
          "Wenn Sie „Meinen Schlüssel merken“ ankreuzen — die einzige Handlung, die ihn speichert — hängt das Ziel von Ihrer Lage ab. Ohne Konto: nur in DIESEM Browser, und man sollte wissen, dass er dort für jedes Skript auf diesem Gerät lesbar ist, wie ein gespeichertes Passwort. Mit Konto: auf dem Server, VERSCHLÜSSELT (AES-256-GCM), wodurch Sie ihn auf jedem Gerät wiederfinden — er gelangt nie zurück in den Browser, der Server entschlüsselt ihn nur, um den Anbieter aufzurufen.",
          "Zwei Wege, ihn zu löschen. Aus dem Chat: Feld leeren, es verlassen und „Meinen Schlüssel vergessen“ ankreuzen — Browser und Server werden mit derselben Handlung bereinigt. Über die Seite Meine Daten: „Diesen Schlüssel vergessen“ entfernt den eines Anbieters, „Zustimmung zurückziehen und alles löschen“ hebt die Zustimmung auf und löscht alle Schlüssel auf einmal.",
          "Schülerinnen und Schüler über ihre Schule: Ein persönlicher Schlüssel ist weder nötig noch nützlich. Es antwortet der Schulschlüssel, von der Lehrperson für den Raum und für begrenzte Zeit geöffnet; der Verbrauch wird der Schule berechnet, und von den Lernenden wird nichts verlangt — kein Konto, kein Schlüssel.",
          "EINZIGE AUSNAHME, auf Ihren Wunsch: Mit einem Konto und dem Häkchen „Schlüssel merken“ im Chat wird er VERSCHLÜSSELT (AES-256-GCM) auf dem Server aufbewahrt, damit Sie ihn nicht erneut eintippen müssen. Er gelangt nie zurück in den Browser: Der Server entschlüsselt ihn nur, um den Anbieter aufzurufen. Abwählen löscht ihn sofort. Schülerinnen und Schüler ohne Konto sind nie betroffen.",
        ],
      },
      {
        title: "Was der Server speichert",
        body: [
          "1. Veröffentlichte sokratische Prompts mit anonymen Zählern (Nutzungen, Tokens, Bewertungen) — ohne Bezug zu einer Person.",
          "1b. Bei einem Vorschlag, der aus dem Netz einer Schule eingereicht wird — auch ANONYM: der Name dieser Schule, und sonst nichts. Nie die IP-Adresse, nie die Identität der einreichenden Person: Die Adresse dient nur dazu, die Schule für die Dauer der Anfrage zu erkennen, danach wird sie vergessen. Ohne diesen Vermerk hätte ein anonym in einer Schule vorgeschlagener Tutor niemanden ausser der Verwaltung der Website, der ihn gegenliest; mit ihm sind es die Lehrpersonen der Schule selbst, die gegenlesen, korrigieren, freigeben und moderieren, was bei ihnen vorgeschlagen wurde.",
          "2. Konten NUR für Autorinnen/Autoren und Administratoren: öffentlicher Name und E-Mail-Adresse, per Einmalcode verifiziert — von Hand eingetippt oder über den Link derselben E-Mail. Dieser Link trägt den Code im FRAGMENT der URL, dem Teil, der nie an den Server übermittelt wird: Er landet weder in dessen Protokollen noch im Referer-Header einer fremden Website. Passwörter existieren nicht.",
          "3. Für die Abrechnung des internen Schlüssels: der Verbrauch pro SCHUL-IP-Adresse (die Adresse einer Schule, nicht einer Person), mit Anbieter und Token-Volumen. Nutzungen mit persönlichem Schlüssel werden nie mit Ihrer IP protokolliert.",
          "4. Wenn Sie ein Konto haben: eine Kopie Ihres Profils (Gespräche, Favoriten), automatisch gesichert — genau dafür ist das Konto da. Die Option lässt sich bei der Kontoerstellung abwählen, und das Serverprofil wird mit einem Klick — ganz oder Gespräch für Gespräch — über die Seite Meine Daten gelöscht.",
          "5. Für den Besucherzähler am unteren Rand der Startseite: ein NICHT UMKEHRBARER technischer Fingerabdruck Ihres Browsers (niemals Ihre IP-Adresse im Klartext) mit dem Zeitpunkt Ihrer letzten Aktivität, nach fünfzehn Minuten automatisch gelöscht. Er speist nur eine Zahl von Personen online und ist mit nichts anderem verknüpft.",
          "6. Wenn Sie es ausdrücklich verlangen (Kästchen „Schlüssel merken“ im Chat, nur für Konten): Ihr API-Schlüssel, VERSCHLÜSSELT (AES-256-GCM). Er gelangt nie zurück in den Browser — der Server entschlüsselt ihn nur, um den Anbieter aufzurufen — und das Abwählen löscht ihn sofort.",
          "8. Plattform-Überwachung: Die Verwaltung erhält Kopien der Servicenachrichten und, für jede Anforderung eines Bestätigungscodes, einen Hinweis mit der betroffenen Adresse und der Uhrzeit — nie den Code und nie den zugehörigen Link: Da es auf EduChat kein Passwort gibt, würde beides genügen, um Ihr Konto zu öffnen.",
          "7. Wenn Sie anonyme Kommentare moderieren — auf Ihren eigenen Tutorenseiten oder, als Lehrperson, auf denen der Tutoren Ihrer Schule: Ihre E-Mail-Adresse wird neben jedem freigegebenen oder ausgeblendeten Kommentar mit Datum vermerkt. Da Kommentare nie gelöscht werden, bleibt diese Spur bestehen; sie erscheint auf Ihrer Seite Meine Daten und in deren Export.",
          "9. Wenn Sie ein persönliches Guthabenkonto aufladen (Seite Meine Daten): der namentliche Auszug dieses Kontos — Aufladungen, einbehaltener Beitrag und eine Zeile pro Aufruf, der über dieses Guthaben bezahlt wurde, mit Anbieter, Modell und Betrag. Es ist ein Buchhaltungsbeleg: er wird nicht gelöscht, und Sie erhalten ihn vollständig im Export der Seite Meine Daten. Er erscheint NICHT im Nutzungsprotokoll von Punkt 3: Bei einem über persönliches Guthaben bezahlten Aufruf erhält dieses Protokoll weder Ihre E-Mail-Adresse noch Ihre IP-Adresse.",
        ],
      },
      {
        title: "KI-Modelle und die DSGVO",
        body: [
          "Die DSGVO-Konformität hängt nicht vom Modell selbst ab, sondern von dem Unternehmen, das Ihre Daten verarbeitet (dem Auftragsverarbeiter): wo dessen Server stehen, ob Ihre Eingaben zum Training des Modells verwendet werden und welcher Vertrag (AVV) das Ganze regelt.",
          "Chinesische Modelle (DeepSeek, Qwen, Kimi, GLM, MiniMax) tragen in der Oberfläche eine ROTE « WRNG »-Flagge: Ihr Anbieter sitzt ausserhalb der EU/des EWR, ohne anerkannten Übermittlungsrahmen — Eingaben können gespeichert, zum Training weiterverwendet und lokalen Behörden zugänglich gemacht werden. Sie bleiben mit IHREM Schlüssel verfügbar, aus einem bestätigten Konto, für nicht personenbezogene Inhalte (allgemeine Übungen, Code, Übersetzung öffentlicher Texte) — nie für identifizierbare Schülerarbeiten und nie über den internen Schlüssel einer Schule oder über persönliches Guthaben: Wer auch immer zahlt, der Schlüssel der Plattform verweigert sie. In einem Schulnetz erscheinen sie in keiner Liste, mit einer einzigen Ausnahme: Ein Konto, das bereits eigene Zahlungsmittel hinterlegt hat (gemerkter Schlüssel oder persönliches Guthaben), findet sie in seiner Liste wieder, und die Schule bezahlt nichts für es — Guthaben allein genügt jedoch nicht, um sie zu nutzen: Dafür braucht es den EIGENEN Schlüssel. Ohne Konto werden sie gar nicht angeboten: Ein von einer anonymen Person eingefügter Schlüssel öffnet sie nicht mehr.",
          "Kostenloser Rückfall und « chinesische » Modelle: Wenn die Website ohne persönlichen Schlüssel antwortet (Demomodus, kostenlose Modelle über den Aggregator OpenRouter) oder mit Modellen von ausserhalb der EU und der USA, können wir die DSGVO-Konformität NICHT garantieren — Daten können die EU verlassen und weiterverwendet werden. Nur für nicht personenbezogene Inhalte verwenden.",
          "Mit Ihrem eigenen Schlüssel in einem kommerziellen Tarif wird ein echter DSGVO-Rahmen möglich. Am solidesten ist Mistral (französischer Auftragsverarbeiter, EU-Hosting, Zusage, nicht auf API-Daten zu trainieren). Claude (Anthropic) und ChatGPT (OpenAI) bieten über ihre kommerzielle API ebenfalls einen echten Rahmen (Auftragsverarbeitungsvertrag, kein Training auf API-Daten), jedoch einen bedingten: EU→US-Übermittlungen sind durch Standardvertragsklauseln abgedeckt.",
          "Das kleine « DSGVO »-Tag in der Anbieterauswahl signalisiert diese MÖGLICHKEIT der Konformität mit Ihrem eigenen Schlüssel — nie eine automatische Garantie. Gemini (kostenloser AI-Studio-Schlüssel, der auf Daten trainieren kann) und Grok tragen es nicht.",
          "Diese konformen Optionen kosten pro Token mehr: Das ist der Preis der Freiheit und der Kontrolle über Ihre Daten. Wir sind keine Juristen; für jede Nutzung mit personenbezogenen Daten prüfen Sie den Auftragsverarbeitungsvertrag (AVV) des Anbieters und schliessen Sie ihn ab, wo nötig.",
        ],
      },
      {
        title: "Ihre Rechte",
        body: [
          "Auskunft und Übertragbarkeit: Die Seite Meine Daten (Kontosymbol, oben links) zeigt alles, was der Server über Sie aufbewahrt, und exportiert es in eine einzige Datei. Löschen in Eigenregie: Ihre gesicherten Gespräche, einzeln oder alle, und Ihre gespeicherten API-Schlüssel.",
          "Ihre veröffentlichten Tutoren werden NIE gelöscht: Einmal im Katalog gehören sie zur Allmende von EduChat. Sie ZIEHEN sie ZURÜCK — sie verlassen den Katalog, und Sie können sie wieder veröffentlichen. Die endgültige Archivierung wird bei der Verwaltung beantragt.",
          "Löschung des Kontos selbst: auf einfache Anfrage an den Administrator, blanvillain@harmonia.education (Ihre veröffentlichten Tutoren bleiben im Katalog, mit anonymisierter Autorschaft).",
          "Der Code der Website ist öffentlich und überprüfbar: https://github.com/4nd4ny/EduChat — dort lässt sich jede Aussage dieser Seite nachprüfen. Es werden keine Cookies verwendet, keine Daten an Dritte weitergegeben; an KI-Anbieter gesendete Nachrichten unterliegen deren jeweiligen Richtlinien.",
        ],
      },
    ],
  },
};

export default function RgpdPage() {
  const { locale } = useRouter();
  const content = CONTENT[locale || "fr"] ?? CONTENT.fr;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-16 text-primary">
      <Head><title>{`${content.title} — EduChat`}</title></Head>
      <h1 className="text-3xl font-bold">{content.title}</h1>
      <p className="mt-3 opacity-80">{content.intro}</p>
      {content.sections.map(section => (
        <section key={section.title} className="mt-8">
          <h2 className="text-xl font-bold">{section.title}</h2>
          {section.body.map((paragraph, i) => (
            <p key={i} className="mt-2 text-sm leading-relaxed opacity-90">{avecLiens(paragraph)}</p>
          ))}
        </section>
      ))}
    </div>
  );
}
