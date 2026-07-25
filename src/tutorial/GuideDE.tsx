import Link from "next/link";
import React from "react";
import { MdSchool, MdTour } from "react-icons/md";
import { GuidedWalk, Mindmap, Profile, Section, WalkStep } from "./shared";

// EduChat-Leitfaden — DEUTSCHE Version. Folgt exakt der Struktur von GuideFR.

const PROFILES: Profile[] = [
  { color: "#4FC3F7", topic: "Schüler · Besucher", anchor: "#eleves", leaves: [
    ["Tutor auswählen", "#eleves"], ["Chatten (eigener Schlüssel)", "#eleves"],
    ["Favoriten & Bewertungen", "#eleves"], ["Profil exportieren", "#eleves"] ] },
  { color: "#DC6521", topic: "Promptagoge", anchor: "#promptagogues", leaves: [
    ["E-Mail verifizieren", "#promptagogues"], ["Tutor veröffentlichen", "#promptagogues"],
    ["Test per Geheimlink", "#validation"], ["Duell & Varianten", "#promptagogues"] ] },
  { color: "#81C784", topic: "Lehrperson", anchor: "/etablissements", leaves: [
    ["/school entsperren", "/etablissements"], ["An die Klasse verteilen", "/etablissements"],
    ["Konto per E-Mail", "/etablissements"] ] },
  { color: "#BA68C8", topic: "Schule", anchor: "/etablissements", leaves: [
    ["Zeiten in Selbstverwaltung", "/etablissements"], ["Kontingent pro Schüler", "/etablissements"],
    ["Monatsbudget", "/etablissements"], ["Abläufe (Schemata)", "/etablissements"] ] },
  { color: "#FFD54F", topic: "Administrator", anchor: "#admin", leaves: [
    ["Tutoren freigeben", "#validation"], ["Schulen verwalten", "/etablissements"],
    ["Abrechnen (CSV)", "/etablissements"] ] },
];

const WALK: WalkStep[] = [
  {
    title: "Der Katalog, das Herz der Website",
    text: "Die Startseite listet die veröffentlichten sokratischen Tutoren. Suchen, sortieren (empfohlen, meistgenutzt, bestbewertet...), Favoriten setzen (der Stern — Ihre Favoriten rücken nach oben). Jeder Tutor ist ein System-Prompt, der die KI in eine Lehrperson verwandelt, die fragt statt zu antworten.",
    href: "/de", hrefLabel: "Katalog öffnen",
  },
  {
    title: "Die Seite eines Tutors",
    text: "Klicken Sie auf einen Namen, um seine Seite zu lesen: Beschreibung, Statistiken, Bewertungen, Herkunft („inspiriert von“), und der VOLLSTÄNDIGE Text des Prompts — alles ist öffentlich, Schule ist gratis. Hier bewertet man (1 bis 5 Sterne), kopiert den Link zum Weiterempfehlen und schlägt eine Variante vor.",
    href: "/de/p/Socrate", hrefLabel: "Socrates Seite ansehen",
  },
  {
    title: "Einen Tutor ausprobieren",
    text: "„Ausprobieren“ öffnet den Chat mit diesem Tutor am Steuer (Banner oben). Auf der öffentlichen Website geben Sie Ihren eigenen API-Schlüssel ein (Feld „Eigener Schlüssel“): Er bleibt auf der Seite — nur auf Wunsch gemerkt — und er schaltet Anhänge (Bilder, PDF) und Sprachchat frei. Die Antworten erscheinen live, während sie entstehen.",
    href: "/de/chat?tuteur=Socrate", hrefLabel: "Socrate ausprobieren",
  },
  {
    title: "Einen eigenen Tutor vorschlagen",
    text: "Das Formular „Tutor vorschlagen“ beginnt mit einer sokratischen Vorlage: Geben Sie einen eindeutigen Eigennamen, eine Beschreibung, passen Sie die Regeln an. Sie können unter Ihrem Namen veröffentlichen (E-Mail in 30 Sekunden verifiziert, ohne Passwort) oder anonym.",
    href: "/de/publier", hrefLabel: "Formular öffnen",
  },
  {
    title: "Testen vor dem Einreichen",
    text: "Ihr Prompt entsteht „im Aufbau“: Eine geheime URL erlaubt es, ihn zu lesen, zu bearbeiten und im Chat zu TESTEN — teilen Sie den Link mit Kolleginnen und Kollegen für Rückmeldungen, er ist nicht gesperrt. Wenn er bereit ist: „Zur Veröffentlichung einreichen“.",
  },
  {
    title: "Im Duell vergleichen",
    text: "Der Duell-Modus (nur für Promptagogen) schickt dieselbe Frage in zwei Spalten: zwei Tutoren auf demselben Modell, oder derselbe Tutor auf zwei Modellen. Das ist die Feinschliff-Werkstatt: Beobachten Sie, was eine Formulierung ändert, oder wie robust Ihr Prompt über LLMs hinweg ist.",
    href: "/de/duel", hrefLabel: "Duell öffnen",
  },
  {
    title: "Die Freigabe",
    text: "Ein eingereichter Tutor kommt in die Warteschlange. Ein Administrator — oder jede verifizierte Promptagogin, jeder verifizierte Promptagoge — liest ihn gegen und veröffentlicht ihn: Er erscheint dann im Katalog. Dieser A-priori-Filter schützt die Schüler; Details weiter unten.",
  },
  {
    title: "Vertreten Sie eine Schule?",
    text: "Schulen haben ihren eigenen Leitfaden: kontofreier Zugang für Schüler, Verteilen eines Tutors an die Klasse, Zeiten und Budgets in Selbstverwaltung, Abrechnung. Alles mit Ablauf-Schemata erklärt.",
    href: "/de/etablissements", hrefLabel: "Schul-Leitfaden",
  },
];

