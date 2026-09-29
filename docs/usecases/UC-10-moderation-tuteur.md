# UC-10 — Modérer le cycle de vie d'un tuteur

| | |
|---|---|
| **Acteur principal** | Super-administrateur (site), administrateur d'école, enseignant, promptagogue |
| **Acteurs secondaires** | Auteur du tuteur (dépublie / republie le sien), service de traduction (UC-24, lancé à la publication) |
| **Déclencheur** | Un tuteur soumis apparaît dans la file de modération (`/admin`, `/enseignant`), ou l'auteur pilote son tuteur depuis `/p/essai/[token]` |
| **Pages** | `src/pages/admin.tsx`, `src/pages/enseignant.tsx` (composant `src/administration/Moderation.tsx`), `src/pages/p/essai/[token].tsx` |
| **API** | `PATCH /api/prompts/[name]` (`approve`, `retire`, `republish`, `archive`, `rename`, `partager`, `reserver`, `retranslate`), `DELETE /api/prompts/[name]`, `GET /api/admin/prompts[?portee=ecole]` |
| **Code serveur** | `src/server/admin.ts` (`requireAdmin`, `requireGestionTuteurs`, `porteeEcoleActive`, `tuteurDeLEcole`), `src/server/appartenance.ts` (`estAdminDe`, `estEnseignantDe`, `ecoleActivePourCompte`), `src/server/prompts.ts` (`CLAUSE_VISIBLE`, `estVisible`), `src/server/traduction.ts` (`planifierTraduction`) |

## Objectif

Faire passer un tuteur d'un état à l'autre selon le cycle

```
draft ── submit ──▶ pending ── approve ──▶ published ── retire ──▶ retired
                                               ▲──── republish ─────┘
```

et régler, sur un axe indépendant, **jusqu'où** paraît un tuteur d'école (`publie`). Principe
absolu : **rien n'est jamais supprimé** — `DELETE` est désactivé, `archive` ne fait que masquer
(la ligne, ses versions et ses compteurs restent, pour que la facturation reste recalculable).

## Préconditions

- Le tuteur existe (UC-09) et n'est pas archivé.
- L'acteur est identifié par un jeton de compte ; ses rôles sont relus en base (et le rang de
  super-administrateur dans `SECRET_ADMIN_EMAILS`).

## Scénario nominal — valider un tuteur soumis

1. Le modérateur ouvre la liste : `GET /api/admin/prompts` rend les tuteurs non archivés de sa
   portée, **soumis d'abord** (`pending`, `draft`, `published`, `retired`), avec corps et état des
   traductions.
2. Il lit le texte et valide : `PATCH /api/prompts/<nom> { action: 'approve' }` →
   `status = 'published'`, réponse `200 { ok: true, status: 'published' }`.
3. La traduction dans les trois autres langues est **planifiée en arrière-plan**
   (`planifierTraduction`) : son échec ne bloque jamais la publication (UC-24).
4. Le tuteur apparaît au catalogue et sur sa fiche, selon la règle de visibilité (`CLAUSE_VISIBLE`).

## Scénarios alternatifs

- **A1 — Qui approuve.** Le super-administrateur (depuis `pending` **ou** `draft`) ; tout
  promptagogue vérifié (depuis `pending` seulement) ; l'administrateur ou l'enseignant de l'école
  propriétaire (`requireGestionTuteurs` + `tuteurDeLEcole`, depuis `pending` seulement).
- **A2 — Dépublier / republier.** `retire` (depuis `published`) et `republish` (depuis
  `retired`) : réservés au super-administrateur et à l'**auteur identifié par son jeton** (pas à
  l'URL secrète, ni à l'école). `republish` replanifie la traduction.
- **A3 — Archiver.** `archive` : super-administrateur uniquement, sur un tuteur **non publié**.
  Le tuteur disparaît de la liste d'administration, son URL secrète répond 404, et toute action
  ultérieure répond `409 ERR_ARCHIVED`. Il ne compte plus dans le quota de son auteur.
