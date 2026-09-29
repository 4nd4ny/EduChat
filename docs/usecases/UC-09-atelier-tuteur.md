# UC-09 — Rédiger, tester et soumettre un tuteur (atelier du promptagogue)

| | |
|---|---|
| **Acteur principal** | Promptagogue (compte vérifié) ou visiteur anonyme |
| **Acteurs secondaires** | Testeurs invités par l'URL secrète, enseignants de l'école propriétaire, administration (notifiée) |
| **Déclencheur** | Le promptagogue remplit le formulaire de `/publier` (éventuellement `/publier?variante=Nom`) |
| **Pages** | `src/pages/publier.tsx`, `src/pages/p/essai/[token].tsx` |
| **API** | `POST /api/prompts`, `GET /api/drafts/[token]`, `PATCH /api/prompts/[name]` (`edit`, `submit`) |
| **Code serveur** | `src/server/prompts.ts` (`isValidPromptName`, `getByName`, `getByShareToken`, `toCard`, quotas), `src/server/appartenance.ts` (`ecoleEnseignante`, `ecolePrincipale`, `choixEcole`), `src/server/etablissements.ts` (`resolveEtablissementByIp`), `src/server/admin.ts` (`requireGestionTuteurs`, `tuteurDeLEcole`), `src/server/mail.ts` (`notifyAdmin`) |

## Objectif

Permettre à quiconque — identifié ou non — d'écrire un **tuteur socratique** (un prompt système),
de le tester en privé grâce à une **URL secrète** partageable avec des testeurs, de le corriger
(chaque correction du texte crée une **version**), puis de le **soumettre** à la modération. Le
tuteur n'entre au catalogue qu'après validation (UC-10).

## Préconditions

- Aucune pour déposer : le dépôt anonyme est permis (décision client).
- Pour un dépôt signé : un jeton de compte valide (UC-04).

## Scénario nominal — auteur identifié

1. Sur `/publier`, l'auteur saisit nom, langue, description, corps, et coche éventuellement la
   recherche web.
2. `POST /api/prompts { name, language, description, body, webSearch, inspiredBy? }` avec
   `Authorization: Bearer` : le serveur valide le nom, l'unicité, la taille, le quota de l'auteur,
   **résout le rattachement** (voir A3), crée la ligne `prompts` (`status = 'draft'`, `version = 1`,
   `share_token` = 128 bits aléatoires en hexadécimal) et la ligne `prompt_versions` n° 1.
   Réponse `201 { name, shareToken, status: 'draft' }`.
3. Le navigateur ouvre `/p/essai/<shareToken>` ; `GET /api/drafts/<shareToken>` rend la carte
   publique, le **corps** et le statut. L'auteur (ou tout testeur qui a reçu le lien) essaie le
   tuteur dans le chat (`/api/completion` avec `shareToken` : le corps du brouillon est servi tel
   quel, jamais une traduction).
4. L'auteur corrige : `PATCH /api/prompts/<nom> { action: 'edit', body?, description?, webSearch?, shareToken }`.
   Toute modification du **corps** incrémente la version et ajoute une ligne `prompt_versions` ;
   une modification de la seule description ou de `webSearch` ne crée pas de version.
   Réponse `200 { ok: true, version }`.
5. L'auteur soumet : `PATCH … { action: 'submit' }` → `status = 'pending'`, réponse
   `200 { ok: true, status: 'pending' }`, et l'administration reçoit « Prompt à modérer : <nom> ».

## Scénarios alternatifs

- **A1 — Dépôt anonyme.** Sans jeton, le tuteur est créé sans auteur (`author_email = NULL`,
  `author_name = ''`) et sans quota. L'URL secrète est la **seule clé** : présenter
  `shareToken` dans le corps du `PATCH` donne les droits d'auteur (`edit`, `submit`) **tant que
  le tuteur est un brouillon**. Une fois soumis, publié ou dépublié, le lien ne sert plus qu'à
  lire et tester (`GET /api/drafts/[token]`, `/api/completion`). La notification de soumission
  indique « ANONYME ».
