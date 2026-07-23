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
