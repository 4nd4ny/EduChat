# UC-24 — Traduire automatiquement un tuteur

| | |
|---|---|
| **Acteur principal** | Système (déclenché par la publication) ; super-administrateur (retraduction) |
| **Acteurs secondaires** | Fournisseur Anthropic (Claude Haiku, clé interne), lecteurs et élèves (reçoivent la traduction), administration (notifiée des traductions périmées) |
| **Déclencheur** | Un tuteur est validé (`approve`) ou republié (`republish`) ; ou le super-administrateur clique « retraduire » dans `/admin` |
| **Pages** | `src/pages/admin.tsx` (composant `src/administration/Moderation.tsx`), `src/pages/p/[name].tsx` (fiche), `src/pages/index.tsx` (catalogue), chat |
| **API** | `PATCH /api/prompts/[name]` (`approve`, `republish`, `retranslate`, `edit`), `GET /api/prompts/[name]?locale=`, `GET /api/prompts?locale=`, `GET /api/admin/prompts`, `POST /api/completion` (sert le corps traduit) |
| **Code serveur** | `src/server/traduction.ts` (`traductionFraiche`, `etatsPour`, `resumeTraductions`, `planifierTraduction`, `traduireTuteur`), `src/server/prompts.ts` (`toCard`, `listPublished`), `src/utils/env.ts` (`DeveloperKeys.anthropic`) |

## Objectif

Un tuteur écrit en français fait répondre le modèle en français : il faut traduire son **corps**
(et son titre, sa description) dans les trois autres langues du site pour que l'élève germanophone
reçoive une leçon en allemand. La traduction est automatique, payée par la plateforme, et ne sert
**jamais** un texte qui ne correspond plus à l'original.

## Préconditions

- Le tuteur existe et sa langue est l'une de `fr`, `en`, `it`, `de` (toute autre est lue `fr`).
- Pour qu'une traduction réussisse : `SECRET_ANTHROPIC_API_KEY` configurée (modèle
  `SECRET_TRANSLATE_MODEL`, par défaut `claude-haiku-4-5-20251001`).

## Scénario nominal — traduction à la publication

1. Un modérateur valide le tuteur (UC-10) ; la route répond **aussitôt** `published` et appelle
   `planifierTraduction(id)`, qui lance `traduireTuteur` sans l'attendre et absorbe toute erreur.
2. Pour chacune des trois langues cibles non déjà à jour : l'état passe à `pending`, puis un appel
   `POST https://api.anthropic.com/v1/messages` (température 0, consigne système « tuteurs
   socratiques », marqueurs `<<<1>>>` nom, `<<<2>>>` description, `<<<3>>>` corps, `<<<0>>>` fin).
3. La réponse est découpée sur **n'importe quel** marqueur `<<<…>>>` (un modèle qui traduit
   `<<<CORPS>>>` en `<<<CORPO>>>` reste lisible) ; la ligne `prompt_translations` passe à `ok`
   avec `source_version = prompts.version`, le modèle et les jetons consommés.
4. La dépense est journalisée dans `usage_log` **sans IP ni établissement**
   (`client_id = 'traduction'`) : elle n'est facturée à aucune école.
5. Fiche, catalogue et chat servent la traduction à qui lit dans cette langue (`?locale=`) :
   `title`, `description`, `body` traduits, `translated: true` ; le `name` canonique (adresse
   `/p/nom`) ne change jamais.

## Scénarios alternatifs

- **A1 — Modification du tuteur.** Toute modification du corps incrémente `prompts.version`
  (UC-09) : les traductions deviennent **périmées** (`source_version < version`) sans qu'on les
  touche. Elles ne sont plus servies (l'original reprend la main), la liste d'administration les
  marque `aVerifier`, et l'administration reçoit « Traductions à revérifier : <nom> ».
- **A2 — Retraduction.** `PATCH { action: 'retranslate', force? }` (super uniquement) attend le
  résultat et rend les états. Sans `force`, ce qui est à jour n'est pas retraduit (idempotence :
  relancer ne coûte rien) ; avec `force: true`, tout est retraduit.
- **A3 — Republication.** `republish` replanifie la traduction (idempotente).
- **A4 — Tuteur non français.** Un tuteur `en` est traduit vers `fr`, `it`, `de`.
- **A5 — Appels concurrents.** Une seconde traduction du même tuteur pendant la première rend
  l'état courant sans rien relancer (verrou en mémoire `enCours`).

