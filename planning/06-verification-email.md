# Étape 6 — Vérification email et jeton promptagogue

**Dépend de :** Étape 4 · **Estimation :** 1-2 sessions (aléas SMTP/DNS)

## Objectif
Mettre en place l'identité sans mot de passe des promptagogues (exigences 6, 7, 12) : un nom et un email confirmé par un code à six chiffres (format 123-456) envoyé via le SMTP OVH gratuit inclus avec le domaine. À la confirmation, le serveur émet un jeton signé HMAC-SHA256 conservé en localStorage (pas de cookie), qui autorisera les futures écritures de prompts. Contrainte de sécurité absolue : le code ne doit jamais apparaître dans les logs Apache, car ceux-ci sont publiés sur le web chaque minute par un cron.

## Contexte et fichiers concernés
- `src/server/mail.ts` (à créer) — module d'envoi SMTP via nodemailer (ssl0.ovh.net), gabarit d'email quadrilingue-ready.
- `src/server/token.ts` (à créer) — signature/vérification du jeton HMAC-SHA256 (crypto natif) + middleware `requireAuth` pour les endpoints d'écriture.
- `src/pages/api/verify/request.ts` (à créer) — POST de demande de code.
- `src/pages/api/verify/confirm.ts` (à créer) — POST de confirmation et d'émission du jeton.
- `src/pages/verifier.tsx` (à créer) — page publique de saisie du code, pré-remplie depuis le fragment d'URL.
- `src/utils/env.ts` — à étendre avec les exports `SECRET_SMTP_HOST/PORT/USER/PASS/FROM` et `SECRET_TOKEN_KEY`.
- `conf/(dot)env.txt` — modèle du `.env` : ajouter les nouvelles variables (sans valeur réelle).
- `README.md` — documenter la création de la boîte et les variables ; la cartographie note qu'il est déjà désynchronisé, corriger au passage sur ce point.
- `src/pages/api/auth.ts:80-173` — pattern existant `proper-lockfile` + fichier JSON, à réutiliser pour le rate-limiting.
- `conf/log_to_web.sh` — le cron qui publie les logs Apache dans `/var/www/html/ip-direct/educh-at.log` : la raison pour laquelle le code voyage en fragment `#`, jamais en query/chemin GET.
- Tables SQLite `email_codes` et `promptagogues` — créées à l'étape 4 (better-sqlite3, `DATA_DIR` hors racine web).

## Tâches
1. **Action client à documenter** : créer la boîte `noreply@educh.at` sur le MX Plan OVH gratuit et ajouter les enregistrements SPF/DKIM dans la zone DNS OVH (procédure à consigner dans le README).
2. Ajouter la dépendance nodemailer ; créer `src/server/mail.ts` (SMTP `ssl0.ovh.net`), déclarer `SECRET_SMTP_HOST/PORT/USER/PASS/FROM` dans `src/utils/env.ts`, dans `conf/(dot)env.txt` et dans le README (déjà désynchronisé — le corriger sur ce point).
3. Créer `POST /api/verify/request` `{name, email}` : code généré par `crypto.randomInt`, formaté XXX-XXX, stocké **haché** (bcrypt) dans `email_codes` avec expiration 15 min et compteur d'essais ; rate-limiting 3 demandes/h par email et 5/h par IP (pattern `proper-lockfile` d'`auth.ts:80-173`) ; réponse indistincte que l'email existe ou non (anti-énumération).
4. Email quadrilingue-ready : code en clair à recopier **et** lien cliquable `https://educh.at/verifier#123-456` — le code exclusivement en **fragment** d'URL, qui n'atteint jamais le serveur donc jamais les logs Apache publiés par `log_to_web.sh` ; jamais de code en query string ni en chemin GET.
5. Page publique `/verifier` : pré-remplissage depuis `location.hash` ou saisie manuelle, puis `POST /api/verify/confirm` `{email, code}` : maximum 5 essais, usage unique, upsert dans `promptagogues`, émission du jeton HMAC-SHA256 (crypto natif : payload `{name, email, exp 90 j}` + signature `SECRET_TOKEN_KEY`).
6. Côté client : stockage du jeton en localStorage sous la clé `promptagogue-token` (pas de cookie) ; créer `src/server/token.ts` avec le middleware `requireAuth` pour les écritures ; purger les codes expirés au fil de l'eau.

## Livrables
- Flux complet demande → email → confirmation → jeton.
- `src/server/mail.ts` + `src/server/token.ts` + les 2 endpoints `/api/verify/request` et `/api/verify/confirm`.
- Anti-spam opérationnel (rate-limiting email + IP, réponse indistincte).

