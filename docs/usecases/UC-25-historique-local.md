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
5. `applyProfile` vérifie la version (seule `1` est connue) et **valide tout le fichier avant
   d'écrire quoi que ce soit** (messages contrôlés comme par `parseImportedMessages`), puis
   **fusionne** : conversations absentes ajoutées, favoris (chaînes) unis, notes locales
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
| Profil sans `conversations` (ou non objet, ou tableau) | `applyProfile` lève « Profil invalide : aucune conversation. » **avant toute écriture** ; ce message exact est affiché |
| Version de profil inconnue (`educhatProfile` ≠ 1) | « Profil invalide : version N non prise en charge. » — rien n'est écrit |
| Message hostile dans une conversation (rôle autre que `user`/`assistant`, contenu non textuel, plus de 5000 messages) | Tout le profil est refusé, **rien n'est écrit** : « Profil invalide : conversation « id », message N : rôle « system » non autorisé. » (ou « contenu textuel attendu », « format invalide », « trop longue (plus de 5000 messages) ») |
| Fichier > 2 Mo ou non `.json` | Refusé par la zone de dépôt (`MAX_IMPORT_BYTES`) : « Fichier trop volumineux (maximum 2 Mo). » / « Fichier refusé… » |
| Conversation sans tableau `messages` | Ignorée silencieusement, les autres sont importées |
| Favoris non tableau, notes non objet, `totalTokens` non numérique, non fini ou négatif | Champ ignoré (valeurs locales inchangées) ; seuls les favoris de type chaîne sont retenus |
| Clé `__proto__` dans `conversations` ou `ratings` | Sans effet : aucune pollution de prototype, aucune conversation ajoutée |
| Champ `educhat-token` / `token` glissé dans le fichier | Ignoré : le jeton local n'est jamais lu ni écrasé |
| `pg-history`, favoris ou notes locaux corrompus | Repli sur des valeurs vides : export et import restent possibles, sans import partiel |

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

1. **Corrigée** — **Le chemin « profil » ne validait pas les messages** : `applyProfile`
   (`src/utils/profile.ts:65`, `validateMessages`) applique désormais les règles de
   `parseImportedMessages` (`src/context/AnthropicProvider.tsx:33`) : rôle `user`/`assistant`,
   contenu textuel (ancien format `{ reply }` converti), au plus 5000 messages. Les champs
   inconnus sont écartés ; l'identifiant, le modèle et les métadonnées de pièces jointes sont
   conservés (aller-retour exact). Une seule conversation hostile fait refuser tout le profil.
   La règle est réécrite dans `profile.ts` plutôt qu'importée : `AnthropicProvider` importe
   `profileSync`, qui importe `profile.ts` (dépendance circulaire, et React/Next inutiles ici).
2. **Corrigée** — **Éléments de favoris non contrôlés** : seules les chaînes sont retenues,
   côté fichier comme côté local (`src/utils/profile.ts:134`).
3. **Corrigée** — **Tableau accepté comme `conversations`** : refusé comme un profil sans
   conversation (`src/utils/profile.ts:115`).
