# UC-08 — Synchroniser son profil entre navigateurs

| | |
|---|---|
| **Acteur principal** | Titulaire d'un compte vérifié ayant consenti à la sauvegarde (`sync_optin`) |
| **Acteurs secondaires** | Ses autres navigateurs / appareils |
| **Déclencheur** | Connexion réussie sur `/verifier` (synchronisation immédiate), bouton « Synchroniser » de la barre latérale, sauvegarde automatique 15 s après le dernier message, effacement depuis « Mes données » |
| **Pages** | `src/pages/verifier.tsx`, `src/chatSidebar/ChatSidebar.tsx`, `src/context/AnthropicProvider.tsx` (sauvegarde automatique), `src/pages/compte.tsx` (effacement) |
| **API** | `GET /api/profile`, `PUT /api/profile`, `DELETE /api/profile` |
| **Code** | serveur : `src/pages/api/profile.ts` (tables `profiles`, `profile_deletions`) ; client : `src/utils/profileSync.ts` (`syncProfile`, `pushProfile`, `deleteServerConversations`, `deleteServerProfile`), `src/utils/profile.ts` (`buildProfile`, `isProfile`, `applyProfile`), `src/context/History.tsx` |

## Objectif

Retrouver ses conversations, favoris, notes et compteur de jetons d'un navigateur à l'autre,
**sur consentement explicite**, sans qu'aucun appareil puisse faire perdre les conversations d'un
autre (fusion, jamais écrasement), et sans qu'une conversation effacée puisse revenir
(pierres tombales définitives).

## Préconditions

- Jeton de compte valide dans le navigateur (`educhat-token`).
- Pour écrire : `users.sync_optin = 1` (coché à la vérification, UC-04, ou sur « Mes données », UC-05).

## Scénario nominal — synchronisation explicite

1. `syncProfile()` lit `GET /api/profile` → `{ profile, updatedAt, deletedConversations }`
   (`profile: null` si rien n'est stocké ou si le stockage est illisible).
2. Le navigateur **fusionne** le profil distant (`applyProfile`) : ajoute les conversations qu'il
   n'a pas (jamais d'écrasement local), unit les favoris, garde ses notes, prend le **maximum**
   des compteurs, prévient la page (`totalTokensUpdated`).
3. Il retire de son historique les conversations listées dans `deletedConversations`.
4. Il renvoie son état fusionné : `PUT /api/profile { profile: buildProfile() }` (le jeton de
   compte n'est jamais inclus).
5. Le serveur **fusionne à son tour** avec ce qu'il a : union des conversations (à identifiant
   égal, la plus récente selon `lastMessage` / `createdAt` gagne, la reçue à égalité), union des
   favoris, notes reçues prioritaires, **maximum** des deux compteurs `totalTokens` ; retire les conversations sous pierre tombale ; stocke
   (≤ 1 Mo) et répond `{ ok, updatedAt }`.
6. Le client rend `{ ok: true, mergedConversations }` ; la barre latérale recharge la page si des
   conversations ont été ajoutées.

## Scénarios alternatifs

- **A1 — Sauvegarde automatique.** `pushProfile()` envoie l'état local **sans** rapatrier (sinon
  une conversation supprimée localement reviendrait) ; le serveur fusionne quand même.
