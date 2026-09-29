# UC-12 — Régénérer une réponse en montant l'échelle des modèles

| | |
|---|---|
| **Acteur principal** | Visiteur / élève / enseignant qui discute (régénération) ; super-administrateur (réglage de l'échelle) |
| **Acteurs secondaires** | Fournisseurs d'IA (appel au modèle du barreau), catalogues de modèles (validité des barreaux) |
| **Déclencheur** | Clic sur « Régénérer » sous la dernière réponse ; ou réglage de l'échelle dans `/admin` |
| **Pages** | `src/chat/ChatMessage.tsx` (bouton), `src/context/AnthropicProvider.tsx` (`regenerate`, `canEscalate`), `src/administration/Modeles.tsx` (`EchelleModeles`) |
| **API** | `GET /api/ladder`, `GET` / `PUT /api/admin/ladder`, `POST /api/completion` (champ `rung`) |
| **Code serveur** | `src/shared/ladder.ts`, `src/server/ladder.ts`, `src/server/models.ts` (`getModels`), `src/server/admin.ts` (`requireSuperAdmin`) |

## Objectif

Ne jamais demander à un apprenant de choisir un nom de modèle. Chaque fournisseur a une
**échelle** de un à trois barreaux, du plus économe au plus fouillé. On commence **toujours**
au barreau 1 ; « Régénérer » renvoie la même question au barreau suivant, avec un effort de
raisonnement plus élevé (`low` → `medium` → `high`). La facture suit l'exigence réelle.
L'échelle est une **proposition du code** (`SUGGESTED_LADDER`) que le super-administrateur
peut remplacer, fournisseur par fournisseur, en voyant quels barreaux le catalogue vivant
du fournisseur ne connaît pas.

## Préconditions

- Régénérer : une conversation contient au moins une question et une réponse, et
  l'échelle du fournisseur a encore un cran au-dessus du barreau courant.
- Régler : être connecté avec une adresse listée dans `SECRET_ADMIN_EMAILS`.

## Scénario nominal — régénérer

1. Au chargement, le navigateur lit `GET /api/ladder` (public, cache 5 min) : les barreaux
   en vigueur par fournisseur. Il en déduit `canEscalate` (reste-t-il un cran ?).
2. Le premier envoi part au barreau 1 (`rung: 1`, ou absent).
3. Le serveur choisit `modelForRung(getLadder(provider), rung, provider)` et l'effort
   `RUNG_REASONING[rung]`, puis appelle le fournisseur.
4. La réponse porte le **modèle réellement appelé** (`model`), pour que chacun sache ce qui a répondu.
5. L'utilisateur clique « Régénérer » : la dernière réponse est retirée, la dernière question
   renvoyée avec `rung + 1`. Le barreau 2, puis 3, reprend les étapes 3–4.
6. Au dernier barreau de l'échelle, le bouton disparaît (il ne promet pas une montée qui n'aurait pas lieu).
7. Changer de fournisseur remet le barreau à 1.

## Scénario nominal — régler l'échelle (super-administrateur)

