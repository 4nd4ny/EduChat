# Décisions techniques

*Choix d'architecture issus de la comparaison de trois plans candidats (angles : coût minimal, sécurité/RGPD, produit pédagogique) départagés par un jury. Chaque décision reste discutable — voir [questions-suggestions.md](questions-suggestions.md) — mais les fiches d'étapes 01 à 13 les supposent acquises.*

## 1. Persistance serveur : SQLite (better-sqlite3) dans `DATA_DIR`, hors racine web

- **Choix** : un fichier SQLite unique via `better-sqlite3`, dans un répertoire de données défini par la variable d'env `DATA_DIR` (défaut `./data/` en dev, `/var/lib/educhat/` en prod via `Environment=` dans `conf/educh-at.service`).
- **Pourquoi** : les compteurs `usage_count`/`tokens_total` s'incrémentent à chaque complétion — le pattern existant « fichiers JSON + proper-lockfile » ne tient pas sans races ; la page d'accueil exige des tris multi-critères, donc des requêtes. MySQL OVH serait un service de plus à administrer pour quelques centaines de prompts ≤ 256 Ko. `better-sqlite3` est synchrone, ACID, sans démon, sauvegardable par `sqlite3 .backup` dans le cron déjà en place.
- **Impératif de sécurité** : la base vit **hors** `/var/www/html` (deux VirtualHost coexistent dont un sert ce répertoire en statique avec `Options Indexes` — une base sous la racine web serait téléchargeable).
- **Conséquence** : `/api/completion` passe du runtime edge au runtime **Node** (nécessaire de toute façon pour vérifier `auth_lock.json` et injecter le prompt système côté serveur). Mono-instance Node assumée (c'est déjà le déploiement réel systemd).
- **Schéma minimal** :
  - `promptagogues(email PK, name, verified_at, quota_bytes_used)`
  - `prompts(id, name UNIQUE, author_email, language, description, body, version, status, created_at, updated_at, usage_count, tokens_total, rating_sum, rating_count, size_bytes)`
  - `prompt_versions(prompt_id, version, body, created_at)`
  - `email_codes(email, code_hash, expires_at, attempts)`
- Les fichiers d'état existants (`auth_lock.json`, `failed_attempts.json`) **restent en fichiers**, simplement déplacés dans `DATA_DIR` — ils fonctionnent, on ne les migre pas.

## 2. Envoi d'email : SMTP authentifié OVH via nodemailer

- **Choix** : boîte dédiée type `noreply@educh.at` sur le MX Plan gratuit inclus avec le domaine OVH (`ssl0.ovh.net:465` ou `587`), pilotée par `nodemailer`. Variables `SECRET_SMTP_HOST/PORT/USER/PASS/FROM` ajoutées à `env.ts` et au gabarit `conf/(dot)env.txt`.
- **Pourquoi** : seul canal réaliste sous les contraintes (zéro service tiers payant) ; un Postfix local sur VPS aurait une délivrabilité désastreuse (port 25 bloqué, réputation IP, SPF/DKIM à monter soi-même).
- **Prérequis manuels (client)** : créer la boîte dans l'espace OVH, poser SPF/DKIM dans la zone DNS, tester la délivrabilité réelle vers Gmail/Outlook/domaines scolaires Microsoft 365 (mail-tester.com).
- **Format du message de vérification** : le code `123-456` figure **en clair** dans le corps (saisie manuelle) **et** dans un lien cliquable `https://educh.at/verifier#123-456` où le code est dans le **fragment** d'URL — le fragment n'atteint jamais le serveur, donc jamais les logs Apache que le cron publie sur le web. **Jamais de code en query string ou en chemin.** La vérification transite exclusivement en POST.
- **Anti-abus** : rate-limiting par IP et par email (réutilisation du pattern `failed_attempts.json` + proper-lockfile), réponse indistincte que l'email existe ou non (anti-énumération).

## 3. Identité promptagogue : jeton HMAC signé, sans mot de passe, sans cookie

Deux circuits **totalement découplés** :

- **Circuit élève/prof (existant, conservé tel quel)** : aucune identité. Déverrouillage global par mot de passe prof bcrypt à durée suffixée, OU auto-login IP établissement + tranches horaires (l'exigence « IP + horaires sans login » est **déjà implémentée**). Nouveauté unique : `/api/completion` (passé en Node) vérifie ce déverrouillage avant de servir les clés internes — la clé personnelle (BYOK) reste toujours permise. Durée de déverrouillage bornée (480 min max).
- **Circuit promptagogue (nouveau, sollicité uniquement pour publier)** :
  1. Sur `/publier` : saisie nom + email.
  2. `POST /api/verify/request` → code `crypto.randomInt` formaté `XXX-XXX`, stocké **haché** (bcrypt, déjà en dépendance), expiration 15 min, max 5 essais (table `email_codes`), envoi SMTP, rate-limiting, réponse indistincte.
  3. `POST /api/verify/confirm {email, code}` → si valide (usage unique) : upsert `promptagogues` + émission d'un **jeton signé HMAC-SHA256** (module `crypto` natif de Node, zéro dépendance) : payload base64url `{name, email, exp ≈ 90 jours}` signé avec `SECRET_TOKEN_KEY`.
  4. Jeton stocké en **localStorage** `promptagogue-token` (pas de cookie : la promesse publique « pas de cookies » de `/rgpd` reste tenable, aucune table sessions à maintenir ; le jeton ne protège que des écritures de prompts publics — le risque XSS est fermé par l'étape 3).
  5. Les endpoints d'écriture `/api/prompts*` exigent `Authorization: Bearer`, signature revérifiée à chaque requête.
- **Admin** : même flux email/code, aucun mot de passe. La liste `SECRET_ADMIN_EMAILS` (défaut `blanvillain@harmonia.education`) est relue côté serveur **à chaque requête sensible** (un vieux jeton ne suffit pas).
- **Stateless** : jeton perdu/expiré → on refait la vérification email (30 s). Compromission → rotation de `SECRET_TOKEN_KEY` (invalide tous les jetons).

## 4. Favoris et ranking

- **Favoris** : purement **locaux au navigateur** — localStorage `prompt-favorites` (liste de noms de prompts), étoile sur chaque carte, tri « favoris d'abord ». Zéro donnée serveur, cohérent avec la philosophie « tout dans le navigateur » ; inclus dans l'export/import de profil pour être transportables entre navigateurs.
- **Ranking v1** : classement **calculé côté serveur** à partir des compteurs anonymes (`usage_count`, `tokens_total`, fraîcheur). Aucune donnée personnelle, rien à sécuriser, colonne triable immédiatement.
- **Vote humain : reporté en v2**, conditionné à la réponse du client. Raison structurelle : derrière le NAT d'un établissement, toute une école partage une IP — un anti-revote par IP écraserait les votes légitimes des élèves, et un anti-revote localStorage est trivialement contournable. Si le client veut du vote, ce sera « vote en session déverrouillée + dédoublonnage localStorage assumé comme suffisant pour une communauté scolaire de confiance ».
- **Anti effet boule de neige** : tri par défaut mêlant ranking et fraîcheur.

## 5. Internationalisation : i18n natif Next, sans bibliothèque

- **Choix** : `next.config.js` avec `i18n: {locales: ['fr','en','it','de'], defaultLocale: 'fr'}` (routing natif du pages router) + dictionnaires JSON plats maison `src/i18n/{fr,en,it,de}.json` + hook `useT()` (~30 lignes) branché sur `router.locale`.
- **Pourquoi pas next-i18next** : 4 locales, quelques dizaines de clés plates, pas de pluralisation complexe — chaque dépendance est une charge pour un mainteneur seul, et le routage localisé (`/en`, `/it`, `/de`) est fourni par Next lui-même. Apache `ProxyPass /` couvre ces préfixes sans modification.
- **Côté API** : les endpoints renvoient des **codes d'erreur stables** (`{error: 'ERR_LOCKED'}`, `ERR_QUOTA_EXCEEDED`…) traduits côté client — aucune i18n serveur.
- **Périmètre** : toutes les chaînes recensées dans la cartographie (UI chat, sidebar, ProtectedPage, Layout, meta description, `manifest.json`) + gabarits d'email + nouvelles pages. `/police` hors périmètre sauf demande explicite.
