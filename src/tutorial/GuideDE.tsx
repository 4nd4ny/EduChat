import Link from "next/link";
import React from "react";
import { MdAccountCircle, MdAdminPanelSettings, MdChat, MdCoPresent, MdCompareArrows, MdSchool, MdSettings } from "react-icons/md";
import { DemoButtons, GuidedWalk, Mindmap, Profile, Section, WalkStep } from "./shared";

// EduChat-Leitfaden — DEUTSCHE Version. Folgt exakt der Struktur von GuideFR.

const PROFILES: Profile[] = [
  { color: "#4FC3F7", topic: "Schüler · Besucher", anchor: "#eleves", leaves: [
    ["Tutor auswählen", "#eleves"], ["Chatten (eigener Schlüssel)", "#eleves"],
    ["Favoriten & Bewertungen", "#eleves"], ["Profil exportieren", "#eleves"] ] },
  { color: "#DC6521", topic: "Promptagoge", anchor: "#promptagogues", leaves: [
    ["E-Mail verifizieren", "#promptagogues"], ["Tutor veröffentlichen", "#promptagogues"],
    ["Test per Geheimlink", "#validation"], ["Duell & Varianten", "#promptagogues"] ] },
  { color: "#81C784", topic: "Lehrperson", anchor: "#enseignants", leaves: [
    ["Den Raum öffnen", "#enseignants"], ["Einen Tutor bereitstellen", "#enseignants"],
    ["Tutoren der Schule prüfen", "#enseignants"] ] },
  { color: "#BA68C8", topic: "Schule", anchor: "#etablissement", leaves: [
    ["Schule anmelden", "#etablissement"], ["Guthaben im Voraus", "#etablissement"],
    ["Beitrag selbst wählen", "#etablissement"], ["Ihre Tutoren gehören ihr", "#etablissement"] ] },
  { color: "#FFD54F", topic: "Administrator", anchor: "#pages", leaves: [
    ["Tutoren freigeben", "#validation"], ["Schulen anlegen", "#etablissement"],
    ["Tarife und Rechnungen", "#etablissement"] ] },
];