- **A4 — Renommer.** `rename { newName }` : super-administrateur, même sur un tuteur publié (les
  liens `/p/nom` partagés tombent ; l'id, les versions et les compteurs restent).
- **A5 — Publier hors de l'école.** `partager` / `reserver` posent `publie = 1 / 0` : réservé à
  l'administration de l'école propriétaire (portée `ecole`) et au super-administrateur — **pas** à
  l'enseignant simple. Un tuteur de la plateforme (rattachement NULL) répond
  `409 ERR_NOT_SCHOOL_OWNED`.
- **A6 — Portée de la liste.** Super : tout ; administrateur d'école : ses tuteurs **et** ceux de
  la plateforme ; enseignant : ses tuteurs seulement. `?portee=ecole` (page `/enseignant`) ramène
  le super à son école active, ou à une liste vide s'il n'en a aucune.
- **A7 — Retraduire.** `retranslate { force? }` : super uniquement (détaillé dans UC-24).

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| Acteur sans le droit requis par l'action | `403 ERR_FORBIDDEN` |
| Transition impossible depuis l'état courant (approuver un brouillon hors super, dépublier un non-publié, archiver un publié…) | `409 ERR_STATUS` |
| Tuteur archivé | `409 ERR_ARCHIVED` (y compris pour `DELETE`) |
| `DELETE` | `403 ERR_DELETE_DISABLED` |
| Nouveau nom invalide / déjà pris | `400 ERR_NAME_INVALID` / `409 ERR_NAME_TAKEN` |
| Partager un tuteur de la plateforme | `409 ERR_NOT_SCHOOL_OWNED` |
| Tuteur inconnu | `404 ERR_PROMPT_UNKNOWN` |
| Action inconnue | `400 ERR_ACTION_UNKNOWN` |
| Plus de 20 écritures / min depuis une IP | `429 ERR_RATE_LIMIT` |
| `GET /api/admin/prompts` sans portée de gestion | `403 ERR_FORBIDDEN` |
| Méthode non autorisée | `405 ERR_METHOD_NOT_ALLOWED` (sur `/api/admin/prompts`, vérifiée **avant** les droits : `Allow: GET`, même pour un anonyme) |

## Règles métier et sécurité

- Rien n'est jamais supprimé : ni `DELETE`, ni suppression de versions.
- Un tuteur **d'école** n'est géré par une école que s'il lui est rattaché : le rattachement NULL
  (plateforme) n'appartient à aucune école (`tuteurDeLEcole` écarte le NULL avant de comparer).
- Le titre d'**enseignant** exige `is_teacher` **et** que l'école soit l'école principale du
  compte : un lien ramassé par IP ne donne aucun droit de modération.
- L'école active annoncée (`x-educhat-ecole`) n'est qu'une proposition, revérifiée en base.
- La visibilité (statut publié, non archivé, rattachement, `publie`) est filtrée **en base**,
  identiquement par `CLAUSE_VISIBLE` et `estVisible`.

## Postconditions

- `prompts.status`, `archived`, `name` ou `publie` mis à jour avec `updated_at` ; traductions
  planifiées après `approve` / `republish` ; aucune ligne supprimée.

## Anomalies constatées

- **Auto-validation.** Tout compte vérifié est promptagogue (UC-04), et `approve` accepte tout
  promptagogue (`src/pages/api/prompts/[name]/index.ts:246`). Un auteur peut donc soumettre puis
  **approuver son propre tuteur**, et un promptagogue de n'importe où peut valider un tuteur en
  attente rattaché à une école qui n'est pas la sienne : la modération a priori se contourne en
  deux gestes. Le commentaire parle d'une « décision client » ; à confirmer. Test :
  `moderation.test.ts` › « un auteur promptagogue peut soumettre puis approuver son propre tuteur ».
- **Corrigée** — `src/pages/api/admin/prompts.ts:18` vérifie la méthode avant les droits : un
  `POST` anonyme reçoit `405` (`Allow: GET`).
  Constat d'origine (mineur) : `GET /api/admin/prompts` vérifie les droits avant la méthode
  (`src/pages/api/admin/prompts.ts:14-19`) : un `POST` anonyme reçoit 403 au lieu de 405.
- **Ouverte** — **La liste de l'administrateur d'école contient des tuteurs qu'il ne peut pas
  modérer.** `GET /api/admin/prompts` (`src/pages/api/admin/prompts.ts:46`, filtre
  `etablissement_id = @etab OR etablissement_id IS NULL`) lui sert aussi les tuteurs de la
  plateforme, alors que `tuteurDeLEcole` (`src/server/admin.ts`) lui refuse toute action dessus
  (403). C'est l'incohérence déjà corrigée pour la file des commentaires (UC-03) ; elle reste ici
  en attente d'une décision : retirer ces tuteurs de sa liste, ou lui donner un droit de lecture
  seule explicite.

## Tests

### Unitaires — `tests/unit/uc10-moderation-tuteur/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `admin.test.ts` | `estMembre`, `estAdminDe`, `estEnseignantDe`, `requireAdmin`, `requireSuperAdmin`, `requireGestionTuteurs`, `porteeEcoleActive`, `tuteurDeLEcole` | lien / rang / titre distincts, élève « enseignant » par IP refusé ; super même rattaché ; admin borné à l'école active, choix non-membre ignoré ; enseignant ajouté, simple membre refusé ; drapeau `portee=ecole` ; NULL jamais à une école |
| `visibilite.test.ts` | `estVisible`, `getPublishedByName`, `listPublished`, `porteeDepuisIp`, `porteeDeLEcole`, `parametresPortee`, `nomsDeLEcole` | seul publié non archivé visible ; matrice école / dehors / `publie` / catalogue ouvert ; accord SQL ↔ JS ; noms de l'école |

### Fonctionnels — `tests/functional/uc10-moderation-tuteur/moderation.test.ts`

| Scénario | Test |
|---|---|
| Nominal | super approuve un tuteur soumis → catalogue + fiche, traduction échouée sans bloquer |
| Nominal / A2 | l'auteur dépublie (catalogue et fiche 404) puis republie |
| A1 | promptagogue : `pending` oui, `draft` non ; super publie un brouillon ; enseignant non promptagogue : son école seulement ; compte sans rôle et anonyme refusés ; auto-validation (anomalie) |
| A2 | super dépublie/republie ; tiers, admin/enseignant d'école, URL secrète refusés ; transitions invalides |
| A3 | archivage : hors liste, URL secrète 404, figé, ligne et versions intactes ; publié refusé ; réservé au super ; `DELETE` désactivé pour tous |
| A4 | renommage d'un publié (id conservé) ; nom invalide/pris ; non-super refusé |
| A5 | admin d'école partage puis réserve (visibilité dehors / chez elle) ; enseignant, autre école, auteur refusés ; super partout ; plateforme `ERR_NOT_SCHOOL_OWNED` |
| A6 | liste : super, admin d'école, enseignant ; `?portee=ecole` ; 403 ; 405 avant les droits (anonyme, compte sans rôle — anomalie corrigée) |
| Erreurs | tuteur inconnu, action inconnue, méthode ; `retranslate` réservé au super |