1. `/admin` → section Échelle : `GET /api/admin/ladder` rend, par fournisseur, `rungs` (en
   vigueur), `suggested` (proposition), `custom`, `updatedAt`, et la **validité** :
   `catalogue` (taille de la liste), `verifiable` (liste réelle de plus d'un modèle),
   `unknown` (barreaux absents du catalogue vivant).
2. Le super-administrateur saisit un à trois barreaux puis enregistre :
   `PUT /api/admin/ladder { provider, rungs }`.
3. Le réglage vaut immédiatement pour **toutes les écoles** et pour `GET /api/ladder`.

## Scénarios alternatifs

- **A1 — Échelle courte.** Un fournisseur à deux barreaux (DeepSeek, Kimi, ou réglage à
  deux crans) : un barreau 3 demandé est ramené au dernier cran existant.
- **A2 — Modèle épinglé.** Un promptagogue ou la page « duel » nomme le modèle (`model`) :
  il prime sur l'échelle ; l'effort suit quand même le barreau, sauf `reasoning` explicite.
- **A3 — Retour à la proposition.** Trois barreaux vides (ou un premier barreau vide)
  effacent le réglage : l'échelle suit de nouveau `SUGGESTED_LADDER`.
- **A4 — Barreau inconnu du catalogue.** Il est enregistré tel quel mais signalé dans
  `unknown`. Si le catalogue du fournisseur se réduit au modèle par défaut (aucune clé,
  aucune source), rien n'est prouvé : `verifiable: false`, `unknown: []`.
- **A5 — Trou dans l'échelle.** `['a', '', 'c']` s'arrête à `['a']` : on ne complète pas
  avec une devinette.

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| `/api/admin/ladder` sans être super-administrateur (anonyme, compte, enseignant, admin d'école) — **toute méthode** | `403 ERR_FORBIDDEN` (la garde passe avant la méthode) |
| `PUT` avec un fournisseur inconnu | `400 ERR_PROVIDER_UNSUPPORTED` |
| `PUT` avec `rungs` absent ou qui n'est pas un tableau de chaînes | `400 ERR_RUNGS_INVALID`, réglage en vigueur conservé |
| `/api/admin/ladder` autre que `GET`/`PUT` (super-admin) | `405 ERR_METHOD_NOT_ALLOWED`, `Allow: GET, PUT` |
| `/api/ladder` autre que `GET` | `405 ERR_METHOD_NOT_ALLOWED` |
| `rung` invalide (`0`, `4`, `"2"`…) à la complétion | pas d'erreur : barreau 1 |

## Règles métier et sécurité

- On commence **toujours** au barreau le moins cher ; seul un geste explicite fait monter.
- Le réglage est réservé au super-administrateur, **lecture comprise** : l'échelle fixe le coût
  par élève de toutes les écoles à la fois.
- Barreaux nettoyés : espaces retirés, 128 caractères au plus, trois barreaux au plus.
- Un barreau vide arrête l'échelle ; une échelle vide retombe sur le modèle par défaut du fournisseur.
- `unknown` n'est calculé que sur un catalogue réellement publié (plus d'un modèle).
- Chez un intermédiaire (OpenRouter), un modèle **hors échelle** exige un compte (garde de
  `/api/completion`, voir UC-13).

## Postconditions

- `PUT` : ligne `provider_ladder` créée/remplacée (`rung1..3`, `updated_at`), ou supprimée.
- Régénération : un appel supplémentaire au fournisseur, au modèle du barreau demandé.

## Anomalies constatées

- **Corrigée** — la route exige un tableau de chaînes et répond sinon
  `400 ERR_RUNGS_INVALID` sans rien écrire ; le retour à la proposition ne se fait plus que sur
  demande explicite (barreaux vides).
  *Constat d'origine :* **`PUT` sans tableau `rungs` efface le réglage.** `src/pages/api/admin/ladder.ts:51` lit
  `rungs` absent ou mal typé (chaîne, objet) comme `[]`, que `setLadder` traite comme « retour
  à la proposition ». Une requête malformée efface donc silencieusement l'échelle en vigueur
  au lieu d'être refusée par un `400`. Test : « PUT sans liste de barreaux valide ».

## Tests

### Unitaires — `tests/unit/uc12-echelle-modeles/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `ladder-partage.test.ts` | `SUGGESTED_LADDER`, `RUNG_REASONING`, `modelForRung`, `hasHigherRung`, `isRung` | proposition complète (1 à 3 barreaux, sans doublon), échelles courtes, effort par barreau, bornage du barreau, barreau dégénéré, échelle vide → défaut, reste-t-il un cran, validation stricte du barreau |
| `ladder-serveur.test.ts` | `getLadders`, `getLadder`, `setLadder` | proposition suivie par défaut, nettoyage (espaces, 128 car.), 3 barreaux max, trou qui arrête l'échelle, premier barreau vide / liste vide = retour à la proposition, remplacement, conversion des valeurs, isolation par fournisseur, ligne blanche ignorée |

### Fonctionnels — `tests/functional/uc12-echelle-modeles/echelle.test.ts`

| Scénario | Test |
|---|---|
| Nominal (lecture) | `GET /api/ladder` public, cache 5 min ; `405` sinon |
| Nominal (réglage) | `GET /api/admin/ladder` : validité vs catalogue (OpenAI déduit d'OpenRouter, OpenRouter natif, Mistral non vérifiable) |
| Nominal (réglage) | `PUT` puis relecture publique et disparition des « inconnus » |
| A4 | barreau fantôme accepté mais signalé |
| A3 | trois barreaux vides → proposition |
| Erreurs (anomalie corrigée) | `PUT` sans tableau de chaînes → `400 ERR_RUNGS_INVALID`, réglage conservé |
| Erreurs | fournisseur inconnu `400` ; méthode `405` |
| Droits | anonyme, compte, enseignant, admin d'école → `403` sur toutes méthodes, rien d'écrit |
| Nominal (régénérer) | barreaux 1→2→3 : modèles de l'échelle, effort croissant (température Mistral) |
| Nominal | barreau absent ou invalide → barreau 1 |
| A1 | échelle réglée à deux crans ; barreau 3 ramené au 2 |
| A2 | modèle épinglé prioritaire ; effort explicite prioritaire |
