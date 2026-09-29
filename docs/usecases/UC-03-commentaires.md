# UC-03 — Commenter un tuteur et modérer les commentaires

| | |
|---|---|
| **Acteur principal** | Visiteur (dépôt anonyme) ; modérateur (auteur du tuteur, école propriétaire, super-administrateur) |
| **Acteurs secondaires** | Administration du site (notifiée par courriel) |
| **Déclencheur** | Le visiteur écrit un commentaire sur la fiche `/p/[name]` ; un modérateur l'approuve ou le masque depuis la fiche, `/admin` ou `/enseignant` |
| **Pages** | `src/pages/p/[name].tsx` (dépôt, lecture, boutons de modération) ; files de modération de `/admin` et `/enseignant` |
| **API** | `GET` / `POST` / `PATCH /api/prompts/[name]/comments`, `GET /api/admin/comments` |
| **Code serveur** | `src/pages/api/prompts/[name]/comments.ts`, `src/pages/api/admin/comments.ts`, `src/server/admin.ts` (`requireAdmin`, `requireGestionTuteurs`, `porteeEcoleActive`, `tuteurDeLEcole`), `src/server/prompts.ts` (`estVisible`, `porteeAppelant`), `src/server/token.ts` (`isAdminEmail`), `src/server/mail.ts` (`notifyAdmin`) |

## Objectif

Permettre à **n'importe qui**, sans compte, de laisser un avis sur un tuteur visible ; l'avis reste
**invisible du public** tant qu'un modérateur ne l'a pas approuvé. Un commentaire n'est **jamais
supprimé** : il est `pending`, `approved` ou `hidden`.

## Préconditions

- Dépôt : le tuteur est publié, non archivé, et visible de l'appelant (même portée que la fiche).
- Modération : l'appelant est identifié et modérateur de **ce** tuteur.

## Scénario nominal — dépôt anonyme puis approbation par l'auteur

1. Le visiteur écrit un texte et l'envoie : `POST /api/prompts/[name]/comments { body }`.
2. Le serveur limite le débit (5 dépôts / minute / IP, périmètre `comment`), vérifie l'état du
   tuteur, rogne et valide le texte (3 à 2000 caractères), l'enregistre en `pending` **sans aucune
   identité** (ni compte, ni IP) : `201 { ok, id, status: 'pending' }`.
3. L'administration reçoit un courriel « Nouveau commentaire sur « nom » » — **au plus un par fiche et
   par heure** (clé `comment:<id>:<heure UTC>` dans `admin_alerts`).
4. Le public relit la fiche (`GET`) : `{ moderator: false, comments: [] }` — seuls les `approved`
   sont servis, sans statut.
5. L'auteur du tuteur (jeton) relit la fiche : `moderator: true`, tous les commentaires avec leur
   statut.
6. Il approuve : `PATCH { id, action: 'approve' }` → `200 { ok, status: 'approved' }` ;
   `moderated_at` et `moderated_by` (son adresse) sont notés. Le commentaire paraît au public.

## Scénarios alternatifs

- **A1 — Masquer.** `action: 'hide'` → `hidden` : le commentaire quitte la vue publique, la ligne
  reste en base.
- **A2 — Super-administrateur.** Modère tout, y compris les tuteurs anonymes de la plateforme (sans
  auteur) — c'est lui qui les couvre.
- **A3 — École propriétaire.** L'administrateur de l'école **et** ses enseignants (au sens de
  `estEnseignantDe`) modèrent les commentaires des tuteurs rattachés à leur école, où qu'ils soient.
  Jamais ceux d'une autre école, jamais ceux de la plateforme par cette route.
- **A4 — Tuteur non publié.** Un modérateur garde l'accès en lecture (brouillon, dépublié…), mais le
  dépôt y est refusé (`409 ERR_STATUS`).