export default function GuideDE() {
  return (
    <>
      <h1 className="text-3xl font-bold">EduChat-Leitfaden</h1>
      <p className="mt-2 opacity-80">
        EduChat ist ein Raum, um <b>sokratische Tutoren</b> zu erstellen, zu vergleichen und zu
        verteilen — Prompts, die eine KI in eine Lehrperson verwandeln, die fragt statt zu antworten.
        Klicken Sie auf die Karte zum Erkunden, oder folgen Sie der geführten Tour.
      </p>

      <div className="mt-6">
        <Mindmap profiles={PROFILES}
          caption="Interaktive Karte — Blase anklicken, ziehen zum Verschieben, Mausrad zum Zoomen."
          ariaLabel="Funktionskarte nach Profil" />
      </div>

      <Link href="/chat?tuteur=Socrate&visite=1"
        className="mt-6 flex items-center gap-3 rounded-lg border border-[#DC6521]/50 bg-[#DC6521]/10 p-4 hover:bg-[#DC6521]/20">
        <MdTour className="text-2xl text-[#DC6521]" />
        <span className="text-sm">
          <b>Interaktive Tour durch die Oberfläche</b> — der Chat-Bildschirm öffnet sich und jedes
          Element (Tutor, Anbieter, Schlüssel, Mikrofon…) wird der Reihe nach vorgestellt, in 40 Sekunden.
        </span>
      </Link>

      <div id="visite" className="mt-8 scroll-mt-6">
        <GuidedWalk steps={WALK}
          labels={{ title: "Geführte Tour", stepAria: "Schritt", prev: "Zurück", next: "Weiter" }} />
      </div>

      <Link href="/etablissements"
        className="mt-8 flex items-center gap-3 rounded-lg border border-[#BA68C8]/40 bg-[#BA68C8]/10 p-4 hover:bg-[#BA68C8]/15">
        <MdSchool className="text-2xl text-[#BA68C8]" />
        <span className="text-sm">
          <b>Vertreten Sie eine Schule, oder sind Sie Lehrperson?</b> Schülerzugang, Verteilen eines
          Tutors an die Klasse, Zeiten und Budgets, Abrechnung, Ablauf-Schemata:{" "}
          <span className="underline">zum Schul-Leitfaden →</span>
        </span>
      </Link>

      <Section id="eleves" title="Schüler und Besucher — lernen">
        <ul className="list-inside list-disc space-y-1">
          <li><b>Tutor auswählen</b> im <Link className="underline" href="/">Katalog</Link>: Suche, Sortierungen, Detailseite mit vollständigem Prompt.</li>
          <li><b>Ausprobieren</b>: Der Chat öffnet sich mit dem Tutor am Steuer; auf der öffentlichen Website treibt Ihr <b>eigener API-Schlüssel</b> (nie gespeichert, außer auf Ihren Wunsch) das Gespräch an, mit Anbieter und Denktiefe Ihrer Wahl. Die Antworten kommen <b>live</b>, während sie entstehen.</li>
          <li><b>Anhänge</b> (eigener Schlüssel): Hängen Sie ein <b>Bild oder PDF</b> an Ihre Frage an, je nach gewähltem Anbieter.</li>
          <li><b>Sprachchat</b> (eigener Schlüssel, kompatible Anbieter): Diktieren Sie Ihre Frage ins Mikrofon — der Sprachmodus liest Antworten laut vor. Praktisch auf dem Smartphone.</li>
          <li><b>Favoriten</b> (Stern) und <b>Bewertungen</b> (1-5): im Browser gespeichert; Favoriten rücken im Katalog nach oben.</li>
          <li><b>Anonyme Kommentare</b> auf jeder Seite: Hinterlassen Sie eine Rückmeldung — sie erscheint nach Freigabe durch den Autor des Tutors oder die Administration.</li>
          <li><b>Verlauf</b>: Ihre Gespräche bleiben im Browser. Umbenennen, Löschen, Export jedes Gesprächs (.md + .json) und <b>Export des vollständigen Profils</b> (Gespräche + Favoriten + Bewertungen), per Drag-and-drop anderswo reimportierbar.</li>
          <li><b>Token-Zähler</b>: Der Gesamtverbrauch erscheint unter dem Eingabefeld und im Tab-Titel.</li>
          <li><b>Über eine Schule</b>: Auf <Link className="underline" href="/school">/school</Link> weder Konto noch Schlüssel — siehe <Link className="underline" href="/etablissements">Schul-Leitfaden</Link>.</li>
          <li><b>Datenschutz</b>: im Detail auf <Link className="underline" href="/rgpd">der Datenschutzseite</Link> — Schüler haben nie ein Konto.</li>
        </ul>
      </Section>

      <Section id="promptagogues" title="Promptagogen — einen Tutor erstellen">
        <p>Ein <b>Promptagoge</b> (Prompt + Pädagoge) ist der Autor eines Tutors. Jede und jeder kann es werden:</p>
        <ol className="list-inside list-decimal space-y-2">
          <li><b>Identifizieren Sie sich</b> (optional, aber empfohlen) auf <Link className="underline" href="/verifier">/verifier</Link>: öffentlicher Name + E-Mail, bestätigt durch einen sechsstelligen Code per E-Mail. <b>Kein Passwort, niemals.</b> Ohne Konto ist die Veröffentlichung anonym — über die geheime URL testbar und einreichbar, doch die gesamte Moderation (Freigabe, Zurückziehen, Archivieren) liegt dann bei der Administration.</li>
          <li><b>Schreiben Sie</b> auf <Link className="underline" href="/publier">/publier</Link>: ein <b>eindeutiger Eigenname</b> (Pythagoras, Curie...), eine Katalogbeschreibung, die Sprache und der Prompt selbst — die mitgelieferte Vorlage setzt die sokratischen Grundregeln (nie die Antwort geben, in Fragen voranschreiten, ermutigen). Grenzen: 256 KB pro Prompt, 1 MB pro Autor. Nur Text.</li>
          <li><b>Testen Sie</b>: Der Entwurf „im Aufbau“ hat eine geheime URL — Lesen, Bearbeiten, Testen im Chat, und Tester einladen durch einfaches Teilen des Links.</li>
          <li><b>Verfeinern Sie im Duell</b> auf <Link className="underline" href="/duel">/duel</Link> (nur Promptagogen): dieselbe Frage an zwei Tutoren auf demselben Modell — oder an denselben Tutor auf zwei Modellen — um die Wirkung einer Formulierung zu messen.</li>
          <li><b>Reichen Sie ein</b>, dann übernimmt die Freigabe (nächster Abschnitt).</li>
        </ol>
        <p><b>Danach:</b> Eine Änderung an einem veröffentlichten Tutor erzeugt eine <b>neue Version</b> — laufende Gespräche bleiben auf ihrer und bieten den Wechsel an, ohne ihn je zu erzwingen. Sie können <b>Ihre</b> Tutoren jederzeit aus Ihrer Werkstatt (dem geheimen Link) <b>zurückziehen</b> und später wieder veröffentlichen (nichts wird je gelöscht: die Zähler bleiben intakt). Die <b>anonymen Kommentare</b> auf Ihren Seiten warten auf Sie: Sie moderieren sie (freigeben oder ausblenden). „Variante vorschlagen“ auf jeder Seite füllt das Formular mit dem bestehenden Prompt vor und registriert die <b>Herkunft</b> („inspiriert von“, auf beiden Seiten angezeigt): Das ist der Weg der Personalisierung. Die Option <b>Synchronisation</b> (auf /verifier angekreuzt) sichert Ihr Profil auf dem Server, um Gespräche und Favoriten in einem anderen Browser wiederzufinden.</p>
      </Section>

      <Section id="validation" title="Der Freigabeprozess">
        <div className="overflow-x-auto">
          <p className="whitespace-nowrap rounded bg-tertiary p-3 font-mono text-xs">
            im Aufbau (geheime URL) → eingereicht → <b className="text-green-400">veröffentlicht</b> ⇄ zurückgezogen — nichts wird je gelöscht
          </p>
        </div>
        <ul className="list-inside list-disc space-y-1">
          <li><b>Im Aufbau</b>: im Katalog unsichtbar, nur über die geheime URL erreichbar (128 zufällige Bits). Frei bearbeitbar und testbar.</li>
          <li><b>Eingereicht</b>: kommt in die Freigabe-Warteschlange, nur für Prüfende sichtbar.</li>
          <li><b>A-priori-Freigabe</b>: Ein <b>Administrator oder jede verifizierte Promptagogin / jeder verifizierte Promptagoge</b> liest den Prompt gegen und veröffentlicht ihn. Diese Gemeinschaftslösung schützt die Schüler (minderjähriges Publikum) und vermeidet den Engpass eines einzelnen Prüfers — sie filtert vor allem anonyme Vorschläge.</li>
          <li><b>Veröffentlicht</b>: im Katalog, für alle nutzbar, Zähler aktiv.</li>
          <li><b>Zurückgezogen</b>: aus dem Katalog entfernt, aber erhalten — Autor oder Administration können ihn <b>wieder veröffentlichen</b>; die Administration kann ihn auch <b>bearbeiten, umbenennen</b> oder <b>archivieren</b> (dauerhaft aus der Admin-Oberfläche ausgeblendet, aber in der Datenbank erhalten: nichts wird je gelöscht, die Verbrauchsstatistiken bleiben exakt).</li>
        </ul>
      </Section>

      <Section id="classement" title="Wie die besten Tutoren hervorgehoben werden">
        <p>Die Standardsortierung „<b>Empfohlen</b>“ berechnet in der Datenbank eine Punktzahl für jeden veröffentlichten Tutor:</p>
        <p className="overflow-x-auto rounded bg-tertiary p-3 font-mono text-xs">
          Punktzahl = Nutzungen + 5 × Bewertungsdurchschnitt + 50 / (1 + Alter in Tagen)
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li><b>Nutzungen</b> — jedes mit dem Tutor begonnene Gespräch zählt: echte Beliebtheit fällt ins Gewicht.</li>
          <li><b>5 × Bewertungsdurchschnitt</b> — die wahrgenommene Qualität (1-5 Sterne) wiegt bis zu 25 Punkte: Ein hervorragender, aber junger Tutor kann einen alten, mittelmäßig geschätzten überholen.</li>
          <li><b>50 / (1 + Alter)</b> — ein Frische-Bonus, stark in den ersten Tagen, dann abnehmend: Neue Tutoren bekommen ihre Chance, gesehen zu werden — die zuerst Veröffentlichten monopolisieren die Spitze nicht („Schneeball-Effekt“).</li>
        </ul>
        <p>Die anderen Sortierungen sind direkte Datenbankspalten: <b>meistgenutzt</b> (Nutzungen), <b>bestbewertet</b> (Durchschnitt, bei Gleichstand entscheidet die Anzahl), <b>neueste</b> (Erstellungsdatum), <b>generierte Tokens</b> (produziertes Volumen), <b>Name</b> (alphabetisch). Und Ihre <b>Favoriten</b> — rein lokal — sind immer oben angeheftet, in der Reihenfolge der gewählten Sortierung.</p>
      </Section>

      <Section id="donnees" title="Was gespeichert wird — und wo">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="uppercase opacity-60">
              <tr><th className="py-1 pr-2">Datum</th><th className="pr-2">Wo</th><th>Detail</th></tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Gespräche, eigener API-Schlüssel, Favoriten, vergebene Bewertungen, Anhänge</td><td className="pr-2"><b>Ihr Browser</b></td><td>Standardmäßig nie auf dem Server (der eigene Schlüssel verlässt den Seitenspeicher nicht; Anhänge werden nur an den Anbieter weitergereicht). Zwei Ausnahmen, unten beschrieben: die Profilsicherung für Konten und der auf Wunsch gemerkte Schlüssel.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Sokratische Tutoren</td><td className="pr-2">Datenbank</td><td>Volltext, aufeinanderfolgende Versionen, Herkunft („inspiriert von“), Status, anonyme Zähler (Nutzungen, generierte Tokens, Summe und Anzahl der Bewertungen).</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Promptagogen- / Lehrpersonen-Konto</td><td className="pr-2">Datenbank</td><td>Öffentlicher Name, E-Mail (nie angezeigt), Rollen, Sync-Option. <b>Es existiert kein Passwort.</b></td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Schulen & Verbrauch</td><td className="pr-2">Datenbank</td><td>Im Detail im <Link className="underline" href="/etablissements#donnees">Schul-Leitfaden</Link> (IP, Zeiten, Kontingente, Verbrauchsprotokoll pro IP — keine personenbezogenen Schülerdaten).</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Synchronisiertes Profil (Option)</td><td className="pr-2">Datenbank</td><td>Kopie Ihres Browser-Profils, jederzeit über /verifier löschbar.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Gemerkter API-Schlüssel (auf Wunsch, Konten)</td><td className="pr-2">Datenbank</td><td>Nur wenn Sie im Chat „Schlüssel merken“ ankreuzen: Ihr Schlüssel wird <b>verschlüsselt</b> (AES-256-GCM) aufbewahrt, gelangt nie zurück in den Browser und verschwindet, sobald Sie abwählen.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">„Online“-Zähler der Startseite</td><td className="pr-2">Datenbank</td><td>Ein nicht umkehrbarer technischer Fingerabdruck des Browsers (nie die IP im Klartext) und der Zeitpunkt der letzten Aktivität, nach fünfzehn Minuten gelöscht.</td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="pages" title="Alle Seiten der Website">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="uppercase opacity-60">
              <tr><th className="py-1 pr-2">Seite</th><th className="pr-2">Für wen</th><th>Rolle</th></tr>
            </thead>
            <tbody>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/">/</Link></td><td className="pr-2">Alle</td><td>Tutoren-Katalog — die Startseite</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2">/p/[Name]</td><td className="pr-2">Alle</td><td>Öffentliche Seite eines Tutors (vollständiger Prompt, Bewertungen, Versionen, Herkunft)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/chat">/chat</Link></td><td className="pr-2">Alle</td><td>Chat mit eigenem Schlüssel, mit oder ohne Tutor — Streaming, Anhänge, Sprache</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/duel">/duel</Link></td><td className="pr-2">Promptagogen</td><td>2 Tutoren auf 1 Modell oder 1 Tutor auf 2 Modellen vergleichen</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/publier">/publier</Link></td><td className="pr-2">Promptagogen</td><td>Einen Tutor erstellen (geführte Vorlage, Varianten mit Herkunft)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2">/p/essai/[Link]</td><td className="pr-2">Promptagogen + Gäste</td><td>Werkstatt eines Entwurfs: lesen, bearbeiten, testen, einreichen</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/verifier">/verifier</Link></td><td className="pr-2">Autoren, Lehrpersonen, Admins</td><td>Identifikation per E-Mail-Code, ohne Passwort</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/compte">/compte</Link></td><td className="pr-2">Konten</td><td>Meine Daten: Verbrauch, Schlüssel, Gespräche, Tutoren — alles exportieren oder löschen</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/etablissements">/etablissements</Link></td><td className="pr-2">Schulen</td><td>Eigener Leitfaden: Zugang, Kontingente, Abrechnung, Abläufe</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/school">/school</Link></td><td className="pr-2">Schulen</td><td>Chat mit internem Schlüssel, hinter der Lehrpersonen-Entsperrung</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/etablissement">/etablissement</Link></td><td className="pr-2">Schulverantwortliche</td><td>Zeiten, Kontingente und Verbrauch in Selbstverwaltung</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/admin">/admin</Link></td><td className="pr-2">Administration</td><td>Moderation, Schulen, Lehrpersonen, Abrechnung</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/rgpd">/rgpd</Link></td><td className="pr-2">Alle</td><td>Datenschutz (DSGVO/nDSG), in 4 Sprachen</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/tutoriel">/tutoriel</Link></td><td className="pr-2">Alle</td><td>Dieser Leitfaden, in 4 Sprachen</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2">/police</td><td className="pr-2">Lehrpersonen</td><td>Unabhängiges Klassenführungs-Tool (außerhalb des Chats)</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs opacity-60">Die Website existiert auf Französisch, Englisch, Italienisch und Deutsch — der Sprachwähler ist auf der Startseite.</p>
      </Section>
    </>
  );
}
