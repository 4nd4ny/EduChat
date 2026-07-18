# Étape 6 — Vérification email et comptes vérifiés (promptagogues, enseignants, admins)

**Dépend de :** Étape 4 · **Estimation :** 1-2 sessions (aléas SMTP/DNS)

> **Prérequis bloquant :** la boîte `noreply@educh.at` n'existe **pas encore**. Action manuelle du client sur OVH avant tout test réel d'envoi : créer la boîte sur le MX Plan gratuit inclus avec le domaine et ajouter les enregistrements SPF/DKIM dans la zone DNS (procédure à consigner dans le README).

## Objectif
Mettre en place l'identité sans mot de passe des **comptes vérifiés** (exigences 6, 7, 12). Les trois types de comptes — promptagogues, enseignants, admins — partagent le même flux : un nom et un email confirmé par un code à six chiffres (format 123-456) envoyé via le SMTP OVH gratuit inclus avec le domaine. Les **élèves n'ont jamais de compte** (principe RGPD central). À la confirmation, le serveur crée ou met à jour le compte dans la table `users` (y compris le choix opt-in de synchronisation de profil, effectif à l'étape 15) et émet un jeton signé HMAC-SHA256 conservé en localStorage (pas de cookie). Le jeton porte uniquement `{name, email, exp}` — **aucun rôle** : les rôles (`is_promptagogue`/`is_teacher` en base, admin via `SECRET_ADMIN_EMAILS`) sont relus côté serveur à chaque requête sensible. Règle conservée par défense en profondeur : le code de vérification ne transite **jamais** en query string ni en chemin GET (lien email en fragment `#`), même si le journal public des logs Apache a été supprimé (étapes 1 et 13).

## Contexte et fichiers concernés
- `src/server/mail.ts` (à créer) — module d'envoi SMTP via nodemailer (ssl0.ovh.net), gabarit d'email quadrilingue-ready.
- `src/server/token.ts` (à créer) — signature/vérification du jeton HMAC-SHA256 (crypto natif) + middleware `requireAuth` et contrôles de rôle relus en base/env pour les endpoints sensibles.
- `src/pages/api/verify/request.ts` (à créer) — POST de demande de code.
- `src/pages/api/verify/confirm.ts` (à créer) — POST de confirmation et d'émission du jeton.
- `src/pages/verifier.tsx` (à créer) — page publique de saisie du code, pré-remplie depuis le fragment d'URL.
- `src/utils/env.ts` — à étendre avec les exports `SECRET_SMTP_HOST/PORT/USER/PASS/FROM`, `SECRET_TOKEN_KEY` et `SECRET_ADMIN_EMAILS`.
- `conf/(dot)env.txt` — modèle du `.env` : ajouter les nouvelles variables (sans valeur réelle).
- `README.md` — documenter la création de la boîte et les variables ; la cartographie note qu'il est déjà désynchronisé, corriger au passage sur ce point.
- `src/pages/api/auth.ts:80-173` — pattern existant `proper-lockfile` + fichier JSON, à réutiliser pour le rate-limiting.
- Tables SQLite `email_codes` et `users` — créées à l'étape 4 (schéma v2, better-sqlite3, `DATA_DIR` hors racine web). `users` porte `email, name, verified_at, is_promptagogue, is_teacher, etablissement_id, sync_optin, quota_bytes_used`.
- Ce flux sert de socle aux étapes 7 (publication), 9 (administration), 14 (espace enseignant) et 15 (sync opt-in du profil).

## Tâches
1. **Action client à documenter (prérequis bloquant)** : créer la boîte `noreply@educh.at` sur le MX Plan OVH gratuit et ajouter les enregistrements SPF/DKIM dans la zone DNS OVH (procédure à consigner dans le README).
2. Ajouter la dépendance nodemailer ; créer `src/server/mail.ts` (SMTP `ssl0.ovh.net`), déclarer `SECRET_SMTP_HOST/PORT/USER/PASS/FROM` et `SECRET_ADMIN_EMAILS` dans `src/utils/env.ts`, dans `conf/(dot)env.txt` et dans le README (déjà désynchronisé — le corriger sur ce point).
3. Créer `POST /api/verify/request` `{name, email, sync_optin}` : la case à cocher opt-in « synchroniser mon profil entre navigateurs » n'enregistre ici que le choix (stockage effectif à l'étape 15) ; code généré par `crypto.randomInt`, formaté XXX-XXX, stocké **haché** (bcrypt) dans `email_codes` avec expiration 15 min et compteur d'essais ; `name` et `sync_optin` conservés avec la demande ; rate-limiting 3 demandes/h par email et 5/h par IP (pattern `proper-lockfile` d'`auth.ts:80-173`) ; réponse indistincte que l'email existe ou non (anti-énumération).
4. Email quadrilingue-ready : code en clair à recopier **et** lien cliquable `https://educh.at/verifier#123-456` — le code exclusivement en **fragment** d'URL ; jamais de code en query string ni en chemin GET (défense en profondeur, règle conservée malgré la suppression du journal public).
5. Page publique `/verifier` : pré-remplissage depuis `location.hash` ou saisie manuelle, puis `POST /api/verify/confirm` `{email, code}` : maximum 5 essais, usage unique, upsert dans `users` (`name`, `verified_at`, `sync_optin` ; **aucun flag de rôle posé ici** — `is_promptagogue`/`is_teacher` sont posés par les parcours des étapes 7, 9 et 14), émission du jeton HMAC-SHA256 (crypto natif : payload `{name, email, exp 90 j}` + signature `SECRET_TOKEN_KEY`).
6. Côté client : stockage du jeton en localStorage sous la clé `educhat-token` (pas de cookie) ; créer `src/server/token.ts` avec le middleware `requireAuth` (signature + expiration) et des contrôles de rôle (`promptagogue`/`teacher`/`admin`) qui relisent la base (`users`) ou l'env (`SECRET_ADMIN_EMAILS`) à chaque requête sensible — jamais depuis le jeton ; purger les codes expirés au fil de l'eau.

