# UC-11 — Discuter avec un tuteur

| | |
|---|---|
| **Acteur principal** | Apprenant (visiteur anonyme, élève en classe, titulaire d'un compte) |
| **Acteurs secondaires** | Fournisseur d'IA (Mistral, Anthropic, OpenAI, OpenRouter, Gemini, Grok, fournisseurs compatibles OpenAI), école (paie sur son réseau), administration (alertée d'un usage intensif) |
| **Déclencheur** | L'apprenant envoie un message dans `/chat` (éventuellement `?tuteur=Nom` ou `?essai=<jeton>`), reprend une conversation `/chat/[id]`, ou compare deux colonnes dans `/duel` |
| **Pages** | `src/pages/chat.tsx`, `src/pages/chat/[id].tsx`, `src/pages/duel.tsx`, `src/context/AnthropicProvider.tsx` (`send`, `regenerate`), `src/chat/ChatInput.tsx` |
| **API** | `POST /api/completion` |
| **Code serveur** | `src/pages/api/completion.ts`, `src/server/llm.ts` (dialectes et flux), `src/server/accesFournisseurs.ts` (`perimetreFournisseurs`, `fournisseurLibre`, `aUnMoyenPropre`), `src/server/access.ts` (`mayUseServerKeys`, `isRateLimited`), `src/server/seance.ts`, `src/server/porteMonnaie.ts` (`aDuCredit`, `decompter`, `tarifDuModele`), `src/server/userKeys.ts` (`readUserKey`), `src/server/prompts.ts`, `src/server/traduction.ts`, `src/server/ladder.ts`, `src/shared/ladder.ts`, `src/shared/providers.ts` ; côté client `src/utils/streamCompletion.ts` |

## Objectif

Converser avec un **tuteur socratique** (ou en chat libre) sans que le navigateur ne voie jamais le
prompt système : le serveur résout le tuteur, choisit **qui paie** (clé personnelle, clé de l'école,
crédit personnel, ou démonstration gratuite), applique le **périmètre des fournisseurs** et les
quotas, appelle le fournisseur dans son dialecte et relaie la réponse **en flux NDJSON** (ou d'un
bloc en JSON).

## Préconditions

- Aucune pour la démonstration gratuite (si `SECRET_FREE_PROVIDER`/`SECRET_FREE_MODEL` et la clé
  serveur correspondante sont configurés).
- Clé personnelle : saisie dans la page, ou mémorisée sur le compte (`user_keys`, chiffrée).
- Clé de l'école : appel depuis une IP d'établissement dont la **salle est ouverte** (verrou posé
  par l'enseignant) ou dans une **plage horaire** de l'école.
- Tuteur : **publié** et **visible** de l'appelant (portée catalogue), ou brouillon par son jeton secret.

## Scénario nominal — clé personnelle, en flux

1. L'apprenant choisit un fournisseur (défaut : barreau 1 de l'échelle) et écrit sa question.
2. `requestCompletion` envoie `POST /api/completion { provider, apiKey?, rung, promptName?,
   promptVersion?, shareToken?, clientId, messages, locale, stream: true }` avec le jeton de compte.
3. Le serveur contrôle méthode, débit (30/min/IP), fournisseur, conversation, modèle (barreau de
   l'échelle réglée par l'administration, ou modèle nommé), puis la clé : tapée, sinon **mémorisée**.
4. Le **périmètre** (`perimetreFournisseurs`) autorise le fournisseur : compte hors campus → tous.
5. Le prompt système du tuteur est résolu **côté serveur** (nom publié et visible → texte de la
   version épinglée, ou traduction fraîche dans la langue du lecteur) et placé en tête ; les
   messages du client sont filtrés (`user`/`assistant` seulement).
6. `streamProviderResponse` appelle le fournisseur en SSE ; chaque fragment part au client en
   NDJSON : `start` (fournisseur, tuteur, version) → `delta`… → `done { tokenUsage }`.
7. Après succès : compteurs publics du tuteur (`usage_count`, `tokens_total`) et présence anonyme.
   **Aucune ligne de journal** pour une clé personnelle.

## Scénarios alternatifs

- **A1 — Réponse complète.** Sans `stream`, pour Gemini (pas de flux) ou en repli gratuit : JSON
  `{ reply, tokenUsage, provider, model, free, promptName?, promptVersion? }`.
- **A2 — Seconde chance.** Si le flux échoue **avant** tout fragment, le serveur retente en requête
  complète et émet le texte en un seul `delta`.
- **A3 — Repli gratuit public.** Anonyme (ou compte sans porte-monnaie) **hors campus**, sans clé :
  fournisseur et modèle **imposés** (`fournisseurLibre`, `SECRET_FREE_MODEL`), sans recherche web ni
  raisonnement, en JSON, `free: true`. **Cascade** : un modèle saturé cède la place au suivant (un
  seul modèle → deux tentatives). Journalisé **sans IP** ni établissement, `montant = 0`.
