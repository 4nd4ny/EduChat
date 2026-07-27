import Link from "next/link";
import React from "react";
import { MdAccountCircle, MdAdminPanelSettings, MdChat, MdCoPresent, MdCompareArrows, MdSchool, MdSettings } from "react-icons/md";
import { DemoButtons, GuidedWalk, Mindmap, Profile, Section, WalkStep } from "./shared";

// Guida di EduChat — versione ITALIANA. Segue esattamente la struttura di GuideFR.

const PROFILES: Profile[] = [
  { color: "#4FC3F7", topic: "Studente · Visitatore", anchor: "#eleves", leaves: [
    ["Scegliere un tutor", "#eleves"], ["Dimostrazione o chiave propria", "#acces"],
    ["Preferiti e valutazioni", "#eleves"], ["Esportare il profilo", "#eleves"] ] },
  { color: "#DC6521", topic: "Promptagogo", anchor: "#promptagogues", leaves: [
    ["Verificare l'email", "#promptagogues"], ["Pubblicare un tutor", "#promptagogues"],
    ["Testare via link segreto", "#validation"], ["Duello e varianti", "#promptagogues"] ] },
  { color: "#81C784", topic: "Insegnante", anchor: "#enseignants", leaves: [
    ["Aprire l'aula", "#enseignants"], ["Distribuire un tutor", "#enseignants"],
    ["Rileggere i tutor della scuola", "#enseignants"] ] },
  { color: "#BA68C8", topic: "Istituto", anchor: "#etablissement", leaves: [
    ["Iscrivere la propria scuola", "#etablissement"], ["Portafoglio prepagato", "#etablissement"],
    ["Contributo alla ricarica", "#etablissement"], ["I suoi tutor le appartengono", "#etablissement"] ] },
  { color: "#FFD54F", topic: "Amministratore", anchor: "#pages", leaves: [
    ["Approvare i tutor", "#validation"], ["Creare gli istituti", "#etablissement"],
    ["Tariffe e fatture", "#etablissement"] ] },
];