## Livrables
- Flux complet demande → email → confirmation → compte `users` vérifié → jeton, commun aux trois types de comptes.
- `src/server/mail.ts` + `src/server/token.ts` (requireAuth + contrôles de rôle base/env) + les 2 endpoints `/api/verify/request` et `/api/verify/confirm`.
- Choix `sync_optin` enregistré à la création de compte.
- Anti-spam opérationnel (rate-limiting email + IP, réponse indistincte).

## Vérification
- Parcours réel avec une vraie boîte (Gmail) : l'email arrive **hors spam**, SPF/DKIM passent sur mail-tester.com.
- Après confirmation, le jeton est présent en localStorage sous `educhat-token` et la ligne `users` porte `verified_at` et le `sync_optin` choisi.
- Un 6e code faux est refusé.
- Un code déjà utilisé est refusé.
- Une 4e demande dans l'heure pour le même email renvoie HTTP 429.
- Un jeton falsifié ou expiré est rejeté (401) ; basculer `is_promptagogue` en base change les droits **sans réémettre le jeton** (preuve que les rôles sont relus en base).
- Le lien de l'email porte le code en fragment `#` uniquement ; aucun code n'apparaît en query string ni en chemin GET dans les logs d'accès.

## Prompt à copier-coller dans Claude Code
```text
Contexte : EduChat est un chatbot éducatif (https://educh.at) en Next.js 14 pages-router, développé par un enseignant seul assisté par IA, hébergé sur un VPS OVH (Apache en reverse-proxy + service systemd, mono-instance Node). Décisions d'architecture déjà tranchées, à respecter strictement : trois types de comptes vérifiés par email, SANS mot de passe — promptagogues, enseignants, admins — partageant le même flux de code ; les élèves n'ont JAMAIS de compte (principe RGPD central). Base SQLite via better-sqlite3 dans DATA_DIR hors racine web ; tables users et email_codes créées à l'étape 4 (users : email, name, verified_at, is_promptagogue, is_teacher, etablissement_id, sync_optin, quota_bytes_used). Envoi d'email par SMTP authentifié OVH via nodemailer (ssl0.ovh.net). Jeton signé HMAC-SHA256 (module crypto natif, aucune bibliothèque JWT), payload {name, email, exp} SANS rôle : les rôles sont relus en base (users) ou en env (SECRET_ADMIN_EMAILS) côté serveur à chaque requête sensible. Prérequis bloquant : la boîte noreply@educh.at n'existe pas encore — création manuelle par le client sur OVH (MX Plan gratuit) + SPF/DKIM avant tout test réel. Règle de défense en profondeur : aucun code de vérification ne transite jamais en query string ni en chemin GET (le journal public des logs a été supprimé, la règle demeure).

Commence par lire planning/00-analyse-existant.md, planning/decisions-techniques.md, ainsi que la fiche de l'étape 4 (planning/04-*.md), prérequis de celle-ci (schéma SQLite v2 en place).

Tâches :
1. Documente dans le README le prérequis client : créer la boîte noreply@educh.at (MX Plan OVH gratuit) et ajouter les enregistrements SPF/DKIM dans la zone DNS OVH.
2. Ajoute nodemailer. Crée src/server/mail.ts : transport SMTP ssl0.ovh.net, variables SECRET_SMTP_HOST/PORT/USER/PASS/FROM et SECRET_ADMIN_EMAILS exportées depuis src/utils/env.ts, ajoutées au modèle conf/(dot)env.txt (sans valeur réelle) et documentées au README (déjà désynchronisé : corrige-le sur ce point).
3. Crée POST /api/verify/request (src/pages/api/verify/request.ts) : body {name, email, sync_optin} — sync_optin vient d'une case à cocher « synchroniser mon profil entre navigateurs » (le stockage serveur effectif arrive à l'étape 15 ; ici on n'enregistre que le choix). Code généré par crypto.randomInt, formaté XXX-XXX, stocké HACHÉ en bcrypt (déjà en dépendance) dans email_codes avec expiration 15 min et compteur d'essais ; conserve name et sync_optin avec la demande ; rate-limiting 3 demandes/h par email et 5/h par IP en réutilisant le pattern proper-lockfile de src/pages/api/auth.ts:80-173 ; réponse strictement identique que l'email existe ou non (anti-énumération).
4. Email envoyé (gabarit prêt pour 4 langues, français par défaut) : le code en clair à recopier + un lien https://educh.at/verifier#123-456 — code dans le FRAGMENT d'URL uniquement, jamais en query string ni en chemin GET.
5. Crée la page publique src/pages/verifier.tsx : pré-remplissage depuis location.hash ou saisie manuelle, puis POST /api/verify/confirm (src/pages/api/verify/confirm.ts) : {email, code}, maximum 5 essais, usage unique, upsert dans users (name, verified_at, sync_optin ; ne pose AUCUN flag de rôle — is_promptagogue/is_teacher seront posés par les parcours des étapes 7, 9 et 14), émission du jeton HMAC-SHA256 : payload base64url {name, email, exp 90 jours} signé avec SECRET_TOKEN_KEY (crypto natif).
6. Côté client : stocke le jeton en localStorage sous la clé 'educhat-token' (pas de cookie). Crée src/server/token.ts : signature/vérification, middleware requireAuth (signature + expiration), et contrôles de rôle promptagogue/teacher/admin qui relisent la base ou SECRET_ADMIN_EMAILS à chaque appel — jamais depuis le jeton. Purge les codes expirés au fil de l'eau (lors de chaque request/confirm).

Critères d'acceptation : parcours complet avec une vraie boîte Gmail (email reçu hors spam, SPF/DKIM validés sur mail-tester.com) ; jeton présent en localStorage et ligne users avec verified_at et sync_optin corrects ; 6e code faux refusé ; code déjà utilisé refusé ; 4e demande dans l'heure pour le même email → HTTP 429 ; jeton falsifié ou expiré → 401 ; basculer is_promptagogue en base change les droits sans réémettre de jeton ; aucun code en query string ni en chemin GET dans les logs d'accès.

Termine par : yarn build sans erreur, vérification manuelle du flux complet, puis un commit git avec un message descriptif en français. Interdiction absolue de commiter .env, secret.txt, data/ ou tout secret — vérifie le .gitignore avant le commit.
```
