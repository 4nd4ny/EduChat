# UC-07 — Mémoriser ses clés API

| | |
|---|---|
| **Acteur principal** | Titulaire d'un compte vérifié qui utilise sa propre clé de fournisseur d'IA |
| **Acteurs secondaires** | Fournisseur d'IA (reçoit la clé déchiffrée au moment de l'appel) |
| **Déclencheur** | Dans le chat, le titulaire saisit sa clé puis coche « Mémoriser ma clé » ; ou, sur « Mes données », il oublie une clé ou retire son accord |
| **Pages** | `src/chat/ChatSettings.tsx` (case « Mémoriser »), `src/context/AnthropicProvider.tsx` (liste des fournisseurs mémorisés), `src/pages/compte.tsx` (oubli, retrait) |
| **API** | `GET /api/keys`, `PUT /api/keys`, `DELETE /api/keys[?provider=x]` ; utilisation : `/api/completion`, `/api/models` (POST), `/api/speak`, `/api/transcribe` (`readUserKey`) |
| **Code serveur** | `src/pages/api/keys.ts`, `src/server/userKeys.ts`, `src/server/secretbox.ts` (AES-256-GCM, `seal`, `open`, `canSealSecrets`) |

## Objectif

Éviter au titulaire d'un compte de retaper sa clé API sur chaque appareil : **à sa demande
explicite**, la clé est conservée **chiffrée** sur le serveur, et n'en redescend **jamais** —
le navigateur sait seulement pour quels fournisseurs une clé existe ; le serveur la déchiffre
au moment d'appeler le fournisseur pour le compte de son titulaire.

## Préconditions

- Jeton de compte valide ; pour consentir ou déposer une clé, le compte doit **exister et être
  vérifié** en base (`verified_at` non nul).
- Le serveur a une clé `SECRET_TOKEN_KEY` réelle (≥ 16 caractères, pas la clé de repli de
  développement) pour mémoriser ; l'effacement reste possible sans elle.

## Scénario nominal

1. Au chargement, le chat appelle `GET /api/keys` → `{ optin, providers: [...], available }`.
2. Le titulaire saisit sa clé et coche « Mémoriser » : `PUT /api/keys { optin: true, provider,
   apiKey }`. Le serveur **valide tout avant d'écrire** (clé serveur disponible, fournisseur
   connu, clé non vide ≤ 512 caractères, consentement acquis ou donné dans cette requête),
   enregistre le consentement (`users.keys_optin = 1`) puis la clé scellée
   (`user_keys.key_enc = base64(iv|tag|chiffré)`, une ligne par fournisseur, remplacée si elle
   existe).
3. Réponse `{ ok, optin, providers }` — jamais la clé.
4. Sur un autre appareil, sans rien saisir, le chat voit le fournisseur dans `providers` ; à
   l'appel (`/api/completion`, `/api/models`…), le serveur lit la clé (`readUserKey`) et l'envoie
   au fournisseur.

## Scénarios alternatifs

- **A1 — Consentement déjà acquis.** `PUT { provider, apiKey }` suffit pour ajouter une clé.
- **A2 — Oublier une clé.** `DELETE /api/keys?provider=x` (champ vidé dans le chat, ou bouton
  « Oublier cette clé ») ; le consentement reste.
- **A3 — Oublier toutes les clés.** `DELETE /api/keys` sans paramètre.
- **A4 — Retirer son accord.** `PUT { optin: false }` : consentement retiré **et** toutes les clés
  effacées (la case décochée ne doit pas mentir) — possible même sans clé de serveur.
- **A5 — SECRET_TOKEN_KEY changée.** Les clés deviennent indéchiffrables : elles ne sont plus
  annoncées au chat (`listUserKeyProviders`), mais restent inventoriées sur « Mes données »
  (`readable: false`, `listUserKeys`) et restent effaçables.

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| Pas de jeton / jeton invalide | `401 ERR_AUTH_REQUIRED` |
| Consentement (`optin: true`) ou clé demandés avec un compte absent ou non vérifié | `401 ERR_AUTH_REQUIRED` (lecture, retrait et effacement restent ouverts) |
| Plus de 20 appels / min / IP | `429 ERR_RATE_LIMIT` |
| Mémorisation ou consentement demandé sans clé de serveur utilisable | `503 ERR_KEYS_UNAVAILABLE` (le chat masque alors la case) |
| Fournisseur absent ou inconnu (PUT avec clé, ou DELETE `?provider=`) | `400 ERR_PROVIDER_UNSUPPORTED` |
| Clé vide ou > 512 caractères | `400 ERR_KEY_INVALID` |
| Clé sans consentement acquis ni donné | `403 ERR_KEYS_OPTOUT` |
| Méthode autre que GET/PUT/DELETE | `405` |

