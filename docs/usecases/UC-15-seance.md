# UC-15 — Déployer une séance sur la classe et suivre son état

| | |
|---|---|
| **Acteur principal** | Enseignant (salle ouverte par le mot de passe, ou compte enseignant / administrateur d'école) |
| **Acteurs secondaires** | Élèves de la salle (héritent de la séance sans compte), route de complétion (applique la séance) |
| **Déclencheur** | L'enseignant choisit un tuteur, la recherche web et les fournisseurs sur `/enseignant` puis clique « Déployer » ; ou l'écran `SessionSetup` qui suit un déverrouillage |
| **Pages** | `src/pages/enseignant.tsx` (console), `src/pages/session.tsx` (réexportation de la console), `src/context/SessionSetup.tsx`, `src/pages/school.tsx` (héritage côté élève) |
| **API** | `PUT /api/session-settings`, `GET /api/session-settings`, `GET /api/session-status` |
| **Code serveur** | `src/pages/api/session-settings.ts`, `src/pages/api/session-status.ts`, `src/server/seance.ts` (`seanceActive`, `seanceAutoriseFournisseur`, `parseFournisseursSeance`, `seanceRestreinte`, `SEANCE_SANS_FOURNISSEUR`), `src/server/appartenance.ts` (`ecoleEnseignante`, `choixEcole`, `ecoleActivePourCompte`), `src/server/access.ts` (`getAuthLockExpiry`, `mayUseServerKeys`, `salleDepuisIp`), `src/server/prompts.ts` (`getPublishedByName`, `CLAUSE_VISIBLE`) |

## Objectif

« Déployer sur une classe » : l'enseignant impose un **tuteur par défaut**, autorise ou coupe la
**recherche web** et restreint les **fournisseurs** servis sur la clé de l'école. Tous les postes
du réseau de l'école reçoivent ce réglage (tuteur présélectionné sur `/school`) jusqu'à
l'échéance de la salle. La console montre à tout moment l'état de la salle et de la séance.

## Préconditions

- Pour **écrire** : la salle de l'école d'où l'on écrit est ouverte (UC-14), **ou** le compte a un
  titre d'enseignement pour son école active (`ecoleEnseignante` : administrateur de l'école, ou
  `is_teacher` **et** école principale).
- Le tuteur choisi est publié et **visible** de l'école cible (`CLAUSE_VISIBLE`).

## Scénario nominal

1. La console lit `GET /api/session-status` (jeton + en-tête `x-educhat-ecole`) : salle,
   école de travail, séance en cours, fournisseurs proposables.
2. L'enseignant choisit un tuteur, la recherche web et coche des fournisseurs, puis
   `PUT /api/session-settings { promptName, webSearch, providers? }`.
3. Le serveur vérifie le droit d'écrire (salle appelante ouverte, ou titre d'enseignement),
   détermine l'**école cible** — celle du compte si titre, sinon celle de l'IP —, contrôle le
   tuteur dans la portée de cette école et filtre les fournisseurs.
4. Il enregistre (UPSERT) la ligne `session_settings` de l'école cible avec
   `set_by_email` (auteur, ou `null` sans compte) et une échéance = **verrou de la salle cible**,
   à défaut `maintenant + SECRET_MAX_UNLOCK_MINUTES` ; réponse `200 { ok: true, expiresAt }`.
5. Chaque poste de l'école appelle `GET /api/session-settings` (public, sans jeton, résolu par
   **IP**) et reçoit `{ promptName, webSearch, expiresAt, providers, providersRestricted }`.
6. La complétion applique la séance via `seanceActive` / `seanceAutoriseFournisseur`.

## Scénarios alternatifs

- **A1 — Préparer de chez soi.** Un compte enseignant hors réseau écrit sur SON école ; échéance
  = verrou de l'école s'il est ouvert, sinon le plafond. Le GET de la maison ne voit rien.
