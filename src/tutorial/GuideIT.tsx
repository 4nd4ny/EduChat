import Link from "next/link";
import React from "react";
import { MdSchool, MdTour } from "react-icons/md";
import { GuidedWalk, Mindmap, Profile, Section, WalkStep } from "./shared";

// Guida di EduChat — versione ITALIANA. Segue esattamente la struttura di GuideFR.

const PROFILES: Profile[] = [
  { color: "#4FC3F7", topic: "Studente · Visitatore", anchor: "#eleves", leaves: [
    ["Scegliere un tutor", "#eleves"], ["Chattare (propria chiave)", "#eleves"],
    ["Preferiti e valutazioni", "#eleves"], ["Esportare il profilo", "#eleves"] ] },
  { color: "#DC6521", topic: "Promptagogo", anchor: "#promptagogues", leaves: [
    ["Verificare l'email", "#promptagogues"], ["Pubblicare un tutor", "#promptagogues"],
    ["Testare via link segreto", "#validation"], ["Duello e varianti", "#promptagogues"] ] },
  { color: "#81C784", topic: "Insegnante", anchor: "/etablissements", leaves: [
    ["Sbloccare /school", "/etablissements"], ["Distribuire alla classe", "/etablissements"],
    ["Account via email", "/etablissements"] ] },
  { color: "#BA68C8", topic: "Istituto", anchor: "/etablissements", leaves: [
    ["Orari self-service", "/etablissements"], ["Quota per studente", "/etablissements"],
    ["Budget mensile", "/etablissements"], ["Percorsi (schemi)", "/etablissements"] ] },
  { color: "#FFD54F", topic: "Amministratore", anchor: "#admin", leaves: [
    ["Approvare i tutor", "#validation"], ["Gestire gli istituti", "/etablissements"],
    ["Fatturare (CSV)", "/etablissements"] ] },
];

const WALK: WalkStep[] = [
  {
    title: "Il catalogo, cuore del sito",
    text: "La home elenca i tutor socratici pubblicati. Cerca, ordina (consigliati, più usati, migliori valutazioni...), aggiungi ai preferiti (la stella — i tuoi preferiti salgono in cima). Ogni tutor è un prompt di sistema che trasforma l'IA in un pedagogo che fa domande invece di dare risposte.",
    href: "/it", hrefLabel: "Apri il catalogo",
  },
  {
    title: "La scheda di un tutor",
    text: "Clicca su un nome per leggere la scheda: descrizione, statistiche, valutazioni, filiazione (« ispirato da »), e il testo INTEGRALE del prompt — tutto è pubblico, la scuola è gratuita. Qui si valuta (da 1 a 5 stelle), si copia il link per consigliare, e si propone una variante.",
    href: "/it/p/Socrate", hrefLabel: "Vedi la scheda di Socrate",
  },
  {
    title: "Provare un tutor",
    text: "« Prova » apre la chat con quel tutor al comando (barra in alto). Sul sito pubblico, inserisci la tua chiave API personale (campo « Chiave personale »): resta nella pagina — memorizzata solo su tua richiesta — e sblocca allegati (immagini, PDF) e chat vocale. Le risposte arrivano in diretta, durante la generazione.",
    href: "/it/chat?tuteur=Socrate", hrefLabel: "Prova Socrate",
  },
  {
    title: "Proporre il proprio tutor",
    text: "Il modulo « Proponi un tutor » parte da un modello socratico: dai un nome proprio unico, una descrizione, adatta le regole. Puoi pubblicare a tuo nome (email verificata in 30 secondi, senza password) o in forma anonima.",
    href: "/it/publier", hrefLabel: "Apri il modulo",
  },
  {
    title: "Testare prima di inviare",
    text: "Il tuo prompt nasce « in costruzione »: un URL segreto permette di leggerlo, modificarlo e TESTARLO nella chat — condividi il link con i colleghi per un parere, non è bloccato. Quando è pronto: « Invia per la pubblicazione ».",
  },
  {
    title: "Confrontare in duello",
    text: "La modalità Duello (riservata ai promptagoghi) invia la stessa domanda a due colonne: due tutor sullo stesso modello, o lo stesso tutor su due modelli. È l'officina di perfezionamento: osserva cosa cambia una formulazione, o la robustezza del tuo prompt da un LLM all'altro.",
    href: "/it/duel", hrefLabel: "Apri il duello",
  },
  {
    title: "La validazione",
    text: "Un tutor inviato entra in coda. Un amministratore — o qualsiasi promptagogo verificato — lo rilegge e lo pubblica: appare allora nel catalogo. Questo filtro a priori protegge gli studenti; è dettagliato più in basso.",
  },
  {
    title: "Rappresenti una scuola?",
    text: "Gli istituti hanno la loro guida: accesso senza account per gli studenti, distribuzione di un tutor alla classe, orari e budget self-service, fatturazione. Tutto è spiegato con schemi di percorso.",
    href: "/it/etablissements", hrefLabel: "Guida degli istituti",
  },
];

