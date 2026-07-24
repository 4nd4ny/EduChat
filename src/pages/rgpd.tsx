import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";
import { MdArrowBack } from "react-icons/md";

// Politique de confidentialité — réécrite pour la réalité v3 (étape 12) :
// site public en clé personnelle, espace établissement /school en clé interne
// facturée par IP, comptes email pour les seuls auteurs et administrateurs,
// JAMAIS de compte élève. Contenu disponible dans les quatre langues du site.

type Section = { title: string; body: string[] };
type Content = { title: string; intro: string; sections: Section[] };

const CONTENT: Record<string, Content> = {
  fr: {
    title: "Confidentialité (RGPD / nLPD)",
    intro: "EduChat est conçu pour fonctionner avec le minimum absolu de données personnelles. Cette page décrit exactement ce qui est stocké, où, et pourquoi.",
    sections: [
      {
        title: "Les élèves n'ont jamais de compte",
        body: [
          "Aucune inscription, aucun identifiant, aucun mot de passe n'est demandé aux élèves. Sur le site public, chacun utilise sa propre clé API ; via l'espace établissement (/school), l'accès est ouvert par un enseignant (mot de passe de session) ou automatiquement depuis l'adresse IP de l'établissement pendant les plages horaires convenues.",
          "Vos conversations sont stockées UNIQUEMENT dans votre navigateur (localStorage). Elles ne transitent par le serveur que le temps d'obtenir la réponse du fournisseur d'IA, et n'y sont jamais conservées. Videz les données de votre navigateur et elles disparaissent — pensez à les exporter avant.",
        ],
      },
      {
        title: "Les clés API personnelles",
        body: [
          "La clé API que vous saisissez reste dans la mémoire vive de la page (jamais dans le stockage du navigateur, jamais en base de données). Elle transite chiffrée (HTTPS) vers le serveur à chaque requête, qui la relaie au fournisseur d'IA sans la conserver.",
        ],
      },
      {
        title: "Ce que le serveur stocke",
        body: [
          "1. Les prompts socratiques publiés, avec leurs compteurs anonymes (usages, tokens, notes) — aucun lien avec un individu.",
          "2. Les comptes des AUTEURS et administrateurs uniquement : nom public et adresse email, vérifiée par un code à usage unique. Aucun mot de passe n'existe.",
          "3. Pour la facturation de la clé interne : la consommation par adresse IP d'ÉTABLISSEMENT (adresse d'une école, pas d'une personne), avec fournisseur et volume de tokens. Les usages en clé personnelle ne sont jamais journalisés avec votre IP.",
          "4. Si vous l'activez explicitement (option de synchronisation), une copie de votre profil (conversations, favoris) — supprimable à tout moment.",
          "5. Pour le compteur de fréquentation affiché en bas de l'accueil : une empreinte technique NON RÉVERSIBLE de votre navigateur (jamais votre adresse IP en clair) avec l'heure de votre dernière activité, effacée automatiquement après quinze minutes. Elle ne sert qu'à afficher un nombre de personnes en ligne et n'est reliée à rien d'autre.",
        ],
      },
      {
        title: "Les modèles d'IA et le RGPD",
        body: [
          "Le respect du RGPD ne dépend pas du modèle lui-même, mais de l'entreprise qui traite vos données (le sous-traitant) : où sont hébergés ses serveurs, si vos échanges servent à entraîner le modèle, et quel contrat (DPA) encadre le tout.",
          "Repli gratuit et modèles « chinois » : quand le site répond sans clé personnelle (mode démo, modèles gratuits via l'agrégateur OpenRouter) ou avec des modèles édités hors UE et États-Unis, nous NE pouvons PAS garantir le respect du RGPD — les données peuvent quitter l'UE et être réutilisées. À réserver à des contenus non personnels.",
          "Avec votre propre clé, en offre commerciale, un vrai cadre RGPD devient possible. Le plus solide est Mistral (sous-traitant français, hébergement dans l'UE, engagement de non-entraînement sur les données de l'API). Claude (Anthropic) et ChatGPT (OpenAI) offrent aussi un cadre réel via leur API commerciale (contrat de traitement, pas d'entraînement sur les données de l'API), mais conditionnel : les transferts UE→États-Unis sont encadrés par des clauses contractuelles types.",
          "Le petit tag « RGPD » affiché dans le sélecteur de fournisseur signale cette POSSIBILITÉ de conformité avec votre propre clé — jamais une garantie automatique. Gemini (clé gratuite AI Studio, susceptible d'entraîner sur les données) et Grok n'en bénéficient pas.",
          "Ces options conformes coûtent plus cher au token : c'est le prix de la liberté et du contrôle sur vos données. Nous ne sommes pas juristes ; pour tout usage impliquant des données personnelles, vérifiez le contrat de traitement (DPA) du fournisseur et signez-le si nécessaire.",
        ],
      },
      {
        title: "Vos droits",
        body: [
          "Export : votre profil complet se télécharge en un clic depuis l'historique. Suppression : un auteur peut supprimer ses prompts ; la suppression d'un compte (et du profil synchronisé) s'obtient par simple demande à l'administrateur : blanvillain@harmonia.education.",
          "Le code du site est public et auditable. Aucun cookie n'est utilisé, aucune donnée n'est cédée à des tiers — les messages envoyés aux fournisseurs d'IA sont soumis à leurs politiques respectives.",
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
          "No sign-up, no username, no password is ever asked of students. On the public site, everyone uses their own API key; through the school area (/school), access is opened by a teacher (session password) or automatically from the school's IP address during agreed hours.",
          "Your conversations are stored ONLY in your browser (localStorage). They pass through the server just long enough to get the AI provider's answer and are never kept there. Clear your browser data and they are gone — export them first.",
        ],
      },
      {
        title: "Personal API keys",
        body: [
          "The API key you type stays in the page's memory (never in browser storage, never in a database). It travels encrypted (HTTPS) to the server with each request, which relays it to the AI provider without keeping it.",
        ],
      },
      {
        title: "What the server stores",
        body: [
          "1. Published Socratic prompts, with anonymous counters (uses, tokens, ratings) — no link to any individual.",
          "2. Accounts for AUTHORS and administrators only: public name and email address, verified by a single-use code. No passwords exist.",
          "3. For internal-key billing: consumption per SCHOOL IP address (a school's address, not a person's), with provider and token volume. Personal-key usage is never logged with your IP.",
          "4. If you explicitly enable it (sync option), a copy of your profile (conversations, favourites) — deletable at any time.",
          "5. For the visitor counter shown at the bottom of the home page: a NON-REVERSIBLE technical fingerprint of your browser (never your IP address in clear) with the time of your last activity, automatically erased after fifteen minutes. It only feeds a number of people online and is linked to nothing else.",
        ],
      },
      {
        title: "AI models and GDPR",
        body: [
          "GDPR compliance does not depend on the model itself, but on the company that processes your data (the processor): where its servers are, whether your exchanges are used to train the model, and what contract (DPA) governs it all.",
          "Free fallback and « Chinese » models: when the site answers without a personal key (demo mode, free models via the OpenRouter aggregator) or with models published outside the EU and United States, we CANNOT guarantee GDPR compliance — data may leave the EU and be reused. Reserve this for non-personal content.",
          "With your own key, on a commercial plan, a real GDPR framework becomes possible. The strongest is Mistral (French processor, EU hosting, commitment not to train on API data). Claude (Anthropic) and ChatGPT (OpenAI) also offer a real framework through their commercial API (data-processing agreement, no training on API data), but a conditional one: EU→US transfers are covered by standard contractual clauses.",
          "The small « GDPR » tag shown in the provider selector flags this POSSIBILITY of compliance with your own key — never an automatic guarantee. Gemini (free AI Studio key, which may train on data) and Grok do not carry it.",
          "These compliant options cost more per token: that is the price of freedom and of control over your data. We are not lawyers; for any use involving personal data, check the provider's data-processing agreement (DPA) and sign it where required.",
        ],
      },
      {
        title: "Your rights",
        body: [
          "Export: your full profile downloads in one click from the history panel. Deletion: authors can delete their prompts; account (and synced profile) deletion is available on request to the administrator: blanvillain@harmonia.education.",
          "The site's code is public and auditable. No cookies are used, no data is sold or shared — messages sent to AI providers are subject to their respective policies.",
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
          "Nessuna registrazione, nessun identificativo, nessuna password viene richiesta agli studenti. Sul sito pubblico ognuno usa la propria chiave API; nell'area istituti (/school), l'accesso è aperto da un insegnante (password di sessione) o automaticamente dall'indirizzo IP della scuola negli orari concordati.",
          "Le conversazioni sono memorizzate SOLO nel tuo browser (localStorage). Transitano dal server solo il tempo di ottenere la risposta del fornitore di IA e non vi vengono mai conservate. Se cancelli i dati del browser scompaiono — esportale prima.",
        ],
      },
      {
        title: "Le chiavi API personali",
        body: [
          "La chiave API che digiti resta nella memoria della pagina (mai nello storage del browser, mai in un database). Viaggia cifrata (HTTPS) verso il server a ogni richiesta, che la inoltra al fornitore di IA senza conservarla.",
        ],
      },
      {
        title: "Cosa memorizza il server",
        body: [
          "1. I prompt socratici pubblicati, con contatori anonimi (usi, token, valutazioni) — nessun legame con una persona.",
          "2. Gli account dei soli AUTORI e amministratori: nome pubblico e indirizzo email, verificato con un codice monouso. Non esistono password.",
          "3. Per la fatturazione della chiave interna: il consumo per indirizzo IP dell'ISTITUTO (l'indirizzo di una scuola, non di una persona), con fornitore e volume di token. Gli usi con chiave personale non vengono mai registrati con il tuo IP.",
          "4. Se la attivi esplicitamente (opzione di sincronizzazione), una copia del tuo profilo (conversazioni, preferiti) — eliminabile in qualsiasi momento.",
          "5. Per il contatore di frequentazione mostrato in fondo alla home: un'impronta tecnica NON REVERSIBILE del tuo browser (mai il tuo indirizzo IP in chiaro) con l'ora della tua ultima attività, cancellata automaticamente dopo quindici minuti. Serve solo a mostrare un numero di persone online e non è collegata a nient'altro.",
        ],
      },
      {
        title: "I modelli di IA e il GDPR",
        body: [
          "Il rispetto del GDPR non dipende dal modello in sé, ma dall'azienda che tratta i tuoi dati (il responsabile del trattamento): dove sono i suoi server, se i tuoi scambi servono ad addestrare il modello e quale contratto (DPA) regola il tutto.",
          "Ripiego gratuito e modelli « cinesi »: quando il sito risponde senza chiave personale (modalità demo, modelli gratuiti tramite l'aggregatore OpenRouter) o con modelli editi fuori dall'UE e dagli Stati Uniti, NON possiamo garantire il rispetto del GDPR — i dati possono lasciare l'UE ed essere riutilizzati. Da riservare a contenuti non personali.",
          "Con la tua chiave, in un piano commerciale, un vero quadro GDPR diventa possibile. Il più solido è Mistral (responsabile francese, hosting nell'UE, impegno a non addestrare sui dati dell'API). Claude (Anthropic) e ChatGPT (OpenAI) offrono anch'essi un quadro reale tramite la loro API commerciale (contratto di trattamento, nessun addestramento sui dati dell'API), ma condizionato: i trasferimenti UE→USA sono coperti da clausole contrattuali standard.",
          "Il piccolo tag « GDPR » mostrato nel selettore del fornitore segnala questa POSSIBILITÀ di conformità con la tua chiave — mai una garanzia automatica. Gemini (chiave gratuita AI Studio, che può addestrare sui dati) e Grok non lo riportano.",
          "Queste opzioni conformi costano di più per token: è il prezzo della libertà e del controllo sui tuoi dati. Non siamo giuristi; per ogni uso che coinvolge dati personali, verifica il contratto di trattamento (DPA) del fornitore e firmalo se necessario.",
        ],
      },
      {
        title: "I tuoi diritti",
        body: [
          "Esportazione: il profilo completo si scarica con un clic dallo storico. Cancellazione: un autore può eliminare i propri prompt; la cancellazione dell'account (e del profilo sincronizzato) si ottiene su semplice richiesta all'amministratore: blanvillain@harmonia.education.",
          "Il codice del sito è pubblico e verificabile. Nessun cookie, nessuna cessione di dati a terzi — i messaggi inviati ai fornitori di IA sono soggetti alle loro rispettive politiche.",
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
          "Keine Registrierung, kein Benutzername, kein Passwort wird von Lernenden verlangt. Auf der öffentlichen Website nutzt jede Person ihren eigenen API-Schlüssel; im Schulbereich (/school) öffnet eine Lehrperson den Zugang (Sitzungspasswort) oder er öffnet sich automatisch von der IP-Adresse der Schule während der vereinbarten Zeiten.",
          "Ihre Gespräche werden NUR in Ihrem Browser gespeichert (localStorage). Sie durchlaufen den Server nur für die Dauer der KI-Antwort und werden dort nie aufbewahrt. Löschen Sie Ihre Browserdaten, sind sie weg — exportieren Sie sie vorher.",
        ],
      },
      {
        title: "Persönliche API-Schlüssel",
        body: [
          "Der eingegebene API-Schlüssel bleibt im Arbeitsspeicher der Seite (nie im Browser-Speicher, nie in einer Datenbank). Er wird bei jeder Anfrage verschlüsselt (HTTPS) an den Server übertragen, der ihn ohne Speicherung an den KI-Anbieter weiterreicht.",
        ],
      },
      {
        title: "Was der Server speichert",
        body: [
          "1. Veröffentlichte sokratische Prompts mit anonymen Zählern (Nutzungen, Tokens, Bewertungen) — ohne Bezug zu einer Person.",
          "2. Konten NUR für Autorinnen/Autoren und Administratoren: öffentlicher Name und E-Mail-Adresse, per Einmalcode verifiziert. Passwörter existieren nicht.",
          "3. Für die Abrechnung des internen Schlüssels: der Verbrauch pro SCHUL-IP-Adresse (die Adresse einer Schule, nicht einer Person), mit Anbieter und Token-Volumen. Nutzungen mit persönlichem Schlüssel werden nie mit Ihrer IP protokolliert.",
          "4. Nur wenn Sie es ausdrücklich aktivieren (Sync-Option): eine Kopie Ihres Profils (Gespräche, Favoriten) — jederzeit löschbar.",
          "5. Für den Besucherzähler am unteren Rand der Startseite: ein NICHT UMKEHRBARER technischer Fingerabdruck Ihres Browsers (niemals Ihre IP-Adresse im Klartext) mit dem Zeitpunkt Ihrer letzten Aktivität, nach fünfzehn Minuten automatisch gelöscht. Er speist nur eine Zahl von Personen online und ist mit nichts anderem verknüpft.",
        ],
      },
      {
        title: "KI-Modelle und die DSGVO",
        body: [
          "Die DSGVO-Konformität hängt nicht vom Modell selbst ab, sondern von dem Unternehmen, das Ihre Daten verarbeitet (dem Auftragsverarbeiter): wo dessen Server stehen, ob Ihre Eingaben zum Training des Modells verwendet werden und welcher Vertrag (AVV) das Ganze regelt.",
          "Kostenloser Rückfall und « chinesische » Modelle: Wenn die Website ohne persönlichen Schlüssel antwortet (Demomodus, kostenlose Modelle über den Aggregator OpenRouter) oder mit Modellen von außerhalb der EU und der USA, können wir die DSGVO-Konformität NICHT garantieren — Daten können die EU verlassen und weiterverwendet werden. Nur für nicht personenbezogene Inhalte verwenden.",
          "Mit Ihrem eigenen Schlüssel in einem kommerziellen Tarif wird ein echter DSGVO-Rahmen möglich. Am solidesten ist Mistral (französischer Auftragsverarbeiter, EU-Hosting, Zusage, nicht auf API-Daten zu trainieren). Claude (Anthropic) und ChatGPT (OpenAI) bieten über ihre kommerzielle API ebenfalls einen echten Rahmen (Auftragsverarbeitungsvertrag, kein Training auf API-Daten), jedoch einen bedingten: EU→US-Übermittlungen sind durch Standardvertragsklauseln abgedeckt.",
          "Das kleine « DSGVO »-Tag in der Anbieterauswahl signalisiert diese MÖGLICHKEIT der Konformität mit Ihrem eigenen Schlüssel — nie eine automatische Garantie. Gemini (kostenloser AI-Studio-Schlüssel, der auf Daten trainieren kann) und Grok tragen es nicht.",
          "Diese konformen Optionen kosten pro Token mehr: Das ist der Preis der Freiheit und der Kontrolle über Ihre Daten. Wir sind keine Juristen; für jede Nutzung mit personenbezogenen Daten prüfen Sie den Auftragsverarbeitungsvertrag (AVV) des Anbieters und schließen Sie ihn ab, wo nötig.",
        ],
      },
      {
        title: "Ihre Rechte",
        body: [
          "Export: Ihr vollständiges Profil lässt sich mit einem Klick aus dem Verlauf herunterladen. Löschung: Autorinnen und Autoren können ihre Prompts löschen; die Löschung eines Kontos (und des synchronisierten Profils) erfolgt auf einfache Anfrage an den Administrator: blanvillain@harmonia.education.",
          "Der Code der Website ist öffentlich und überprüfbar. Es werden keine Cookies verwendet, keine Daten an Dritte weitergegeben — an KI-Anbieter gesendete Nachrichten unterliegen deren jeweiligen Richtlinien.",
        ],
      },
    ],
  },
};

export default function RgpdPage() {
  const { locale } = useRouter();
  const content = CONTENT[locale || "fr"] ?? CONTENT.fr;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 text-primary">
      <Head><title>{`${content.title} — EduChat`}</title></Head>
      <nav className="pt-6 pb-4">
        <Link href="/" className="flex w-fit items-center gap-1 text-sm opacity-70 hover:opacity-100">
          <MdArrowBack /> EduChat
        </Link>
      </nav>
      <h1 className="text-3xl font-bold">{content.title}</h1>
      <p className="mt-3 opacity-80">{content.intro}</p>
      {content.sections.map(section => (
        <section key={section.title} className="mt-8">
          <h2 className="text-xl font-bold">{section.title}</h2>
          {section.body.map((paragraph, i) => (
            <p key={i} className="mt-2 text-sm leading-relaxed opacity-90">{paragraph}</p>
          ))}
        </section>
      ))}
    </div>
  );
}