## Vérification
- Parcours réel avec une vraie boîte (Gmail) : l'email arrive **hors spam**, SPF/DKIM passent sur mail-tester.com.
- Après confirmation, le jeton est présent en localStorage sous `promptagogue-token`.
- Un 6e code faux est refusé.
- Un code déjà utilisé est refusé.
- Une 4e demande dans l'heure pour le même email renvoie HTTP 429.
- Le code n'apparaît **pas** dans `/var/www/html/ip-direct/educh-at.log` (fragment jamais transmis au serveur).

## Prompt à copier-coller dans Claude Code
```text
Contexte : EduChat est un chatbot éducatif (https://educh.at) en Next.js 14 pages-router, développé par un enseignant seul assisté par IA, hébergé sur un VPS OVH (Apache en reverse-proxy + service systemd, mono-instance Node). Décisions d'architecture déjà tranchées, à respecter strictement : base SQLite via better-sqlite3 dans DATA_DIR hors racine web (tables promptagogues et email_codes, créées à l'étape 4) ; envoi d'email par SMTP authentifié OVH via nodemailer (ssl0.ovh.net) ; identité « promptagogue » sans mot de passe ni cookie — jeton signé HMAC-SHA256 (module crypto natif, zéro dépendance) stocké en localStorage. Contrainte critique : un cron (conf/log_to_web.sh) publie les logs Apache sur le web (/var/www/html/ip-direct/educh-at.log) ; aucun code de vérification ne doit donc jamais transiter en query string ni en chemin GET.

Commence par lire planning/00-analyse-existant.md, planning/decisions-techniques.md, ainsi que la fiche de l'étape 4 (planning/04-*.md), prérequis de celle-ci (base SQLite en place).

Tâches :
1. Documente dans le README l'action côté client : créer la boîte noreply@educh.at (MX Plan OVH gratuit) et ajouter les enregistrements SPF/DKIM dans la zone DNS OVH.
2. Ajoute nodemailer. Crée src/server/mail.ts : transport SMTP ssl0.ovh.net, variables SECRET_SMTP_HOST/PORT/USER/PASS/FROM exportées depuis src/utils/env.ts, ajoutées au modèle conf/(dot)env.txt (sans valeur réelle) et documentées au README (déjà désynchronisé : corrige-le sur ce point).
3. Crée POST /api/verify/request (src/pages/api/verify/request.ts) : body {name, email} ; code généré par crypto.randomInt, formaté XXX-XXX ; stocké HACHÉ en bcrypt (déjà en dépendance) dans la table email_codes avec expiration 15 min et compteur d'essais ; rate-limiting 3 demandes/h par email et 5/h par IP en réutilisant le pattern proper-lockfile de src/pages/api/auth.ts:80-173 ; réponse strictement identique que l'email existe ou non (anti-énumération).
4. Email envoyé (gabarit prêt pour 4 langues, français par défaut) : le code en clair à recopier + un lien https://educh.at/verifier#123-456 — code dans le FRAGMENT d'URL uniquement, jamais en query ni en chemin.
5. Crée la page publique src/pages/verifier.tsx : pré-remplissage depuis location.hash ou saisie manuelle, puis POST /api/verify/confirm (src/pages/api/verify/confirm.ts) : {email, code}, maximum 5 essais, usage unique, upsert dans promptagogues, émission du jeton HMAC-SHA256 : payload base64url {name, email, exp 90 jours} signé avec SECRET_TOKEN_KEY (crypto natif, pas de bibliothèque JWT).
6. Côté client : stocke le jeton en localStorage sous la clé 'promptagogue-token' (pas de cookie). Crée src/server/token.ts avec signature/vérification et un middleware requireAuth pour les futurs endpoints d'écriture. Purge les codes expirés au fil de l'eau (lors de chaque request/confirm).

Critères d'acceptation : parcours complet avec une vraie boîte Gmail (email reçu hors spam, SPF/DKIM validés sur mail-tester.com) puis jeton présent en localStorage ; 6e code faux refusé ; code déjà utilisé refusé ; 4e demande dans l'heure pour le même email → HTTP 429 ; le code n'apparaît jamais dans les logs Apache publiés.

Termine par : yarn build sans erreur, vérification manuelle du flux complet, puis un commit git avec un message descriptif en français. Interdiction absolue de commiter .env, secret.txt, data/ ou tout secret — vérifie le .gitignore avant le commit.
```
