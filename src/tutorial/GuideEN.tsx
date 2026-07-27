import Link from "next/link";
import React from "react";
import { MdAccountCircle, MdAdminPanelSettings, MdChat, MdCoPresent, MdCompareArrows, MdSchool, MdSettings } from "react-icons/md";
import { DemoButtons, GuidedWalk, Mindmap, Profile, Section, WalkStep } from "./shared";

// EduChat guide — ENGLISH version. Mirrors GuideFR structure exactly.

const PROFILES: Profile[] = [
  { color: "#4FC3F7", topic: "Student · Visitor", anchor: "#eleves", leaves: [
    ["Pick a tutor", "#eleves"], ["Free demo or own key", "#acces"],
    ["Favourites & ratings", "#eleves"], ["Export your profile", "#eleves"] ] },
  { color: "#DC6521", topic: "Promptagogue", anchor: "#promptagogues", leaves: [
    ["Verify your email", "#promptagogues"], ["Publish a tutor", "#promptagogues"],
    ["Test via secret link", "#validation"], ["Duel & variants", "#promptagogues"] ] },
  { color: "#81C784", topic: "Teacher", anchor: "#enseignants", leaves: [
    ["Open the room", "#enseignants"], ["Deploy a tutor", "#enseignants"],
    ["Review the school's tutors", "#enseignants"] ] },
  { color: "#BA68C8", topic: "School", anchor: "#etablissement", leaves: [
    ["Register your school", "#etablissement"], ["Prepaid wallet", "#etablissement"],
    ["Contribution on top-up", "#etablissement"], ["Its tutors are its own", "#etablissement"] ] },
  { color: "#FFD54F", topic: "Administrator", anchor: "#pages", leaves: [
    ["Approve tutors", "#validation"], ["Create schools", "#etablissement"],
    ["Rates and invoices", "#etablissement"] ] },
];

const WALK: WalkStep[] = [
  {
    title: "The catalogue, heart of the site",
    text: "The home page lists the published Socratic tutors. Search, sort (recommended, most used, best rated...), add favourites (the star — your favourites rise to the top). Each tutor is a system prompt that turns the AI into an educator who asks questions instead of giving answers.",
    href: "/en", hrefLabel: "Open the catalogue",
  },
  {
    title: "A tutor's page",
    text: "Click a name to read its page: description, statistics, ratings, lineage (“inspired by”), and the FULL text of the prompt — a tutor never hides its rules. This is where you rate (1 to 5 stars), copy the link to recommend, and propose a variant.",
    href: "/en/p/Socrate", hrefLabel: "See Socrate's page",
  },
  {
    title: "Trying a tutor",
    text: "“Try” opens the chat with that tutor in charge (banner at the top). Without an account, the free demo answers: a small model, chosen by us and imposed — quite enough to judge a tutor. With a verified account, your personal API key (“Personal key” field) opens every provider outside a school network — on one, the school's rule applies to everyone, save the exception set out further down. The key stays in the page, is remembered only if you ask, and it unlocks attachments (images, PDF); voice chat runs on it too, or on the school's key in class. Replies then stream in live, as they are generated, with the providers that can do it (Gemini answers in one block); those of the free demo, by contrast, always arrive in one block, once written.",
    href: "/en/chat?tuteur=Socrate", hrefLabel: "Try Socrate",
  },
  {
    title: "Proposing your own tutor",
    text: "The “Propose a tutor” form starts from a Socratic template: give a unique proper name, a description, adapt the rules. You can publish under your name (email verified in 30 seconds, no password) or anonymously.",
    href: "/en/publier", hrefLabel: "Open the form",
  },
  {
    title: "Testing before submitting",
    text: "Your prompt is born “under construction”: a secret URL lets you read, edit and TEST it in the chat — share that link with colleagues for feedback, it is not locked. When it is ready: “Submit for publication”.",
  },
  {
    title: "Comparing in a duel",
    text: "Duel mode (promptagogues only) sends the same question to two columns: two tutors on the same model, or the same tutor on two models. It is the refinement workshop: observe what a wording changes, or how robust your prompt is across LLMs.",
    href: "/en/duel", hrefLabel: "Open the duel",
  },
  {
    title: "Validation",
    text: "A submitted tutor joins the queue. An administrator — or any verified promptagogue — reviews and publishes it: it then appears in the catalogue. This a-priori filter protects students; it is detailed below.",
  },
  {
    title: "Do you represent a school?",
    text: "A school registers itself: a name, the IP addresses of its network, a billing address. Its wallet starts at zero, and a top-up is arranged by writing to us: no payment method is wired up on the site yet, and nothing is billed today. Once funded, every call is debited from it at cost, with no mark-up on the tokens, at the two published prices of the model actually called — one for input, one for output — the school's contribution, 3.5 to 10 % of its own choosing, is withheld once, on the top-up. Access closes by itself when the credit runs out; students write to tutors with no account and no key. The schools guide shows the journeys; the “Schools” section further down sums up what a school sets for itself.",
    href: "/en/etablissements", hrefLabel: "Schools guide",
  },
];