const WALK: WalkStep[] = [
  {
    title: "Il catalogo, cuore del sito",
    text: "La home elenca i tutor socratici pubblicati. Cerchi, ordini (consigliati, più usati, migliori valutazioni...), aggiunga ai preferiti (la stella — i Suoi preferiti salgono in cima). Ogni tutor è un prompt di sistema che trasforma l'IA in un pedagogo che fa domande invece di dare risposte.",
    href: "/it", hrefLabel: "Apra il catalogo",
  },
  {
    title: "La scheda di un tutor",
    text: "Clicchi su un nome per leggere la scheda: descrizione, statistiche, valutazioni, filiazione (« ispirato da »), e il testo INTEGRALE del prompt — un tutor non nasconde mai le proprie regole. Qui si valuta (da 1 a 5 stelle), si copia il link per consigliare, e si propone una variante.",
    href: "/it/p/Socrate", hrefLabel: "Veda la scheda di Socrate",
  },
  {
    title: "Provare un tutor",
    text: "« Prova » apre la chat con quel tutor al comando (barra in alto). Senza account risponde la dimostrazione gratuita: un piccolo modello, scelto da noi e imposto — più che sufficiente per giudicare un tutor. Con un account verificato, la Sua chiave API personale (campo « Chiave personale ») apre tutti i fornitori: resta nella pagina, è memorizzata solo su Sua richiesta e sblocca allegati (immagini, PDF) e chat vocale. Le risposte arrivano in diretta, durante la generazione.",
    href: "/it/chat?tuteur=Socrate", hrefLabel: "Provi Socrate",
  },
  {
    title: "Proporre il proprio tutor",
    text: "Il modulo « Proponi un tutor » parte da un modello socratico: dia un nome proprio unico, una descrizione, adatti le regole. Può pubblicare a Suo nome (email verificata in 30 secondi, senza password) o in forma anonima.",
    href: "/it/publier", hrefLabel: "Apra il modulo",
  },
  {
    title: "Testare prima di inviare",
    text: "Il Suo prompt nasce « in costruzione »: un URL segreto permette di leggerlo, modificarlo e TESTARLO nella chat — condivida il link con i colleghi per un parere, non è bloccato. Quando è pronto: « Inviare per la pubblicazione ».",
  },
  {
    title: "Confrontare in duello",
    text: "La modalità Duello (riservata ai promptagoghi) invia la stessa domanda a due colonne: due tutor sullo stesso modello, o lo stesso tutor su due modelli. È l'officina di perfezionamento: osservi cosa cambia una formulazione, o la robustezza del Suo prompt da un LLM all'altro.",
    href: "/it/duel", hrefLabel: "Apra il duello",
  },
  {
    title: "La validazione",
    text: "Un tutor inviato entra in coda. Un amministratore — o qualsiasi promptagogo verificato — lo rilegge e lo pubblica: appare allora nel catalogo. Questo filtro a priori protegge gli studenti; è dettagliato più in basso.",
  },
  {
    title: "Rappresenta una scuola?",
    text: "Una scuola si iscrive da sé: un nome, gli indirizzi IP della sua rete, un indirizzo di fatturazione. Il suo portafoglio parte da zero, e una ricarica si concorda scrivendoci: nessun mezzo di pagamento è ancora collegato al sito, e oggi non viene fatturato nulla. Una volta alimentato, ogni chiamata vi viene scalata al prezzo esatto del fornitore, senza alcun ricarico — il contributo della scuola, fra il 3,5 e il 10 % che sceglie lei stessa, è trattenuto una sola volta, sulla ricarica. L'accesso si chiude da solo quando il credito è esaurito; gli allievi scrivono ai tutor senza account né chiave. La guida degli istituti mostra i percorsi; la sezione « Istituti » più in basso riassume ciò che la scuola regola da sé.",
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
        Clicchi sulla mappa per esplorare, o segua la visita guidata.
      </p>

      <div className="mt-6">
        <Mindmap profiles={PROFILES}
          caption="Mappa interattiva — clicchi una bolla, trascini per spostare, rotella per lo zoom."
          ariaLabel="Mappa delle funzionalità per profilo" />
      </div>

      <DemoButtons
        titre="Le visite guidate"
        chapeau="Ogni pulsante apre la PAGINA REALE, come la vede la persona interessata, e la commenta elemento per elemento. Le interfacce riservate appaiono sbloccate ma inerti: nulla può esservi attivato."
        boutons={[
          { label: "Allievo", note: "la chat, dalla domanda alla risposta", href: "/chat?tuteur=Socrate&visite=1", color: "#4FC3F7", icon: <MdChat /> },
          { label: "Insegnante", note: "aprire l'aula, distribuire un tutor", href: "/enseignant?visite=1", color: "#81C784", icon: <MdCoPresent /> },
          { label: "Istituto", note: "orari, quote, portafoglio", href: "/etablissement?visite=1", color: "#BA68C8", icon: <MdSettings /> },
          { label: "Promptagogo", note: "confrontare due tutor in duello", href: "/duel?visite=1", color: "#DC6521", icon: <MdCompareArrows /> },
          { label: "I miei dati", note: "ciò che il server conserva di Lei", href: "/compte?visite=1", color: "#4DB6AC", icon: <MdAccountCircle /> },
          { label: "Amministrazione", note: "validare, fatturare, gestire le scuole", href: "/admin-demo?visite=1", color: "#FFD54F", icon: <MdAdminPanelSettings /> },
        ]} />


      <div id="visite" className="mt-8 scroll-mt-6">
        <GuidedWalk steps={WALK}
          labels={{ title: "Visita guidata", stepAria: "Passo", prev: "Precedente", next: "Successivo" }} />
      </div>

      <Link href="/etablissements"
        className="mt-8 flex items-center gap-3 rounded-lg border border-[#BA68C8]/40 bg-[#BA68C8]/10 p-4 hover:bg-[#BA68C8]/15">
        <MdSchool className="text-2xl text-[#BA68C8]" />
        <span className="text-sm">
          <b>Rappresenta una scuola, o è un insegnante?</b> Iscrizione dell'istituto, accesso degli
          studenti senza account, distribuzione di un tutor alla classe, orari, portafoglio e
          fatturazione:{" "}
          <span className="underline">consulti la guida degli istituti →</span>
        </span>
      </Link>

      <Section id="tuteurs" title="Gestire i tutor: cercare, ordinare, condividere">
        <p dangerouslySetInnerHTML={{ __html: `<b>Cercare</b>: il campo di ricerca della home interroga nome e descrizione di tutti i tutor pubblicati. Tre lettere di solito bastano.` }} />
        <p dangerouslySetInnerHTML={{ __html: `<b>Ordinare</b>: « Consigliati » mescola popolarità, valutazioni e freschezza, perché un buon tutor recente non sia schiacciato da uno vecchio. Gli altri ordinamenti sono grezzi — più usati, meglio valutati, più recenti, maggiori consumatori di token, o alfabetico. I preferiti salgono sempre in cima e riguardano solo Lei: vivono nel Suo browser.` }} />
        <p dangerouslySetInnerHTML={{ __html: `<b>Condividere con la comunità</b>: « Proponi un tutor » parte da un modello socratico. La bozza nasce con un URL segreto — lo condivida con i colleghi per raccogliere pareri, lo provi nella chat, poi lo invii. Un amministratore o qualsiasi promptagogo verificato lo pubblica, e appare nel catalogo.` }} />
        <p dangerouslySetInnerHTML={{ __html: `<b>Una volta pubblicato</b>, un tutor non viene mai eliminato: può ritirarlo — esce dal catalogo — e rimetterlo, con i contatori intatti.` }} />
        <p dangerouslySetInnerHTML={{ __html: `<b>A chi appartiene un tutor</b>: un tutor scritto da un account collegato a una scuola appartiene a quella scuola, e resta riservato ai suoi allievi finché essa non decide di condividerlo all'esterno. I tutor senza scuola — compresi quelli d'origine — formano il catalogo della piattaforma, visibile a tutti. La sezione « Istituti » più in basso descrive entrambe le porte.` }} />
        <p dangerouslySetInnerHTML={{ __html: `<b>« Proponi una variante »</b> da qualsiasi scheda copia il prompt esistente e registra la filiazione « ispirato da » su entrambe le schede: è il percorso normale della personalizzazione.` }} />
      </Section>

      <Section id="eleves" title="Studenti e visitatori — imparare">
        <ul className="list-inside list-disc space-y-1">
          <li><b>Scegliere un tutor</b> nel <Link className="underline" href="/">catalogo</Link>: ricerca, ordinamenti, scheda dettagliata con il prompt integrale.</li>
          <li><b>Provare</b>: la chat si apre con il tutor al comando. <b>Senza account</b> risponde la <b>dimostrazione gratuita</b> — un piccolo modello, imposto, sufficiente per giudicare un tutor. <b>Con un account verificato</b>, la Sua <b>chiave API personale</b> (mai memorizzata, salvo Sua richiesta) fa girare la conversazione, con il fornitore a Sua scelta. Le risposte arrivano <b>in diretta</b>, durante la generazione. Le quattro situazioni sono descritte <a className="underline" href="#acces">poco più in basso</a>.</li>
          <li><b>Allegati</b> (account + chiave personale): alleghi un'<b>immagine o un PDF</b> alla Sua domanda, secondo il fornitore scelto.</li>
          <li><b>Chat vocale</b> (account + chiave personale, fornitori compatibili): detti la Sua domanda al microfono, e la modalità vocale legge le risposte — comoda sullo smartphone.</li>
          <li><b>Preferiti</b> (stella) e <b>valutazioni</b> (1-5): conservati nel Suo browser; i preferiti salgono in cima al catalogo.</li>
          <li><b>Commenti anonimi</b> su ogni scheda: lasci un riscontro d'uso — appare dopo la moderazione dell'autore del tutor o dell'amministrazione.</li>
          <li><b>Storico</b>: le conversazioni restano nel browser. Rinomina, cancellazione, esportazione di ogni discussione (.md + .json), ed <b>esportazione del profilo completo</b> (conversazioni + preferiti + valutazioni) reimportabile altrove con il trascinamento.</li>
          <li><b>Contatore di token</b>: il totale consumato appare sotto l'area di scrittura e nel titolo della scheda.</li>
          <li><b>Tramite una scuola</b>: su <Link className="underline" href="/school">/school</Link>, nessun account né chiave — è la chiave dell'istituto a far girare la conversazione, negli orari e nelle quote che esso ha fissato. Dalla rete della propria scuola, <Link className="underline" href="/etablissement">/etablissement</Link> mostra direttamente il nome dell'istituto e i tutor che apre ai suoi allievi.</li>
          <li><b>Privacy</b>: dettagliata sulla <Link className="underline" href="/rgpd">pagina Privacy</Link> — gli studenti non hanno mai un account.</li>
        </ul>
      </Section>

      <Section id="acces" title="Quale fornitore di IA, e per chi">
        <p><b>Due domande, e soltanto due.</b> Ciò che l'elenco dei fornitori Le propone dipende da dove sta chiamando — la rete di un istituto, o qualunque altro luogo — e dal fatto che Lei abbia o meno un account. Quattro situazioni, dunque, e non una di più.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="uppercase opacity-60">
              <tr><th className="py-1 pr-2">Lei chiama…</th><th className="pr-2">Senza account</th><th>Con un account verificato</th></tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2"><b>Da qualunque luogo</b> (casa, telefono, bar)</td><td className="pr-2">La dimostrazione gratuita, e nient'altro.</td><td>Tutti i fornitori, con la Sua chiave.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2"><b>Dalla rete di una scuola</b></td><td className="pr-2">I fornitori conformi che la scuola accetta, sulla sua chiave.</td><td>Quelli della scuola — salvo se la Sua chiave personale è già collegata al Suo account: allora tutti.</td></tr>
            </tbody>
          </table>
        </div>
        <p><b>La dimostrazione gratuita.</b> Senza account e fuori da una scuola, il sito risponde con un piccolo modello gratuito che scegliamo noi: il fornitore mostrato è solo un intermediario, il modello è imposto, e non vi sono né ricerca web né allegati. Basta per porre tre domande e vedere che cos'è un tutor socratico. Nulla di personale trova posto in una dimostrazione pubblica — <Link className="underline" href="/rgpd">la pagina Privacy</Link> lo dice già, e qui vale più che altrove.</p>
        <p><b>Che cosa cambia un account.</b> Fuori da una scuola, un account verificato apre l'intero elenco, con la Sua chiave: Lei è identificabile, paga le proprie chiamate, ne risponde. Le tre cose vanno insieme, ed è per questo che una chiave incollata da un visitatore anonimo non basta più: non c'è nessuno a cui chiedere conto. La verifica richiede trenta secondi su <Link className="underline" href="/verifier">/verifier</Link>: un nome, un indirizzo, un codice a sei cifre, e <b>mai una password</b>.</p>
        <p><b>Sulla rete di una scuola.</b> Lì l'istituto risponde dei propri allievi, e la sua regola vale per tutti, con o senza account: sono proposti solo i fornitori conformi, e la chiave della scuola non paga mai gli altri. Un'eccezione, una sola: un account la cui chiave personale sia stata <b>collegata prima di arrivare</b> ritrova l'intero elenco — ciò che un adulto paga di tasca propria non riguarda la scuola. Una chiave semplicemente digitata nel campo, sul posto, non toglie nulla: altrimenti una chiave trovata su un forum riaprirebbe in classe ciò che l'istituto ha escluso.</p>
        <p><b>Che cosa è scomparso, e perché.</b> Un tempo occorreva far « certificare la propria maggiore età » per raggiungere i fornitori esclusi. Ma un allievo che passava il telefono alla rete mobile usciva dalla rete della scuola e otteneva tutto: la restrizione si aggirava con un gesto, e una restrizione che un gesto aggira non è una protezione, è una scenografia — una scenografia che costava in complessità ciò che non rendeva in sicurezza. La certificazione è quindi stata tolta dal sito: la casella, il campo e le formulazioni che ne parlavano. Ciò che protegge davvero è la rete della scuola, dove un minore è sotto la responsabilità dell'istituzione; è l'impegno che EduChat prende davanti a una direzione, e non è cambiato.</p>
      </Section>

      <Section id="enseignants" title="Insegnanti — la classe">
        <p>Lo spazio insegnante, su <Link className="underline" href="/enseignant">/enseignant</Link>, richiede un account verificato e parla soltanto dell'aula in cui Lei si trova. Il vecchio indirizzo /session vi conduce ancora.</p>
        <ul className="list-inside list-disc space-y-1">
          <li><b>Aprire l'aula</b>: la password d'aula sblocca la chiave della scuola per tutte le persone collegate dalla rete dell'istituto, per la durata che sceglie Lei. Nessun allievo ha un account o una chiave da inserire. Può richiudere prima del tempo.</li>
          <li><b>Distribuire un tutor</b>: il tutor scelto arriva preselezionato presso ogni allievo dell'aula, con o senza ricerca web. Può anche limitare i fornitori della seduta; togliere tutte le spunte è una scelta legittima, e chiude — la chiave della scuola non serve allora più nulla. Il filtro vale solo per quella chiave: un allievo che porta la propria non ne dipende. Resta però nel perimetro della scuola: su quella rete la sua chiave gli apre soltanto i fornitori conformi, a meno che non sia già collegata al suo account.</li>
          <li><b>La seduta riguarda l'aula, non il Suo account</b>: è riconosciuta dall'indirizzo IP della rete. Un insegnante che va a insegnare in un altro istituto vi apre l'aula di quell'istituto, non della propria scuola.</li>
          <li><b>Rileggere i tutor della scuola</b>: i tutor proposti dai colleghi e i commenti lasciati su quelle schede si moderano qui. È aperto agli amministratori della scuola e a ogni insegnante di cui essa sia la scuola principale — quella che un'amministrazione gli ha attribuito. Il rango di amministratore non è necessario: validare il tutor di un collega è un gesto d'insegnamento.</li>
          <li><b>Più scuole</b>: un account può insegnare in più istituti. Un selettore, in cima alla pagina, dice di quale si parla — la moderazione e lo spazio istituto lo seguono.</li>
        </ul>
      </Section>

      <Section id="etablissement" title="Istituti — la scuola a casa sua">
        <p><b>Perché questo sito esiste.</b> Una scuola non può aprire un contratto API presso un fornitore di IA: servono una carta aziendale, un pagamento a consumo e una fattura in dollari. Sa però pagare una fattura con un bonifico. L'ostacolo sta nel mezzo di pagamento, non nel bilancio: EduChat firma quel contratto al suo posto e si colloca fra la scuola e i fornitori.</p>
        <p><b>Iscriversi da soli.</b> Da <Link className="underline" href="/etablissement">/etablissement</Link>, con un indirizzo email verificato: un nome, gli indirizzi IP della rete della scuola, un indirizzo di fatturazione. Nessuno deve scriverci per cominciare. Il portafoglio parte da zero, e il modulo lo dice prima della firma: nulla passa dalla chiave della scuola finché non è alimentato.</p>
        <p><b>L'accoglienza della scuola.</b> /etablissement non è più una porta chiusa. Chi arriva dalla rete del proprio istituto vi vede il nome della sua scuola e i tutor che essa gli apre, senza account né password. Da una rete che nessuno ha dichiarato, la pagina propone invece di iscrivere un istituto.</p>
        <p><b>Il portafoglio prepagato.</b> La scuola versa una somma; ogni chiamata effettuata sulla chiave della piattaforma vi viene scalata <b>al prezzo esatto pubblicato dal fornitore</b> — Anthropic, OpenAI, Mistral — senza un centesimo di ricarico. È il punto che conta, ed è verificabile: apra il loro tariffario, rifaccia il calcolo, ritroverà la nostra cifra. Un servizio che si colloca fra una scuola e i fornitori non ha nulla di meglio da offrire di un estratto che la scuola può ricalcolare da sé; un margine sciolto nel prezzo del token, al contrario, si verifica male e si sospetta bene. L'accesso si chiude da solo quando il credito è esaurito, e il controllo avviene prima della chiamata: una risposta già iniziata si paga, quindi lo sconfinamento è limitato a una risposta. La schermata mostra il saldo, la spesa degli ultimi trenta giorni, l'autonomia stimata in giorni, la ricarica suggerita e la cronologia datata dei movimenti — ricarica, consumo, rettifica. <b>Oggi non viene ancora fatturato nulla</b>: nessun mezzo di pagamento è collegato al sito, e una ricarica si concorda scrivendoci. Nel frattempo ognuno può portare la propria chiave IA.</p>
        <p><b>Il contributo alle spese: sulla ricarica, e una sola volta.</b> Non si aggiunge più a ogni token — è trattenuto sul versamento, all'aliquota che la scuola ha scelto fra il 3,5 e il 10 % con un cursore, e mai meno di 0.50 per ricarica, perché le spese d'incasso hanno una parte fissa che un piccolo versamento non coprirebbe. Ricaricare 100 lascia dunque 90 utilizzabili al 10 %, 96.50 al 3,5 %. Il registro iscrive i due movimenti separatamente, il versamento e poi la trattenuta: un saldo netto senza la sua riga di commissione è una cifra che nessuno può ricalcolare, ed è esattamente ciò che vogliamo evitare. Il minimo copre soltanto le spese di pagamento: a quel livello la piattaforma paga il server di tasca propria. Finché una scuola non ha scelto nulla, vale l'impostazione del sito.</p>
        <p><b>Ciò che non abbiamo ripreso, e l'effetto collaterale.</b> La regola viene da OpenRouter, che non prende alcun margine sull'inferenza e si remunera sull'acquisto di credito. Due delle loro pratiche sono rimaste fuori: <b>nessuna commissione sulle chiavi personali</b> — misurarla richiederebbe di registrare l'uso di una chiave privata, e <Link className="underline" href="/rgpd">la pagina Privacy</Link> promette nero su bianco il contrario; e <b>nessuna scadenza dei crediti</b> — su un bilancio scolastico votato e poi speso lentamente, sarebbe una confisca. Resta un effetto collaterale, meglio leggerlo qui che scoprirlo: una scuola che ricarica e non consuma ha pagato il contributo per nulla. Il rimborso del saldo è previsto — passerà dal mezzo di pagamento, che non è ancora aperto — e restituisce il credito residuo, meno le spese che il prestatore di pagamento non restituisce; non restituisce il contributo già trattenuto.</p>
        <p><b>I tutor di una scuola le appartengono.</b> Un tutor scritto da un account collegato all'istituto è collegato a esso e non è pubblico per impostazione predefinita: scrivere un tutor per i propri allievi non deve equivalere a pubblicarlo per il mondo intero. È la scuola ad aprirlo all'esterno, tutor per tutor. Nell'altro senso, decide anche se i suoi allievi vedano i tutor pubblici delle altre scuole — chiuso finché non lo apre. Il catalogo della piattaforma resta visibile in ogni caso.</p>
        <p><b>Ciò che la scuola regola, e chi lo regola.</b> Orari di accesso libero, quota giornaliera per allievo, tetto mensile in token, e il consumo del mese per fornitore. Ogni insegnante collegato legge questa schermata; solo un amministratore della scuola vi cambia qualcosa, e la pagina lo dice invece di lasciarlo scoprire. Gli indirizzi IP e lo stato di fatturazione restano nelle mani del sito.</p>
        <p><b>Gli account e la fattura.</b> Un collega entra nella scuola verificando il proprio indirizzo email dalla rete dell'istituto: nessuno deve iscriverlo a mano, e arriva senza diritti di amministrazione. Un amministratore della scuola lo riconosce poi come docente e ne nomina altri amministratori della stessa scuola. Collegare un account a una scuola, o spostarlo altrove, resta nelle mani del sito. Completa inoltre le indicazioni amministrative della fattura — indirizzo esatto, riferimento o numero d'ordine interno, nota libera. Nessuna di queste indicazioni entra nel calcolo: l'importo resta quello del portafoglio. La fattura di un mese si apre come pagina stampabile, su <Link className="underline" href="/facture">/facture</Link>.</p>
        <p><b>I fornitori esclusi.</b> Ai sensi del regolamento europeo sull'IA, Grok, Gemini e i fornitori cinesi non sono proposti a nessuno sulla rete di un istituto, e la chiave della scuola non li paga mai — non più per un insegnante che per un allievo. OpenRouter porta invece un contrassegno di avvertimento anziché un'esclusione: è solo un intermediario verso modelli conformi, ed è anche il motore della dimostrazione gratuita; una scuola, però, non lo paga mai. Ciò che un adulto sceglie per sé, con il proprio account e la propria chiave, non passa dal portafoglio dell'istituto e non lo impegna — la sezione <a className="underline" href="#acces">« Quale fornitore di IA, e per chi »</a> espone la regola per intero.</p>
        <p><b>Sui dati restiamo esatti.</b> Il contratto API a pagamento garantisce che gli scambi non servono ad addestrare i modelli, ma restano una trentina di giorni presso il fornitore, per il contrasto degli abusi. Scrivere « nessun dato conservato » sarebbe falso — e una promessa falsa è esattamente ciò che mette una scuola in difetto il giorno di un controllo. <Link className="underline" href="/rgpd">La pagina Privacy</Link> lo dettaglia, <Link className="underline" href="/etablissements">la guida degli istituti</Link> mostra i percorsi, e <Link className="underline" href="/assistance">la pagina Assistenza</Link> — leggibile senza account — dà l'indirizzo di una persona in carne e ossa, oltre a ciò che sarebbe un server installato nella scuola.</p>
      </Section>

      <Section id="promptagogues" title="Promptagoghi — creare un tutor">
        <p>Un <b>promptagogo</b> (prompt + pedagogo) è l'autore di un tutor. Chiunque può diventarlo:</p>
        <ol className="list-inside list-decimal space-y-2">
          <li><b>Si identifichi</b> (facoltativo ma consigliato) su <Link className="underline" href="/verifier">/verifier</Link>: nome pubblico + email, confermata da un codice a sei cifre ricevuto via email. <b>Nessuna password, mai.</b> Senza account, la pubblicazione è anonima — testabile e inviabile tramite l'URL segreto, ma tutta la moderazione (validazione, ritiro, archiviazione) spetterà all'amministrazione.</li>
          <li><b>Scriva</b> su <Link className="underline" href="/publier">/publier</Link>: un <b>nome proprio unico</b> (Pitagora, Curie...), una descrizione per il catalogo, la lingua, e il prompt stesso — il modello fornito pone le regole socratiche di base (mai dare la risposta, avanzare per domande, incoraggiare). Limiti: 256 KB per prompt, 1 MB per autore. Solo testo.</li>
          <li><b>Lo testi</b>: la bozza « in costruzione » ha un URL segreto — lettura, modifica, test nella chat, e inviti ai tester con la semplice condivisione del link.</li>
          <li><b>Perfezioni in duello</b> su <Link className="underline" href="/duel">/duel</Link> (riservato ai promptagoghi): la stessa domanda a due tutor sullo stesso modello — o allo stesso tutor su due modelli — per misurare l'effetto di una formulazione.</li>
          <li><b>Invii</b>, poi lasci che la validazione faccia il suo lavoro (sezione successiva).</li>
        </ol>
        <p><b>Dopo:</b> una modifica di un tutor pubblicato crea una <b>nuova versione</b> — le conversazioni in corso restano sulla loro e propongono il passaggio, senza mai imporlo. Può <b>ritirare i Suoi</b> tutor in ogni momento dalla Sua officina (il link segreto) e ripubblicarli più tardi (niente viene mai cancellato: i contatori restano intatti). I <b>commenti anonimi</b> lasciati sulle Sue schede La aspettano: è Lei a moderarli (approvare o nascondere). « Proponi una variante » su qualsiasi scheda precompila il modulo con il prompt esistente e registra la <b>filiazione</b> (« ispirato da », mostrata su entrambe le schede): è la via della personalizzazione. L'opzione <b>sincronizzazione</b> (spuntata su /verifier) salva il Suo profilo sul server per ritrovare conversazioni e preferiti su un altro browser.</p>
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
          <li><b>Ritirato</b>: rimosso dal catalogo ma conservato — l'autore o l'amministrazione può <b>ripubblicarlo</b>, e l'amministrazione <b>archiviarlo</b> — per ritoccarlo bisogna prima ripubblicarlo (nascosto definitivamente dall'interfaccia di amministrazione, ma conservato nel database: niente viene mai cancellato, le statistiche di consumo restano esatte).</li>
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
        <p>Gli altri ordinamenti sono colonne dirette del database: <b>più usati</b> (usi), <b>migliori valutazioni</b> (media, a parità decide il numero di giudizi), <b>più recenti</b> (data di creazione), <b>token generati</b> (volume prodotto), <b>nome</b> (alfabetico). E i Suoi <b>preferiti</b> — puramente locali — sono sempre fissati in cima, nell'ordine dell'ordinamento scelto.</p>
      </Section>

      <Section id="donnees" title="Cosa viene memorizzato — e dove">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="uppercase opacity-60">
              <tr><th className="py-1 pr-2">Dato</th><th className="pr-2">Dove</th><th>Dettaglio</th></tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Conversazioni, chiave API personale, preferiti, valutazioni date, allegati</td><td className="pr-2"><b>Il Suo browser</b></td><td>Mai sul server (gli allegati sono solo inoltrati al fornitore). La chiave personale è conservata in QUESTO browser per non doverla ridigitare — veda la <Link className="underline" href="/rgpd">pagina Privacy</Link>. Due eccezioni: il salvataggio del profilo per gli account e la chiave memorizzata sul server, su richiesta.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Tutor socratici</td><td className="pr-2">Database</td><td>Testo integrale, versioni successive, filiazione (« ispirato da »), stato, la scuola proprietaria se ve n'è una e se l'abbia o meno condiviso all'esterno, le traduzioni automatiche nelle altre tre lingue con la versione da cui provengono, contatori anonimi (usi, token generati, somma e numero delle valutazioni).</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Account promptagogo / insegnante</td><td className="pr-2">Database</td><td>Nome pubblico, email (mai mostrata), ruoli, opzione di sincronizzazione, e le <b>scuole a cui l'account appartiene</b> — più di una è possibile, con il diritto di amministrazione legame per legame e una scuola principale. Verificare il proprio indirizzo dalla rete di una scuola vi collega l'account, <b>senza alcun diritto di amministrazione</b>. Il consumo effettuato sulla chiave di una scuola conserva l'email dell'insegnante che ha aperto l'aula. <b>Nessuna password esiste.</b></td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Istituti e consumi</td><td className="pr-2">Database</td><td>Nome, indirizzi IP della rete, orari di accesso libero, quote, aliquota di contributo scelta dalla scuola, indirizzo di fatturazione, apertura o meno al catalogo delle altre scuole, e il registro dei consumi per IP d'istituto — nessun dato nominativo di studenti. Dettagliato nella <Link className="underline" href="/etablissements#donnees">guida degli istituti</Link>.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Portafoglio e fatture</td><td className="pr-2">Database</td><td>Il saldo di ogni scuola e il registro datato di tutti i suoi movimenti: ricarica, consumo o rettifica, importo con segno, saldo successivo e chi lo ha effettuato. Il contributo trattenuto su una ricarica vi figura come riga a parte, nominata e datata, perché il conto si possa rifare a mano. Una fattura emessa fissa il proprio importo, perché un cambio di tariffa non riscriva il passato; le indicazioni amministrative che la scuola vi aggiunge vivono a parte, affinché una riemissione non le cancelli mai.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Profilo sincronizzato (opzione)</td><td className="pr-2">Database</td><td>Copia del Suo profilo del browser, cancellabile in ogni momento da /verifier.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Chiave API memorizzata (su richiesta, account)</td><td className="pr-2">Database</td><td>Solo se spunta « Memorizza la mia chiave » nella chat: la chiave è conservata <b>cifrata</b> (AES-256-GCM), non torna mai al browser e sparisce appena toglie la spunta.</td></tr>
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
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/chat">/chat</Link></td><td className="pr-2">Tutti</td><td>La chat, con o senza tutor: dimostrazione gratuita senza account, chiave propria con un account — streaming, allegati, vocale</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/duel">/duel</Link></td><td className="pr-2">Promptagoghi</td><td>Confrontare 2 tutor su 1 modello, o 1 tutor su 2 modelli</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/publier">/publier</Link></td><td className="pr-2">Promptagoghi</td><td>Creare un tutor (modello guidato, varianti con filiazione)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2">/p/essai/[link]</td><td className="pr-2">Promptagoghi + ospiti</td><td>Officina di una bozza: leggere, modificare, testare, inviare</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/verifier">/verifier</Link></td><td className="pr-2">Autori, insegnanti, admin</td><td>Identificazione con codice email, senza password</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/compte">/compte</Link></td><td className="pr-2">Account</td><td>L'ACCOUNT: consumo, chiavi, conversazioni, tutor — esportare o cancellare tutto</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/enseignant">/enseignant</Link></td><td className="pr-2">Insegnanti</td><td>La CLASSE: aprire l'aula, distribuire un tutor, rileggere i tutor della propria scuola (il vecchio indirizzo /session vi conduce)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/school">/school</Link></td><td className="pr-2">Allievi di una scuola</td><td>Chat sulla chiave della scuola, dietro lo sblocco dell'insegnante</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/etablissement">/etablissement</Link></td><td className="pr-2">Scuole</td><td>LA SCUOLA: accoglienza per chi arriva dalla sua rete, iscrizione di un istituto e — per i suoi amministratori — orari, quote, portafoglio, account, tutor e fattura</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/etablissements">/etablissements</Link></td><td className="pr-2">Scuole</td><td>Guida dedicata: accesso, quote, fatturazione, percorsi</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/facture">/facture</Link></td><td className="pr-2">Scuole, sito</td><td>La fattura di un mese, in pagina stampabile (vuota senza account)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/assistance">/assistance</Link></td><td className="pr-2">Tutti</td><td>Contattarci, e che cosa sarebbe un server installato nella scuola — leggibile senza account</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/admin">/admin</Link></td><td className="pr-2">Super-amministratori</td><td>LA PIATTAFORMA: creare gli istituti, tariffe, fatture non pagate, portafoglio di tutte le scuole, scala dei modelli. Il loro elenco vive nella configurazione del server — nessuna interfaccia ne crea</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/admin-demo">/admin-demo</Link></td><td className="pr-2">Tutti</td><td>Vetrina dell'amministrazione, interamente inventata: nessun dato reale</td></tr>
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
