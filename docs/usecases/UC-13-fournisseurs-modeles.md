# UC-13 — Choisir un fournisseur et un modèle

| | |
|---|---|
| **Acteur principal** | Visiteur, élève, enseignant, promptagogue (sélecteur du chat, page « duel ») |
| **Acteurs secondaires** | Super-administrateur (catalogue), fournisseurs d'IA et OpenRouter (listes `/models`) |
| **Déclencheur** | Ouverture du chat ou des réglages ; choix d'un fournisseur ; saisie d'une clé personnelle ; bouton « Rafraîchir le catalogue » dans `/admin` |
| **Pages** | `src/chat/ChatSettings.tsx`, `src/chat/ChatInput.tsx`, `src/chat/useFournisseurs.ts`, `src/chat/useModelList.ts`, `src/administration/Modeles.tsx` (`CatalogueModeles`) |
| **API** | `GET /api/providers`, `GET` / `POST /api/models`, `GET` / `POST /api/admin/models` |
| **Code serveur** | `src/shared/providers.ts`, `src/server/accesFournisseurs.ts`, `src/server/fournisseurs.ts`, `src/server/models.ts`, `src/server/userKeys.ts`, `src/server/seance.ts` |

## Objectif

Ne proposer à chacun que les fournisseurs qu'il a **le droit de choisir ici et maintenant**,
dire lesquels la plateforme **paie** pour lui, et, pour le fournisseur choisi, proposer une
liste de modèles **que le fournisseur accepterait vraiment**. La règle du périmètre est écrite
une seule fois (`perimetreFournisseurs`) et appliquée à l'identique par la liste
(`/api/providers`) et par la complétion (`/api/completion`).

## Préconditions

- Aucune pour lire la liste. Un compte vérifié et/ou une clé personnelle élargissent le choix.
- Administration du catalogue : adresse listée dans `SECRET_ADMIN_EMAILS`.

## Scénario nominal

