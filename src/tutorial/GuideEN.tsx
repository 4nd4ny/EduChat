import Link from "next/link";
import React from "react";
import { MdSchool, MdTour } from "react-icons/md";
import { GuidedWalk, Mindmap, Profile, Section, WalkStep } from "./shared";

// EduChat guide — ENGLISH version. Mirrors GuideFR structure exactly.

const PROFILES: Profile[] = [
  { color: "#4FC3F7", topic: "Student · Visitor", anchor: "#eleves", leaves: [
    ["Pick a tutor", "#eleves"], ["Chat (own key)", "#eleves"],
    ["Favourites & ratings", "#eleves"], ["Export your profile", "#eleves"] ] },
  { color: "#DC6521", topic: "Promptagogue", anchor: "#promptagogues", leaves: [
    ["Verify your email", "#promptagogues"], ["Publish a tutor", "#promptagogues"],
    ["Test via secret link", "#validation"], ["Duel & variants", "#promptagogues"] ] },
  { color: "#81C784", topic: "Teacher", anchor: "/etablissements", leaves: [
    ["Unlock /school", "/etablissements"], ["Deploy to the class", "/etablissements"],
    ["Email account", "/etablissements"] ] },
  { color: "#BA68C8", topic: "School", anchor: "/etablissements", leaves: [
    ["Self-service hours", "/etablissements"], ["Per-student quota", "/etablissements"],
    ["Monthly budget", "/etablissements"], ["Journeys (diagrams)", "/etablissements"] ] },
  { color: "#FFD54F", topic: "Administrator", anchor: "#admin", leaves: [
    ["Approve tutors", "#validation"], ["Manage schools", "/etablissements"],
    ["Billing (CSV)", "/etablissements"] ] },
];

