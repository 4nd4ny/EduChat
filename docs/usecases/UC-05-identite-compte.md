# UC-05 — Gérer son identité et changer d'adresse email

| | |
|---|---|
| **Acteur principal** | Titulaire d'un compte vérifié (promptagogue, enseignant, administrateur) |
| **Acteurs secondaires** | Serveur SMTP (code vers la nouvelle adresse, avertissement vers l'ancienne), copie de suivi (`SECRET_SMTP_BCC`) |
| **Déclencheur** | Le titulaire ouvre « Mes données » (`/compte`) et modifie son nom, sa sauvegarde, ou son adresse ; toute page réservée lit aussi `/api/me` |
| **Pages** | `src/pages/compte.tsx` (section identité), `src/pages/duel.tsx` (lecture des rôles) |
| **API** | `GET /api/me`, `PUT /api/me`, `POST /api/me/email`, `PUT /api/me/email` |
| **Code serveur** | `src/pages/api/me.ts`, `src/pages/api/me/email.ts`, `src/server/appartenance.ts` (`listerEcoles`, `choixEcole`, `ecoleActivePourCompte`), `src/server/admin.ts` (`requireAdmin`, `requireGestionTuteurs`), `src/server/accountData.ts` (`isVerifiedAccount`), `src/server/mail.ts` (`sendEmailChangeCode`, `sendEmailChangeWarning`) |

## Objectif

Permettre au titulaire d'un compte de **lire son identité et ses rôles tels que le serveur les
voit** (relus en base à chaque appel), de **personnaliser son nom d'affichage**, de **donner ou
retirer son consentement** à la sauvegarde des conversations, et de **changer d'adresse email**
sans perdre ni ses données ni ses droits : l'adresse étant la clé du compte, le changement est
prouvé par un code envoyé à la nouvelle adresse, signalé à l'ancienne, puis appliqué à toutes
les tables dans une seule transaction.

## Préconditions

- Le navigateur détient un jeton de compte valide (`educhat-token`, voir UC-04).
- Pour `/api/me/email` : le compte existe **et est vérifié** en base (`verified_at` non nul).

## Scénario nominal — lire et personnaliser son identité

1. La page appelle `GET /api/me` avec `Authorization: Bearer …` (et l'en-tête `x-educhat-ecole`
   si une école active est choisie dans ce navigateur).
2. Le serveur rend `{ email, name, isPromptagogue, isTeacher, ecoles[], ecoleActive, isAdmin,
   isSuper, gereTuteurs }` : rôles lus en base, école active **revérifiée** contre la table de
   liaison (`user_etablissements`).
3. Le titulaire saisit un nouveau nom : `PUT /api/me { name }`. Le nom est rogné (espaces,
   80 caractères) puis écrit dans `users.name` **et** reporté sur `prompts.author_name` de tous
   ses tuteurs (nom d'auteur dénormalisé).
4. Il coche ou décoche la sauvegarde : `PUT /api/me { syncOptin }` met à jour `users.sync_optin`.
   Les deux champs peuvent arriver dans la même requête. Réponse `200 { ok: true }`.

## Scénario nominal — changer d'adresse

1. Le titulaire saisit la nouvelle adresse : `POST /api/me/email { newEmail }`.
2. Le serveur normalise (minuscules, espaces), vérifie le format, que l'adresse diffère et
   qu'aucun compte ne la porte, tire un code `123-456`, en stocke le **hash bcrypt** dans
   `email_changes` (clé : l'ancienne adresse, validité 15 min, compteur d'essais remis à 0).
3. Le code part à la **nouvelle** adresse (sans copie cachée ; le suivi reçoit un avis **sans le
   code**) ; un avertissement part à l'**ancienne** adresse, en tâche de fond.
4. Le titulaire recopie le code : `PUT /api/me/email { code }`.
5. Le serveur vérifie le code puis, dans **une transaction**, remplace l'adresse dans `users`,
   `profiles`, `profile_deletions`, `user_keys`, `prompts.author_email`, `usage_log.teacher_email`,
   `session_settings.set_by_email`, `comments.moderated_by`, `user_etablissements` (le rang
   d'administrateur d'école suit la personne), `facture_mentions.par`, et supprime la demande.
6. La réponse `{ ok, email, token }` porte un **nouveau jeton** (l'ancien désigne une adresse qui
   n'est plus un compte) ; la page le range et recharge tout.

## Scénarios alternatifs

- **A1 — Nom vide.** `PUT /api/me { name: "   " }` rétablit le nom dérivé de la partie locale de
  l'adresse (`marie.curie@…` → `marie.curie`).
- **A2 — Plusieurs écoles.** `ecoles` liste l'école principale d'abord ; `ecoleActive` vaut le
  choix annoncé s'il est lié, sinon l'école principale, sinon le plus ancien lien. Un choix non
  lié est **corrigé** silencieusement. `isAdmin` dépend du rang **dans l'école active**.
- **A3 — Enseignant de son école principale.** `gereTuteurs = true` sans `isAdmin`.
- **A4 — Nouvelle demande de changement.** Elle remplace la précédente (même ligne
  `email_changes`) : seul le dernier code est valable.
- **A5 — Jeton dont le compte a disparu.** `GET /api/me` répond quand même (nom du jeton, aucun
  rôle) ; `PUT /api/me` répond `ok` sans rien écrire dans `users`.

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| Pas de jeton / jeton invalide | `401 ERR_AUTH_REQUIRED` |
| `PUT /api/me` sans `name` texte ni `syncOptin` booléen | `400 ERR_PROFILE_INVALID` |
| Méthode autre que GET/PUT sur `/api/me` | `405` (`Allow: GET, PUT`) |
| `/api/me/email` avec un compte absent ou non vérifié | `401 ERR_AUTH_REQUIRED` |
| Plus de 5 appels / min / IP sur `/api/me/email` (toutes méthodes) | `429 ERR_RATE_LIMIT` |
| Adresse mal formée | `400 ERR_EMAIL_INVALID` |
| Adresse identique à l'actuelle | `400 ERR_EMAIL_SAME` |
| Adresse déjà portée par un compte (à la demande ou à la confirmation) | `409 ERR_EMAIL_TAKEN` |
| Confirmation sans demande en cours | `404 ERR_CODE_UNKNOWN` |
| Code expiré (demande effacée) | `410 ERR_CODE_EXPIRED` |
| Code faux (essai compté) | `403 ERR_CODE_INVALID` |
| 5 essais faux | `429 ERR_TOO_MANY_ATTEMPTS`, même avec le bon code |
| Lien d'école déjà posé sur la nouvelle adresse | exception SQL → **toute** la transaction est annulée (500) |
| Méthode autre que POST/PUT sur `/api/me/email` | `405` (`Allow: POST, PUT`) |

## Règles métier et sécurité

- Les rôles et le nom ne sont jamais crus sur le jeton : ils sont relus en base à chaque appel.
- L'école active annoncée par le navigateur n'est qu'une préférence, revérifiée en base.
- Le code de changement n'est jamais stocké en clair ni copié au suivi ; l'ancienne adresse est
  toujours prévenue (c'est la protection contre un compte détourné).
- La migration est **tout ou rien** : mieux vaut un changement refusé qu'un compte à moitié
  déplacé (notamment `user_etablissements`, qui porte l'autorisation).

## Postconditions

- Identité : `users.name` / `users.sync_optin` à jour, `prompts.author_name` aligné.
- Changement d'adresse : plus aucune ligne des tables migrées ne porte l'ancienne adresse ;
  `email_changes` vidée ; l'ancien jeton n'ouvre plus rien sur les routes qui exigent un compte.

## Anomalies constatées

1. **Le porte-monnaie personnel ne suit pas le changement d'adresse**
   (`src/pages/api/me/email.ts:90-128`). La transaction migre `users.solde` (avec la ligne
   `users`) mais **ni `credit_mouvements.titulaire_email` ni `recharges.titulaire_email`**.
   Conséquences : le relevé disparaît de « Mes données » et de l'export de la nouvelle adresse ;
   `aUnPorteMonnaie` repasse à faux (le compte est traité comme n'ayant jamais provisionné) ; une
   recharge PayPal en attente créditerait l'**ancienne** adresse, qui n'a plus de ligne `users`
   (`bouger` lève « Porte-monnaie introuvable »). Les colonnes de traçabilité
   `credit_mouvements.par`, `recharges.par` et `users.adult_verified_by` ne sont pas migrées non
   plus. Test : `changementEmail.test.ts` › « le porte-monnaie personnel ne suit pas ».
2. **Le code n'est pas normalisé** (`src/pages/api/me/email.ts:70`) : contrairement à
   `/api/verify/confirm` (UC-04), `123456` ou `123 456` sont refusés comme **code faux** et
   consomment un des 5 essais. Test : « le code doit être recopié AVEC son tiret ».
3. Mineur : `PUT /api/me { name }` met à jour `prompts.author_name` même quand le compte n'existe
   pas / n'est pas vérifié (`src/pages/api/me.ts:42`, non gardé comme les lignes 33 et 38).

## Tests

### Unitaires — `tests/unit/uc05-identite-compte/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `appartenance.test.ts` | `choixEcole`, `ecoleActivePourCompte`, `listerEcoles`, `ecolePrincipale`, `isVerifiedAccount` | en-tête puis corps, en-tête répété, valeurs invalides ; choix lié / non lié / principale / plus ancien lien / aucun ; principale en tête, rang par école, établissement effacé ignoré ; compte vérifié, non vérifié, absent |
| `mailChangementAdresse.test.ts` | `sendEmailChangeCode`, `sendEmailChangeWarning` | sans SMTP : journal, aucun envoi ; code vers la nouvelle adresse sans BCC + avis de suivi sans code ; avertissement vers l'ancienne avec BCC ; échec de l'avertissement non fatal ; échec du code remonté |

### Fonctionnels — `tests/functional/uc05-identite-compte/`

| Scénario | Test |
|---|---|
| Nominal (lecture) | `identite.test.ts` › rend l'adresse, le nom et les rôles ; rôles relus en base ; nom en base prioritaire ; super-administrateur |
| A2 / A3 | `identite.test.ts` › plusieurs écoles et école active ; école annoncée non liée corrigée ; enseignant gestionnaire de tuteurs |
| Nominal (nom, sync) / A1 | `identite.test.ts` › nom rogné et reporté sur les tuteurs ; nom vide → nom dérivé ; consentement donné/retiré ; deux champs à la fois |
| Erreurs / A5 | `identite.test.ts` › 401 ; 400 `ERR_PROFILE_INVALID` ; 405 ; jeton sans compte |
| Nominal (adresse) | `changementEmail.test.ts` › code vers la nouvelle + avertissement ; migration de toutes les tables, nouveau jeton, ancien jeton refusé |
| A4 | `changementEmail.test.ts` › une nouvelle demande remplace la précédente |
| Erreurs (demande) | `changementEmail.test.ts` › invalide / identique / prise ; 401 ; 429 ; 405 |
| Erreurs (confirmation) | `changementEmail.test.ts` › 404 ; 403 puis 429 ; code sans tiret ; 410 ; 409 ; annulation complète de la transaction |
| Anomalie 1 | `changementEmail.test.ts` › le porte-monnaie personnel ne suit pas |