const WALK: WalkStep[] = [
  {
    title: "Der Katalog, das Herz der Website",
    text: "Die Startseite listet die veröffentlichten sokratischen Tutoren. Suchen, sortieren (empfohlen, meistgenutzt, bestbewertet...), Favoriten setzen (der Stern — Ihre Favoriten rücken nach oben). Jeder Tutor ist ein System-Prompt, der die KI in eine Lehrperson verwandelt, die fragt statt zu antworten.",
    href: "/de", hrefLabel: "Katalog öffnen",
  },
  {
    title: "Die Seite eines Tutors",
    text: "Klicken Sie auf einen Namen, um seine Seite zu lesen: Beschreibung, Statistiken, Bewertungen, Herkunft („inspiriert von“), und der VOLLSTÄNDIGE Text des Prompts — ein Tutor verbirgt seine Regeln nie. Hier bewertet man (1 bis 5 Sterne), kopiert den Link zum Weiterempfehlen und schlägt eine Variante vor.",
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
    text: "Eine Schule meldet sich selbst an: ein Name, die IP-Adressen ihres Netzes, eine Rechnungsadresse. Ihr Guthaben startet bei null, und eine Aufladung wird vereinbart, indem sie uns schreibt: Es ist noch kein Zahlungsmittel an die Website angebunden, und heute wird nichts verrechnet. Ist es aufgefüllt, wird jeder Aufruf davon abgezogen, und der Zugang schliesst sich von selbst, sobald das Guthaben erschöpft ist; die Schüler schreiben dann ohne Konto und ohne Schlüssel an die Tutoren. Der Schul-Leitfaden zeigt die Abläufe; der Abschnitt „Schulen“ weiter unten fasst zusammen, was eine Schule selbst regelt.",
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

      <DemoButtons
        titre="Die Führungen"
        chapeau="Jede Schaltfläche öffnet die ECHTE Seite, so wie die betreffende Person sie sieht, und erklärt sie Element für Element. Geschützte Oberflächen erscheinen entsperrt, aber reglos: Dort lässt sich nichts auslösen."
        boutons={[
          { label: "Lernende", note: "der Chat, von der Frage zur Antwort", href: "/chat?tuteur=Socrate&visite=1", color: "#4FC3F7", icon: <MdChat /> },
          { label: "Lehrperson", note: "den Raum öffnen, einen Tutor bereitstellen", href: "/enseignant?visite=1", color: "#81C784", icon: <MdCoPresent /> },
          { label: "Schule", note: "Zeiten, Kontingente, Guthaben", href: "/etablissement?visite=1", color: "#BA68C8", icon: <MdSettings /> },
          { label: "Promptagoge", note: "zwei Tutoren im Duell vergleichen", href: "/duel?visite=1", color: "#DC6521", icon: <MdCompareArrows /> },
          { label: "Meine Daten", note: "was der Server über Sie aufbewahrt", href: "/compte?visite=1", color: "#4DB6AC", icon: <MdAccountCircle /> },
          { label: "Verwaltung", note: "prüfen, abrechnen, Schulen verwalten", href: "/admin-demo?visite=1", color: "#FFD54F", icon: <MdAdminPanelSettings /> },
        ]} />


      <div id="visite" className="mt-8 scroll-mt-6">
        <GuidedWalk steps={WALK}
          labels={{ title: "Geführte Tour", stepAria: "Schritt", prev: "Zurück", next: "Weiter" }} />
      </div>

      <Link href="/etablissements"
        className="mt-8 flex items-center gap-3 rounded-lg border border-[#BA68C8]/40 bg-[#BA68C8]/10 p-4 hover:bg-[#BA68C8]/15">
        <MdSchool className="text-2xl text-[#BA68C8]" />
        <span className="text-sm">
          <b>Vertreten Sie eine Schule, oder sind Sie Lehrperson?</b> Anmeldung der Schule,
          kontofreier Schülerzugang, Verteilen eines Tutors an die Klasse, Zeiten, Guthaben und
          Abrechnung:{" "}
          <span className="underline">zum Schul-Leitfaden →</span>
        </span>
      </Link>

      <Section id="tuteurs" title="Tutoren verwalten: suchen, sortieren, teilen">
        <p dangerouslySetInnerHTML={{ __html: `<b>Suchen</b>: Das Suchfeld der Startseite durchsucht Name und Beschreibung aller veröffentlichten Tutoren. Drei Buchstaben genügen meist.` }} />
        <p dangerouslySetInnerHTML={{ __html: `<b>Sortieren</b>: „Empfohlen“ mischt Beliebtheit, Bewertungen und Aktualität, damit ein guter neuer Tutor nicht von einem alten verdrängt wird. Die übrigen Sortierungen sind roh — meistgenutzt, bestbewertet, neueste, grösster Tokenverbrauch oder alphabetisch. Ihre Favoriten stehen immer oben und gehen nur Sie etwas an: Sie leben in Ihrem Browser.` }} />
        <p dangerouslySetInnerHTML={{ __html: `<b>Mit der Gemeinschaft teilen</b>: „Einen Tutor vorschlagen“ startet von einer sokratischen Vorlage. Der Entwurf entsteht mit einer geheimen URL — teilen Sie sie mit Kolleginnen und Kollegen für Rückmeldungen, testen Sie ihn im Chat, dann reichen Sie ihn ein. Ein Administrator oder jede verifizierte Promptagogin / jeder verifizierte Promptagoge veröffentlicht ihn, und er erscheint im Katalog.` }} />
        <p dangerouslySetInnerHTML={{ __html: `<b>Einmal veröffentlicht</b>, wird ein Tutor nie gelöscht: Sie können ihn zurückziehen — er verlässt den Katalog — und ihn später zurückholen, die Zähler bleiben intakt.` }} />
        <p dangerouslySetInnerHTML={{ __html: `<b>Wem ein Tutor gehört</b>: Ein Tutor, der von einem einer Schule zugeordneten Konto aus geschrieben wurde, gehört dieser Schule und bleibt ihren Schülern vorbehalten, solange sie ihn nicht nach aussen teilt. Tutoren ohne Schule — darunter die ursprünglichen — bilden den Katalog der Plattform, für alle sichtbar. Der Abschnitt „Schulen“ weiter unten beschreibt beide Türen.` }} />
        <p dangerouslySetInnerHTML={{ __html: `<b>„Eine Variante vorschlagen“</b> kopiert von jeder Seite aus den bestehenden Prompt und vermerkt die Abstammung „inspiriert von“ auf beiden Seiten: der normale Weg der Personalisierung.` }} />
      </Section>

      <Section id="eleves" title="Schüler und Besucher — lernen">
        <ul className="list-inside list-disc space-y-1">
          <li><b>Tutor auswählen</b> im <Link className="underline" href="/">Katalog</Link>: Suche, Sortierungen, Detailseite mit vollständigem Prompt.</li>
          <li><b>Ausprobieren</b>: Der Chat öffnet sich mit dem Tutor am Steuer; auf der öffentlichen Website treibt Ihr <b>eigener API-Schlüssel</b> (nie gespeichert, ausser auf Ihren Wunsch) das Gespräch an, mit Anbieter und Denktiefe Ihrer Wahl. Die Antworten kommen <b>live</b>, während sie entstehen.</li>
          <li><b>Anhänge</b> (eigener Schlüssel): Hängen Sie ein <b>Bild oder PDF</b> an Ihre Frage an, je nach gewähltem Anbieter.</li>
          <li><b>Sprachchat</b> (eigener Schlüssel, kompatible Anbieter): Diktieren Sie Ihre Frage ins Mikrofon — der Sprachmodus liest Antworten laut vor. Praktisch auf dem Smartphone.</li>
          <li><b>Favoriten</b> (Stern) und <b>Bewertungen</b> (1-5): im Browser gespeichert; Favoriten rücken im Katalog nach oben.</li>
          <li><b>Anonyme Kommentare</b> auf jeder Seite: Hinterlassen Sie eine Rückmeldung — sie erscheint nach Freigabe durch den Autor des Tutors oder die Administration.</li>
          <li><b>Verlauf</b>: Ihre Gespräche bleiben im Browser. Umbenennen, Löschen, Export jedes Gesprächs (.md + .json) und <b>Export des vollständigen Profils</b> (Gespräche + Favoriten + Bewertungen), per Drag-and-drop anderswo reimportierbar.</li>
          <li><b>Token-Zähler</b>: Der Gesamtverbrauch erscheint unter dem Eingabefeld und im Tab-Titel.</li>
          <li><b>Über eine Schule</b>: Auf <Link className="underline" href="/school">/school</Link> weder Konto noch Schlüssel — der Schlüssel der Schule treibt das Gespräch an, innerhalb der Zeiten und Kontingente, die sie festgelegt hat. Aus dem Netz der eigenen Schule zeigt <Link className="underline" href="/etablissement">/etablissement</Link> direkt deren Namen und die Tutoren, die sie ihren Schülern öffnet.</li>
          <li><b>Datenschutz</b>: im Detail auf <Link className="underline" href="/rgpd">der Datenschutzseite</Link> — Schüler haben nie ein Konto.</li>
        </ul>
      </Section>

      <Section id="enseignants" title="Lehrpersonen — die Klasse">
        <p>Der Lehrpersonen-Bereich auf <Link className="underline" href="/enseignant">/enseignant</Link> verlangt ein verifiziertes Konto und spricht nur von dem Raum, in dem Sie stehen. Die alte Adresse /session führt weiterhin dorthin.</p>
        <ul className="list-inside list-disc space-y-1">
          <li><b>Den Raum öffnen</b>: Das Raumpasswort entsperrt den Schlüssel der Schule für alle, die aus dem Schulnetz verbunden sind, für die von Ihnen gewählte Dauer. Kein Schüler braucht ein Konto oder einen Schlüssel. Sie können vorzeitig wieder schliessen.</li>
          <li><b>Einen Tutor bereitstellen</b>: Der gewählte Tutor erscheint bei jedem Schüler im Raum vorausgewählt, mit oder ohne Websuche. Sie können auch die Anbieter der Lektion einschränken; alle abzuwählen ist eine legitime Wahl, und sie schliesst — der Schlüssel der Schule bedient dann nichts mehr. Der Filter gilt nur für diesen Schlüssel: Wer den eigenen mitbringt, hängt nicht davon ab.</li>
          <li><b>Die Lektion gilt dem Raum, nicht Ihrem Konto</b>: Sie wird an der IP-Adresse des Netzes erkannt. Eine Lehrperson, die an einer anderen Schule unterrichtet, öffnet dort den Raum jener Schule und nicht den ihrer eigenen.</li>
          <li><b>Tutoren der Schule prüfen</b>: Von Kolleginnen und Kollegen vorgeschlagene Tutoren und die auf diesen Seiten hinterlassenen Kommentare werden hier moderiert. Offen für die Administratoren der Schule und für jede Lehrperson, deren Hauptschule sie ist — jene, die eine Administration ihr zugewiesen hat. Der Administratorenrang ist nicht nötig: den Tutor einer Kollegin freizugeben ist eine Handlung des Unterrichtens.</li>
          <li><b>Mehrere Schulen</b>: Ein Konto kann an mehreren Schulen unterrichten. Eine Auswahl oben auf der Seite sagt, von welcher die Rede ist — Moderation und Schulbereich folgen ihr.</li>
        </ul>
      </Section>

      <Section id="etablissement" title="Schulen — die Schule bei sich">
        <p><b>Warum es diese Website gibt.</b> Eine Schule kann bei einem KI-Anbieter keinen API-Vertrag abschliessen: Dafür braucht es eine Firmenkarte, eine nutzungsabhängige Zahlung und eine Rechnung in Dollar. Eine Rechnung per Überweisung zu begleichen, kann sie hingegen sehr wohl. Das Hindernis liegt im Zahlungsmittel, nicht im Budget: EduChat unterzeichnet diesen Vertrag an ihrer Stelle und stellt sich zwischen die Schule und die Anbieter.</p>
        <p><b>Sich selbst anmelden.</b> Auf <Link className="underline" href="/etablissement">/etablissement</Link>, mit einer verifizierten E-Mail-Adresse: ein Name, die IP-Adressen des Schulnetzes, eine Rechnungsadresse. Niemand muss uns schreiben, um zu beginnen. Das Guthaben startet bei null, und das Formular sagt es vor der Unterschrift: Über den Schlüssel der Schule läuft nichts, solange es nicht aufgefüllt ist.</p>
        <p><b>Die Startseite der Schule.</b> /etablissement ist keine verschlossene Tür mehr. Wer aus dem Netz seiner Schule kommt, sieht dort deren Namen und die Tutoren, die sie ihm öffnet, ohne Konto und ohne Passwort. Aus einem Netz, das niemand angemeldet hat, bietet die Seite stattdessen an, eine Schule anzumelden.</p>
        <p><b>Das Guthaben im Voraus.</b> Die Schule zahlt einen Betrag ein; jeder Aufruf über den Schlüssel der Plattform wird zum Tagestarif davon abgezogen, und der Zugang schliesst sich von selbst, sobald das Guthaben erschöpft ist. Geprüft wird vor dem Aufruf: Eine bereits begonnene Antwort wird bezahlt, die Überschreitung ist also durch eine Antwort begrenzt. Der Bildschirm zeigt den Saldo, die Ausgaben der letzten dreissig Tage, die geschätzte Reichweite in Tagen, die vorgeschlagene Aufladung und den datierten Verlauf der Bewegungen — Aufladung, Verbrauch, Korrektur. <b>Heute wird noch nichts verrechnet</b>: Es ist kein Zahlungsmittel an die Website angebunden, und eine Aufladung wird vereinbart, indem Sie uns schreiben. In der Zwischenzeit kann jede und jeder den eigenen KI-Schlüssel mitbringen.</p>
        <p><b>Der Beitrag an die Kosten, von der Schule gewählt.</b> Zum Verbrauch kommt ein Beitrag an die Betriebskosten, und die Schule legt den Satz selbst fest, zwischen 3,5 und 10 %, mit einem Schieberegler. Die Untergrenze deckt nur die Zahlungsgebühren: Auf dieser Höhe bezahlt die Plattform den Server aus eigener Tasche. Solange eine Schule nichts gewählt hat, gilt die Einstellung der Website.</p>
        <p><b>Die Tutoren einer Schule gehören ihr.</b> Ein Tutor, der von einem der Schule zugeordneten Konto aus geschrieben wurde, ist ihr zugeordnet und ist nicht von vornherein öffentlich: Einen Tutor für die eigenen Schüler zu schreiben soll nicht heissen, ihn für die ganze Welt zu veröffentlichen. Die Schule öffnet ihn nach aussen, Tutor für Tutor. Umgekehrt entscheidet sie auch, ob ihre Schüler die öffentlichen Tutoren anderer Schulen sehen — geschlossen, solange sie es nicht öffnet. Der Katalog der Plattform bleibt in jedem Fall sichtbar.</p>
        <p><b>Was die Schule einstellt, und wer es einstellt.</b> Zeiten des freien Zugangs, ein tägliches Kontingent pro Schüler, eine monatliche Token-Obergrenze und der Verbrauch des Monats nach Anbieter. Jede zugeordnete Lehrperson liest diesen Bildschirm; nur eine Administratorin der Schule ändert etwas daran, und die Seite sagt es, statt es entdecken zu lassen. IP-Adressen und Abrechnungsstatus bleiben in der Hand der Website.</p>
        <p><b>Die Konten und die Rechnung.</b> Eine Kollegin tritt der Schule bei, indem sie ihre E-Mail-Adresse aus dem Schulnetz bestätigt: Niemand muss sie von Hand eintragen, und sie kommt ohne Administrationsrechte. Eine Schuladministration erkennt sie danach als Lehrperson an, ernennt weitere Administratoren derselben Schule und bestätigt die Volljährigkeit eines Kontos — nie die eigene. Ein Konto einer Schule zuzuordnen oder es zu verschieben bleibt in der Hand der Website. Sie ergänzt zudem die administrativen Angaben der Rechnung — genaue Adresse, interne Referenz oder Bestellnummer, freie Notiz. Keine dieser Angaben geht in die Berechnung ein: Der Betrag bleibt jener des Guthabens. Die Rechnung eines Monats öffnet sich als druckbare Seite auf <Link className="underline" href="/facture">/facture</Link>.</p>
        <p><b>Ausgeschlossene Anbieter.</b> Nach der europäischen KI-Verordnung werden Grok, Gemini und die chinesischen Anbieter in der öffentlichen Oberfläche nicht angeboten, und der Schlüssel einer Schule lehnt sie ab. Sie kehren nur für ein Konto zurück, dessen Volljährigkeit bestätigt wurde, und nie aus einem Schulnetz. OpenRouter trägt ein Warnzeichen: Er bleibt zugänglich, wird aber nie von einer Schule bezahlt.</p>
        <p><b>Bei den Daten bleiben wir genau.</b> Der kostenpflichtige API-Vertrag garantiert, dass die Gespräche nicht dem Training der Modelle dienen, doch sie bleiben rund dreissig Tage beim Anbieter, zur Missbrauchsbekämpfung. „Keine Daten aufbewahrt“ zu schreiben wäre falsch — und ein falsches Versprechen ist genau das, was eine Schule am Tag einer Kontrolle ins Unrecht setzt. <Link className="underline" href="/rgpd">Die Datenschutzseite</Link> führt es aus, <Link className="underline" href="/etablissements">der Schul-Leitfaden</Link> zeigt die Abläufe, und <Link className="underline" href="/assistance">die Support-Seite</Link> — ohne Konto lesbar — nennt die Adresse eines Menschen sowie das, was ein in der Schule aufgestellter Server bedeuten würde.</p>
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
          <li><b>Zurückgezogen</b>: aus dem Katalog entfernt, aber erhalten — Autor oder Administration können ihn <b>wieder veröffentlichen</b>, die Administration ihn <b>archivieren</b> — zum Überarbeiten muss er zuerst wieder veröffentlicht werden (dauerhaft aus der Admin-Oberfläche ausgeblendet, aber in der Datenbank erhalten: nichts wird je gelöscht, die Verbrauchsstatistiken bleiben exakt).</li>
        </ul>
      </Section>

      <Section id="classement" title="Wie die besten Tutoren hervorgehoben werden">
        <p>Die Standardsortierung „<b>Empfohlen</b>“ berechnet in der Datenbank eine Punktzahl für jeden veröffentlichten Tutor:</p>
        <p className="overflow-x-auto rounded bg-tertiary p-3 font-mono text-xs">
          Punktzahl = Nutzungen + 5 × Bewertungsdurchschnitt + 50 / (1 + Alter in Tagen)
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li><b>Nutzungen</b> — jedes mit dem Tutor begonnene Gespräch zählt: echte Beliebtheit fällt ins Gewicht.</li>
          <li><b>5 × Bewertungsdurchschnitt</b> — die wahrgenommene Qualität (1-5 Sterne) wiegt bis zu 25 Punkte: Ein hervorragender, aber junger Tutor kann einen alten, mittelmässig geschätzten überholen.</li>
          <li><b>50 / (1 + Alter)</b> — ein Frische-Bonus, stark in den ersten Tagen, dann abnehmend: Neue Tutoren bekommen ihre Chance, gesehen zu werden — die zuerst Veröffentlichten monopolisieren die Spitze nicht („Schneeball-Effekt“).</li>
        </ul>
        <p>Die anderen Sortierungen sind direkte Datenbankspalten: <b>meistgenutzt</b> (Nutzungen), <b>bestbewertet</b> (Durchschnitt, bei Gleichstand entscheidet die Anzahl), <b>neueste</b> (Erstellungsdatum), <b>generierte Tokens</b> (produziertes Volumen), <b>Name</b> (alphabetisch). Und Ihre <b>Favoriten</b> — rein lokal — sind immer oben angeheftet, in der Reihenfolge der gewählten Sortierung.</p>
      </Section>

      <Section id="donnees" title="Was gespeichert wird — und wo">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="uppercase opacity-60">
              {/* « Datum » signifierait la date pour un lecteur germanophone : la
                  colonne liste des données, d'où « Daten ». */}
              <tr><th className="py-1 pr-2">Daten</th><th className="pr-2">Wo</th><th>Detail</th></tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Gespräche, eigener API-Schlüssel, Favoriten, vergebene Bewertungen, Anhänge</td><td className="pr-2"><b>Ihr Browser</b></td><td>Nie auf dem Server (Anhänge werden nur an den Anbieter weitergereicht). Der persönliche Schlüssel wird in DIESEM Browser aufbewahrt, damit Sie ihn nicht neu eintippen müssen — siehe <Link className="underline" href="/rgpd">die Datenschutzseite</Link>. Zwei Ausnahmen: die Profilsicherung für Konten und der auf Wunsch serverseitig gespeicherte Schlüssel.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Sokratische Tutoren</td><td className="pr-2">Datenbank</td><td>Volltext, aufeinanderfolgende Versionen, Herkunft („inspiriert von“), Status, die besitzende Schule, falls es eine gibt, und ob sie ihn nach aussen geteilt hat, automatische Übersetzungen in die drei anderen Sprachen samt der Quellversion, aus der sie stammen, anonyme Zähler (Nutzungen, generierte Tokens, Summe und Anzahl der Bewertungen).</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Promptagogen- / Lehrpersonen-Konto</td><td className="pr-2">Datenbank</td><td>Öffentlicher Name, E-Mail (nie angezeigt), Rollen, Sync-Option und die <b>Schulen, zu denen das Konto gehört</b> — mehrere sind möglich, mit dem Administrationsrecht Zuordnung für Zuordnung und einer Hauptschule. Wer seine Adresse aus dem Netz einer Schule verifiziert, wird ihr zugeordnet, <b>ohne jedes Administrationsrecht</b>. Der Verbrauch über den Schlüssel einer Schule hält die E-Mail der Lehrperson fest, die den Raum geöffnet hat. <b>Es existiert kein Passwort.</b></td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Schulen & Verbrauch</td><td className="pr-2">Datenbank</td><td>Name, IP-Adressen des Netzes, Zeiten des freien Zugangs, Kontingente, der von der Schule gewählte Beitragssatz, Rechnungsadresse, ob der Katalog der anderen Schulen geöffnet ist, und das Verbrauchsprotokoll pro Schul-IP — keine personenbezogenen Schülerdaten. Im Detail im <Link className="underline" href="/etablissements#donnees">Schul-Leitfaden</Link>.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Guthaben und Rechnungen</td><td className="pr-2">Datenbank</td><td>Der Saldo jeder Schule und das datierte Register all ihrer Bewegungen: Aufladung, Verbrauch oder Korrektur, vorzeichenbehafteter Betrag, Saldo danach und wer sie ausgelöst hat. Eine ausgestellte Rechnung friert ihren Betrag ein, damit eine Tarifänderung die Vergangenheit nicht umschreibt; die administrativen Angaben, die eine Schule ergänzt, leben getrennt davon, damit eine erneute Ausstellung sie nie löscht.</td></tr>
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
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/compte">/compte</Link></td><td className="pr-2">Konten</td><td>DAS KONTO: Verbrauch, Schlüssel, Gespräche, Tutoren — alles exportieren oder löschen</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/enseignant">/enseignant</Link></td><td className="pr-2">Lehrpersonen</td><td>DIE KLASSE: den Raum öffnen, einen Tutor bereitstellen, die Tutoren der eigenen Schule prüfen (die alte Adresse /session führt dorthin)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/school">/school</Link></td><td className="pr-2">Schüler einer Schule</td><td>Chat mit dem Schlüssel der Schule, hinter der Lehrpersonen-Entsperrung</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/etablissement">/etablissement</Link></td><td className="pr-2">Schulen</td><td>DIE SCHULE: Startseite für alle, die aus ihrem Netz kommen, Anmeldung einer Schule und — für ihre Administratoren — Zeiten, Kontingente, Guthaben, Konten, Tutoren und Rechnung</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/etablissements">/etablissements</Link></td><td className="pr-2">Schulen</td><td>Eigener Leitfaden: Zugang, Kontingente, Abrechnung, Abläufe</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/facture">/facture</Link></td><td className="pr-2">Schulen, Website</td><td>Die Rechnung eines Monats als druckbare Seite (ohne Konto leer)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/assistance">/assistance</Link></td><td className="pr-2">Alle</td><td>Kontakt, und was ein in der Schule aufgestellter Server bedeuten würde — ohne Konto lesbar</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/admin">/admin</Link></td><td className="pr-2">Super-Administratoren</td><td>DIE PLATTFORM: Schulen anlegen, Tarife, offene Rechnungen, das Guthaben aller Schulen, die Modell-Leiter. Ihre Liste lebt in der Serverkonfiguration — keine Oberfläche legt einen an</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/admin-demo">/admin-demo</Link></td><td className="pr-2">Alle</td><td>Schaufenster der Verwaltung, vollständig erfunden: keine echten Daten</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/rgpd">/rgpd</Link></td><td className="pr-2">Alle</td><td>Datenschutz (DSGVO/nDSG), in 4 Sprachen</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/tutoriel">/tutoriel</Link></td><td className="pr-2">Alle</td><td>Dieser Leitfaden, in 4 Sprachen</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2">/police</td><td className="pr-2">Lehrpersonen</td><td>Unabhängiges Klassenführungs-Tool (ausserhalb des Chats)</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs opacity-60">Die Website existiert auf Französisch, Englisch, Italienisch und Deutsch — der Sprachwähler ist auf der Startseite.</p>
      </Section>
    </>
  );
}