- **A4 — Clé interne de l'école.** Sur le réseau d'une école ouverte (verrou ou horaire), sans clé
  personnelle : clé serveur du fournisseur choisi, soumise à la séance, au porte-monnaie de l'école,
  au quota mensuel et au quota quotidien par élève (`clientId` anonyme, à défaut `ip:<adresse>`).
  Journalisée **avec IP**, établissement, enseignant de la séance et `client_id` ; décomptée au tarif
  du modèle réellement appelé (`montant`), sauf école RESPIRE (prix notés, rien prélevé).
- **A5 — Porte-monnaie personnel.** Compte vérifié ayant déjà provisionné, hors école ouverte :
  clé interne décomptée sur `users.solde`, journal **sans IP, sans établissement, sans enseignant**.
- **A6 — Tuteur.** Version épinglée antérieure → texte de cette version (`prompt_versions`) ;
  brouillon par `shareToken` → texte de l'auteur, jamais traduit ; chat libre → aucun prompt système,
  recherche web active (le tuteur, lui, décide via `web_search`, désactivée par défaut ; la séance peut la couper).
- **A7 — Pièces jointes.** Images/PDF (4 au plus, 8 Mo chacune) en clé personnelle uniquement, rattachées
  au dernier message utilisateur dans le dialecte du fournisseur.
- **A8 — Duel et modèle nommé.** `dual: true` réservé aux promptagogues vérifiés ; un modèle
  **hors échelle** chez OpenRouter exige un compte.