- **A2 — Administrateur d'école** (lien `is_admin`, sans rôle enseignant) : autorisé.
- **A3 — Enseignant itinérant** : depuis la salle ouverte d'une autre école, la cible reste
  **son** école (jamais l'IP), et l'échéance est celle de son école.
- **A4 — Tuteur réservé** à l'école : déployable ; tuteur public d'une autre école : seulement si
  le catalogue de l'école cible est ouvert (`catalogue_ouvert`).
- **A5 — Fournisseurs.** Liste blanche `SCHOOL_PROVIDER_IDS` (mistral, anthropic, openai) :
  inconnus, écartés et drapeaux rouges ignorés sans erreur, doublons retirés. « Tout coché » sur
  l'**univers** (liste scolaire ∩ clés serveur) = colonne vide (aucune restriction) ; **tout
  décoché** = jeton `aucun` (restreint et vide : plus rien sur la clé de l'école).
- **A6 — Champ `providers` absent** : la restriction de la séance **en cours** est reconduite
  (y compris `aucun`, ou une liste dont plus rien ne survit) ; une séance expirée repart sans
  restriction.
- **A7 — GET sans objet** : hors école, sans séance ou séance expirée → `{ settings: null }`.
- **A8 — Tuteur devenu invisible** (archivé, réservé) après le déploiement : le GET rend
  `promptName: null` (la classe retombe sur le catalogue), la séance demeure.
- **État** (`/api/session-status`) : `etablissement` = la **salle** (IP) avec `open`
  (`mayUseServerKeys`), `withinSchedule`, `lockExpiresAt`, `salleOuvrable` ; `ecole` = l'école
  de **travail** (titre du compte, à défaut la salle) avec `settings` ; `surPlace` dit si ce sont
  les mêmes ; `schoolProviders` = univers des cases ; `maxUnlockMinutes`. `Cache-Control:
  private, no-store`.

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| Ni salle ouverte (de CE réseau) ni titre d'enseignement | `403 ERR_FORBIDDEN` |
| Élève rattaché par IP, case « enseignant » cochée | `403 ERR_FORBIDDEN` |
| Compte annonçant une école où il n'a pas de titre | `403 ERR_FORBIDDEN` |
| Salle d'amorçage ouverte, sans école en base ni compte | `400 ERR_NO_ETABLISSEMENT` |
| Tuteur inconnu, non publié, réservé à une autre école, public d'autrui avec catalogue fermé | `404 ERR_PROMPT_UNKNOWN` |
| Plus de 10 `PUT` / min / IP | `429 ERR_RATE_LIMIT` |
| Méthode autre que `GET`/`PUT` (resp. `GET` pour le statut) | `405 ERR_METHOD_NOT_ALLOWED` |

## Règles métier et sécurité

- La **cible** d'une écriture n'est jamais l'IP seule pour un compte : un enseignant ne peut pas
  pousser une séance à une autre école en forgeant une IP.
- La salle ouverte d'une **autre** école n'autorise rien ; le verrou autorise, il ne date pas :
  l'échéance vient de l'école **cible**.
- Le GET élève reste résolu par **IP** (héritage d'un lieu) ; le statut distingue lieu et école.
- `parseFournisseursSeance` refiltre toujours par la liste scolaire à la lecture ;
  `seanceRestreinte` lit la colonne **brute** : une restriction vide reste une restriction.
- `promptName` tronqué à 64 caractères ; aucune donnée personnelle dans le GET public.

## Postconditions

- Ligne `session_settings(etablissement_id)` créée ou remplacée : `default_prompt_id`,
  `web_search`, `providers` (`''`, liste CSV ou `aucun`), `set_by_email`, `expires_at`.

## Tests

### Unitaires — `tests/unit/uc15-seance/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `seance.test.ts` | `parseFournisseursSeance`, `seanceRestreinte`, `seanceActive`, `seanceAutoriseFournisseur`, `SEANCE_SANS_FOURNISSEUR`, `SCHOOL_PROVIDER_IDS` | décodage, doublons, refiltrage scolaire, jeton `aucun`, restriction lue sur la colonne brute, séance en cours / expirée / absente, autorisation par fournisseur (sans séance, sans restriction, liste, liste vide) |
| `ecoleEnseignante.test.ts` | `choixEcole`, `ecoleActivePourCompte`, `estEnseignantDe`, `ecoleEnseignante` | en-tête puis corps, valeurs invalides, choix revérifié, repli principale / plus ancien lien, titre enseignant ou admin, élève rattaché sans titre, jeton absent, école choisie sans titre |

### Fonctionnels — `tests/functional/uc15-seance/`

| Scénario | Test |
|---|---|
| Nominal | `seance.test.ts` — salle ouverte sans compte (échéance = verrou, héritage GET) ; compte enseignant (auteur retenu, sans tuteur imposé) |
| A1 | préparation de chez soi (plafond ; GET maison vide, GET salle rempli) ; alignement sur le verrou de l'école |
| A2 | administrateur d'école |
| A3 | enseignant itinérant : cible = son école, pas la salle |
| A4 | tuteur réservé ; tuteur public d'autrui selon `catalogue_ouvert` |
| A5 | liste blanche ; tout décoché → `aucun` ; `fournisseurs-cles.test.ts` : univers avec clés, tout coché → vide, partiel, case hors univers |
| A6 | reconduction, restriction sans survivant, séance expirée non reconduite |
| A7 / A8 | GET sans objet ; tuteur archivé → `promptName: null` |
| Droits / erreurs | 403 (rien, autre salle, élève rattaché, école sans titre), 404 tuteur, 429, 405, troncature du nom ; `fournisseurs-cles.test.ts` : amorçage → 400 |
| État | `etat.test.ts` — réponse complète sur place ; salle fermée ; de chez soi ; visiteur ; horaires propres ; salle d'une autre école ; élève rattaché ; 405 ; amorçage (`fournisseurs-cles.test.ts`) |

## Anomalies constatées

1. **La console nomme un tuteur que les élèves ne reçoivent plus** —
   `src/pages/api/session-status.ts:80` joint le tuteur sur `p.status = 'published'` seul,
   alors que `GET /api/session-settings` (`src/pages/api/session-settings.ts:48`) applique
   `CLAUSE_VISIBLE` (archivage, portée). Un tuteur archivé ou repris par son école après le
   déploiement reste affiché « déployé » sur `/enseignant` alors que les élèves retombent sur le
   catalogue (test « Comportement actuel discutable » de `etat.test.ts`).
