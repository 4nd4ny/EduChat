# UC-02 — Noter un tuteur

| | |
|---|---|
| **Acteur principal** | Visiteur (anonyme ou identifié, élève compris) |
| **Acteurs secondaires** | — |
| **Déclencheur** | Le visiteur clique sur une étoile (1 à 5) de la fiche `/p/[name]` |
| **Pages** | `src/pages/p/[name].tsx` (anti-revote local : `src/utils/favorites.ts`, `getGivenRating` / `storeGivenRating`) |
| **API** | `POST /api/prompts/[name]/rate` |
| **Code serveur** | `src/pages/api/prompts/[name]/rate.ts`, `src/server/prompts.ts` (`porteeAppelant`, `getPublishedByName`), `src/server/access.ts` (`getClientIp`, `isRateLimited`) |

## Objectif

Laisser **n'importe qui** donner une note de 1 à 5 étoiles à un tuteur qu'il a le droit de voir, sans
compte. La note alimente la moyenne affichée sur les cartes et le tri `rating` / `score` du
catalogue (UC-01).

## Préconditions

- Le tuteur est **publié**, non archivé, et **visible** de l'appelant (même portée que le catalogue).
- Le navigateur n'a pas déjà noté ce tuteur (vérification **locale** seulement, `prompt-ratings`).

## Scénario nominal

1. Sur la fiche, le visiteur choisit un nombre d'étoiles ; la page n'envoie rien si une note est
   déjà mémorisée localement pour ce tuteur.
2. `POST /api/prompts/[name]/rate { stars }`.
3. Le serveur limite le débit (10 notes / minute / IP, périmètre `rate`), valide `stars` (entier de
   1 à 5 après conversion `Number`), résout la portée de l'appelant et relit le tuteur sous cette
   portée.
4. `rating_sum += stars`, `rating_count += 1` ; réponse `200 { ratingAvg, ratingCount }`, moyenne
   arrondie au dixième.
5. Le navigateur mémorise la note (`storeGivenRating`) et met à jour la fiche.

## Scénarios alternatifs

- **A1 — Tuteur réservé à une école.** Il se note depuis le réseau de cette école, ou par un
  enseignant de l'école identifié par son jeton (où qu'il soit).
- **A2 — Tuteur partagé d'une autre école.** Il se note depuis hors école (ou depuis une école au
  catalogue ouvert).
- **A3 — Même IP, plusieurs notes.** Aucun dédoublonnage serveur : derrière le NAT d'une école, toute
  la classe partage une IP. Seul le limiteur borne les abus.

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| `stars` absent, non numérique, non entier, hors 1–5 | `400 ERR_RATING_INVALID`, rien n'est compté |
| Tuteur inconnu, brouillon, en attente, dépublié, archivé, réservé à une autre école | `404 ERR_PROMPT_UNKNOWN` (indistinct : la route n'est pas un oracle d'existence) |
| Plus de 10 requêtes / minute depuis une IP (valides ou non) | `429 ERR_RATE_LIMIT`, rien n'est compté |
| Méthode autre que `POST` | `405`, `Allow: POST` |

## Règles métier et sécurité

- La note est **anonyme** : aucune identité, aucune IP n'est stockée avec elle.
- On ne note que ce qu'on peut voir : la portée (`porteeAppelant`) est la même que pour la fiche.
- Le limiteur s'applique **avant** la validation : une rafale de requêtes invalides épuise aussi le
  crédit de l'IP.
- L'anti-revote est local au navigateur, assumé comme suffisant pour une communauté scolaire.

## Postconditions

- `prompts.rating_sum` et `prompts.rating_count` incrémentés ; entrée `rate|<ip>` dans
  `rate_limit.json`.

## Anomalies constatées

- **Validation laxiste du type.** `src/pages/api/prompts/[name]/rate.ts:23` convertit par
  `Number(req.body?.stars)` : `true` vaut 1 étoile, `[5]` vaut 5, `"3"` vaut 3. Sans gravité (les
  bornes 1–5 tiennent), mais un corps mal formé est compté au lieu d'être refusé. Test :
  « comportement actuel : true et [5] passent la validation ».
- **Notation sans jeton depuis la fiche.** `src/pages/p/[name].tsx:104` envoie la note sans
  `authHeaders()` : un enseignant chez lui ne peut pas noter un tuteur réservé de son école (404),
  alors que la route l'accepte avec le jeton (scénario A1). Voir aussi UC-01.

## Tests

### Unitaires — `tests/unit/uc02-notation/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `debitEtIp.test.ts` | `getClientIp`, `isRateLimited` | X-Real-IP honoré sans proxy configuré, mal formé, X-Forwarded-For ignoré, socket illisible, secret de proxy exigé ; 10 par minute puis refus, séparation par IP et par périmètre |

La validation et la mise à jour des compteurs vivent dans la route elle-même : elles sont couvertes
par les tests fonctionnels. La portée et la moyenne (`toCard`) sont testées dans UC-01.

### Fonctionnels — `tests/functional/uc02-notation/notation.test.ts`

| Scénario | Test |
|---|---|
| Nominal | note comptée, moyenne renvoyée ; arrondi au dixième, reflété par la fiche |
| A3 | pas de dédoublonnage par IP |
| Nominal | chaîne « 3 » acceptée ; `true` / `[5]` acceptés (anomalie) |
| A1 | tuteur réservé noté depuis le réseau de l'école, ou par un enseignant identifié |
| A2 | tuteur partagé d'une autre école noté depuis hors école |
| Erreurs | notes invalides → 400 sans effet ; 404 indistinct ; 429 à la 11e requête ; invalides comptées par le limiteur ; 405 |