4. **Corrigée** — **Import partiel possible** : `applyProfile` valide et lit tout (historique,
   favoris et notes locaux avec repli sur des valeurs vides s'ils sont corrompus) **avant** la
   première écriture (`src/utils/profile.ts:110`).
5. **Corrigée** — **`totalTokens: "Infinity"`** : un compteur non fini ou négatif est ignoré,
   une valeur décimale est tronquée (`src/utils/profile.ts:150`).
6. **Corrigée** — **Message d'erreur trompeur** : `ChatSidebar.onDrop`
   (`src/chatSidebar/ChatSidebar.tsx:73`) distingue le JSON illisible (« ce n'est pas du JSON
   valide ») du profil rejeté, dont la raison exacte est affichée (« Profil invalide : … »).
   Les messages voisins de ce gestionnaire sont codés en français en dur : aucune clé i18n.
7. **Corrigée** — **Historique corrompu bloquant** : `getHistory`
   (`src/context/History.tsx:66`) se replie sur `{}` si `pg-history` est illisible ou n'est pas
   un objet ; la valeur corrompue n'est remplacée qu'à la prochaine écriture.
8. **Laissée en l'état** (nom du champ) — **Divergence avec le planning**
   (`planning/11-export-import.md`, tâche 6) : le champ de version s'appelle `educhatProfile`,
   pas `formatVersion`. Le renommer rendrait illisibles les profils déjà exportés et ceux de la
   synchronisation serveur ; c'est le planning qui devrait s'aligner. En revanche, les versions
   sont désormais restreintes à celles connues (`SUPPORTED_PROFILE_FORMATS`,
   `src/utils/profile.ts:48`) : `isProfile` aiguille toujours tout profil numéroté (pour
   qu'il ne soit pas confié à `importConversation`), et `applyProfile` refuse explicitement une
   version inconnue.
9. **Corrigée** — Mineures : `getFavorites` se replie sur `[]` pour un JSON non tableau
   (`src/utils/favorites.ts:13`), `toggleFavorite` ne lève plus ; `getAccount` tient pour
   invalide une charge sans `exp` numérique, comme le serveur (`src/utils/account.ts:68`) ;
   `formatTokens` affiche « 1.00 M » pour 999 999 (passage à l'unité suivante quand l'arrondi
   atteint 1000) et 0 pour une valeur négative, `NaN` ou infinie (`src/utils/formatTokens.ts:5`).

## Tests

Les tests tournent dans l'environnement `node` : `tests/unit/uc25-historique-local/navigateur.ts`
fournit une doublure minimale de navigateur (`localStorage` en mémoire, `window.dispatchEvent`,
`document.createElement('a')`, `URL.createObjectURL`) ; en installer une seconde simule
« un autre navigateur ».

### Unitaires — `tests/unit/uc25-historique-local/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `profile.test.ts` | `buildProfile`, `isProfile`, `applyProfile`, `downloadProfile` | contenu et version du profil, exclusion jeton/uuid/école, stockage corrompu (historique compris), reconnaissance du format, version inconnue refusée, fusion (ajout, priorité locale, favoris, notes, max des tokens, événement), rejet sans écriture, champs invalides, entrées hostiles (`__proto__`, favoris non chaînes, messages invalides, plus de 5000 messages, normalisation, tableau, `Infinity`/négatifs, stockage local corrompu sans import partiel), téléchargement daté |
| `history.test.ts` | `storeConversation`, `getConversation`, `updateConversation`, `deleteConversationFromHistory`, `getHistory`, `clearHistory` | rangement avec/sans identifiant, tuteur + version, mise à jour partielle, suppression, historique corrompu → repli sur `{}` |
| `favorites.test.ts` | `getFavorites`, `toggleFavorite`, `getGivenRating`, `storeGivenRating` | bascule, persistance, corruption, JSON non tableau (repli sur `[]`), notes non numériques, absence de `window` |
| `clientId.test.ts` | `getClientId` | uuid v4, stabilité, unicité par navigateur, régénération après effacement, absence de `window`, exclusion du profil |
| `account.test.ts` | `storeToken`, `clearToken`, `getToken`, `getAccount`, `getEcoleActive`, `setEcoleActive`, `authHeaders` | événements, décodage d'un vrai jeton serveur, pas de vérification de signature, expiré/illisible/sans adresse/sans `exp` (invalide), validation de l'école, en-têtes |
| `formatTokens.test.ts` | `formatTokens` | paliers d'unités, chiffres significatifs, plafond Y, arrondi à 1000 → unité suivante, négatifs/`NaN`/infini → 0 |

### Fonctionnels — `tests/functional/uc25-historique-local/historique-local.test.ts`

La logique de dépôt de `ChatSidebar.onDrop` (composant React) est reproduite à l'identique par
`deposerFichier()` (JSON illisible et profil refusé distingués) ; tout le reste est le vrai code.

| Scénario | Test |
|---|---|
| Nominal | export sur A, import sur B déjà utilisé : fusion complète, tuteur/version, notes locales prioritaires, jeton et uuid de B intacts |
| A2 | réimport du même fichier sans effet (idempotent) |
| A4 | aller-retour A → B → A : historiques identiques, favoris unis |
| A1 | import sur navigateur vierge, aucun élément d'identité transporté |
| A2 | même identifiant des deux côtés : version locale conservée |
| A3 | conversation seule aiguillée hors du chemin « profil » |
| Erreurs | JSON tronqué / vide / binaire : message, historique intact |
| Erreurs | profil sans conversations (ou tableau) : rejet sans écriture, raison exacte affichée |
| Erreurs | version de profil inconnue : refus explicite sans écriture |
| Erreurs | historique local corrompu : import puis export possibles |
| Erreurs | fichier hostile : `__proto__`, tentative d'écrasement, faux jeton, tokens négatifs |
| Erreurs | messages validés comme par le chemin « conversation » (refus en bloc, sans écriture) ; 2 Mo par la zone de dépôt, plus de 5000 messages refusés |