export default function GuideIT() {
  return (
    <>
      <h1 className="text-3xl font-bold">Guida di EduChat</h1>
      <p className="mt-2 opacity-80">
        EduChat è uno spazio per creare, confrontare e distribuire <b>tutor socratici</b> —
        prompt che trasformano un'IA in un pedagogo che interroga invece di rispondere.
        Clicca sulla mappa per esplorare, o segui la visita guidata.
      </p>

      <div className="mt-6">
        <Mindmap profiles={PROFILES}
          caption="Mappa interattiva — clicca una bolla, trascina per spostare, rotella per lo zoom."
          ariaLabel="Mappa delle funzionalità per profilo" />
      </div>

      <Link href="/chat?tuteur=Socrate&visite=1"
        className="mt-6 flex items-center gap-3 rounded-lg border border-[#DC6521]/50 bg-[#DC6521]/10 p-4 hover:bg-[#DC6521]/20">
        <MdTour className="text-2xl text-[#DC6521]" />
        <span className="text-sm">
          <b>Visita interattiva dell'interfaccia</b> — si apre la schermata della chat e ogni
          elemento (tutor, fornitore, chiave, microfono…) viene presentato a turno, in 40 secondi.
        </span>
      </Link>

      <div id="visite" className="mt-8 scroll-mt-6">
        <GuidedWalk steps={WALK}
          labels={{ title: "Visita guidata", stepAria: "Passo", prev: "Precedente", next: "Successivo" }} />
      </div>

      <Link href="/etablissements"
        className="mt-8 flex items-center gap-3 rounded-lg border border-[#BA68C8]/40 bg-[#BA68C8]/10 p-4 hover:bg-[#BA68C8]/15">
        <MdSchool className="text-2xl text-[#BA68C8]" />
        <span className="text-sm">
          <b>Rappresenti una scuola, o sei un insegnante?</b> Accesso degli studenti, distribuzione
          di un tutor alla classe, orari e budget, fatturazione, schemi di percorso:{" "}
          <span className="underline">consulta la guida degli istituti →</span>
        </span>
      </Link>

      <Section id="eleves" title="Studenti e visitatori — imparare">
        <ul className="list-inside list-disc space-y-1">
          <li><b>Scegliere un tutor</b> nel <Link className="underline" href="/">catalogo</Link>: ricerca, ordinamenti, scheda dettagliata con il prompt integrale.</li>
          <li><b>Provare</b>: la chat si apre con il tutor al comando; sul sito pubblico, la tua <b>chiave API personale</b> (mai memorizzata, salvo tua richiesta) fa girare la conversazione, con fornitore e livello di ragionamento a tua scelta. Le risposte arrivano <b>in diretta</b>, durante la generazione.</li>
          <li><b>Allegati</b> (chiave personale): allega un'<b>immagine o un PDF</b> alla tua domanda, secondo il fornitore scelto.</li>
          <li><b>Chat vocale</b> (chiave personale, fornitori compatibili): detta la tua domanda al microfono, e la modalità vocale legge le risposte — comoda sullo smartphone.</li>
          <li><b>Preferiti</b> (stella) e <b>valutazioni</b> (1-5): conservati nel tuo browser; i preferiti salgono in cima al catalogo.</li>
          <li><b>Commenti anonimi</b> su ogni scheda: lascia un riscontro d'uso — appare dopo la moderazione dell'autore del tutor o dell'amministrazione.</li>
          <li><b>Storico</b>: le conversazioni restano nel browser. Rinomina, cancellazione, esportazione di ogni discussione (.md + .json), ed <b>esportazione del profilo completo</b> (conversazioni + preferiti + valutazioni) reimportabile altrove con il trascinamento.</li>
          <li><b>Contatore di token</b>: il totale consumato appare sotto l'area di scrittura e nel titolo della scheda.</li>
          <li><b>Tramite una scuola</b>: su <Link className="underline" href="/school">/school</Link>, nessun account né chiave — vedi la <Link className="underline" href="/etablissements">guida degli istituti</Link>.</li>
          <li><b>Privacy</b>: dettagliata sulla <Link className="underline" href="/rgpd">pagina Privacy</Link> — gli studenti non hanno mai un account.</li>
        </ul>
      </Section>

      <Section id="promptagogues" title="Promptagoghi — creare un tutor">
        <p>Un <b>promptagogo</b> (prompt + pedagogo) è l'autore di un tutor. Chiunque può diventarlo:</p>
        <ol className="list-inside list-decimal space-y-2">
          <li><b>Identificati</b> (facoltativo ma consigliato) su <Link className="underline" href="/verifier">/verifier</Link>: nome pubblico + email, confermata da un codice a sei cifre ricevuto via email. <b>Nessuna password, mai.</b> Senza account, la pubblicazione è anonima — testabile e inviabile tramite l'URL segreto, ma tutta la moderazione (validazione, ritiro, archiviazione) spetterà all'amministrazione.</li>
          <li><b>Scrivi</b> su <Link className="underline" href="/publier">/publier</Link>: un <b>nome proprio unico</b> (Pitagora, Curie...), una descrizione per il catalogo, la lingua, e il prompt stesso — il modello fornito pone le regole socratiche di base (mai dare la risposta, avanzare per domande, incoraggiare). Limiti: 256 KB per prompt, 1 MB per autore. Solo testo.</li>
          <li><b>Testa</b>: la bozza « in costruzione » ha un URL segreto — lettura, modifica, test nella chat, e inviti ai tester con la semplice condivisione del link.</li>
          <li><b>Perfeziona in duello</b> su <Link className="underline" href="/duel">/duel</Link> (riservato ai promptagoghi): la stessa domanda a due tutor sullo stesso modello — o allo stesso tutor su due modelli — per misurare l'effetto di una formulazione.</li>
          <li><b>Invia</b>, poi lascia che la validazione faccia il suo lavoro (sezione successiva).</li>
        </ol>
        <p><b>Dopo:</b> una modifica di un tutor pubblicato crea una <b>nuova versione</b> — le conversazioni in corso restano sulla loro e propongono il passaggio, senza mai imporlo. Puoi <b>ritirare i tuoi</b> tutor in ogni momento dalla tua officina (il link segreto) e ripubblicarli più tardi (niente viene mai cancellato: i contatori restano intatti). I <b>commenti anonimi</b> lasciati sulle tue schede ti aspettano: sei tu a moderarli (approvare o nascondere). « Proponi una variante » su qualsiasi scheda precompila il modulo con il prompt esistente e registra la <b>filiazione</b> (« ispirato da », mostrata su entrambe le schede): è la via della personalizzazione. L'opzione <b>sincronizzazione</b> (spuntata su /verifier) salva il tuo profilo sul server per ritrovare conversazioni e preferiti su un altro browser.</p>
      </Section>

      <Section id="validation" title="Il processo di validazione">
        <div className="overflow-x-auto">
          <p className="whitespace-nowrap rounded bg-tertiary p-3 font-mono text-xs">
            in costruzione (URL segreto) → inviato → <b className="text-green-400">pubblicato</b> ⇄ ritirato — niente viene mai cancellato
          </p>
        </div>
        <ul className="list-inside list-disc space-y-1">
          <li><b>In costruzione</b>: invisibile nel catalogo, raggiungibile solo tramite il suo URL segreto (128 bit casuali). Modificabile e testabile liberamente.</li>
          <li><b>Inviato</b>: entra nella coda di validazione, visibile solo ai validatori.</li>
          <li><b>Validazione a priori</b>: un <b>amministratore o qualsiasi promptagogo verificato</b> rilegge il prompt e lo pubblica. Questa scelta comunitaria protegge gli studenti (pubblico minorenne) evitando il collo di bottiglia di un validatore unico — filtra soprattutto le proposte anonime.</li>
          <li><b>Pubblicato</b>: nel catalogo, utilizzabile da tutti, contatori attivi.</li>
          <li><b>Ritirato</b>: rimosso dal catalogo ma conservato — l'autore o l'amministrazione può <b>ripubblicarlo</b>; l'amministrazione può anche <b>modificarlo, rinominarlo</b> o <b>archiviarlo</b> (nascosto definitivamente dall'interfaccia di amministrazione, ma conservato nel database: niente viene mai cancellato, le statistiche di consumo restano esatte).</li>
        </ul>
      </Section>

      <Section id="classement" title="Come vengono messi in evidenza i migliori tutor">
        <p>L'ordinamento predefinito « <b>Consigliati</b> » calcola, nel database, un punteggio per ogni tutor pubblicato:</p>
        <p className="overflow-x-auto rounded bg-tertiary p-3 font-mono text-xs">
          punteggio = usi + 5 × media delle valutazioni + 50 / (1 + età in giorni)
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li><b>usi</b> — ogni conversazione avviata con il tutor conta: la popolarità reale pesa.</li>
          <li><b>5 × media delle valutazioni</b> — la qualità percepita (stelle 1-5) pesa fino a 25 punti: un tutor eccellente ma recente può superare un tutor vecchio e mediamente apprezzato.</li>
          <li><b>50 / (1 + età)</b> — un bonus di freschezza, forte nei primi giorni e poi decrescente: i nuovi tutor hanno la loro occasione di essere visti, evitando che i primi pubblicati monopolizzino la testa (« effetto valanga »).</li>
        </ul>
        <p>Gli altri ordinamenti sono colonne dirette del database: <b>più usati</b> (usi), <b>migliori valutazioni</b> (media, a parità decide il numero di giudizi), <b>più recenti</b> (data di creazione), <b>token generati</b> (volume prodotto), <b>nome</b> (alfabetico). E i tuoi <b>preferiti</b> — puramente locali — sono sempre fissati in cima, nell'ordine dell'ordinamento scelto.</p>
      </Section>

      <Section id="donnees" title="Cosa viene memorizzato — e dove">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="uppercase opacity-60">
              <tr><th className="py-1 pr-2">Dato</th><th className="pr-2">Dove</th><th>Dettaglio</th></tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Conversazioni, chiave API personale, preferiti, valutazioni date, allegati</td><td className="pr-2"><b>Il tuo browser</b></td><td>Per impostazione predefinita mai sul server (la chiave personale non lascia la memoria della pagina; gli allegati sono solo inoltrati al fornitore). Due eccezioni, descritte sotto: il salvataggio del profilo per gli account e la chiave memorizzata su richiesta.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Tutor socratici</td><td className="pr-2">Database</td><td>Testo integrale, versioni successive, filiazione (« ispirato da »), stato, contatori anonimi (usi, token generati, somma e numero delle valutazioni).</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Account promptagogo / insegnante</td><td className="pr-2">Database</td><td>Nome pubblico, email (mai mostrata), ruoli, opzione di sincronizzazione. <b>Nessuna password esiste.</b></td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Istituti e consumi</td><td className="pr-2">Database</td><td>Dettagliato nella <Link className="underline" href="/etablissements#donnees">guida degli istituti</Link> (IP, orari, quote, registro dei consumi per IP — nessun dato nominativo di studenti).</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Profilo sincronizzato (opzione)</td><td className="pr-2">Database</td><td>Copia del tuo profilo del browser, cancellabile in ogni momento da /verifier.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Chiave API memorizzata (su richiesta, account)</td><td className="pr-2">Database</td><td>Solo se spunti « Memorizza la mia chiave » nella chat: la chiave è conservata <b>cifrata</b> (AES-256-GCM), non torna mai al browser e sparisce appena togli la spunta.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Contatore « online » della home</td><td className="pr-2">Database</td><td>Un&apos;impronta tecnica non reversibile del browser (mai l&apos;IP in chiaro) e l&apos;ora dell&apos;ultima attività, cancellate dopo quindici minuti.</td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="pages" title="Tutte le pagine del sito">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="uppercase opacity-60">
              <tr><th className="py-1 pr-2">Pagina</th><th className="pr-2">Per chi</th><th>Ruolo</th></tr>
            </thead>
            <tbody>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/">/</Link></td><td className="pr-2">Tutti</td><td>Catalogo dei tutor — la home</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2">/p/[nome]</td><td className="pr-2">Tutti</td><td>Scheda pubblica di un tutor (prompt integrale, valutazioni, versioni, filiazione)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/chat">/chat</Link></td><td className="pr-2">Tutti</td><td>Chat con la propria chiave, con o senza tutor — streaming, allegati, vocale</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/duel">/duel</Link></td><td className="pr-2">Promptagoghi</td><td>Confrontare 2 tutor su 1 modello, o 1 tutor su 2 modelli</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/publier">/publier</Link></td><td className="pr-2">Promptagoghi</td><td>Creare un tutor (modello guidato, varianti con filiazione)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2">/p/essai/[link]</td><td className="pr-2">Promptagoghi + ospiti</td><td>Officina di una bozza: leggere, modificare, testare, inviare</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/verifier">/verifier</Link></td><td className="pr-2">Autori, insegnanti, admin</td><td>Identificazione con codice email, senza password</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/compte">/compte</Link></td><td className="pr-2">Account</td><td>I miei dati: consumo, chiavi, conversazioni, tutor — esportare o cancellare tutto</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/etablissements">/etablissements</Link></td><td className="pr-2">Scuole</td><td>Guida dedicata: accesso, quote, fatturazione, percorsi</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/school">/school</Link></td><td className="pr-2">Scuole</td><td>Chat sulla chiave interna, dietro lo sblocco dell'insegnante</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/etablissement">/etablissement</Link></td><td className="pr-2">Responsabile d'istituto</td><td>Orari, quote e consumi self-service</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/admin">/admin</Link></td><td className="pr-2">Amministrazione</td><td>Moderazione, istituti, insegnanti, fatturazione</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/rgpd">/rgpd</Link></td><td className="pr-2">Tutti</td><td>Privacy (GDPR/nLPD), in 4 lingue</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/tutoriel">/tutoriel</Link></td><td className="pr-2">Tutti</td><td>Questa guida, in 4 lingue</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2">/police</td><td className="pr-2">Insegnanti</td><td>Strumento indipendente di gestione della classe (fuori dalla chat)</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs opacity-60">Il sito esiste in francese, inglese, italiano e tedesco — il selettore di lingua è nella home.</p>
      </Section>
    </>
  );
}