- **A5 — Tuteur réservé.** Il se commente et se lit depuis le réseau de son école.
- **A6 — File de l'administration** (`GET /api/admin/comments`) : en attente d'abord (toutes), puis
  l'historique modéré (500 plus récents) avec `moderatedTotal`. Portée : le super voit tout ;
  l'administrateur d'école et l'enseignant, les tuteurs de leur école **seulement** — exactement ce
  que la route de modération leur accorde (`tuteurDeLEcole`). `?portee=ecole` ramène le super aux
  tuteurs de son école active (file vide s'il n'en a pas).

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| Tuteur inconnu | `404 ERR_PROMPT_UNKNOWN` |
| Pour un non-modérateur : tuteur brouillon, dépublié, archivé, réservé à une autre école (lecture comme dépôt) | `404 ERR_PROMPT_UNKNOWN` (indistinct) |
| Dépôt par un modérateur sur un tuteur non publié | `409 ERR_STATUS` |
| Texte rogné de moins de 3 ou plus de 2000 caractères | `400 ERR_COMMENT_INVALID` |
| Plus de 5 dépôts / minute depuis une IP | `429 ERR_RATE_LIMIT` |
| Modération par un anonyme ou un non-modérateur | `403 ERR_FORBIDDEN` |
| Action autre que `approve` / `hide` | `400 ERR_ACTION_UNKNOWN` |
| Identifiant inconnu, invalide, ou commentaire d'une autre fiche | `404 ERR_COMMENT_UNKNOWN` (rien n'est modifié) |
| Méthode autre que `GET`/`POST`/`PATCH` sur un tuteur accessible | `405`, `Allow: GET, POST, PATCH` |
| `/api/admin/comments` sans rang de gestion | `403 ERR_FORBIDDEN` (la garde passe **avant** la méthode, comportement couvert par un test ; la route sœur `/api/admin/prompts` vérifie, elle, la méthode d'abord — voir UC-10) |
| `/api/admin/comments` autre que `GET`, avec rang | `405`, `Allow: GET` |

## Règles métier et sécurité

- Le dépôt est **anonyme** même avec un jeton : la table `comments` n'a aucune colonne d'identité.
- La visibilité publique suit `estVisible` (même règle que `CLAUSE_VISIBLE`) : la route ne dit pas
  par un 200 ce que la fiche cache par un 404.
- `moderator = super-admin OU auteur du tuteur OU (gestion de tuteurs ET tuteurDeLEcole)`.
  Le rattachement `NULL` (plateforme) ne répond jamais vrai pour une école.
- Le simple lien d'appartenance (posé par l'IP) ne donne **aucun** droit de modération.
- Anti-rafale : une seule notification par fiche et par heure ; le détail attend dans `/admin`.

## Postconditions

- Dépôt : ligne `comments` (`pending`), éventuelle ligne `admin_alerts`, compteur `comment|<ip>`.
- Modération : `status`, `moderated_at`, `moderated_by` mis à jour ; jamais de suppression.

## Anomalies constatées

- **Corrigée** — `src/pages/api/admin/comments.ts:40` borne les deux niveaux d'école (administrateur
  et enseignant) aux tuteurs de leur école : la file est exactement ce que `tuteurDeLEcole` leur
  laisse modérer. Les commentaires de la plateforme restent au super-administrateur (`/admin`).
  Conséquence voulue : un super ramené à son école (`?portee=ecole`) n'y voit plus non plus la
  plateforme, qui ne relève d'aucune école.
  Constat d'origine : **file de l'administrateur d'école plus large que ses droits.** `src/pages/api/admin/comments.ts:35`
  sert à un administrateur d'école les commentaires des tuteurs de la **plateforme**
  (`OR p.etablissement_id IS NULL`), mais la route de modération
  (`src/pages/api/prompts/[name]/comments.ts:42`, via `tuteurDeLEcole`, `src/server/admin.ts:175`)
  lui refuse ces mêmes commentaires (`403`). C'est exactement ce que le commentaire de la route
  (`src/pages/api/admin/comments.ts:14`) dit vouloir éviter : « une liste plus large ne lui donnerait
  que des boutons répondant 403 ». Test : « comportement actuel : l'administrateur d'école reçoit les
  commentaires de la plateforme mais ne peut pas les modérer ».

## Tests

### Unitaires — `tests/unit/uc03-commentaires/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `gardes.test.ts` | `requireAdmin`, `requireGestionTuteurs`, `tuteurDeLEcole`, `porteeEcoleActive` | sans jeton, compte simple, super (même rattaché), admin d'école, enseignant, membre par IP, compte sans école ; propriété d'un tuteur (plateforme `NULL` jamais à une école) ; resserrement du super à son école active, ou null |

La visibilité (`estVisible`, `porteeAppelant`) est testée dans UC-01, le limiteur de débit dans UC-02.

### Fonctionnels — `tests/functional/uc03-commentaires/commentaires.test.ts`

| Scénario | Test |
|---|---|
| Nominal | dépôt `pending` invisible, vue modérateur avec statuts, approbation, parution publique, `moderated_by` |
| A1 | masquer sans supprimer |
| Règles | aucune identité stockée (ni compte, ni IP) |
| Nominal | notification unique par fiche et par heure |
| A2 | super-admin sur tuteur anonyme de la plateforme |
| A3 | admin et enseignant de l'école propriétaire ; enseignant d'une autre école refusé |
| A4 | modérateur sur brouillon : lecture oui, dépôt 409 |
| A5 | tuteur réservé commenté et lu depuis le réseau de l'école |
| Erreurs | 404 tuteur inconnu ; 404 indistinct pour le public ; texte 400 (bornes 3 / 2000) ; 429 au 6e dépôt ; 403 / 400 / 404 en modération ; 405 |
| A6 | file admin : 403 sans rang ; super (ordre, total) ; admin d'école (siens seulement) ; enseignant (siens) ; `?portee=ecole` (école active sans la plateforme) ; 405 après la garde |
| Anomalie corrigée | admin d'école et enseignant : chaque commentaire de la file se modère (200), celui de la plateforme n'y figure pas et reste refusé (403) |