Dans tous les cas d'erreur, **rien n'est écrit** (ni consentement, ni clé).

## Règles métier et sécurité

- AES-256-GCM, IV aléatoire de 12 octets par scellement, étiquette d'authentification de
  16 octets : un contenu altéré ou une clé serveur différente donnent `null`, jamais un faux clair.
- La clé de chiffrement dérive de `SECRET_TOKEN_KEY` (`sha256("educhat:secretbox:" + clé)`) :
  elle ne vit jamais en base.
- La clé API ne sort jamais du serveur : ni dans `/api/keys`, ni dans `/api/me/data`, ni dans
  l'export (UC-06).
- Chacun n'agit que sur ses clés (adresse lue dans le jeton signé).
- La clé saisie est rognée (espaces) avant d'être scellée.

## Postconditions

- `users.keys_optin` reflète le dernier choix ; `user_keys` contient au plus une ligne chiffrée
  par (compte, fournisseur) ; aucune ligne après un retrait de consentement.

## Anomalies constatées

1. **Corrigée** — `PUT /api/keys` exige désormais un compte vérifié en base (`isVerifiedAccount`)
   dès qu'il s'agit de consentir ou de déposer une clé : `401 ERR_AUTH_REQUIRED`, rien n'est
   écrit ; lire, retirer son accord et effacer restent possibles (ils n'écrivent rien de neuf).
   Constat d'origine : **clé déposée pour un compte inexistant** (`src/pages/api/keys.ts:50` et `:56`). La route ne
   vérifie que la signature du jeton, pas l'existence du compte (contrairement à
   `/api/me/data`, `/api/me/email`). Avec `{ optin: true, provider, apiKey }`, le contrôle de
   consentement est satisfait par la requête elle-même, `setKeysOptin` ne met à jour aucune ligne
   (pas de `users`), mais `storeUserKey` enregistre la clé. La réponse est alors incohérente
   (`optin: false`, `providers: ['openai']`) et la clé reste stockée pour une adresse sans compte
   (compte supprimé en base par l'administration avec un jeton encore valide 90 jours).
   Tests : `cles.test.ts` › « un jeton dont le compte n'existe pas ne peut ni consentir ni déposer
   une clé », « un compte présent mais non vérifié ne peut pas déposer de clé ».

## Tests

### Unitaires — `tests/unit/uc07-cles-api/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `secretbox.test.ts` | `seal`, `open`, `canSealSecrets` | aller-retour (accents, emoji, 512 car.) ; IV neuf, aucun clair, taille iv/tag ; altération du chiffré et de l'étiquette ; formes dégénérées ; changement de SECRET_TOKEN_KEY ; clé de repli et clé trop courte refusées |
| `userKeys.test.ts` | `storeUserKey`, `readUserKey`, `forgetUserKey`, `listUserKeyProviders`, `listUserKeys`, `keysOptin`, `setKeysOptin` | stockage chiffré et remplacement ; isolement entre comptes ; oubli d'une / de toutes ; clé illisible tue au chat mais inventoriée, fournisseur inconnu ignoré ; retrait du consentement = effacement ; compte inconnu |

### Fonctionnels — `tests/functional/uc07-cles-api/`

| Scénario | Test |
|---|---|
| Nominal | `cles.test.ts` › consentement et clé dans la même requête ; la clé ne redescend jamais |
| A1 | `cles.test.ts` › ajout d'une clé sans redemander le consentement |
| Nominal (étape 4) | `cles.test.ts` › le serveur utilise la clé mémorisée (`/api/models`, `Authorization: Bearer …` vers le fournisseur doublé) |
| A2 / A3 / A4 | `cles.test.ts` › oubli d'une puis de toutes ; retrait du consentement ; isolement entre comptes |
| Erreurs | `cles.test.ts` › 403 sans consentement ; 400 fournisseur/clé, rien d'écrit ; 400 au DELETE ; 401, 429, 405 |
| Anomalie 1 (corrigée) | `cles.test.ts` › compte inexistant : 401, rien d'écrit, retrait possible ; compte non vérifié : 401 |
| Erreurs (503) / A4 | `configuration.test.ts` › sans clé de serveur : 503, mais retrait et effacement possibles |
| A5 | `configuration.test.ts` › après changement de SECRET_TOKEN_KEY |