1. Le navigateur appelle `GET /api/providers` (avec le jeton s'il y en a un).
2. Le serveur lit l'**IP** (`getClientIp`), le **compte** (relu en base : `verified_at`), le
   **moyen propre** (clé mémorisée lisible ou crédit personnel > 0, lu en base) et renvoie :
   - `visibles` / `motif` / `campus` / `compte` — le périmètre (matrice ci-dessous) ;
   - `served` — fournisseurs ni écartés ni drapeau rouge, dont une **clé serveur** existe, et
     autorisés par la **séance** en cours ;
   - `internalKey` — la clé interne répond-elle depuis cette IP (école + salle ouverte ou plage horaire).
3. L'utilisateur choisit un fournisseur ; le navigateur appelle `GET /api/models?provider=…`.
4. Le serveur rend la liste en cache (`models.json` dans `DATA_DIR`), établie une fois par jour :
   liste **native** du fournisseur si une clé de catalogue existe, sinon **déduite d'OpenRouter**
   (OpenAI, Gemini, Grok), sinon le seul **modèle par défaut**. Liste triée, sans modèles non
   conversationnels (plongements, audio, image, OCR, « coder »…), défaut toujours inclus.
5. Le champ « Modèle » reste librement éditable ; dans le chat, le modèle par défaut vient de l'échelle (UC-12).

### Matrice du périmètre

| | Hors campus | Sur le campus (IP d'école, en base ou `SECRET_ALLOWED_IPS`) |
|---|---|---|
| **Anonyme** | `demo` : le seul fournisseur du repli gratuit (ou rien) | `ecole` : Mistral, Claude, ChatGPT |
| **Compte vérifié** | `tout` : les onze fournisseurs | `ecole`, ou `tout` s'il a un **moyen propre** associé avant de venir |

## Scénarios alternatifs

- **A1 — Clé saisie par le visiteur.** `POST /api/models { provider, apiKey }` : la clé sert
  uniquement à demander la liste native au fournisseur ; elle n'est ni journalisée ni
  conservée ; la réponse est `private, no-store`. Une liste de repli est remplacée **tout de
  suite** par la liste native.
- **A2 — Clé mémorisée.** `POST /api/models { provider }` avec un jeton : le serveur déchiffre
  la clé du compte et l'utilise ; elle ne redescend jamais au navigateur.
- **A3 — Clé fautive.** La liste retombe sur le repli ; aucun nouvel essai avec une clé avant
  une minute (purgatoire), pour ne pas marteler l'éditeur à chaque frappe.
- **A4 — Cache périmé.** L'ancienne liste est rendue aussitôt ; la nouvelle est construite en
  arrière-plan. Une seule interrogation en vol par fournisseur.
- **A4 bis — Panne à l'échéance.** Si la reconstruction ne rend qu'un repli de moins bonne
  source (native > OpenRouter > défaut), l'ancienne liste reste en place avec sa date d'origine
  et un nouvel essai a lieu au bout d'une heure (pas avant). Une liste qu'on n'arrive plus à
  confirmer depuis sept jours cède au repli. Vaut aussi pour la reconstruction de l'administration.
- **A5 — Séance restreinte.** L'enseignant a coché une liste : les autres sortent de `served`.
- **A6 — Repli gratuit.** `SECRET_FREE_PROVIDER` + clé serveur : c'est toute la liste d'un
  anonyme hors campus. Un fournisseur **écarté** (ex. faute de frappe `gemini`) n'est jamais servi.
- **A7 — Administration.** `GET /api/admin/models` : source (`native`, `openrouter`, `defaut`,
  `jamais`), nombre et date de chaque liste ; `POST` : reconstruction immédiate des onze listes
  (et sonde de tarifs si une liste a changé).

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| `/api/providers` autre que `GET` | `405 ERR_METHOD_NOT_ALLOWED` |
| `/api/models` : fournisseur absent ou inconnu | `400 ERR_PROVIDER_UNSUPPORTED` |
| `/api/models` autre que `GET`/`POST` | `405`, `Allow: GET, POST` |
| Fournisseur injoignable, clé refusée | pas d'erreur : ancienne liste si elle est meilleure et a moins de sept jours, sinon liste de repli (OpenRouter ou défaut) |
| `/api/admin/models` sans être super-administrateur (toute méthode) | `403 ERR_FORBIDDEN` |
| `/api/admin/models` autre que `GET`/`POST` (super-admin) | `405` |

## Règles métier et sécurité

- **Le périmètre n'est pas le paiement** : `visibles` dit ce qu'on peut choisir, `served` ce que la plateforme paie.
- La clé interne ne paie **jamais** un fournisseur écarté (AI Act) ni à drapeau rouge.
- Sur le campus, seul un moyen propre **lu en base** lève les règles de l'école — jamais une clé collée dans la requête.
- Un jeton ne vaut compte que si le compte existe et est vérifié en base.
- Une IP illisible compte pour une école (une école au proxy cassé continue de travailler).
- Une clé indéchiffrable ou un crédit nul ne valent pas moyen propre.
- `/api/providers` n'est jamais mis en cache partagé ; `/api/models` obtenu avec une clé non plus.
- Clés de **catalogue** (`CatalogueKeys`) distinctes des clés de **conversation** (`DeveloperKeys`).

## Postconditions

- `models.json` (dans `DATA_DIR`) contient la liste de chaque fournisseur interrogé, avec sa source et sa date.

## Anomalies constatées

- **Corrigée** — `refresh()` n'écrit plus une reconstruction de source moins bonne que la liste
  en cache : l'ancienne reste servie (date d'origine conservée), avec réessai dans l'heure et au
  plus sept jours de garde, au-delà desquels la règle « identifiants vraiment acceptés » reprend
  le dessus.
  *Constat d'origine :* **Une panne à l'échéance efface la bonne liste.** L'en-tête de `src/server/models.ts:23`
  promet qu'« une panne du catalogue laisse l'ancienne liste en place ». Mais `build()` ne lève
  jamais : quand l'appel natif échoue, il rend une entrée `defaut` (le seul modèle par défaut),
  que `refresh()` écrit sans condition dans le cache (`src/server/models.ts:217`). Après 24 h,
  une indisponibilité passagère du fournisseur remplace donc une liste native complète par un
  seul modèle, pour 24 h. Tests : « PANNE du fournisseur à l'échéance… », « PANNE : … sept jours… »,
  « PANNE pendant la reconstruction… » (`models.test.ts`).

## Tests

### Unitaires — `tests/unit/uc13-fournisseurs-modeles/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `providers.test.ts` | `providerDefaults`, `SCHOOL_PROVIDER_IDS`, `DUEL_PUBLIC_PROVIDER_IDS`, `isProviderId`, `isReasoningLevel`, `providerAcceptsAttachment`, `ERR` | onze fournisseurs, drapeaux `ecarte`/`wrng` (Gemini, OpenRouter, chinois), mention RGPD, liste scolaire, gardes de type, pièces jointes, codes d'erreur |
| `accesFournisseurs.test.ts` | `perimetreFournisseurs`, `aUnMoyenPropre`, `fournisseurLibre` | les quatre cases de la matrice, moyen propre ignoré pour un anonyme, compte non vérifié / effacé, IP illisible = campus, clé lisible/indéchiffrable, crédit > 0 / nul / négatif, repli gratuit (absent, sans clé, inconnu, écarté, servi), IP d'amorçage |
| `fournisseurs.test.ts` | `fournisseursServis`, `estServiParLEcole` | aucune clé, croisement règle × clé non blanche, fournisseur disparu |
| `models.test.ts` | `getModels`, `catalogueStatus`, `refreshAllModels` | défaut sans réseau, déduction OpenRouter, OpenRouter natif, en-têtes par dialecte (Bearer, x-api-key, x-goog), filtrage non conversationnel, clé visiteur non conservée, cache 24 h, périmé non bloquant, relecture disque, disque illisible, vol unique, panne : ancienne liste gardée, réessai après 1 h, garde de 7 jours, reconstruction admin (anomalie corrigée), amélioration par clé, purgatoire 1 min, état et reconstruction avec sonde de tarifs |

### Fonctionnels — `tests/functional/uc13-fournisseurs-modeles/fournisseurs.test.ts`

| Scénario | Test |
|---|---|
| Nominal / matrice | anonyme hors campus (vide) ; élève sur le campus ; compte hors campus ; compte sur le campus avec clé mémorisée, avec crédit |
| A6 | repli gratuit OpenRouter, jamais « servi » |
| Règle | jeton d'un compte disparu → `demo` |
| Nominal | `served` = scolaires avec clé serveur |
| A5 | séance restreinte, clé interne en plage horaire ; hors plage → `internalKey: false` |
| Nominal (modèles) | `GET` public déduit d'OpenRouter, cache 1 h ; défaut seul |
| A1 / A2 | `POST` avec clé saisie (native, `no-store`) ; clé mémorisée d'un compte ; anonyme sans clé |
| Erreurs | fournisseur absent/inconnu `400` ; méthodes `405` |
| A7 | état « jamais » puis source ; reconstruction des onze listes |
| Droits | anonyme, compte, admin d'école → `403` sans reconstruction |