- **A2 — Effacer une sélection** (« Mes données ») : `deleteServerConversations(ids)` →
  `DELETE /api/profile { conversations: ids }` : pierre tombale pour chaque identifiant (64
  caractères, 500 au plus), retrait du profil stocké, puis retrait local. Réponse `{ ok, deleted }`.
  Une sélection présente mais vide (ou qui n'est pas une liste) est refusée, jamais confondue
  avec l'effacement total.
- **A3 — Effacement total** : `DELETE /api/profile` sans corps : pierre tombale sur chaque
  conversation stockée (les anciennes conservées), profil supprimé, **consentement retiré** (la
  sauvegarde automatique ne le recrée pas). Réponse `{ ok, syncDisabled: true }`.
- **A4 — L'autre appareil** encore porteur d'une conversation effacée la retire à sa prochaine
  synchronisation, et le serveur la filtrerait de toute façon, même datée dans le futur.

## Scénarios d'erreur

| Cas | Réponse (serveur) | Résultat (client) |
|---|---|---|
| Pas de jeton | `401 ERR_AUTH_REQUIRED` | `{ ok: false, reason: 'auth' }` (sans appel si pas de jeton local) |
| Consentement absent ou retiré, compte absent | `403 ERR_SYNC_OPTOUT` au PUT | `reason: 'optout'` (la barre latérale invite à réactiver la sauvegarde depuis « Mes données ») |
| Profil sans `educhatProfile` numérique | `400 ERR_PROFILE_INVALID` | `reason: 'error'` |
| Sélection d'effacement vide, qui n'est pas une liste, ou sans identifiant exploitable | `400 ERR_PROFILE_INVALID` (rien n'est effacé) | `false` |
| Profil fusionné > 1 Mo | `413 ERR_PROFILE_TOO_LARGE` | `reason: 'error'` |
| Plus de 10 appels / min / IP | `429 ERR_RATE_LIMIT` | lecture ignorée, écriture en `error` |
| Coupure réseau | — | `reason: 'error'` / `false` |
| Méthode autre que GET/PUT/DELETE | `405` | — |

## Règles métier et sécurité

- Strictement opt-in pour l'écriture ; la lecture et l'effacement restent toujours possibles.
- La fusion ne retire jamais rien ; seule la volonté d'effacement (DELETE) retire, et
  définitivement : une pierre tombale ne se compare pas à une date.
- Les pierres tombales ne gardent que l'identifiant opaque, jamais de contenu.
- Chacun ne lit et n'efface que son profil (adresse lue dans le jeton signé).

## Postconditions

- `profiles` contient l'union fusionnée, sans conversation effacée ; `profile_deletions` ne fait
  que grandir ; après A3, plus de profil et `sync_optin = 0`.

## Anomalies constatées

1. **Corrigée** — un champ `conversations` présent doit être une liste non vide, sinon
   `400 ERR_PROFILE_INVALID` sans rien effacer ; seul un DELETE sans sélection déclenche
   l'effacement total. Constat d'origine : **une sélection vide effaçait tout** (`src/pages/api/profile.ts:104`). `DELETE { conversations: [] }`
   n'était pas traité comme une sélection (test `demandees.length`) et tombait dans l'effacement
   **total** (profil supprimé, consentement retiré). Le client officiel s'en garde
   (`deleteServerConversations` refuse une liste vide) mais la route devait répondre 400.
   Test : `profil.test.ts` › « une sélection VIDE est refusée et n'efface rien ».
2. **Corrigée** — la fusion serveur garde le maximum des deux `totalTokens` (valeur illisible
   comptée 0), comme `applyProfile`. Constat d'origine : **le compteur déclaré pouvait régresser** (`src/pages/api/profile.ts:61-78`). La fusion serveur ne
   traite que conversations, favoris et notes : `totalTokens` (affiché comme « compteur venant des
   navigateurs » sur « Mes données ») est pris tel quel du dernier envoi. La sauvegarde automatique
   d'un appareil au compteur plus bas le fait donc baisser, alors que `applyProfile` côté client
   prend le maximum. Test : « le compteur de jetons garde le maximum des deux côtés ».
3. **Corrigée** — `deleteServerProfile` rend `false` sur coupure réseau (l'appel de `verifier.tsx`,
   inchangé, affiche alors « Échec de la suppression ») et le message « optout » de la barre
   latérale renvoie vers « Mes données » (texte en dur dans `ChatSidebar.tsx`, hors dictionnaire
   i18n). Constat d'origine : mineur, `deleteServerProfile` (`src/utils/profileSync.ts:96-101`) n'intercepte pas une coupure
   réseau, contrairement aux trois autres fonctions ; `verifier.tsx:291` l'appelle dans un
   `alert(await …)` sans `try`. Et le message « optout » de `ChatSidebar.tsx` invite à
   « re-vérifier son email » alors que le consentement se redonne désormais depuis « Mes données »
   (`PUT /api/me`).

## Tests

### Unitaires — `tests/unit/uc08-sync-profil/`

(`doublureNavigateur.ts` fournit un `localStorage` en mémoire et un `window` minimal, un par navigateur simulé.)

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `profile.test.ts` | `buildProfile`, `isProfile`, `applyProfile` | contenu du profil sans jeton ; stockage vide/corrompu ; reconnaissance du format ; ajout sans écrasement (et sans conversation sans messages) ; favoris unis, notes locales, compteur maximal, événement ; profil sans conversations refusé |
| `profileSync.test.ts` | `syncProfile`, `pushProfile`, `deleteServerConversations`, `deleteServerProfile` | sans jeton ; fusion + retrait des effacées + PUT de l'état fusionné (en-tête Bearer) ; 401/403/500 → auth/optout/error ; lecture en échec puis écriture ; coupure réseau ; poussée sans lecture ; effacement serveur puis local, échec sans effet local, liste vide sans appel ; DELETE sans corps ; coupure réseau → `false` ; refus serveur → `false`, sans jeton aucun appel |

### Fonctionnels — `tests/functional/uc08-sync-profil/`

| Scénario | Test |
|---|---|
| Nominal (route) | `profil.test.ts` › premier envoi puis relecture |
| Nominal (fusion) | `profil.test.ts` › union, la plus récente gagne ; égalité → reçue ; profil serveur illisible remplacé |
| A2 / A4 | `profil.test.ts` › pierre tombale définitive (date future) ; bornes 64/500 ; sélection inexploitable → 400 |
| A3 | `profil.test.ts` › effacement total, consentement coupé, PUT suivant refusé |
| Erreurs / droits | `profil.test.ts` › 403 sans consentement ou sans compte ; 400 ; 413 ; isolement entre comptes ; 401, 429, 405 |
| Anomalies 1 et 2 (corrigées) | `profil.test.ts` › sélection vide (ou non-liste) refusée, rien d'effacé ; compteur maximal |
| Nominal (bout en bout) | `deuxNavigateurs.test.ts` › deux appareils convergent (client réel + route réelle) |
| A1 | `deuxNavigateurs.test.ts` › sauvegarde automatique sans rapatriement, fusion serveur |
| A2 / A4 | `deuxNavigateurs.test.ts` › effacée sur le portable, disparue du fixe |
| A3 / erreurs | `deuxNavigateurs.test.ts` › après effacement total → optout ; sans consentement → optout |