export default function GuideEN() {
  return (
    <>
      <h1 className="text-3xl font-bold">EduChat guide</h1>
      <p className="mt-2 opacity-80">
        EduChat is a space to create, compare and deploy <b>Socratic tutors</b> —
        prompts that turn an AI into an educator who questions instead of answering.
        Click the map to explore, or follow the guided walkthrough.
      </p>

      <div className="mt-6">
        <Mindmap profiles={PROFILES}
          caption="Interactive map — click a bubble, drag to move, scroll to zoom."
          ariaLabel="Feature map by profile" />
      </div>

      <DemoButtons
        titre="The guided walkthroughs"
        chapeau="Each button opens the REAL page as the person concerned sees it, and comments on it element by element. Restricted interfaces appear unlocked but inert: nothing can be triggered there."
        boutons={[
          { label: "Learner", note: "the chat, from question to answer", href: "/chat?tuteur=Socrate&visite=1", color: "#4FC3F7", icon: <MdChat /> },
          { label: "Teacher", note: "open the room, deploy a tutor", href: "/enseignant?visite=1", color: "#81C784", icon: <MdCoPresent /> },
          { label: "School", note: "hours, quotas, wallet", href: "/etablissement?visite=1", color: "#BA68C8", icon: <MdSettings /> },
          { label: "Promptagogue", note: "compare two tutors in a duel", href: "/duel?visite=1", color: "#DC6521", icon: <MdCompareArrows /> },
          { label: "My data", note: "what the server keeps about you", href: "/compte?visite=1", color: "#4DB6AC", icon: <MdAccountCircle /> },
          { label: "Administration", note: "validate, bill, manage schools", href: "/admin-demo?visite=1", color: "#FFD54F", icon: <MdAdminPanelSettings /> },
        ]} />


      <div id="visite" className="mt-8 scroll-mt-6">
        <GuidedWalk steps={WALK}
          labels={{ title: "Guided walkthrough", stepAria: "Step", prev: "Previous", next: "Next" }} />
      </div>

      <Link href="/etablissements"
        className="mt-8 flex items-center gap-3 rounded-lg border border-[#BA68C8]/40 bg-[#BA68C8]/10 p-4 hover:bg-[#BA68C8]/15">
        <MdSchool className="text-2xl text-[#BA68C8]" />
        <span className="text-sm">
          <b>Do you represent a school, or are you a teacher?</b> Registering the school, account-free
          student access, deploying a tutor to the class, hours, wallet and billing:{" "}
          <span className="underline">see the schools guide →</span>
        </span>
      </Link>

      <Section id="tuteurs" title="Managing tutors: search, sort, share">
        <p dangerouslySetInnerHTML={{ __html: `<b>Search</b>: the home search box queries the name and description of every published tutor. Three letters usually suffice.` }} />
        <p dangerouslySetInnerHTML={{ __html: `<b>Sort</b>: “Recommended” blends popularity, ratings and freshness, so that a good recent tutor is not buried by an old one. The other sorts are raw — most used, best rated, newest, largest token consumers, or alphabetical. Your favourites always rise to the top, and concern only you: they live in your browser.` }} />
        <p dangerouslySetInnerHTML={{ __html: `<b>Share with the community</b>: “Propose a tutor” starts from a Socratic template. The draft is born with a secret URL — share it with colleagues for feedback, test it in the chat, then submit it. An administrator or any verified promptagogue publishes it, and it appears in the catalogue.` }} />
        <p dangerouslySetInnerHTML={{ __html: `<b>Once published</b>, a tutor is never deleted: you may unpublish it — it leaves the catalogue — then put it back, with counters intact.` }} />
        <p dangerouslySetInnerHTML={{ __html: `<b>Who owns a tutor</b>: a tutor written from an account attached to a school belongs to that school, and stays reserved for its students until the school decides to share it outside. Tutors with no school — including the original ones — form the platform catalogue, visible to everyone. The “Schools” section further down details both doors.` }} />
        <p dangerouslySetInnerHTML={{ __html: `<b>“Propose a variant”</b> from any page copies the existing prompt and records the “inspired by” lineage on both pages: that is the normal path of personalisation.` }} />
      </Section>

      <Section id="eleves" title="Students and visitors — learning">
        <ul className="list-inside list-disc space-y-1">
          <li><b>Pick a tutor</b> in the <Link className="underline" href="/">catalogue</Link>: search, sorting, detailed page with the full prompt.</li>
          <li><b>Try</b>: the chat opens with the tutor in charge. <b>Without an account</b>, the <b>free demo</b> answers — a small model, imposed, enough to judge a tutor. <b>With a verified account</b>, your <b>personal API key</b> (never stored, unless you ask to remember it) powers the conversation, with the provider of your choice. Replies then arrive <b>live</b>, as they are generated, with the providers that can do it (Gemini answers in one block); those of the free demo arrive in one block too, once written. The four situations are set out <a className="underline" href="#acces">a little further down</a>.</li>
          <li><b>Attachments</b> (account + personal key): attach an <b>image or a PDF</b> to your question, depending on the chosen provider.</li>
          <li><b>Voice chat</b> (compatible providers): dictate your question into the microphone, and voice mode reads replies aloud — handy on a smartphone. Your own key pays for it; where the school's key is serving — its hours, or a room the teacher has opened — that key pays instead, so a class need not bring one. Attachments, by contrast, stay strictly on a personal key.</li>
          <li><b>Favourites</b> (star) and <b>ratings</b> (1-5): kept in your browser; favourites rise to the top of the catalogue.</li>
          <li><b>Anonymous comments</b> on each page: leave usage feedback — it appears after moderation by the tutor's author or the administration.</li>
          <li><b>History</b>: your conversations stay in the browser. Renaming, deletion, per-conversation export (.md + .json), and <b>full profile export</b> (conversations + favourites + ratings) re-importable elsewhere by drag and drop.</li>
          <li><b>Token counter</b>: the total consumed shows under the input area and in the tab title.</li>
          <li><b>Through a school</b>: on <Link className="underline" href="/school">/school</Link>, no account or key — the school's own key powers the conversation, within the hours and quotas it has set. From the school network, <Link className="underline" href="/etablissement">/etablissement</Link> shows the school's name and the tutors it opens to its students.</li>
          <li><b>Privacy</b>: detailed on <Link className="underline" href="/rgpd">the Privacy page</Link> — students never have accounts.</li>
        </ul>
      </Section>

      <Section id="acces" title="Which AI provider, for whom">
        <p><b>Two questions, and only two.</b> What the provider list offers you depends on where you are calling from — a school network, or anywhere else — and on whether you have an account. Four situations, then, and not one more.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="uppercase opacity-60">
              <tr><th className="py-1 pr-2">You are calling…</th><th className="pr-2">Without an account</th><th>With a verified account</th></tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2"><b>From anywhere</b> (home, phone, café)</td><td className="pr-2">The free demo, and nothing else.</td><td>Every provider, with your own key.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2"><b>From a school network</b></td><td className="pr-2">The compliant providers the school accepts, on its key.</td><td>The school's — unless your account already carries its own means of payment (a key attached to it, or a personal credit — see below): then all of them.</td></tr>
            </tbody>
          </table>
        </div>
        <p><b>The free demo.</b> Without an account and outside a school, the site answers with a small free model that we choose: the provider shown is only an intermediary, the model is imposed, and there is no web search and no attachments. It is enough to ask three questions and see what a Socratic tutor is. Nothing personal belongs in a public demo — <Link className="underline" href="/rgpd">the Privacy page</Link> already says so, and it holds here more than anywhere.</p>
        <p><b>What an account changes.</b> Outside a school, a verified account opens the whole list, with your own key: you are identifiable, you pay for your calls, you answer for them. The three go together, and that is why a key pasted in by an anonymous visitor is no longer enough — there is nobody to ask anything of. Verification takes thirty seconds on <Link className="underline" href="/verifier">/verifier</Link>: a name, an address, a six-digit code — or simply the link in the same email, which opens the account in one click, for the same fifteen minutes and once only — and <b>never a password</b>.</p>
        <p><b>Buying tokens rather than bringing a key.</b> The account page also holds a <b>personal wallet</b>: EduChat's key, debited from your credit at cost, plus a contribution taken once on the top-up — 3.5 %, and never less than 0.50 per top-up. The machinery is written; the door is not open: no payment method is wired up on the site, here no more than for a school, so no credit can be bought today. And a credit is not a pass: it widens the list you may choose from, but EduChat's key still refuses the providers set aside for a school audience — to reach those, your own key is needed.</p>
        <p><b>On a school network.</b> There, the school answers for its students, and its rule applies to everyone, account or no account: only compliant providers are offered, and the school's key never pays for the others. One exception: an account that brings its own means of payment <b>before coming</b> — a personal key attached to it, or a personal credit — gets the whole list back, what an adult pays for themselves being no business of the school. A key simply typed into the field, on the spot, lifts nothing: otherwise a key found on a forum would reopen in class what the school has set aside.</p>
        <p><b>What has gone, and why.</b> Reaching the providers set aside once required having your adulthood “certified”. But a student who flipped their phone to mobile data left the school network and got everything: the restriction was bypassed with a single gesture, and a restriction one gesture bypasses is not a protection, it is scenery — scenery that cost in complexity what it did not return in safety. Certification has therefore been removed from the site: the checkbox, the field and the wording that mentioned it. What really protects is the school network, where a minor is under the institution's responsibility; that is the commitment EduChat makes to a head teacher, and it has not moved.</p>
      </Section>

      <Section id="enseignants" title="Teachers — the class">
        <p>The teacher's space, on <Link className="underline" href="/enseignant">/enseignant</Link>, requires a verified account and speaks only of the room you are standing in. The old address /session still leads there.</p>
        <ul className="list-inside list-disc space-y-1">
          <li><b>Open the room</b>: the room password unlocks the platform's key for the duration you choose. <b>That unlock is bounded to your school's local network</b>: it applies to the pupils calling from that network, and to them alone — elsewhere on the internet nothing changes. Every call is recognised by the network's IP and charged to the school. A duration is asked for so that the room closes by itself if it is forgotten, and you can close it before time. Two schools can have their rooms open at once without sharing anything. No pupil needs an account or a key. One consequence to know: <b>you cannot open the room from home</b> — the password only opens the school of the network the request comes from. From home you can still prepare the session and deploy a tutor.</li>
          <li><b>Deploy a tutor</b>: the chosen tutor arrives pre-selected for every student in the room, with or without web search. You may also restrict the session's providers; unticking them all is a legitimate choice, and it closes — the school's key then serves nothing. The filter applies to the keys EduChat serves, the school's as well as a personal credit: only a student bringing their own key does not depend on it. They do, however, stay within the school's perimeter: on that network their key opens only the compliant providers, unless it is already attached to their account.</li>
          <li><b>The session targets the room, not your account</b>: it is recognised by the network's IP address. A teacher visiting another school opens the room of that school, not of their own.</li>
          <li><b>Review the school's tutors</b>: tutors proposed by colleagues, and the comments left on those pages, are moderated here. It is open to the school's administrators and to any teacher whose main school it is — the one an administration assigned to them. Administrator rank is not required: approving a colleague's tutor is an act of teaching.</li>
          <li><b>Several schools</b>: an account may teach in several schools. A selector at the top of the page says which one is being talked about — moderation and the school space follow it.</li>
        </ul>
      </Section>

      <Section id="etablissement" title="Schools — the school at home">
        <p><b>Why this site exists.</b> A school cannot open an API contract with an AI provider: that takes a corporate card, pay-as-you-go billing and an invoice in dollars. It can, however, settle an invoice by bank transfer. The obstacle lies in the means of payment, not in the budget: EduChat signs that contract in its place and stands between the school and the providers.</p>
        <p><b>Registering on your own.</b> From <Link className="underline" href="/etablissement">/etablissement</Link>, with a verified email address: a name, the IP addresses of the school network, a billing address. Nobody needs to write to us to get started. The wallet starts at zero, and the form says so before you sign: nothing passes through the school's key until it is funded.</p>
        <p><b>The school's front page.</b> /etablissement is no longer a closed door. Anyone arriving from their school's network sees the school's name and the tutors it opens to them, with no account and no password. From a network nobody has declared, the page offers to register a school instead.</p>
        <p><b>The prepaid wallet.</b> The school funds a sum; every call made on the platform's key is debited from it <b>at cost</b> — the tokens are counted at the published rate of the model used (Anthropic, OpenAI, Mistral) and <b>nothing is added to it</b>. The rate applied is that of the <b>model actually called</b>, input and output separately — two prices whose ratio runs from 1 to 5 at every provider, and which a single price could not represent. They are read off OpenRouter's public catalogue for the rungs of the three GDPR-compliant providers, and every call carries on its own line the two prices it was charged: an invoice is never recomputed at today's rate, and a rate that changes tonight cannot move by one cent what was owed this morning. The invoice therefore names the model, separates incoming from outgoing tokens, and shows both prices: reopen the model's public price page, multiply, and you get our figure. <b>And when a model has no recorded price</b> — a name changed at the provider, a probe that has not yet run — nothing stops and nothing counts as zero: the call is billed at the price of the most expensive rung known for that provider, which errs on the safe side for the budget, and that fallback is spelled out on the invoice line and in the wallet's ledger alike. A service that stands between a school and its providers has nothing better to offer than a statement the school can recompute itself; a margin melted into the token price, by contrast, is hard to verify and easy to suspect. So the administrators' screen shows, for the school's active provider, the rungs of the model ladder read off the public catalogue — input and output prices, dated, converted into the billing currency at the day's rate, or left in dollars when that rate could not be read, with a link under the table to the catalogue page where they were read. Those prices are indeed the ones that bill, as of the date they were read — but the table is still not an invoice: it states today's price, whereas every call already made has frozen its own. A price the site has not yet recorded is said to be missing rather than shown as zero. Access closes by itself once the credit runs out, and the check happens before the call: an answer already begun is paid for, so the overrun is bounded by one answer. The screen shows the balance, the spending of the last thirty days, the estimated autonomy in days, the suggested top-up, and the dated history of movements — top-up, consumption, adjustment. <b>As of today nothing is billed yet</b>: no payment method is wired up on the site, and a top-up is arranged by writing to us. In the meantime anyone can bring their own AI key.</p>
        <p><b>The contribution to costs: on the top-up, and once only.</b> It is no longer added to every token — it is withheld from the payment, at the rate the school has chosen between 3.5 and 10 % with a slider, and never less than 0.50 per top-up, because collection fees have a fixed part that a small payment would not cover. Topping up 100 therefore leaves 90 usable at 10 %, 96.50 at 3.5 %. The register records the two movements separately, the payment then the withholding: a net balance with no commission line is a figure nobody can recompute, and that is precisely what we are trying to avoid. The floor covers only the payment fees: at that level the platform pays for the server out of its own pocket. As long as a school has chosen nothing, the site's setting applies.</p>
        <p><b>What we did not take over, and the side effect.</b> The rule comes from OpenRouter, which takes no margin on inference and earns on credit purchases instead. Two of their practices were left out: <b>no commission on personal keys</b> — measuring it would mean logging the use of a private key, and <Link className="underline" href="/rgpd">the Privacy page</Link> promises the opposite in black and white; and <b>no expiry on credits</b> — on a school budget voted then spent slowly, that would be confiscation. One side effect remains, better read here than discovered: a school that tops up and does not consume has paid the contribution for nothing. Refunding the balance is provided for — it will go through the payment method, which is not open yet — and it returns the remaining credit, less the fees the payment provider does not return; it does not return the contribution already withheld.</p>
        <p><b>A school's tutors belong to it.</b> A tutor written from an account attached to the school is attached to it, and is not public by default: writing a tutor for your own students should not amount to publishing it for the whole world. It is the school that opens it outwards, tutor by tutor. In the other direction, it also decides whether its students see the public tutors of other schools — closed until it opens it. The platform catalogue remains visible in every case.</p>
        <p><b>What the school sets, and who sets it.</b> Free-access hours, a daily per-student quota, a monthly token ceiling, and the month's consumption by provider. Every attached teacher reads this screen; only an administrator of the school changes anything on it, and the page says so rather than letting it be discovered. Four blocks of this page go further — the wallet, the invoice and the rates, the accounts, and what the school opens or reserves among its tutors: for a teacher who is not an administrator, they are not locked, they are simply not there. IP addresses and billing status stay in the site's hands.</p>
        <p><b>Accounts and the invoice.</b> A colleague joins the school by verifying their email address from the school's network: nobody has to enrol them by hand, and they arrive with no administration rights. A school administrator then recognises them as a teacher and appoints other administrators of the same school. Attaching an account to a school, or moving it elsewhere, stays in the site's hands. They also complete the administrative particulars of the invoice — exact address, internal reference or order number, free note. None of these enters the calculation: the amount remains the wallet's. A month's invoice opens as a printable page, on <Link className="underline" href="/facture">/facture</Link>.</p>
        <p><b>Providers set aside.</b> Under the European AI Act, Grok, Gemini and the Chinese providers are offered to nobody who depends on the school's key, and it never pays for them — no more for a teacher than for a student. OpenRouter carries a warning flag rather than an AI Act exclusion: it is only an intermediary towards compliant models, and it is also the engine of the free demo. The flag is enough all the same — a school's list leaves out the red-flagged as well as the set-aside, and the school's key pays for neither. What an adult chooses for themselves, with their own account and key, does not go through the school's wallet and does not commit it — the section <a className="underline" href="#acces">“Which AI provider, for whom”</a> gives the whole rule.</p>
        <p><b>On data we stay exact.</b> The paid API contract guarantees that exchanges are not used to train the models, but they remain about thirty days with the provider, for abuse monitoring. Writing “no data retained” would be false — and a false promise is exactly what puts a school in the wrong on the day of an audit. <Link className="underline" href="/rgpd">The Privacy page</Link> details it, <Link className="underline" href="/etablissements">the schools guide</Link> shows the journeys, and <Link className="underline" href="/assistance">the Support page</Link> — readable without an account — gives the address of a human being, along with what a server installed in the school would involve.</p>
      </Section>

      <Section id="promptagogues" title="Promptagogues — creating a tutor">
        <p>A <b>promptagogue</b> (prompt + pedagogue) is a tutor's author. Anyone can become one:</p>
        <ol className="list-inside list-decimal space-y-2">
          <li><b>Identify yourself</b> (optional but recommended) on <Link className="underline" href="/verifier">/verifier</Link>: public name + email. The message carries a <b>link</b> that opens the account in one click, with nothing to retype, and the <b>six-digit code</b> for anyone reading their mail on another device — link and code both last fifteen minutes and serve once only. <b>No password, ever.</b> Without an account, publication is anonymous — testable and submittable via the secret URL, but all moderation (validation, unpublishing, archiving) will rest with the administration.</li>
          <li><b>Write</b> on <Link className="underline" href="/publier">/publier</Link>: a <b>unique proper name</b> (Pythagoras, Curie...), a catalogue description, the language, and the prompt itself — the provided template lays down the basic Socratic rules (never give the answer, advance by questions, encourage). Limits: 256 KB per prompt, 1 MB per author. Text only.</li>
          <li><b>Test</b>: the “under construction” draft has a secret URL — reading, editing, testing in the chat, and inviting testers by simply sharing the link.</li>
          <li><b>Refine in a duel</b> on <Link className="underline" href="/duel">/duel</Link> (promptagogues only): the same question to two tutors on the same model — or the same tutor on two models — to measure the effect of a wording.</li>
          <li><b>Submit</b>, then let validation do its work (next section).</li>
        </ol>
        <p><b>Afterwards:</b> editing a published tutor creates a <b>new version</b> — ongoing conversations stay on theirs and offer the switch, never forcing it. You can <b>unpublish your</b> tutors at any time from your workshop (the secret link) and republish them later (nothing is ever deleted: counters stay intact). The <b>anonymous comments</b> left on your pages await you: you moderate them (approve or hide). “Propose a variant” on any page pre-fills the form with the existing prompt and records the <b>lineage</b> (“inspired by”, shown on both pages): that is the path of personalisation. The <b>sync</b> option (ticked on /verifier) saves your profile on the server so you can retrieve your conversations and favourites in another browser.</p>
      </Section>

      <Section id="validation" title="The validation process">
        <div className="overflow-x-auto">
          <p className="whitespace-nowrap rounded bg-tertiary p-3 font-mono text-xs">
            under construction (secret URL) → submitted → <b className="text-green-400">published</b> ⇄ unpublished — nothing is ever deleted
          </p>
        </div>
        <ul className="list-inside list-disc space-y-1">
          <li><b>Under construction</b>: invisible in the catalogue, reachable only via its secret URL (128 random bits). Freely editable and testable.</li>
          <li><b>Submitted</b>: joins the validation queue, visible to validators only.</li>
          <li><b>A-priori validation</b>: an <b>administrator or any verified promptagogue</b> reviews the prompt and publishes it. This community choice protects students (a minor audience) while avoiding a single-validator bottleneck — it mostly filters anonymous proposals.</li>
          <li><b>Published</b>: in the catalogue, usable by everyone, counters active.</li>
          <li><b>Unpublished</b>: removed from the catalogue but kept — the author or the administration can <b>republish</b> it, and the administration <b>archive</b> it — to amend it, republish it first (permanently hidden from the admin interface, yet kept in the database: nothing is ever deleted, so consumption statistics stay exact).</li>
        </ul>
      </Section>

      <Section id="classement" title="How the best tutors are highlighted">
        <p>The default “<b>Recommended</b>” sort computes, in the database, a score for each published tutor:</p>
        <p className="overflow-x-auto rounded bg-tertiary p-3 font-mono text-xs">
          score = uses + 5 × average rating + 50 / (1 + age in days)
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li><b>uses</b> — every conversation started with the tutor counts: real popularity weighs in.</li>
          <li><b>5 × average rating</b> — perceived quality (1-5 stars) weighs up to 25 points: an excellent but recent tutor can overtake an old, moderately liked one.</li>
          <li><b>50 / (1 + age)</b> — a freshness bonus, strong in the first days then decreasing: new tutors get their chance to be seen, preventing the first published from monopolising the top (“snowball effect”).</li>
        </ul>
        <p>The other sorts are direct database columns: <b>most used</b> (uses), <b>best rated</b> (average, tie-broken by the number of ratings), <b>newest</b> (creation date), <b>tokens generated</b> (volume produced), <b>name</b> (alphabetical). And your <b>favourites</b> — purely local — are always pinned on top, in the order of the chosen sort.</p>
      </Section>

      <Section id="donnees" title="What is stored — and where">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="uppercase opacity-60">
              <tr><th className="py-1 pr-2">Data</th><th className="pr-2">Where</th><th>Detail</th></tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Conversations, personal API key, favourites, given ratings, attachments</td><td className="pr-2"><b>Your browser</b></td><td>Never on the server (attachments are only relayed to the provider). The personal key is kept in THIS browser so you need not retype it — see <Link className="underline" href="/rgpd">the Privacy page</Link>. Two exceptions: profile backup for accounts, and the key remembered on the server, on request.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Socratic tutors</td><td className="pr-2">Database</td><td>Full text, successive versions, lineage (“inspired by”), status, the owning school if there is one and whether it has been shared outside, automatic translations into the three other languages together with the source version they come from, anonymous counters (uses, tokens generated, sum and count of ratings).</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Promptagogue / teacher account</td><td className="pr-2">Database</td><td>Public name, email (never displayed), roles, sync option, and the <b>schools the account belongs to</b> — several are possible, with administration rights link by link and one main school. Verifying your address from a school's network attaches the account to it, <b>with no administration rights whatsoever</b>. Consumption on a school's key records the email of the teacher who opened the room. <b>No password exists.</b></td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Schools & consumption</td><td className="pr-2">Database</td><td>Name, network IP addresses, free-access hours, quotas, the contribution rate the school has chosen, billing address, whether other schools' catalogue is open, and the consumption log by school IP — no student personal data. Detailed in the <Link className="underline" href="/etablissements#donnees">schools guide</Link>.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Wallet and invoices</td><td className="pr-2">Database</td><td>Each school's balance, and the dated register of all its movements: top-up, consumption or adjustment, signed amount, balance afterwards, and who made it. The contribution withheld from a top-up appears there as a separate line, named and dated, so that the arithmetic can be redone by hand. An issued invoice freezes its amount, so that a change of rate does not rewrite the past; the administrative particulars a school adds live apart, so that a reissue never erases them. A personal wallet keeps the same register — balance and dated movements — but its consumption is logged with neither IP, nor school, nor teacher, and no screen lists these wallets: the administration sees the schools', never a person's.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Synced profile (optional)</td><td className="pr-2">Database</td><td>A copy of your browser profile, deletable at any time from /verifier.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Remembered API key (on request, accounts)</td><td className="pr-2">Database</td><td>Only if you tick “Remember my key” in the chat: your key is kept <b>encrypted</b> (AES-256-GCM), never travels back to the browser, and disappears as soon as you untick.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Home page “online” counter</td><td className="pr-2">Database</td><td>A non-reversible technical fingerprint of the browser (never the IP in clear) and the time of the last activity, erased after fifteen minutes.</td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="pages" title="All the site's pages">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="uppercase opacity-60">
              <tr><th className="py-1 pr-2">Page</th><th className="pr-2">For whom</th><th>Role</th></tr>
            </thead>
            <tbody>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/">/</Link></td><td className="pr-2">Everyone</td><td>Tutor catalogue — the home page</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2">/p/[name]</td><td className="pr-2">Everyone</td><td>A tutor's public page (full prompt, ratings, versions, lineage)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/chat">/chat</Link></td><td className="pr-2">Everyone</td><td>The chat, with or without a tutor: free demo without an account, your own key with one — streaming, attachments, voice</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/duel">/duel</Link></td><td className="pr-2">Promptagogues</td><td>Compare 2 tutors on 1 model, or 1 tutor on 2 models</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/publier">/publier</Link></td><td className="pr-2">Promptagogues</td><td>Create a tutor (guided template, variants with lineage)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2">/p/essai/[link]</td><td className="pr-2">Promptagogues + guests</td><td>A draft's workshop: read, edit, test, submit</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/verifier">/verifier</Link></td><td className="pr-2">Authors, teachers, admins</td><td>Identification by the link or the code received by email, no password</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/compte">/compte</Link></td><td className="pr-2">Accounts</td><td>The ACCOUNT: usage, keys, personal wallet (not open — no payment method), conversations, tutors — export or erase everything</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/enseignant">/enseignant</Link></td><td className="pr-2">Teachers</td><td>The CLASS: open the room, deploy a tutor, review the school's tutors (the old address /session leads there)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/school">/school</Link></td><td className="pr-2">A school's students</td><td>Chat on the school's key, behind teacher unlock</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/etablissement">/etablissement</Link></td><td className="pr-2">Schools</td><td>The SCHOOL: front page for anyone arriving from its network, school registration, and — for its administrators — hours, quotas, wallet, accounts, tutors and invoice</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/etablissements">/etablissements</Link></td><td className="pr-2">Schools</td><td>Dedicated guide: access, quotas, billing, journeys</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/facture">/facture</Link></td><td className="pr-2">Schools, site</td><td>A month's invoice, as a printable page (empty without an account)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/assistance">/assistance</Link></td><td className="pr-2">Everyone</td><td>Contacting us, and what a server installed in the school would involve — readable without an account</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/admin">/admin</Link></td><td className="pr-2">Super-administrators</td><td>THE PLATFORM: creating schools, rates, unpaid invoices, every school's wallet, the model ladder. Their list lives in the server configuration — no interface creates one</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/admin-demo">/admin-demo</Link></td><td className="pr-2">Everyone</td><td>Showcase of the administration interface, entirely invented: no real data</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/rgpd">/rgpd</Link></td><td className="pr-2">Everyone</td><td>Privacy (GDPR/nFADP), in 4 languages</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/tutoriel">/tutoriel</Link></td><td className="pr-2">Everyone</td><td>This guide, in 4 languages</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2">/police</td><td className="pr-2">Teachers</td><td>Independent classroom-management tool (outside the chat)</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs opacity-60">The site exists in French, English, Italian and German — the language switcher is on the home page.</p>
      </Section>
    </>
  );
}
