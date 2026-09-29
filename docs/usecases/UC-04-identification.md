# UC-04 — Créer un compte ou se reconnecter par code email

| | |
|---|---|
| **Acteur principal** | Visiteur (futur promptagogue, enseignant, administrateur) |
| **Acteurs secondaires** | Serveur SMTP (envoi du code), administration (notifiée) |
| **Déclencheur** | Le visiteur saisit son adresse sur `/verifier` |
| **Pages** | `src/pages/verifier.tsx` |
| **API** | `POST /api/verify/request`, `POST /api/verify/confirm` |
| **Code serveur** | `src/server/token.ts`, `src/server/appartenance.ts` (`lierCompte`), `src/server/etablissements.ts` (`resolveEtablissementByIp`), `src/server/mail.ts` |

## Objectif

Prouver la possession d'une adresse email **sans mot de passe** : un code à six chiffres
(`123-456`) est envoyé par courriel, avec un lien signé qui porte le même code. Vérifier son
adresse crée le compte (rôle **promptagogue**) ou le reconnecte, et rend un jeton de compte
signé HMAC-SHA256 valable 90 jours.

## Préconditions

- Aucune. Le visiteur n'a pas besoin d'être connu du site.

## Scénario nominal — code recopié

1. Le visiteur saisit son adresse (et coche éventuellement « synchroniser » et « je suis enseignant »).
2. `POST /api/verify/request { email, syncOptin?, isTeacher? }` : le serveur tire un code
   cryptographique, en stocke le **hash bcrypt** (`email_codes`, validité 15 min) et envoie le code
   et un lien signé. La réponse est toujours `200 { ok: true }`.
3. Le visiteur recopie le code (`123-456`, `123 456` et `123456` sont équivalents).
4. `POST /api/verify/confirm { email, code }` : le code est comparé au hash, **consommé**
   (ligne supprimée), le compte est créé (`is_promptagogue = 1`) ou réactivé.
5. Le serveur renvoie `{ token, name, email, sync, teacher, ecole }` ; le navigateur range le
   jeton dans `localStorage` (`educhat-token`).
6. L'administration est notifiée d'un nouveau compte.

## Scénarios alternatifs

- **A1 — Lien du courriel.** `POST /api/verify/confirm { lien }` : le lien porte adresse, code,
  expiration et les deux choix, signés avec un **préfixe de contexte** qui le rend inutilisable
  comme jeton de compte. Les choix (`sync`, `teacher`) sont relus dans la charge signée.
- **A2 — Compte existant.** Le nom personnalisé n'est pas réécrit ; les rôles ne sont **jamais**
  modifiés (un rôle retiré par l'administration ne revient pas). Une demande de rôle enseignant
  part en notification à l'administration.
- **A3 — Vérification depuis le réseau d'une école.** Si l'IP appartient à un établissement, le
  compte y est **rattaché sans droit d'administration** (`lierCompte`, idempotent). La réponse
  dit l'école et si le lien est nouveau (`ecole.nouvelle`).

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| Adresse mal formée | `400 ERR_EMAIL_INVALID` (seule erreur visible à la demande) |
| Plus de 3 envois / heure pour une adresse, ou 5 demandes / min pour une IP | `200 { ok: true }` indistinct, **aucun envoi** |
| Code mal formé | `400 ERR_CODE_INVALID` |
| Code expiré, déjà consommé, adresse inconnue | `400 ERR_CODE_EXPIRED` |
| Code faux | `401 ERR_CODE_WRONG` (compteur d'essais incrémenté) |
| 5 essais faux | `429 ERR_TOO_MANY_ATTEMPTS`, même avec le bon code |
| Lien falsifié, périmé, rejoué ou remplacé par un envoi plus récent | `400 ERR_LIEN_INVALIDE` — **toujours la même réponse** (aucune énumération) |
| Plus de 10 confirmations / min depuis une IP | `429 ERR_RATE_LIMIT` |
| Méthode autre que `POST` | `405` |

## Règles métier et sécurité

- Aucune réponse de `/api/verify/request` ne permet de savoir si une adresse est connue.
- Le code n'est jamais stocké en clair ; le lien le place dans le **fragment** (`#…`) de l'URL.
- Les rôles ne sont jamais portés par le jeton : ils sont relus en base à chaque requête.
- Le rang de super-administrateur vient uniquement de `SECRET_ADMIN_EMAILS`.

## Postconditions

- Ligne `users` créée/mise à jour (`verified_at`, `sync_optin`), ligne `email_codes` supprimée,
  éventuel lien `user_etablissements` (`is_admin = 0`).

## Tests

### Unitaires — `tests/unit/uc04-identification/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `token.test.ts` | `issueToken`, `verifyToken`, `signerLienVerification`, `lireLienVerification`, `requireAuth`, `isAdminEmail` | émission/relecture, durée de vie 90 j, falsification, expiration, formes dégénérées, séparation lien/jeton, en-tête Bearer, super-admins insensibles à la casse |
| `lierCompte.test.ts` | `lierCompte`, `resolveEtablissementByIp` | résolution d'IP (liste, inconnue, vide), lien sans admin, idempotence sans rétrogradation |

### Fonctionnels — `tests/functional/uc04-identification/identification.test.ts`

| Scénario | Test |
|---|---|
| Nominal | inscription par code recopié → compte promptagogue + jeton + notification |
| Nominal | code à usage unique |
| A1 | confirmation par lien, transport des choix sync/enseignant |
| A1 / erreurs | lien périmé, falsifié, rejoué → même `ERR_LIEN_INVALIDE` |
| Erreurs | adresse invalide ; code mal formé ; 5 codes faux puis blocage |
| Erreurs | plafond de 3 envois/heure/adresse et 5 demandes/min/IP, réponse indistincte |
| Erreurs | méthodes non autorisées |
| A2 | re-vérification : rôles et nom préservés, demande enseignant notifiée |
| A3 | rattachement par IP sans admin, puis `nouvelle: false` au second passage |
