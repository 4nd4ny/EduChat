# UC-25 — Conserver son historique, ses favoris et le basculer d'un navigateur à l'autre

| | |
|---|---|
| **Acteur principal** | Utilisateur du chat (élève sans compte, ou titulaire d'un compte vérifié) |
| **Acteurs secondaires** | Un second navigateur (autre poste, autre logiciel) du même utilisateur |
| **Déclencheur** | L'utilisateur clique « Exporter tout (profil) » puis dépose le fichier dans la zone « Importer une discussion » d'un autre navigateur |
| **Pages** | Barre latérale `src/chatSidebar/ChatSidebar.tsx` (présente sur les pages de chat), `src/chatSidebar/Conversation.tsx` (export unitaire .md/.json) |
| **API** | Aucune : tout se passe dans le navigateur (`localStorage`). La synchronisation serveur opt-in (`/api/profile`, `src/utils/profileSync.ts`) relève d'un autre cas. |
| **Code navigateur** | `src/utils/profile.ts` (`buildProfile`, `isProfile`, `applyProfile`, `downloadProfile`), `src/context/History.tsx`, `src/utils/favorites.ts`, `src/utils/clientId.ts`, `src/utils/account.ts`, `src/utils/formatTokens.ts` |

## Objectif

Les conversations vivent **à 100 % dans le navigateur** (principe RGPD : les élèves n'ont
jamais de compte). Le **profil** — conversations, favoris, notes données et compteur de
tokens — est la seule voie de sauvegarde et de transfert : un fichier JSON versionné
(`educhatProfile: 1`) qu'on exporte d'un navigateur et qu'on **fusionne** dans un autre, sans
jamais rien écraser et sans jamais transporter d'élément d'identité.

## Préconditions

- Aucune : ni compte, ni réseau. Le navigateur doit simplement autoriser `localStorage`.

## Scénario nominal — export sur A, import sur B

1. Sur le navigateur A, l'utilisateur converse : chaque conversation est rangée dans
   `pg-history` (identifiant → `{ name, createdAt, lastMessage, messages, promptName?, promptVersion? }`),
   le tuteur et sa **version figée** compris.
2. Il marque des tuteurs en favoris (`prompt-favorites`, tableau de noms), note des tuteurs
   (`prompt-ratings`, nom → étoiles) ; le compteur `totalTokens` s'incrémente.
3. « Exporter tout (profil) » : `downloadProfile()` construit le profil (`buildProfile`) et
   télécharge `educhat-profil-AAAA-MM-JJ.json`.
4. Sur le navigateur B, il dépose le fichier dans la barre latérale. `JSON.parse` puis
   `isProfile` (champ numérique `educhatProfile`) aiguillent vers `applyProfile`.
5. `applyProfile` **fusionne** : conversations absentes ajoutées, favoris unis, notes locales
   prioritaires, compteur = maximum des deux ; l'événement `totalTokensUpdated` est émis.
6. Message « Profil importé : N conversation(s) ajoutée(s). », puis rechargement de la page.

## Scénarios alternatifs

- **A1 — Navigateur vierge.** Tout le profil est restauré ; ni jeton de compte ni identifiant
  anonyme n'apparaissent dans B.
- **A2 — Conversation déjà présente (même identifiant).** La version **locale** est conservée,
  celle du fichier ignorée (jamais d'écrasement). Réimporter le même fichier ajoute donc 0
  conversation : l'import est **idempotent**.
- **A3 — Fichier d'une conversation seule** (export unitaire `.json`). Faute de champ
  `educhatProfile`, il est confié à `importConversation` (`AnthropicProvider`), qui valide
  strictement chaque message.
- **A4 — Aller-retour A → B → A.** Après un import croisé, les deux navigateurs ont le même
  historique et la même union de favoris.

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| Fichier non JSON (tronqué, vide, binaire) | « Fichier illisible : ce n'est pas du JSON valide. » — rien n'est écrit |
| Profil sans `conversations` (ou non objet) | `applyProfile` lève « Profil invalide : aucune conversation. » **avant toute écriture** ; l'utilisateur voit le même message « Fichier illisible… » (voir anomalies) |
| Fichier > 2 Mo ou non `.json` | Refusé par la zone de dépôt (`MAX_IMPORT_BYTES`) : « Fichier trop volumineux (maximum 2 Mo). » / « Fichier refusé… » |
| Conversation sans tableau `messages` | Ignorée silencieusement, les autres sont importées |
| Favoris non tableau, notes non objet, `totalTokens` non numérique | Champ ignoré (valeurs locales inchangées) |
| Clé `__proto__` dans `conversations` ou `ratings` | Sans effet : aucune pollution de prototype, aucune conversation ajoutée |
| Champ `educhat-token` / `token` glissé dans le fichier | Ignoré : le jeton local n'est jamais lu ni écrasé |
| `pg-history` local corrompu | `getHistory` lève : l'export comme l'import échouent (voir anomalies) |

## Règles métier et sécurité

- Le profil ne contient **que** `educhatProfile`, `exportedAt`, `conversations`, `favorites`,
  `ratings`, `totalTokens` : jamais `educhat-token` (jeton de compte), `educhat-client`
  (identifiant anonyme du quota école) ni `educhat-ecole` (école active).
- L'import est **additif** : rien de local n'est supprimé ni remplacé ; les notes locales
  priment (anti-revote), le compteur ne peut que croître.
- L'identifiant `educhat-client` est un uuid v4 propre à chaque navigateur, jamais relié à une
  identité ; vider le stockage en génère un nouveau (contournement assumé).
- Le jeton `educhat-token` n'est décodé côté navigateur que pour l'affichage
  (`getAccount`, sans vérification de signature) ; `authHeaders` n'ajoute
  `x-educhat-ecole` que s'il y a un jeton, et le serveur revérifie tout.
- Le compteur s'affiche via `formatTokens` (K, M, G… trois chiffres significatifs).

## Postconditions

- B contient l'union des conversations (identifiants d'origine, tuteur et version compris),
  l'union des favoris, les notes (locales prioritaires) et `totalTokens = max(A, B)`.
- `educhat-token`, `educhat-client` et `educhat-ecole` de B sont inchangés.

## Anomalies constatées

Comportements actuels, testés tels quels (tests marqués « ANOMALIE » ou « comportement actuel ») :

1. **Le chemin « profil » ne valide pas les messages** (`src/utils/profile.ts:50`) : seule la
   présence d'un tableau `messages` est vérifiée. Rôle `system`, contenu non textuel, plus de
   5000 messages sont acceptés, alors que le chemin « conversation seule »
   (`parseImportedMessages`, `src/context/AnthropicProvider.tsx:33`) les refuse. Un fichier
   hostile peut ainsi faire entrer dans l'historique des données que l'import unitaire rejette.
2. **Éléments de favoris non contrôlés** (`src/utils/profile.ts:59`) : nombres ou objets sont
   rangés dans `prompt-favorites`.
3. **Tableau accepté comme `conversations`** (`src/utils/profile.ts:44`) : les conversations
   reçoivent les identifiants `"0"`, `"1"`…
4. **Import partiel possible** (`src/utils/profile.ts:58`) : si `prompt-favorites` local est
   corrompu, `JSON.parse` lève **après** l'écriture de l'historique ; notes et compteur ne sont
   pas appliqués.
5. **`totalTokens: "Infinity"`** (`src/utils/profile.ts:70`) est rangé tel quel, puis relu comme
   0 par `buildProfile`.
6. **Message d'erreur trompeur** (`src/chatSidebar/ChatSidebar.tsx:62`) : un profil JSON valide
   mais rejeté par `applyProfile` affiche « ce n'est pas du JSON valide ».
7. **Historique corrompu bloquant** (`src/context/History.tsx:68`) : `getHistory` n'a aucun
   repli, contrairement aux favoris et notes ; l'export du profil devient impossible.
8. **Divergence avec le planning** (`planning/11-export-import.md`, tâche 6) : le champ de
   version s'appelle `educhatProfile`, pas `formatVersion` ; `isProfile`
   (`src/utils/profile.ts:34`) accepte toute version numérique, y compris future.
9. Mineures : `getFavorites` rend tel quel un JSON non tableau, ce qui fait lever
   `toggleFavorite` (`src/utils/favorites.ts:14`) ; `getAccount` tient pour non expirée une
   charge sans `exp` (`src/utils/account.ts:65`) ; `formatTokens(999_999)` affiche
   « 1000 KTok. » et ne filtre ni négatifs ni `NaN` (`src/utils/formatTokens.ts:16`).

## Tests

Les tests tournent dans l'environnement `node` : `tests/unit/uc25-historique-local/navigateur.ts`
fournit une doublure minimale de navigateur (`localStorage` en mémoire, `window.dispatchEvent`,
`document.createElement('a')`, `URL.createObjectURL`) ; en installer une seconde simule
« un autre navigateur ».

### Unitaires — `tests/unit/uc25-historique-local/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `profile.test.ts` | `buildProfile`, `isProfile`, `applyProfile`, `downloadProfile` | contenu et version du profil, exclusion jeton/uuid/école, stockage corrompu, reconnaissance du format, fusion (ajout, priorité locale, favoris, notes, max des tokens, événement), rejet sans écriture, champs invalides, entrées hostiles (`__proto__`, favoris/messages non validés, tableau, `Infinity`, import partiel), téléchargement daté |
| `history.test.ts` | `storeConversation`, `getConversation`, `updateConversation`, `deleteConversationFromHistory`, `getHistory`, `clearHistory` | rangement avec/sans identifiant, tuteur + version, mise à jour partielle, suppression, historique corrompu |
| `favorites.test.ts` | `getFavorites`, `toggleFavorite`, `getGivenRating`, `storeGivenRating` | bascule, persistance, corruption, JSON non tableau, notes non numériques, absence de `window` |
| `clientId.test.ts` | `getClientId` | uuid v4, stabilité, unicité par navigateur, régénération après effacement, absence de `window`, exclusion du profil |
| `account.test.ts` | `storeToken`, `clearToken`, `getToken`, `getAccount`, `getEcoleActive`, `setEcoleActive`, `authHeaders` | événements, décodage d'un vrai jeton serveur, pas de vérification de signature, expiré/illisible/sans adresse/sans `exp`, validation de l'école, en-têtes |
| `formatTokens.test.ts` | `formatTokens` | paliers d'unités, chiffres significatifs, plafond Y, arrondi « 1000 K », négatifs/`NaN` |

### Fonctionnels — `tests/functional/uc25-historique-local/historique-local.test.ts`

La logique de dépôt de `ChatSidebar.onDrop` (composant React) est reproduite à l'identique par
`deposerFichier()` ; tout le reste est le vrai code.

| Scénario | Test |
|---|---|
| Nominal | export sur A, import sur B déjà utilisé : fusion complète, tuteur/version, notes locales prioritaires, jeton et uuid de B intacts |
| A2 | réimport du même fichier sans effet (idempotent) |
| A4 | aller-retour A → B → A : historiques identiques, favoris unis |
| A1 | import sur navigateur vierge, aucun élément d'identité transporté |
| A2 | même identifiant des deux côtés : version locale conservée |
| A3 | conversation seule aiguillée hors du chemin « profil » |
| Erreurs | JSON tronqué / vide / binaire : message, historique intact |
| Erreurs | profil sans conversations : rejet sans écriture, message trompeur |
| Erreurs | fichier hostile : `__proto__`, tentative d'écrasement, faux jeton, tokens négatifs |
| Erreurs | messages non validés par le chemin « profil » ; limite de 2 Mo portée par la zone de dépôt seule |