const WALK: WalkStep[] = [
  {
    title: "The catalogue, heart of the site",
    text: "The home page lists the published Socratic tutors. Search, sort (recommended, most used, best rated...), add favourites (the star — your favourites rise to the top). Each tutor is a system prompt that turns the AI into an educator who asks questions instead of giving answers.",
    href: "/en", hrefLabel: "Open the catalogue",
  },
  {
    title: "A tutor's page",
    text: "Click a name to read its page: description, statistics, ratings, lineage (\"inspired by\"), and the FULL text of the prompt — everything is public, school is free. This is where you rate (1 to 5 stars), copy the link to recommend, and propose a variant.",
    href: "/en/p/Socrate", hrefLabel: "See Socrate's page",
  },
  {
    title: "Trying a tutor",
    text: "\"Try\" opens the chat with that tutor in charge (banner at the top). On the public site, enter your personal API key (\"Personal key\" field): it stays in the page — remembered only if you ask — and it unlocks attachments (images, PDF) and voice chat. Replies stream in live, as they are generated.",
    href: "/en/chat?tuteur=Socrate", hrefLabel: "Try Socrate",
  },
  {
    title: "Proposing your own tutor",
    text: "The \"Propose a tutor\" form starts from a Socratic template: give a unique proper name, a description, adapt the rules. You can publish under your name (email verified in 30 seconds, no password) or anonymously.",
    href: "/en/publier", hrefLabel: "Open the form",
  },
  {
    title: "Testing before submitting",
    text: "Your prompt is born \"under construction\": a secret URL lets you read, edit and TEST it in the chat — share that link with colleagues for feedback, it is not locked. When it is ready: \"Submit for publication\".",
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
    text: "Schools have their own guide: account-free access for students, deploying a tutor to the class, self-service hours and budgets, billing. Everything is explained with journey diagrams.",
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

      <Link href="/chat?tuteur=Socrate&visite=1"
        className="mt-6 flex items-center gap-3 rounded-lg border border-[#DC6521]/50 bg-[#DC6521]/10 p-4 hover:bg-[#DC6521]/20">
        <MdTour className="text-2xl text-[#DC6521]" />
        <span className="text-sm">
          <b>Interactive interface tour</b> — the chat screen opens and each element
          (tutor, provider, key, microphone…) is presented in turn, in 40 seconds.
        </span>
      </Link>

      <div id="visite" className="mt-8 scroll-mt-6">
        <GuidedWalk steps={WALK}
          labels={{ title: "Guided walkthrough", stepAria: "Step", prev: "Previous", next: "Next" }} />
      </div>

      <Link href="/etablissements"
        className="mt-8 flex items-center gap-3 rounded-lg border border-[#BA68C8]/40 bg-[#BA68C8]/10 p-4 hover:bg-[#BA68C8]/15">
        <MdSchool className="text-2xl text-[#BA68C8]" />
        <span className="text-sm">
          <b>Do you represent a school, or are you a teacher?</b> Student access, deploying a
          tutor to the class, hours and budgets, billing, journey diagrams:{" "}
          <span className="underline">see the schools guide →</span>
        </span>
      </Link>

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
          <li><b>Through a school</b>: on <Link className="underline" href="/school">/school</Link>, no account or key — see the <Link className="underline" href="/etablissements">schools guide</Link>.</li>
          <li><b>Privacy</b>: detailed on <Link className="underline" href="/rgpd">the privacy page</Link> — students never have accounts.</li>
        </ul>
      </Section>

      <Section id="promptagogues" title="Promptagogues — creating a tutor">
        <p>A <b>promptagogue</b> (prompt + pedagogue) is a tutor's author. Anyone can become one:</p>
        <ol className="list-inside list-decimal space-y-2">
          <li><b>Identify yourself</b> (optional but recommended) on <Link className="underline" href="/verifier">/verifier</Link>: public name + email, confirmed by a six-digit code received by email. <b>No password, ever.</b> Without an account, publication is anonymous — testable and submittable via the secret URL, but all moderation (validation, unpublishing, archiving) will rest with the administration.</li>
          <li><b>Write</b> on <Link className="underline" href="/publier">/publier</Link>: a <b>unique proper name</b> (Pythagoras, Curie...), a catalogue description, the language, and the prompt itself — the provided template lays down the basic Socratic rules (never give the answer, advance by questions, encourage). Limits: 256 KB per prompt, 1 MB per author. Text only.</li>
          <li><b>Test</b>: the \"under construction\" draft has a secret URL — reading, editing, testing in the chat, and inviting testers by simply sharing the link.</li>
          <li><b>Refine in a duel</b> on <Link className="underline" href="/duel">/duel</Link> (promptagogues only): the same question to two tutors on the same model — or the same tutor on two models — to measure the effect of a wording.</li>
          <li><b>Submit</b>, then let validation do its work (next section).</li>
        </ol>
        <p><b>Afterwards:</b> editing a published tutor creates a <b>new version</b> — ongoing conversations stay on theirs and offer the switch, never forcing it. You can <b>unpublish your</b> tutors at any time from your workshop (the secret link) and republish them later (nothing is ever deleted: counters stay intact). The <b>anonymous comments</b> left on your pages await you: you moderate them (approve or hide). \"Propose a variant\" on any page pre-fills the form with the existing prompt and records the <b>lineage</b> (\"inspired by\", shown on both pages): that is the path of personalisation. The <b>sync</b> option (ticked on /verifier) saves your profile on the server so you can retrieve your conversations and favourites in another browser.</p>
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
        <p>The default \"<b>Recommended</b>\" sort computes, in the database, a score for each published tutor:</p>
        <p className="overflow-x-auto rounded bg-tertiary p-3 font-mono text-xs">
          score = uses + 5 × average rating + 50 / (1 + age in days)
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li><b>uses</b> — every conversation started with the tutor counts: real popularity weighs in.</li>
          <li><b>5 × average rating</b> — perceived quality (1-5 stars) weighs up to 25 points: an excellent but recent tutor can overtake an old, moderately liked one.</li>
          <li><b>50 / (1 + age)</b> — a freshness bonus, strong in the first days then decreasing: new tutors get their chance to be seen, preventing the first published from monopolising the top (\"snowball effect\").</li>
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
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Conversations, personal API key, favourites, given ratings, attachments</td><td className="pr-2"><b>Your browser</b></td><td>Never on the server (attachments are only relayed to the provider). The personal key is kept in THIS browser so you need not retype it — see the Privacy page. Two exceptions: profile backup for accounts, and the key remembered on the server, on request.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Socratic tutors</td><td className="pr-2">Database</td><td>Full text, successive versions, lineage (\"inspired by\"), status, anonymous counters (uses, tokens generated, sum and count of ratings).</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Promptagogue / teacher account</td><td className="pr-2">Database</td><td>Public name, email (never displayed), roles, sync option. <b>No password exists.</b></td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Schools & consumption</td><td className="pr-2">Database</td><td>Detailed in the <Link className="underline" href="/etablissements#donnees">schools guide</Link> (IP, hours, quotas, per-IP consumption log — no student personal data).</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Synced profile (optional)</td><td className="pr-2">Database</td><td>A copy of your browser profile, deletable at any time from /verifier.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Remembered API key (on request, accounts)</td><td className="pr-2">Database</td><td>Only if you tick « Remember my key » in the chat: your key is kept <b>encrypted</b> (AES-256-GCM), never travels back to the browser, and disappears as soon as you untick.</td></tr>
              <tr className="border-b border-white/5"><td className="py-1.5 pr-2">Home page &quot;online&quot; counter</td><td className="pr-2">Database</td><td>A non-reversible technical fingerprint of the browser (never the IP in clear) and the time of the last activity, erased after fifteen minutes.</td></tr>
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
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/compte">/compte</Link></td><td className="pr-2">Accounts</td><td>My data: usage, keys, conversations, tutors — export or erase everything</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/etablissements">/etablissements</Link></td><td className="pr-2">Schools</td><td>Dedicated guide: access, quotas, billing, journeys</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/school">/school</Link></td><td className="pr-2">Schools</td><td>Chat on the internal key, behind teacher unlock</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/etablissement">/etablissement</Link></td><td className="pr-2">School manager</td><td>Self-service hours, quotas and consumption</td></tr>
              <tr className="border-b border-white/5"><td className="py-1 pr-2"><Link className="underline" href="/admin">/admin</Link></td><td className="pr-2">Administration</td><td>Moderation, schools, teachers, billing</td></tr>
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