- **A9 — Régénérer.** Le client renvoie la conversation au barreau suivant (effort `low → medium → high`).

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| Méthode autre que `POST` | `405 ERR_METHOD_NOT_ALLOWED` (+ `Allow: POST`) |
| Plus de 30 requêtes / min / IP | `429 ERR_RATE_LIMIT` |
| Fournisseur inconnu | `400 ERR_PROVIDER_UNSUPPORTED` |
| Conversation absente, vide, ou sans message `user`/`assistant` | `400 ERR_EMPTY_CONVERSATION` |
| Modèle vide ou > 128 caractères | `400 ERR_MODEL_INVALID` |
| Corps > 48 Mo | refusé par le parseur de Next (`config.api.bodyParser.sizeLimit`) |
| `dual` sans rôle promptagogue relu en base | `403 ERR_PROMPTAGOGUE_ONLY` |
| Clé personnelle hors périmètre : réseau d'école / anonyme hors campus (ou jeton d'un compte disparu) | `403 ERR_PROVIDER_SCHOOL_NETWORK` / `403 ERR_PROVIDER_ACCOUNT_REQUIRED` |
| Modèle hors échelle chez OpenRouter sans compte | `403 ERR_PROVIDER_ACCOUNT_REQUIRED` |
| Pièces jointes : > 4, type non admis, base64 invalide ou > 8 Mo | `400 ERR_ATTACHMENTS_INVALID` |
| Pièces jointes sans clé personnelle / fournisseur incompatible | `403 ERR_ATTACHMENTS_KEY` / `400 ERR_ATTACHMENTS_UNSUPPORTED` |
| Tuteur inconnu, non publié, archivé, invisible (autre école), ou jeton secret inconnu | `404 ERR_PROMPT_UNKNOWN` |
| Clé interne demandée pour un fournisseur écarté ou à drapeau rouge (école ou crédit personnel) | `403 ERR_PROVIDER_NOT_ALLOWED` |
| Fournisseur non coché par l'enseignant pour la séance | `403 ERR_PROVIDER_NOT_IN_SESSION` |
| Porte-monnaie de l'école à sec (non RESPIRE) | `402 ERR_SCHOOL_NO_CREDIT` |
| Crédit personnel épuisé | `402 ERR_ACCOUNT_NO_CREDIT` |
| Quota mensuel de l'établissement / quota quotidien de l'élève | `429 ERR_QUOTA_ETABLISSEMENT` / `429 ERR_QUOTA_ELEVE` |
| Aucune clé serveur pour le fournisseur choisi | `503 ERR_NO_API_KEY` |
| Aucun accès (réseau d'école fermé, ou pas de repli gratuit) | `401 ERR_LOCKED` |
| Fournisseur en erreur (hors flux) / repli gratuit saturé | `502 ERR_UPSTREAM` / `503 ERR_FREE_BUSY` |
| Fournisseur en erreur après le début du flux | `200`, dernière ligne `{ type: "error", code: "ERR_UPSTREAM" }` |

## Règles métier et sécurité

- Le **prompt système** ne transite jamais par le client : `system` du corps et messages `system`
  sont ignorés. Le tuteur doit être visible de l'appelant (`CLAUSE_VISIBLE`) — pas seulement publié.
- Le **périmètre** (`perimetreFournisseurs`) ne mord que sur la clé personnelle ; sur le campus, seul
  un moyen de paiement **associé en base** (clé mémorisée ou crédit) lève les règles de l'école —
  jamais une clé collée dans la page.
- La **clé interne** (école ou crédit personnel) ne sert **jamais** un fournisseur écarté (`ecarte`)
  ni à drapeau rouge (`wrng`) ; elle n'est jamais offerte à un anonyme hors campus.
- Le **repli gratuit ne dessert pas une salle de classe** : sur le campus, hors horaire ou verrou, la
  réponse est `ERR_LOCKED`.
- Le verrou de salle ne vaut que pour les adresses de l'école qui l'a ouvert.
- Refus d'argent **avant** l'appel ; décompte **dans la même transaction** que la ligne de journal.
- Journal (`usage_log`) : IP seulement pour la clé d'école ; ni IP ni établissement pour le crédit
  personnel et le repli gratuit ; **rien** pour une clé personnelle.
- Alerte « IP gourmande » (clé d'école) : une notification par IP et par jour au-delà de
  `SECRET_ALERT_IP_TOKENS_DAILY`, sans blocage.

## Postconditions

- `prompts.usage_count` / `tokens_total` incrémentés (si tuteur), `presence` rafraîchie.
- Selon la voie : ligne `usage_log` (+ `credit_mouvements` et solde décrémenté), ou rien (BYOK).
- Éventuelle ligne `admin_alerts` et notification à l'administration.

## Tests

### Unitaires — `tests/unit/uc11-conversation/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `llm.test.ts` | `buildProviderRequest`, `isOpenAiCompatible`, `canStreamProvider`, `tokensDetail`, `tokensFromUsage`, `streamProviderResponse` | URL/en-têtes/corps de chaque dialecte (OpenAI, Grok, Anthropic, Gemini, OpenRouter payant/gratuit, compatibles OpenAI, Mistral), effort/budget, recherche web, pièces jointes par dialecte, vocabulaires de décompte, lecture SSE par fournisseur, CRLF/[DONE]/non-JSON/dernière ligne sans saut, erreurs HTTP et événements d'erreur, flux vide |
| `regles.test.ts` | `isRung`, `modelForRung`, `hasHigherRung`, `RUNG_REASONING`, `getLadder`/`setLadder`, `parseFournisseursSeance`, `seanceRestreinte`, `seanceAutoriseFournisseur`, `seanceActive`, `isProviderId`, `providerAcceptsAttachment`, `SCHOOL_PROVIDER_IDS` | bornage du barreau, échelle administrée avec trou, séance restreinte/vide/expirée, capacités des fournisseurs |
| `streamCompletion.test.ts` | `requestCompletion`, `CompletionError` (client) | JSON complet, en-têtes, erreurs codées, assemblage NDJSON, `onStart`/`onDelta`, événement `error`, flux interrompu |

### Fonctionnels — `tests/functional/uc11-conversation/`

`flux.ts` fabrique les flux SSE de chaque fournisseur pour la doublure de `fetch`.

| Scénario | Test (`conversation.test.ts`, sauf mention) |
|---|---|
| Nominal | BYOK tapée en flux : start/delta/done, clé et prompt transmis, aucun journal, compteurs du tuteur |
| Nominal | clé mémorisée utilisée sans être renvoyée |
| A1 | réponse JSON complète, modèle du barreau 3 ; Gemini en JSON malgré le flux demandé |
| A2 | seconde chance non streamée ; erreur en cours de flux → `error` |
| A3 | repli gratuit imposé, journal sans IP ; cascade ; cascade saturée ; compte sans porte-monnaie |
| A4 | salle ouverte : clé interne, journal avec IP, décompte ; horaire propre ; réseau fermé → `ERR_LOCKED` ; verrou sans effet hors réseau |
| A4 / erreurs | drapeaux rouges et écartés refusés ; école à sec ; RESPIRE ; quota mensuel ; quota par élève ; séance (fournisseurs, recherche web, enseignant) |
| Périmètre | clé tapée sur réseau d'école (Grok refusé) ; clé mémorisée qui lève les règles ; anonyme hors campus refusé ; OpenRouter : clé libre admise, modèle hors échelle réservé aux comptes ; jeton d'un compte disparu |
| A5 | crédit personnel décompté, journal sans IP ; crédit épuisé ; drapeau rouge refusé |
| A6 | prompt non remplaçable par le client ; chat libre ; recherche web du tuteur ; inconnu/brouillon/archivé → 404 ; `shareToken` ; version épinglée ; traduction fraîche/périmée ; tuteur réservé d'une autre école |
| A7 | image transmise ; refus (sans clé, incompatible, type, base64, nombre, taille) |
| A8 | duel réservé aux promptagogues |
| Erreurs | méthodes ; validation ; rôles non admis ; limite de 48 Mo ; 30 req/min |
| Configuration (`configurationServeur.test.ts`) | sans repli gratuit → `ERR_LOCKED` ; clé interne absente → `ERR_NO_API_KEY` ; alerte « IP gourmande » unique |

## Anomalies constatées

- **Version épinglée inexistante annoncée comme servie** — `src/pages/api/completion.ts:116-123`
  retombe sur le texte **courant** quand `promptVersion` ne figure pas dans `prompt_versions`, mais
  les réponses (`:769` en flux, `:845` en JSON) renvoient `promptVersion` tel que demandé dès qu'il
  est > 0. Le client épingle alors une version qui n'existe pas. Test :
  « version épinglée INEXISTANTE… » (comportement actuel figé).