## Scénarios d'erreur

| Cas | Effet |
|---|---|
| Clé interne absente | état `failed` « Clé interne Anthropic absente… », aucun appel réseau, publication intacte |
| Erreur HTTP du fournisseur | `failed`, détail = message d'erreur du fournisseur, sinon `HTTP <code>` |
| Réponse tronquée (`stop_reason: max_tokens`) | `failed` « Réponse tronquée… » |
| Réponse sans marqueurs | `failed` « Réponse du modèle illisible… » |
| Corps traduit < 40 octets | `failed` « Corps traduit vide ou trop court » |
| Corps source > 48 Ko | `failed` sans appel au modèle |
| Exception réseau | `failed` avec le message ; `planifierTraduction` ne la propage jamais |
| `retranslate` par un non-super | `403 ERR_FORBIDDEN` |
| Locale inconnue demandée | l'original est servi |

## Règles métier et sécurité

- La **péremption** tient en un entier : une traduction n'est servie que si `state = 'ok'` et
  `source_version >= prompts.version` (même règle en SQL dans `listPublished`).
- Un échec ou une mise en attente **n'efface pas** la traduction précédente (nom, corps,
  `source_version` conservés) : l'administration peut la relire ; elle n'est simplement plus servie.
- La traduction ne bloque jamais la publication.
- Un brouillon testé par son URL secrète est toujours servi dans le texte de l'auteur, jamais
  traduit ; une conversation restée sur une version antérieure garde son texte d'origine.
- La recherche du catalogue interroge aussi la traduction fraîche de la langue du lecteur.

## Postconditions

- Trois lignes `prompt_translations` (une par langue cible) dans l'état `ok` ou `failed`, et une
  ligne `usage_log` par traduction réussie.

## Anomalies constatées

- **Une retraduction forcée qui échoue retire du service une traduction à jour.** Avec
  `force: true`, `traduireTuteur` écrit `pending` puis `failed` même sur une langue déjà à jour
  (`src/server/traduction.ts:153` puis `:164` / `:172`) ; comme `traductionFraiche` exige
  `state = 'ok'`, la traduction valide n'est plus servie alors que le tuteur n'a pas changé
  (elle reste en base). Test : `traduction.test.ts` (unitaire) › « une retraduction forcée qui
  échoue retire du service une traduction à jour ».
- Mineur : le message du dépassement de taille calcule la taille en **caractères**
  (`row.body.length / 1024`, `traduction.ts:157`) alors que la limite est mesurée en **octets**.

## Tests

### Unitaires — `tests/unit/uc24-traduction/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `traduction.test.ts` | `isLocale`, `traductionFraiche`, `toCard` (titre traduit), `etatsPour`, `resumeTraductions`, `traduireTuteur`, `planifierTraduction` | locales ; fraîche / périmée / pending / failed / vide ; nom canonique conservé ; langues cibles, source inconnue, états et résumé ; requête au fournisseur (URL, clé, modèle, température, marqueurs) ; journalisation sans IP ; idempotence et `force` ; seules les langues périmées retraduites ; tuteur anglais ; tuteur inconnu ; échecs HTTP, tronqué, illisible, trop court, > 48 Ko ; marqueurs « traduits » ; conservation de l'ancienne traduction ; anomalie `force` ; verrou de concurrence ; erreurs absorbées |
| `sans-cle.test.ts` | `traduireTuteur`, `MODELE_TRADUCTION` | échec explicite sans clé et sans réseau ; modèle Haiku par défaut |
| `outils.ts` | — | fausse API Anthropic (utilitaire propre, non exécuté comme test) |

### Fonctionnels — `tests/functional/uc24-traduction/traduction.test.ts`

| Scénario | Test |
|---|---|
| Nominal | `approve` → traduction en arrière-plan → fiche `?locale=en` et catalogue `?locale=de` (recherche comprise) traduits ; original sans locale |
| A1 | édition → original servi, `perimee`, `aVerifier`, notification |
| A2 | `retranslate` rend des traductions fraîches ; sans `force` rien, avec `force` tout |
| A3 | `republish` relance la traduction |
| Erreurs | fournisseur en panne : publication intacte, `enEchec` dans l'administration ; `retranslate` réservé au super ; locale inconnue |