- **A2 — Variante.** `/publier?variante=Socrate` pré-remplit le formulaire depuis la fiche
  originale (sans `?locale=`, donc le texte original). `inspiredBy` est résolu en
  `prompts.inspired_by` ; une source inconnue est ignorée silencieusement.
- **A3 — Rattachement à une école** (jamais reçu du client) :
  1. l'école du compte si le signataire y a un **titre** (`ecoleEnseignante` : administrateur de
     l'école active, ou enseignant dont c'est l'école principale ; l'en-tête `x-educhat-ecole`
     choisit parmi ses écoles) ;
  2. sinon l'**école principale** du compte (`users.etablissement_id`, promptagogue rattaché par
     l'administration) ;
  3. sinon l'établissement de l'**adresse IP** du dépôt (c'est ce qui donne un modérateur local
     aux propositions anonymes) ;
  4. sinon `NULL` : catalogue de la plateforme.
  L'IP elle-même n'est jamais stockée.
- **A4 — Correction par un collègue.** Un enseignant ou administrateur de l'école propriétaire
  (`requireGestionTuteurs` + `tuteurDeLEcole`) peut éditer le tuteur d'un collègue. Un tuteur de
  la plateforme (`NULL`) n'appartient à aucune école.
- **A5 — Retouche d'un tuteur publié.** Par son **jeton** d'auteur (ou un gestionnaire),
  jamais par l'URL secrète : l'édition du corps d'un tuteur publié crée une version, le laisse
  publié, périme ses traductions (UC-24) et notifie « Traductions à revérifier ».

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| Nom invalide (< 2 ou > 64 caractères, ponctuation, `essai`) | `400 ERR_NAME_INVALID` |
| Nom déjà utilisé (tout statut) | `409 ERR_NAME_TAKEN` |
| Corps < 40 octets | `400 ERR_BODY_TOO_SHORT` |
| Corps > 256 Ko | `413 ERR_BODY_TOO_LARGE` |
| Somme des tuteurs non archivés de l'auteur > 1 Mo (dépôt ou édition) | `413 ERR_QUOTA_USER` |
| Plus de 10 dépôts / min depuis une IP | `429 ERR_RATE_LIMIT` |
| Plus de 20 écritures (`PATCH`/`DELETE`) / min depuis une IP | `429 ERR_RATE_LIMIT` |
| URL secrète inconnue, mal formée, ou tuteur archivé | `404 ERR_PROMPT_UNKNOWN` |
| Tuteur inconnu au `PATCH` | `404 ERR_PROMPT_UNKNOWN` |
| Édition/soumission sans être auteur (jeton, ou `shareToken` d'un **brouillon**) ni gestionnaire | `403 ERR_FORBIDDEN` |
| `shareToken` présenté pour un tuteur soumis, publié ou dépublié | `403 ERR_FORBIDDEN` |
| Soumettre autre chose qu'un brouillon | `409 ERR_STATUS` |
| Tuteur archivé | `409 ERR_ARCHIVED` |
| Action inconnue | `400 ERR_ACTION_UNKNOWN` |
| `DELETE` | `403 ERR_DELETE_DISABLED` (rien n'est jamais supprimé) |
| Méthode non autorisée | `405 ERR_METHOD_NOT_ALLOWED` |

## Règles métier et sécurité

- Le `share_token` n'apparaît jamais dans une carte publique (`toCard`) ; il n'est rendu qu'à la
  création et par `GET /api/drafts/[token]` (à qui le connaît déjà).
- L'URL secrète ne vaut droit d'écriture que sur un **brouillon** (`resolveRights`) : elle
  circule auprès des testeurs, et un tuteur soumis ou publié ne se réécrit pas sans modération.
- `getByShareToken` résout le jeton quel que soit le statut (lecture seule) ; il refuse tout jeton qui n'est pas de l'hexadécimal minuscule de 24 à 64
  caractères, et ignore les tuteurs archivés.
- Le quota d'auteur exclut les tuteurs archivés : il reste libérable.
- La langue hors `fr/en/it/de` retombe sur `fr` ; la description est tronquée à 500 caractères.
- Le rattachement à une école exige un **titre** : un simple lien d'appartenance ramassé par IP
  ne confisque pas les tuteurs d'un auteur au profit d'une école.

## Postconditions

- Ligne `prompts` (`draft` puis `pending`), une ligne `prompt_versions` par version du corps,
  `inspired_by` et `etablissement_id` éventuels ; notification « Prompt à modérer ».

## Anomalies constatées

- **Corrigée** — `resolveRights` n'accepte plus `shareToken` que pour un tuteur au statut
  `draft` ; `getByShareToken` reste une simple lecture (l'atelier suit son tuteur publié). Constat
  d'origine : **l'URL secrète restait une clé d'auteur après publication.** `resolveRights`
  (`src/pages/api/prompts/[name]/index.ts:58`) accepte `shareToken` quel que soit le statut, et
  `getByShareToken` (`src/server/prompts.ts:247`) le résout aussi pour un tuteur publié. Quiconque
  a reçu le lien d'essai (les testeurs invités) peut donc réécrire un tuteur **publié** sans
  nouvelle modération (seule la notification « Traductions à revérifier » part). Tests :
  `atelier.test.ts` › « l'URL secrète d'une proposition anonyme ne permet plus de réécrire… »,
  « ni un tuteur soumis ni un tuteur dépublié… », « l'auteur identifié garde, lui, la main… ».
- **Corrigée** — branche morte supprimée. Constat d'origine : mineur, la branche
  `else if (bodyChanged)` de l'édition (`[name]/index.ts:200`) était inatteignable depuis que
  `bumpVersion === bodyChanged`.

## Tests

### Unitaires — `tests/unit/uc09-atelier-tuteur/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `prompts.test.ts` | `isValidPromptName`, `MAX_PROMPT_BYTES`, `MAX_USER_BYTES`, `getByName`, `getByShareToken`, `toCard` | noms valides (accents, apostrophes), bornes 2–64, `essai` réservé, ponctuation, non-chaînes ; quotas ; lecture par nom sensible à la casse ; jeton mal formé, archivé ; carte sans jeton ni corps, moyenne arrondie, auteur anonyme vide |
| `rattachement.test.ts` | `choixEcole`, `ecolePrincipale`, `ecoleActivePourCompte`, `ecoleEnseignante` | en-tête puis corps, valeurs invalides ; choix revérifié en base, replis ; titre d'enseignant / d'admin exigé, simple membre refusé, choix d'école par en-tête |

### Fonctionnels — `tests/functional/uc09-atelier-tuteur/atelier.test.ts`

| Scénario | Test |
|---|---|
| Nominal | brouillon signé, versionné, relu par l'URL secrète |
| Nominal | nouvelle version à chaque changement de corps, pas pour la description ; action par défaut `edit` |
| Nominal | soumission → `pending` + notification |
| A1 | brouillon anonyme modifié et soumis par le seul `shareToken` ; refus sans lui ou avec un autre |
| A3 | école de l'enseignant, IP de l'école pour l'anonyme, NULL sans titre, école principale du promptagogue, choix par en-tête, jamais reçu du client |
| A2 | variante liée à sa source ; source inconnue ignorée |
| A4 | collègue de l'école propriétaire autorisé, autre école refusée, tuteur NULL refusé |
| A5 | retouche d'un tuteur publié par le jeton d'auteur : version + notification ; l'URL secrète ne réécrit ni un tuteur publié, ni soumis, ni dépublié |
| Erreurs | nom invalide/réservé/pris ; corps trop court/long ; quota (archivés exclus) ; anonyme sans quota ; langue/description normalisées ; 429 au dépôt ; 405 |
| Erreurs | URL secrète inconnue, mal formée, archivée ; 405 |
| Erreurs | édition trop courte/longue/hors quota ; double soumission ; tuteur/action inconnus ; `DELETE` désactivé ; archivé figé ; 429 en écriture |
