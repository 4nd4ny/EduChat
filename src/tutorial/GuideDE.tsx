import Link from "next/link";
import React from "react";
import { MdAccountCircle, MdAdminPanelSettings, MdChat, MdCoPresent, MdCompareArrows, MdSchool, MdSettings } from "react-icons/md";
import { DemoButtons, GuidedWalk, Mindmap, Profile, Section, WalkStep } from "./shared";

// EduChat-Leitfaden — DEUTSCHE Version. Folgt exakt der Struktur von GuideFR.

const PROFILES: Profile[] = [
  { color: "#4FC3F7", topic: "Schüler · Besucher", anchor: "#eleves", leaves: [
    ["Tutor auswählen", "#eleves"], ["Demo oder eigener Schlüssel", "#acces"],
    ["Favoriten & Bewertungen", "#eleves"], ["Profil exportieren", "#eleves"] ] },
  { color: "#DC6521", topic: "Promptagoge", anchor: "#promptagogues", leaves: [
    ["E-Mail verifizieren", "#promptagogues"], ["Tutor veröffentlichen", "#promptagogues"],
    ["Test per Geheimlink", "#validation"], ["Duell & Varianten", "#promptagogues"] ] },
  { color: "#81C784", topic: "Lehrperson", anchor: "#enseignants", leaves: [
    ["Den Raum öffnen", "#enseignants"], ["Einen Tutor bereitstellen", "#enseignants"],
    ["Tutoren der Schule prüfen", "#enseignants"] ] },
  { color: "#BA68C8", topic: "Schule", anchor: "#etablissement", leaves: [
    ["Schule anmelden", "#etablissement"], ["Guthaben im Voraus", "#etablissement"],
    ["Beitrag bei der Aufladung", "#etablissement"], ["Ihre Tutoren gehören ihr", "#etablissement"] ] },
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
    text: "„Ausprobieren“ öffnet den Chat mit diesem Tutor am Steuer (Banner oben). Ohne Konto antwortet die kostenlose Demo: ein kleines Modell, von uns gewählt und fest vorgegeben — genug, um einen Tutor zu beurteilen. Mit einem verifizierten Konto öffnet Ihr eigener API-Schlüssel (Feld „Eigener Schlüssel“) alle Anbieter — ausserhalb eines Schulnetzes; in diesem Netz gilt die Regel der Schule für alle, ausser in dem weiter unten beschriebenen Fall. Er bleibt auf der Seite, wird nur auf Wunsch gemerkt und schaltet die Anhänge (Bilder, PDF) frei; das Diktat dagegen zahlt auch der Schlüssel der Schule, solange dieser bedient. Die Antworten erscheinen dann live, während sie entstehen, bei den Anbietern, die das können (Gemini antwortet am Stück); jene der kostenlosen Demo kommen dagegen immer am Stück, wenn sie fertig geschrieben sind.",
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
    // CORRIGÉ, comme le paragraphe « Das Guthaben im Voraus. » plus bas : ce
    // résumé promettait encore « le prix exact du fournisseur ». Le décompte
    // retombe toujours sur prix_mtok (porteMonnaie.ts:80-91), un prix UNIQUE
    // appliqué à l'entrée comme à la sortie, et ce prix est saisi à la main
    // par le super-administrateur (api/admin/tarifs.ts:114-129). Formulation
    // reprise du guide de référence, GuideFR.
    title: "Vertreten Sie eine Schule?",
    text: "Eine Schule meldet sich selbst an: ein Name, die IP-Adressen ihres Netzes, eine Rechnungsadresse. Ihr Guthaben startet bei null, und eine Aufladung wird vereinbart, indem sie uns schreibt: Es ist noch kein Zahlungsmittel an die Website angebunden, und heute wird nichts verrechnet. Ist es aufgefüllt, wird jeder Aufruf ohne die geringste Marge auf die Inferenz davon abgezogen, zu dem Preis je Million Jetons, den die Administration der Website für diesen Anbieter eingetragen hat — der Beitrag der Schule, 3,5 bis 10 % nach ihrer eigenen Wahl, wird einmalig bei der Aufladung einbehalten. Der Zugang schliesst sich von selbst, sobald das Guthaben erschöpft ist; die Schüler schreiben ohne Konto und ohne Schlüssel an die Tutoren. Der Schul-Leitfaden zeigt die Abläufe; der Abschnitt „Schulen“ weiter unten fasst zusammen, was eine Schule selbst regelt.",
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
          <li><b>Ausprobieren</b>: Der Chat öffnet sich mit dem Tutor am Steuer. <b>Ohne Konto</b> antwortet die <b>kostenlose Demo</b> — ein kleines, fest vorgegebenes Modell, genug, um einen Tutor zu beurteilen. <b>Mit einem verifizierten Konto</b> treibt Ihr <b>eigener API-Schlüssel</b> (nie gespeichert, ausser auf Ihren Wunsch) das Gespräch an, beim Anbieter Ihrer Wahl. Die Antworten kommen dann <b>live</b>, während sie entstehen, bei den Anbietern, die das können (Gemini antwortet am Stück); jene der kostenlosen Demo kommen ebenfalls am Stück, wenn sie fertig geschrieben sind. Die vier Fälle stehen <a className="underline" href="#acces">etwas weiter unten</a>.</li>
          <li><b>Anhänge</b> (Konto + eigener Schlüssel): Hängen Sie ein <b>Bild oder PDF</b> an Ihre Frage an, je nach gewähltem Anbieter.</li>
          <li><b>Sprachchat</b> (Anbieter mit Transkription: Mistral und ChatGPT): Diktieren Sie Ihre Frage ins Mikrofon — der Sprachmodus liest Antworten laut vor. Praktisch auf dem Smartphone. Das <b>Diktat</b> zahlt ein Schlüssel, der zahlen kann: Ihrer, oder <b>jener der Schule, solange er bedient</b> — eine Klasse muss also keinen mitbringen. Das <b>Vorlesen</b> dagegen ist die Sprachausgabe des Browsers: kein Schlüssel, keine Kosten, nichts wird gesendet. Die Anhänge bleiben im Gegensatz dazu streng dem eigenen Schlüssel vorbehalten.</li>
          <li><b>Favoriten</b> (Stern) und <b>Bewertungen</b> (1-5): im Browser gespeichert; Favoriten rücken im Katalog nach oben.</li>
          <li><b>Anonyme Kommentare</b> auf jeder Seite: Hinterlassen Sie eine Rückmeldung — sie erscheint nach Freigabe durch den Autor des Tutors oder die Administration.</li>
          <li><b>Verlauf</b>: Ihre Gespräche bleiben im Browser. Umbenennen, Löschen, Export jedes Gesprächs (.md + .json) und <b>Export des vollständigen Profils</b> (Gespräche + Favoriten + Bewertungen), per Drag-and-drop anderswo reimportierbar.</li>
          <li><b>Token-Zähler</b>: Der Gesamtverbrauch erscheint unter dem Eingabefeld und im Tab-Titel.</li>
          <li><b>Über eine Schule</b>: Auf <Link className="underline" href="/school">/school</Link> weder Konto noch Schlüssel — der Schlüssel der Schule treibt das Gespräch an, innerhalb der Zeiten und Kontingente, die sie festgelegt hat. Aus dem Netz der eigenen Schule zeigt <Link className="underline" href="/etablissement">/etablissement</Link> direkt deren Namen und die Tutoren, die sie ihren Schülern öffnet.</li>
          <li><b>Datenschutz</b>: im Detail auf <Link className="underline" href="/rgpd">der Datenschutzseite</Link> — Schüler haben nie ein Konto.</li>
        </ul>
      </Section>

      <Section id="acces" title="Welcher KI-Anbieter, für wen">
        <p><b>Zwei Fragen, und nur zwei.</b> Was Ihnen die Anbieterliste anbietet, hängt davon ab, von wo Sie aufrufen — aus dem Netz einer Schule oder von irgendwo sonst — und ob Sie ein Konto haben. Vier Fälle also, und kein einziger mehr.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="uppercase opacity-60">
              <tr><th className="py-1 pr-2">Sie rufen auf…</th><th className="pr-2">Ohne Konto</th><th>Mit verifiziertem Konto</th></tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2"><b>Von überall</b> (zu Hause, Handy, Café)</td><td className="pr-2">Die kostenlose Demo, und sonst nichts.</td><td>Alle Anbieter, mit Ihrem eigenen Schlüssel.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2"><b>Aus einem Schulnetz</b></td><td className="pr-2">Die konformen Anbieter, die die Schule zulässt, auf ihrem Schlüssel.</td><td>Jene der Schule — ausser Sie haben eigene Mittel hinterlegt (einen mit dem Konto verknüpften Schlüssel oder ein persönliches Guthaben): dann alle.</td></tr>
            </tbody>
          </table>
        </div>
        <p><b>Die kostenlose Demo.</b> Ohne Konto und ausserhalb einer Schule antwortet die Website mit einem kleinen kostenlosen Modell, das wir wählen: Der angezeigte Anbieter ist nur ein Vermittler, das Modell ist fest vorgegeben, Websuche und Anhänge gibt es dort nicht. Es reicht, um drei Fragen zu stellen und zu sehen, was ein sokratischer Tutor ist. Nichts Persönliches gehört in eine öffentliche Demo — <Link className="underline" href="/rgpd">die Datenschutzseite</Link> sagt es bereits, und hier gilt es mehr als anderswo.</p>
        <p><b>Was ein Konto ändert.</b> Ausserhalb einer Schule öffnet ein verifiziertes Konto die ganze Liste, mit Ihrem eigenen Schlüssel: Sie sind identifizierbar, Sie bezahlen Ihre Aufrufe, Sie stehen dafür ein. Die drei gehören zusammen, und darum genügt ein Schlüssel, den eine anonyme Besucherin einfügt, nicht mehr: Es gibt niemanden, den man zur Rede stellen könnte. Die Verifizierung dauert dreissig Sekunden auf <Link className="underline" href="/verifier">/verifier</Link>: ein Name, eine Adresse, ein sechsstelliger Code — und <b>nie ein Passwort</b>. Dieselbe E-Mail trägt den Code auch als <b>Link</b>: Ein Klick öffnet das Konto, ohne dass Sie etwas abtippen. Code und Link gelten fünfzehn Minuten und ein einziges Mal — ein neu angeforderter Code lässt den vorherigen Link verfallen.</p>
        <p><b>Im Netz einer Schule.</b> Dort steht die Schule für ihre Schüler ein, und ihre Regel gilt für alle, mit oder ohne Konto: Angeboten werden nur die konformen Anbieter, und der Schlüssel der Schule bezahlt die übrigen nie. Eine Ausnahme: ein Konto, das <b>vor dem Kommen eigene Mittel hinterlegt</b> hat — einen mit dem Konto verknüpften Schlüssel oder ein persönliches Guthaben. Es erhält die ganze Liste zurück; was eine erwachsene Person selbst bezahlt, geht die Schule nichts an. Ein Schlüssel, der vor Ort einfach ins Feld getippt wird, hebt nichts auf: Sonst würde ein in einem Forum gefundener Schlüssel im Klassenzimmer wieder öffnen, was die Schule ausgeschlossen hat.</p>
        {/* AJOUT : le porte-monnaie personnel manquait entièrement à ce guide.
            Trois faits qui ne se lisent nulle part ailleurs et qu'on ne peut
            pas séparer — le taux ET son forfait (3,5 % seul serait faux dès la
            recharge minimale), ce que le crédit N'ouvre PAS (la clé d'EduChat
            refuse les écartés quel que soit le payeur), et le fait que la
            recharge n'est pas branchée aujourd'hui. */}
        <p><b>Das persönliche Guthaben.</b> Ein Konto kann auf <Link className="underline" href="/compte">/compte</Link> auch bei EduChat Jetons kaufen, statt einen eigenen Schlüssel mitzubringen: Der Aufruf läuft dann über den Schlüssel der Plattform und wird zum Selbstkostenpreis vom Guthaben abgezogen, ohne Marge. Einbehalten wird einmalig bei der Aufladung, zum Satz von 3,5 % — dem Satz, der nur die Zahlungsgebühren deckt, und für den es keinen Schieberegler gibt —, <b>nie jedoch weniger als 0.50 je Aufladung</b>: Auf der kleinsten Aufladung von 5 sind das 10 %, und der Auszug nennt, welcher der beiden gegriffen hat. Was dieses Guthaben <b>nicht</b> kauft: die ausgeschlossenen Anbieter und die mit Warnzeichen. Der Schlüssel von EduChat bedient sie keinem Zahler — dafür braucht es weiterhin den eigenen Schlüssel. Wer nie aufgeladen hat, behält die kostenlose Demo; wer aufgeladen und aufgebraucht hat, erfährt es und wird nicht stillschweigend zurückgestuft. <b>Aufladen ist heute nicht möglich</b>: Wie bei den Schulen ist kein Zahlungsmittel an die Website angebunden. Die Schaltfläche zum Aufladen steht da und antwortet, dass der Dienst geschlossen ist; für die Rückerstattung eines Saldos erscheint gar keine Schaltfläche.</p>
        <p><b>Was verschwunden ist, und warum.</b> Früher musste man seine Volljährigkeit „bestätigen“ lassen, um die ausgeschlossenen Anbieter zu erreichen. Doch ein Schüler, der sein Telefon auf Mobilfunk umschaltete, verliess das Schulnetz und bekam alles: Die Einschränkung liess sich mit einer Handbewegung umgehen, und eine Einschränkung, die eine Handbewegung umgeht, ist kein Schutz, sondern Kulisse — eine Kulisse, die an Komplexität kostete, was sie an Sicherheit nicht einbrachte. Die Bestätigung wurde deshalb von der Website entfernt: das Kästchen, das Feld und die Textstellen, die davon sprachen. Was wirklich schützt, ist das Schulnetz, wo eine minderjährige Person in der Verantwortung der Institution steht; das ist die Zusage, die EduChat einer Schulleitung gibt, und sie hat sich nicht verändert.</p>
      </Section>

      <Section id="enseignants" title="Lehrpersonen — die Klasse">
        <p>Der Lehrpersonen-Bereich auf <Link className="underline" href="/enseignant">/enseignant</Link> verlangt ein verifiziertes Konto und spricht nur von dem Raum, in dem Sie stehen. Die alte Adresse /session führt weiterhin dorthin.</p>
        <ul className="list-inside list-disc space-y-1">
          <li><b>Den Raum öffnen</b>: Das Raumpasswort entsperrt den Schlüssel der Plattform für die von Ihnen gewählte Dauer. <b>Beachten Sie: diese Entsperrung ist nicht auf Ihr Netz begrenzt.</b> Solange sie gilt, antwortet dieser Schlüssel auch jedem verifizierten Konto, von wo auch immer es aufruft — darum wird eine Dauer verlangt, und darum können Sie vorzeitig wieder schliessen. Im Raum wird der Aufruf an der IP des Netzes erkannt und der Schule abgezogen; ausserhalb nicht. Kein Schüler braucht ein Konto oder einen Schlüssel.</li>
          <li><b>Einen Tutor bereitstellen</b>: Der gewählte Tutor erscheint bei jedem Schüler im Raum vorausgewählt, mit oder ohne Websuche. Sie können auch die Anbieter der Lektion einschränken; alle abzuwählen ist eine legitime Wahl, und sie schliesst — der Schlüssel der Schule bedient dann nichts mehr. Der Filter bindet den Schlüssel der Schule <b>und ebenso ein persönliches Guthaben</b>: Selbst zu bezahlen kauft niemanden aus dem heraus, was Sie für Ihre Stunde angekreuzt haben. Nur wer den eigenen Schlüssel mitbringt, hängt nicht davon ab. Im Perimeter der Schule bleibt er dennoch: In diesem Netz öffnet ihm sein Schlüssel nur die konformen Anbieter, sofern er nicht bereits mit seinem Konto verknüpft ist.</li>
          <li><b>Die Lektion gilt dem Raum, nicht Ihrem Konto</b>: Sie wird an der IP-Adresse des Netzes erkannt. Eine Lehrperson, die an einer anderen Schule unterrichtet, öffnet dort den Raum jener Schule und nicht den ihrer eigenen.</li>
          <li><b>Tutoren der Schule prüfen</b>: Von Kolleginnen und Kollegen vorgeschlagene Tutoren und die auf diesen Seiten hinterlassenen Kommentare werden hier moderiert. Offen für die Administratoren der Schule und für jede Lehrperson, deren Hauptschule sie ist — jene, die eine Administration ihr zugewiesen hat. Der Administratorenrang ist nicht nötig: den Tutor einer Kollegin freizugeben ist eine Handlung des Unterrichtens.</li>
          <li><b>Mehrere Schulen</b>: Ein Konto kann an mehreren Schulen unterrichten. Eine Auswahl oben auf der Seite sagt, von welcher die Rede ist — Moderation und Schulbereich folgen ihr.</li>
        </ul>
      </Section>

      <Section id="etablissement" title="Schulen — die Schule bei sich">
        <p><b>Warum es diese Website gibt.</b> Eine Schule kann bei einem KI-Anbieter keinen API-Vertrag abschliessen: Dafür braucht es eine Firmenkarte, eine nutzungsabhängige Zahlung und eine Rechnung in Dollar. Eine Rechnung per Überweisung zu begleichen, kann sie hingegen sehr wohl. Das Hindernis liegt im Zahlungsmittel, nicht im Budget: EduChat unterzeichnet diesen Vertrag an ihrer Stelle und stellt sich zwischen die Schule und die Anbieter.</p>
        <p><b>Sich selbst anmelden.</b> Auf <Link className="underline" href="/etablissement">/etablissement</Link>, mit einer verifizierten E-Mail-Adresse: ein Name, die IP-Adressen des Schulnetzes, eine Rechnungsadresse. Niemand muss uns schreiben, um zu beginnen. Das Guthaben startet bei null, und das Formular sagt es vor der Unterschrift: Über den Schlüssel der Schule läuft nichts, solange es nicht aufgefüllt ist.</p>
        <p><b>Die Startseite der Schule.</b> /etablissement ist keine verschlossene Tür mehr. Wer aus dem Netz seiner Schule kommt, sieht dort deren Namen und die Tutoren, die sie ihm öffnet, ohne Konto und ohne Passwort. Aus einem Netz, das niemand angemeldet hat, bietet die Seite stattdessen an, eine Schule anzumelden.</p>
        {/* CORRIGÉ : la promesse « ouvrez leur tarif, refaites le calcul, vous
            retrouvez notre chiffre » est démentie par le code. Le décompte
            retombe toujours sur prix_mtok — un prix UNIQUE appliqué à l'entrée
            comme à la sortie (les colonnes détaillées ne sont écrites par
            aucune route) —, et ce prix est saisi à la main par le
            super-administrateur : la sonde ne fait que le proposer. La marge
            nulle, elle, reste vraie (decompter appelle coutDe avec pct = 0). */}
        <p><b>Das Guthaben im Voraus.</b> Die Schule zahlt einen Betrag ein; jeder Aufruf über den Schlüssel der Plattform wird <b>zum Selbstkostenpreis</b> davon abgezogen — Anthropic, OpenAI, Mistral —, ohne einen Rappen Aufschlag auf die Inferenz. Der angewandte Preis wird jedoch nicht von selbst beim Anbieter abgeholt: Es ist ein Preis je Million Jetons, den die Administration der Website von Hand einträgt, <b>derselbe für eingehende wie für ausgehende Jetons</b>, dort wo der Katalog eines Anbieters die beiden trennt. Die Preisseite von Anthropic, OpenAI oder Mistral wieder zu öffnen gibt also nicht unsere Zahl auf den Rappen genau; und solange für einen Anbieter kein Preis eingetragen ist, wird überhaupt nichts abgezogen. Eine im Tokenpreis aufgelöste Marge liesse sich schlecht prüfen und gut verdächtigen; deshalb steht dort keine. Geprüft wird vor dem Aufruf: Eine bereits begonnene Antwort wird bezahlt, die Überschreitung ist also durch eine Antwort begrenzt. Der Bildschirm zeigt den Saldo, die Ausgaben der letzten dreissig Tage, die geschätzte Reichweite in Tagen, die vorgeschlagene Aufladung und den datierten Verlauf der Bewegungen — Aufladung, Verbrauch, Korrektur. <b>Heute wird noch nichts verrechnet</b>: Es ist kein Zahlungsmittel an die Website angebunden, und eine Aufladung wird vereinbart, indem Sie uns schreiben. In der Zwischenzeit kann jede und jeder den eigenen KI-Schlüssel mitbringen.</p>
        <p><b>Der Beitrag an die Kosten: bei der Aufladung, und nur einmal.</b> Er kommt nicht mehr zu jedem Token hinzu — er wird von der Einzahlung einbehalten, zu dem Satz, den die Schule mit einem Schieberegler zwischen 3,5 und 10 % gewählt hat, und nie weniger als 0.50 je Aufladung, weil die Inkassogebühren einen festen Anteil haben, den eine kleine Einzahlung nicht decken würde. Eine Aufladung von 100 lässt somit 90 nutzbar bei 10 %, 96.50 bei 3,5 %. Das Register verbucht die beiden Bewegungen getrennt, die Einzahlung und dann den Abzug: Ein Nettosaldo ohne seine Kommissionszeile ist eine Zahl, die niemand nachrechnen kann — und genau das wollen wir vermeiden. Die Untergrenze deckt nur die Zahlungsgebühren: Auf dieser Höhe bezahlt die Plattform den Server aus eigener Tasche. Solange eine Schule nichts gewählt hat, gilt die Einstellung der Website.</p>
        <p><b>Was wir nicht übernommen haben, und der Nebeneffekt.</b> Die Regel stammt von OpenRouter, das auf die Inferenz keine Marge nimmt und stattdessen am Kauf von Guthaben verdient. Zwei ihrer Praktiken blieben draussen: <b>keine Kommission auf eigene Schlüssel</b> — sie zu messen hiesse, die Nutzung eines privaten Schlüssels zu protokollieren, und <Link className="underline" href="/rgpd">die Datenschutzseite</Link> verspricht schwarz auf weiss das Gegenteil; und <b>kein Verfall des Guthabens</b> — bei einem beschlossenen und langsam ausgegebenen Schulbudget wäre das eine Enteignung. Ein Nebeneffekt bleibt, und man liest ihn besser hier, als ihn zu entdecken: Eine Schule, die auflädt und nichts verbraucht, hat den Beitrag umsonst bezahlt. Die Rückerstattung des Saldos ist vorgesehen — sie läuft über das Zahlungsmittel, das noch nicht offen ist — und sie gibt das verbleibende Guthaben zurück, abzüglich der Gebühren, die der Zahlungsdienst nicht zurückgibt; den bereits einbehaltenen Beitrag gibt sie nicht zurück.</p>
        <p><b>Die Tutoren einer Schule gehören ihr.</b> Ein Tutor, der von einem der Schule zugeordneten Konto aus geschrieben wurde, ist ihr zugeordnet und ist nicht von vornherein öffentlich: Einen Tutor für die eigenen Schüler zu schreiben soll nicht heissen, ihn für die ganze Welt zu veröffentlichen. Die Schule öffnet ihn nach aussen, Tutor für Tutor. Umgekehrt entscheidet sie auch, ob ihre Schüler die öffentlichen Tutoren anderer Schulen sehen — geschlossen, solange sie es nicht öffnet. Der Katalog der Plattform bleibt in jedem Fall sichtbar.</p>
        <p><b>Was die Schule einstellt, und wer es einstellt.</b> Zeiten des freien Zugangs, ein tägliches Kontingent pro Schüler, eine monatliche Token-Obergrenze und der Verbrauch des Monats nach Anbieter. Jede zugeordnete Lehrperson liest diesen Bildschirm; nur eine Administratorin der Schule ändert etwas daran, und die Seite sagt es, statt es entdecken zu lassen. Das Guthaben, die Preisleiter, die Rechnung, die Konten und die Tutoren der Schule erscheinen überhaupt nur ihr. Die Preisleiter zeigt die Modelle ihres aktiven Anbieters, Eingang und Ausgang getrennt, in Rechnungswährung, mit dem Datum der Ablesung und einem Link auf den öffentlichen Katalog von OpenRouter, wo diese Preise abgelesen wurden: eine datierte Referenzmessung — nicht die Zahl, die verrechnet wird, und keine Rechnung. IP-Adressen und Abrechnungsstatus bleiben in der Hand der Website.</p>
        <p><b>Die Konten und die Rechnung.</b> Eine Kollegin tritt der Schule bei, indem sie ihre E-Mail-Adresse aus dem Schulnetz bestätigt: Niemand muss sie von Hand eintragen, und sie kommt ohne Administrationsrechte. Eine Schuladministration erkennt sie danach als Lehrperson an und ernennt weitere Administratoren derselben Schule. Ein Konto einer Schule zuzuordnen oder es zu verschieben bleibt in der Hand der Website. Sie ergänzt zudem die administrativen Angaben der Rechnung — genaue Adresse, interne Referenz oder Bestellnummer, freie Notiz. Keine dieser Angaben geht in die Berechnung ein: Der Betrag bleibt jener des Guthabens. Die Rechnung eines Monats öffnet sich als druckbare Seite auf <Link className="underline" href="/facture">/facture</Link>.</p>
        <p><b>Ausgeschlossene Anbieter.</b> Nach der europäischen KI-Verordnung werden Grok, Gemini und die chinesischen Anbieter im Netz einer Schule niemandem angeboten, und der Schlüssel der Schule bezahlt sie nie — für eine Lehrperson so wenig wie für einen Schüler. OpenRouter trägt ein Warnzeichen statt eines Ausschlusses: Er ist nur ein Vermittler zu konformen Modellen und zugleich der Motor der kostenlosen Demo. Das Warnzeichen genügt gleichwohl — im Netz einer Schule erscheint auch er nicht in der angebotenen Liste, unter demselben Vorbehalt, und der Schlüssel der Schule bezahlt ihn nie. Was eine erwachsene Person für sich selbst wählt, mit eigenem Konto und eigenem Schlüssel, läuft nicht über das Guthaben der Schule und verpflichtet sie nicht — der Abschnitt <a className="underline" href="#acces">„Welcher KI-Anbieter, für wen“</a> nennt die vollständige Regel.</p>
        <p><b>Bei den Daten bleiben wir genau.</b> Der kostenpflichtige API-Vertrag garantiert, dass die Gespräche nicht dem Training der Modelle dienen, doch sie bleiben rund dreissig Tage beim Anbieter, zur Missbrauchsbekämpfung. „Keine Daten aufbewahrt“ zu schreiben wäre falsch — und ein falsches Versprechen ist genau das, was eine Schule am Tag einer Kontrolle ins Unrecht setzt. <Link className="underline" href="/rgpd">Die Datenschutzseite</Link> führt es aus, <Link className="underline" href="/etablissements">der Schul-Leitfaden</Link> zeigt die Abläufe, und <Link className="underline" href="/assistance">die Support-Seite</Link> — ohne Konto lesbar — nennt die Adresse eines Menschen sowie das, was ein in der Schule aufgestellter Server bedeuten würde.</p>
      </Section>

      <Section id="promptagogues" title="Promptagogen — einen Tutor erstellen">
        <p>Ein <b>Promptagoge</b> (Prompt + Pädagoge) ist der Autor eines Tutors. Jede und jeder kann es werden:</p>
        <ol className="list-inside list-decimal space-y-2">
          <li><b>Identifizieren Sie sich</b> (optional, aber empfohlen) auf <Link className="underline" href="/verifier">/verifier</Link>: öffentlicher Name + E-Mail, bestätigt durch einen sechsstelligen Code — oder mit einem Klick auf den Link derselben E-Mail. <b>Kein Passwort, niemals.</b> Ohne Konto ist die Veröffentlichung anonym — über die geheime URL testbar und einreichbar, doch die gesamte Moderation (Freigabe, Zurückziehen, Archivieren) liegt dann bei der Administration.</li>
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
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Guthaben und Rechnungen</td><td className="pr-2">Datenbank</td><td>Der Saldo jeder Schule und das datierte Register all ihrer Bewegungen: Aufladung, Verbrauch oder Korrektur, vorzeichenbehafteter Betrag, Saldo danach und wer sie ausgelöst hat. Der bei einer Aufladung einbehaltene Beitrag erscheint dort als eigene Zeile, benannt und datiert, damit sich die Rechnung von Hand nachvollziehen lässt. Eine ausgestellte Rechnung friert ihren Betrag ein, damit eine Tarifänderung die Vergangenheit nicht umschreibt; die administrativen Angaben, die eine Schule ergänzt, leben getrennt davon, damit eine erneute Ausstellung sie nie löscht. Das persönliche Guthaben eines Kontos steht im selben Register, an seine E-Mail-Adresse gebunden — ohne IP, ohne Schule, ohne Lehrperson —, und kein Verwaltungsbildschirm listet diese Guthaben.</td></tr>
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
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/chat">/chat</Link></td><td className="pr-2">Alle</td><td>Der Chat, mit oder ohne Tutor: kostenlose Demo ohne Konto, eigener Schlüssel mit Konto — Streaming, Anhänge, Sprache</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/duel">/duel</Link></td><td className="pr-2">Promptagogen</td><td>2 Tutoren auf 1 Modell oder 1 Tutor auf 2 Modellen vergleichen</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/publier">/publier</Link></td><td className="pr-2">Promptagogen</td><td>Einen Tutor erstellen (geführte Vorlage, Varianten mit Herkunft)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2">/p/essai/[Link]</td><td className="pr-2">Promptagogen + Gäste</td><td>Werkstatt eines Entwurfs: lesen, bearbeiten, testen, einreichen</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/verifier">/verifier</Link></td><td className="pr-2">Autoren, Lehrpersonen, Admins</td><td>Identifikation per E-Mail — sechsstelliger Code oder Klick-Link, ohne Passwort</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/compte">/compte</Link></td><td className="pr-2">Konten</td><td>DAS KONTO: Verbrauch, Schlüssel, persönliches Guthaben (Aufladen noch nicht offen), Gespräche, Tutoren — alles exportieren oder löschen</td></tr>
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
