import Link from "next/link";
import React from "react";
import { MdAccountCircle, MdAdminPanelSettings, MdChat, MdCoPresent, MdCompareArrows, MdSchool, MdSettings } from "react-icons/md";
import { DemoButtons, GuidedWalk, Mindmap, Profile, Section, WalkStep } from "./shared";

// EduChat guide — ENGLISH version. Mirrors GuideFR structure exactly.

const PROFILES: Profile[] = [
  { color: "#4FC3F7", topic: "Student · Visitor", anchor: "#eleves", leaves: [
    ["Pick a tutor", "#eleves"], ["Chat (own key)", "#eleves"],
    ["Favourites & ratings", "#eleves"], ["Export your profile", "#eleves"] ] },
  { color: "#DC6521", topic: "Promptagogue", anchor: "#promptagogues", leaves: [
    ["Verify your email", "#promptagogues"], ["Publish a tutor", "#promptagogues"],
    ["Test via secret link", "#validation"], ["Duel & variants", "#promptagogues"] ] },
  { color: "#81C784", topic: "Teacher", anchor: "#enseignants", leaves: [
    ["Open the room", "#enseignants"], ["Deploy a tutor", "#enseignants"],
    ["Review the school's tutors", "#enseignants"] ] },
  { color: "#BA68C8", topic: "School", anchor: "#etablissement", leaves: [
    ["Register your school", "#etablissement"], ["Prepaid wallet", "#etablissement"],
    ["Adjustable contribution", "#etablissement"], ["Its tutors are its own", "#etablissement"] ] },
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
    text: "“Try” opens the chat with that tutor in charge (banner at the top). On the public site, enter your personal API key (“Personal key” field): it stays in the page — remembered only if you ask — and it unlocks attachments (images, PDF) and voice chat. Replies stream in live, as they are generated.",
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
    text: "A school registers itself: a name, the IP addresses of its network, a billing address. Its wallet starts at zero, and a top-up is arranged by writing to us: no payment method is wired up on the site yet, and nothing is billed today. Once funded, every call is debited from it and access closes by itself when the credit runs out; students then write to tutors with no account and no key. The schools guide shows the journeys; the “Schools” section further down sums up what a school sets for itself.",
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
          <li><b>Try</b>: the chat opens with the tutor in charge; on the public site, your <b>personal API key</b> (never stored, unless you ask to remember it) powers the conversation, with the provider and reasoning level of your choice. Replies arrive <b>live</b>, as they are generated.</li>
          <li><b>Attachments</b> (personal key): attach an <b>image or a PDF</b> to your question, depending on the chosen provider.</li>
          <li><b>Voice chat</b> (personal key, compatible providers): dictate your question into the microphone, and voice mode reads replies aloud — handy on a smartphone.</li>
          <li><b>Favourites</b> (star) and <b>ratings</b> (1-5): kept in your browser; favourites rise to the top of the catalogue.</li>
          <li><b>Anonymous comments</b> on each page: leave usage feedback — it appears after moderation by the tutor's author or the administration.</li>
          <li><b>History</b>: your conversations stay in the browser. Renaming, deletion, per-conversation export (.md + .json), and <b>full profile export</b> (conversations + favourites + ratings) re-importable elsewhere by drag and drop.</li>
          <li><b>Token counter</b>: the total consumed shows under the input area and in the tab title.</li>
          <li><b>Through a school</b>: on <Link className="underline" href="/school">/school</Link>, no account or key — the school's own key powers the conversation, within the hours and quotas it has set. From the school network, <Link className="underline" href="/etablissement">/etablissement</Link> shows the school's name and the tutors it opens to its students.</li>
          <li><b>Privacy</b>: detailed on <Link className="underline" href="/rgpd">the Privacy page</Link> — students never have accounts.</li>
        </ul>
      </Section>

      <Section id="enseignants" title="Teachers — the class">
        <p>The teacher's space, on <Link className="underline" href="/enseignant">/enseignant</Link>, requires a verified account and speaks only of the room you are standing in. The old address /session still leads there.</p>
        <ul className="list-inside list-disc space-y-1">
          <li><b>Open the room</b>: the room password unlocks the school's key for everyone connected from the school network, for the duration you choose. No student needs an account or a key. You can close it before time.</li>
          <li><b>Deploy a tutor</b>: the chosen tutor arrives pre-selected for every student in the room, with or without web search. You may also restrict the session's providers; unticking them all is a legitimate choice, and it closes — the school's key then serves nothing. The filter only applies to that key: a student bringing their own does not depend on it.</li>
          <li><b>The session targets the room, not your account</b>: it is recognised by the network's IP address. A teacher visiting another school opens the room of that school, not of their own.</li>
          <li><b>Review the school's tutors</b>: tutors proposed by colleagues, and the comments left on those pages, are moderated here. It is open to the school's administrators and to any teacher whose main school it is — the one an administration assigned to them. Administrator rank is not required: approving a colleague's tutor is an act of teaching.</li>
          <li><b>Several schools</b>: an account may teach in several schools. A selector at the top of the page says which one is being talked about — moderation and the school space follow it.</li>
        </ul>
      </Section>

      <Section id="etablissement" title="Schools — the school at home">
        <p><b>Why this site exists.</b> A school cannot open an API contract with an AI provider: that takes a corporate card, pay-as-you-go billing and an invoice in dollars. It can, however, settle an invoice by bank transfer. The obstacle lies in the means of payment, not in the budget: EduChat signs that contract in its place and stands between the school and the providers.</p>
        <p><b>Registering on your own.</b> From <Link className="underline" href="/etablissement">/etablissement</Link>, with a verified email address: a name, the IP addresses of the school network, a billing address. Nobody needs to write to us to get started. The wallet starts at zero, and the form says so before you sign: nothing passes through the school's key until it is funded.</p>
        <p><b>The school's front page.</b> /etablissement is no longer a closed door. Anyone arriving from their school's network sees the school's name and the tutors it opens to them, with no account and no password. From a network nobody has declared, the page offers to register a school instead.</p>
        <p><b>The prepaid wallet.</b> The school funds a sum; every call made on the platform's key is debited from it at the current rate, and access closes by itself once the credit runs out. The check happens before the call: an answer already begun is paid for, so the overrun is bounded by one answer. The screen shows the balance, the spending of the last thirty days, the estimated autonomy in days, the suggested top-up, and the dated history of movements — top-up, consumption, adjustment. <b>As of today nothing is billed yet</b>: no payment method is wired up on the site, and a top-up is arranged by writing to us. In the meantime anyone can bring their own AI key.</p>
        <p><b>The contribution to costs, set by the school.</b> On top of consumption comes a contribution to running costs, and it is the school that sets the rate, between 3.5 and 10 %, with a slider. The floor covers only the payment fees: at that level the platform pays for the server out of its own pocket. As long as a school has chosen nothing, the site's setting applies.</p>
        <p><b>A school's tutors belong to it.</b> A tutor written from an account attached to the school is attached to it, and is not public by default: writing a tutor for your own students should not amount to publishing it for the whole world. It is the school that opens it outwards, tutor by tutor. In the other direction, it also decides whether its students see the public tutors of other schools — closed until it opens it. The platform catalogue remains visible in every case.</p>
        <p><b>What the school sets, and who sets it.</b> Free-access hours, a daily per-student quota, a monthly token ceiling, and the month's consumption by provider. Every attached teacher reads this screen; only an administrator of the school changes anything on it, and the page says so rather than letting it be discovered. IP addresses and billing status stay in the site's hands.</p>
        <p><b>Accounts and the invoice.</b> A colleague joins the school by verifying their email address from the school's network: nobody has to enrol them by hand, and they arrive with no administration rights. A school administrator then recognises them as a teacher, appoints other administrators of the same school, and certifies that an account holder is of age — never their own. Attaching an account to a school, or moving it elsewhere, stays in the site's hands. They also complete the administrative particulars of the invoice — exact address, internal reference or order number, free note. None of these enters the calculation: the amount remains the wallet's. A month's invoice opens as a printable page, on <Link className="underline" href="/facture">/facture</Link>.</p>
        <p><b>Providers set aside.</b> Under the European AI Act, Grok, Gemini and the Chinese providers are not offered in the public interface, and a school's key refuses them. They return only for an account whose majority has been certified, and never from a school network. OpenRouter carries a warning flag: it stays available, but is never paid for by a school.</p>
        <p><b>On data we stay exact.</b> The paid API contract guarantees that exchanges are not used to train the models, but they remain about thirty days with the provider, for abuse monitoring. Writing “no data retained” would be false — and a false promise is exactly what puts a school in the wrong on the day of an audit. <Link className="underline" href="/rgpd">The Privacy page</Link> details it, <Link className="underline" href="/etablissements">the schools guide</Link> shows the journeys, and <Link className="underline" href="/assistance">the Support page</Link> — readable without an account — gives the address of a human being, along with what a server installed in the school would involve.</p>
      </Section>

      <Section id="promptagogues" title="Promptagogues — creating a tutor">
        <p>A <b>promptagogue</b> (prompt + pedagogue) is a tutor's author. Anyone can become one:</p>
        <ol className="list-inside list-decimal space-y-2">
          <li><b>Identify yourself</b> (optional but recommended) on <Link className="underline" href="/verifier">/verifier</Link>: public name + email, confirmed by a six-digit code received by email. <b>No password, ever.</b> Without an account, publication is anonymous — testable and submittable via the secret URL, but all moderation (validation, unpublishing, archiving) will rest with the administration.</li>
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
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Wallet and invoices</td><td className="pr-2">Database</td><td>Each school's balance, and the dated register of all its movements: top-up, consumption or adjustment, signed amount, balance afterwards, and who made it. An issued invoice freezes its amount, so that a change of rate does not rewrite the past; the administrative particulars a school adds live apart, so that a reissue never erases them.</td></tr>
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
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/chat">/chat</Link></td><td className="pr-2">Everyone</td><td>Chat with your own key, with or without a tutor — streaming, attachments, voice</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/duel">/duel</Link></td><td className="pr-2">Promptagogues</td><td>Compare 2 tutors on 1 model, or 1 tutor on 2 models</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/publier">/publier</Link></td><td className="pr-2">Promptagogues</td><td>Create a tutor (guided template, variants with lineage)</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2">/p/essai/[link]</td><td className="pr-2">Promptagogues + guests</td><td>A draft's workshop: read, edit, test, submit</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/verifier">/verifier</Link></td><td className="pr-2">Authors, teachers, admins</td><td>Identification by email code, no password</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/compte">/compte</Link></td><td className="pr-2">Accounts</td><td>The ACCOUNT: usage, keys, conversations, tutors — export or erase everything</td></tr>
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
