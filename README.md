# EduChat

A catalogue of **Socratic tutors** — prompts that turn a language model into an educator who
asks questions instead of handing out answers — with a chat to use them, a workshop to write
them, and everything a school needs to let a class in without giving anyone an account.

Live at **[educh.at](https://educh.at)**, in French, English, Italian and German.

Originally forked from [GPT-4 Playground](https://github.com/Nashex/gpt4-playground) by
[Nashex](https://github.com/Nashex); little of that code remains.

## Three ways in

| Who | How they get an answer | What they need |
|---|---|---|
| Anyone | The **free public fallback** — a small model, capped daily budget | Nothing |
| A visitor | Their **own API key**, typed in the chat | A key from any supported provider |
| A class | The **school's internal key**, opened by a teacher for the room | Nothing — no account, no key |

Students never have accounts. Access for a class is granted by network address and a teacher's
unlock, for a limited time, and billed to the school.

## What it does

**Catalogue.** Published tutors with search, six sortings (the default blends popularity,
ratings and freshness so a good new tutor is not buried), local favourites and 1–5 ratings.
Every tutor page shows the full prompt: school is free, and so is the text.

**Chat.** Streaming answers, attachments (images, PDF) and voice — dictation plus read-aloud —
where the provider supports them. A **Regenerate** button climbs a three-rung ladder of models,
from thriftiest to most thorough, so cost follows the demand rather than the fear of choosing
badly. Learners pick a provider, never a model name.

**Duel.** Two tutors on one model, or one tutor on two models, side by side. The only place
left where a model is named — which is precisely its purpose. Open to any verified account.

**Workshop.** Write a tutor from a Socratic template, test it behind a secret URL, share that
URL with colleagues, then submit it. Any verified promptagogue can publish it. Editing creates
a new version; ongoing conversations stay on theirs. Variants record an "inspired by" lineage.

**Nothing is ever deleted.** A published tutor belongs to the public domain of the site: it is
unpublished (reversibly) or archived, never removed — token billing must stay computable.

**Schools.** Self-service opening hours, a daily quota per student and a monthly cap per
school; a teacher console to open the room and deploy a tutor to the class; monthly billing
in tokens per provider, exportable as CSV, also broken down by teacher.

**Accounts without passwords.** Identity is proven by a six-digit code sent by email — there is
no password anywhere in the system. Verifying an email makes you a promptagogue.

**Guided tours.** The help page opens the real interfaces in a demonstration mode — unlocked,
fed with invented data, every control inert — and comments them element by element. Including
a static copy of the administration screen, so the product can be shown to an institution
without opening a real admin account.

## Data and the law

- **API keys are never remembered without consent.** Typing one stores it nowhere. Ticking
  "Remember my key" stores it in that browser (visitor) or on the server, AES-256-GCM
  encrypted (account) — and it never travels back to the browser.
- **Personal-key usage is never logged.** Only the internal school key is, for billing: IP of
  the school, provider, model, token count — never a pupil's identity.
- **Conversations stay in the browser** unless an account opts into server sync.
- **My data** (`/compte`) shows everything the server holds about an account, exports it in one
  file, and erases what can be erased.
- **AI Act.** Providers with no recognised EU transfer framework are absent from the public
  interface and unreachable from a school network, whatever the account and whatever the key.
  They return behind an adult-verified account, certified by a named guarantor — no identity
  document is ever requested or kept.

Details, in four languages, on `/rgpd`.

## Providers

Mistral, Anthropic (Claude) and OpenAI (ChatGPT) are offered in the public interface;
OpenRouter serves the free fallback. Grok, Gemini and five Chinese providers (DeepSeek, Qwen,
Kimi, GLM, MiniMax) are implemented and kept in the code, but hidden pending adult
verification. Gemini waits on Vertex AI, whose contractual framework the free AI Studio key
does not provide.

The model catalogue is rebuilt once a day from each provider's own list — natively where the
server holds a key, otherwise deduced from OpenRouter's public catalogue — and cached in a
JSON file. The administration sets the three rungs per provider, and any rung the provider no
longer publishes is flagged.

## Configuration

Copy `conf/(dot)env.txt` to `educhat.env` (Docker) or `.env` (local) and fill what you need.
Everything is optional except the provider key you intend to serve.

```dotenv
# Provider keys held by the server (internal school key + free fallback)
SECRET_MISTRAL_API_KEY=
SECRET_ANTHROPIC_API_KEY=
SECRET_OPENAI_API_KEY=
SECRET_OPENROUTER_API_KEY=
SECRET_GEMINI_API_KEY=
SECRET_XAI_API_KEY=

# Free public fallback: provider, then an ordered cascade of models
SECRET_FREE_PROVIDER=openrouter
SECRET_FREE_MODEL=model-a:free,model-b:free,paid-fallback
SECRET_FREE_DAILY_USD=1
SECRET_FREE_PRICE_PER_MTOK=0.08

# School access
SECRET_PASSWD=              # bcrypt hash — the room unlock password
SECRET_ALLOWED_IPS=
SECRET_ALLOWED_HOURS=
SECRET_MAX_UNLOCK_MINUTES=240
SET_TIME_ZONE=Europe/Zurich

# Accounts, administration, email
SECRET_TOKEN_KEY=           # REQUIRED in production: signs account tokens and
                            # encrypts remembered keys. Without it, a public
                            # fallback key is used and anyone can forge a token.
SECRET_ADMIN_EMAILS=
SECRET_SMTP_HOST=
SECRET_SMTP_PORT=587
SECRET_SMTP_USER=
SECRET_SMTP_PASS=
SECRET_SMTP_FROM=EduChat <noreply@example.org>
SECRET_SMTP_BCC=            # blind copy of outgoing mail, for monitoring —
                            # never of the two messages carrying a code
SECRET_ALERT_IP_TOKENS_DAILY=100000

# Behind a reverse proxy
SECRET_PROXY_TOKEN=         # header X-Proxy-Token, proves the proxy is yours
TRUSTED_PROXY_IPS=
DATA_DIR=/data              # SQLite database and the model cache
```

Never prefix a secret with `NEXT_PUBLIC_`: that would ship it to the browser.

Without `SECRET_SMTP_HOST`, verification codes are printed to the server log — the whole flow
stays testable without a mailbox.

## Running it

Locally, with [Node.js](https://nodejs.org/) 20 and Yarn:

```bash
yarn install
yarn dev
```

The site answers on `localhost:3000`. `yarn build && yarn start` runs the production build.

In production, Docker Compose:

```bash
docker compose up -d --build
```

The database is SQLite (better-sqlite3, WAL) in `DATA_DIR`, created and migrated on first use.
Migrations are additive `ALTER TABLE`s: an existing database is upgraded in place, never
rewritten.

## Layout

```
src/pages/          routes and API endpoints (Next.js pages router)
src/pages/api/      the server: completion, prompts, accounts, schools, admin
src/server/         database, provider dialects, mail, tokens, access rules
src/chat/           chat interface, settings bar, guided tour
src/tutorial/       the four-language guide
src/i18n/           flat dictionaries fr / en / it / de
planning/           the design notes this project was built from
```

## About

Written for the RESPIRE schools by a full-time teacher at the Gymnasium of Chamblandes,
Switzerland — which means limited time for maintenance. Issues and pull requests are welcome;
answers may take a while.
