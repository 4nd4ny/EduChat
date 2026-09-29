# UC-01 — Consulter le catalogue des tuteurs

| | |
|---|---|
| **Acteur principal** | Visiteur (de passage, élève sur le réseau d'une école, enseignant identifié) |
| **Acteurs secondaires** | Administration d'école (décide `catalogue_ouvert` et le partage de ses tuteurs) |
| **Déclencheur** | Le visiteur ouvre la page d'accueil `/`, trie, cherche, puis ouvre une fiche `/p/[name]` |
| **Pages** | `src/pages/index.tsx`, `src/pages/p/[name].tsx` (favoris locaux : `src/utils/favorites.ts`) |
| **API** | `GET /api/prompts`, `GET /api/prompts/[name]` |
| **Code serveur** | `src/server/prompts.ts` (`porteeAppelant`, `porteeDepuisIp`, `CLAUSE_VISIBLE`, `estVisible`, `listPublished`, `toCard`, `getPublishedByName`), `src/server/appartenance.ts` (`ecoleEnseignante`), `src/server/etablissements.ts` (`resolveEtablissementByIp`), `src/server/traduction.ts` (`traductionFraiche`, `resumeTraductions`) |

## Objectif

Présenter les tuteurs socratiques **publiés** qu'un appelant a le droit de voir, triés en base,
filtrables par une recherche, dans la langue de l'interface quand une traduction fraîche existe ;
puis leur fiche publique (texte intégral, versions, filiation). Ce que l'appelant voit dépend de
**qui il est** (son école, s'il y enseigne) et **d'où il écrit** (le réseau d'une école).

## Préconditions

- Aucune. Aucun compte n'est requis ; un jeton de compte, s'il est présent, peut élargir la vue.

## Scénario nominal — visiteur de passage

1. La page d'accueil appelle `GET /api/prompts?sort=score&q=&locale=fr` (avec l'en-tête
   `Authorization` s'il existe un jeton).
2. Le serveur calcule la **portée** de l'appelant (`porteeAppelant`) : hors école, `{ etablissementId: null, publicsExternes: true }`.
3. `listPublished` sélectionne en base les tuteurs `published`, non archivés, visibles selon
   `CLAUSE_VISIBLE`, les filtre par `q` (nom, description, ou leur traduction dans la locale), les
   trie (`score` par défaut) et les renvoie en **cartes publiques** (`toCard` : jamais le
   `share_token` ni le corps). Réponse `200 { prompts }`, `Cache-Control: private, no-store`.
4. Le navigateur remonte en tête les **favoris** (liste locale `prompt-favorites`,
   `src/utils/favorites.ts`), dans l'ordre du tri courant.
5. Le visiteur ouvre une fiche : `GET /api/prompts/[name]?locale=fr` (avec l'en-tête
   `Authorization` s'il existe un jeton, comme le catalogue) renvoie
   `{ prompt: { …carte, body, inspiredBy, variants, translations }, versions }`.

## Scénarios alternatifs

- **A1 — Tri.** `sort` ∈ `score` (usage + 5 × moyenne + 50 / (1 + âge en jours)), `uses`, `rating`
  (non notés en dernier), `recent`, `updated`, `tokens`, `name` (insensible à la casse). Toute autre
  valeur retombe sur `score`.
- **A2 — Recherche.** `q` (tronqué à 64 caractères, espaces rognés) cherche en `LIKE` dans le nom, la
  description, et la traduction fraîche de la locale demandée.
- **A3 — Langue.** Avec `locale` ∈ `en/it/de/fr` et une traduction **fraîche** (`state = 'ok'` et
  `source_version ≥ version`), `title`, `description` (et le `body` de la fiche) sont traduits,
  `translated: true` ; `name` reste le nom canonique (URL, favoris, facturation).
- **A4 — Élève sur le réseau d'une école au catalogue fermé** (défaut) : plateforme + tuteurs
  réservés de son école ; les tuteurs partagés des autres écoles sont masqués.
- **A5 — École au catalogue ouvert** (`catalogue_ouvert = 1`) : s'y ajoutent les tuteurs partagés
  (`publie = 1`) des autres écoles.
- **A6 — Enseignant identifié, chez lui.** Son école (école active, s'il en est administrateur ou
  enseignant au sens de `estEnseignantDe`) lui ouvre les tuteurs réservés de son établissement ; le
  réseau d'où il écrit (hors école) lui laisse les publics du monde : il obtient l'**union**.
- **A7 — Simple membre** (lien posé par l'IP à la vérification de l'adresse) : n'emporte **pas** son
  école ; il voit le catalogue de l'IP d'où il écrit.
- **A8 — Filiation.** `inspiredBy` et `variants` obéissent à la même règle de visibilité : le nom
  d'un tuteur réservé ailleurs ne transparaît pas (`inspiredBy: null`).

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| Fiche inconnue, brouillon, en attente, dépubliée, archivée, ou réservée à une autre école | `404 ERR_PROMPT_UNKNOWN` — **indistinct** (jamais 403, qui avouerait l'existence) |
| Méthode autre que `GET`/`POST` sur `/api/prompts` | `405`, `Allow: GET, POST` |
| Méthode autre que `GET`/`PATCH`/`DELETE` sur la fiche | `405`, `Allow: GET, PATCH, DELETE` |
| Annonce d'une école dont on n'est pas membre (`x-educhat-ecole`) | ignorée : retour à l'école principale |

## Règles métier et sécurité

- **Trois familles de tuteurs** : rattachement `NULL` (plateforme) visible de tous ; rattaché à
  **mon** école visible chez moi même non partagé ; rattaché **ailleurs** visible seulement si
  `publie = 1` **et** si la portée voit le dehors (hors école, ou école au catalogue ouvert).
- Le filtre vit **en base** (`CLAUSE_VISIBLE`) ; `estVisible` en est la copie sur une ligne déjà lue.
- `publicsExternes` dépend du **lieu** (IP) ; `etablissementId` dépend du **compte** (titre
  d'enseignement), à défaut de l'IP. Cette portée dit ce qui se **lit**, jamais qui paie.
- Les réponses dépendent du jeton et de l'IP : `Cache-Control: private, no-store`.
- Les cartes n'exposent jamais `share_token` ; l'auteur absent reste un nom vide (l'interface nomme
  l'absence dans sa langue).
- Les favoris sont **purement locaux** au navigateur (aucune route serveur).

## Postconditions

- Aucune écriture en base : consultation pure.

## Anomalies constatées

- **Corrigée** — la page de la fiche envoie désormais `authHeaders()` (`src/pages/p/[name].tsx:95`),
  comme le catalogue, pour la fiche comme pour la note (UC-02) : la fiche d'un tuteur réservé de
  son école s'ouvre à l'enseignant hors campus. La page React n'a pas de test fonctionnel ; le test
  A6 vérifie côté route que c'est bien le jeton qui ouvre la fiche (200 avec, 404 sans).
  Constat d'origine : **la fiche est chargée sans jeton.** `src/pages/p/[name].tsx:92` appelle
  `GET /api/prompts/[name]` sans `authHeaders()`, alors que le catalogue (`src/pages/index.tsx:189`)
  les envoie et que la route calcule sa portée avec le jeton. Conséquence : un enseignant chez lui
  voit dans le catalogue un tuteur réservé de son école (A6), mais sa fiche lui répond « tuteur
  inconnu ». La route, elle, se comporte correctement avec le jeton (voir le test fonctionnel A6).
  Même omission pour la notation (`src/pages/p/[name].tsx:104`, voir UC-02).

## Tests

### Unitaires — `tests/unit/uc01-catalogue/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `portee.test.ts` | `porteeDepuisIp`, `porteeDeLEcole`, `porteeAppelant`, `ecoleEnseignante`, `parametresPortee`, `estVisible` | IP hors école / école fermée / ouverte ; école désignée ; titre d'enseignant ou d'admin, simple membre, école annoncée d'autrui ; union « école du compte + dehors de l'IP » ; règle de visibilité sur les trois familles et les statuts |
| `listPublished.test.ts` | `listPublished`, `toCard`, `traductionFraiche`, `getPublishedByName`, `nomsDeLEcole` | les sept tris et le repli ; recherche nom/description/traduction ; statuts et archivage ; portées ; champs publics, moyenne arrondie, pas de `share_token` ; traduction fraîche vs périmée/échec/locale inconnue ; fiche sous portée ; tuteurs de l'école |

### Fonctionnels — `tests/functional/uc01-catalogue/catalogue.test.ts`

| Scénario | Test |
|---|---|
| Nominal | cartes publiques, sans cache partagé ni `share_token`, brouillons exclus |
| A1 | tri par `sort`, repli sur `score` |
| A2 | recherche `q` (rognée), aucun résultat |
| A3 | carte et recherche traduites ; corps traduit sur la fiche |
| Nominal | fiche : corps, versions, filiation, états de traduction |
| A4 / A5 | élève sur réseau d'école fermée / ouverte ; une école voit ses tuteurs |
| A6 | enseignant chez lui : réservés de son école + publics ; fiche accessible avec jeton, 404 sans (non-régression de l'anomalie corrigée) |
| A7 | simple membre rattaché par IP |
| Erreurs | école annoncée d'autrui ignorée |
| A8 | filiation masquée hors portée, révélée dans l'école propriétaire |
| Erreurs | 404 indistinct (inconnu, brouillon, dépublié, archivé, réservé ailleurs) ; 405 |
