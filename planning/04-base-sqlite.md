# Étape 4 — Base SQLite et modèle de données

**Dépend de :** Étape 2 · **Estimation :** 1 session

## Objectif

Créer l'unique persistance serveur du projet (exigences 2 et 3) : une base SQLite au **schéma v2 complet** — comptes `users` généralisés (promptagogues, enseignants, admins ; les élèves n'ont JAMAIS de compte), établissements clients, prompts avec statuts `draft`/`pending`/`published`/`retired`, journal d'usage pour quotas et facturation, traductions, profils synchronisés et réglages de session. TOUTES les tables sont créées dès cette étape (migrations simples), même celles exploitées par les étapes ultérieures (6 à 9, 14, 15). La base vit dans un répertoire de données `DATA_DIR` situé hors de la racine web (impératif : un VirtualHost Apache sert `/var/www/html` en statique avec `Options Indexes`, une base sous la racine serait téléchargeable). Les fichiers d'état d'auth existants restent des fichiers, simplement déplacés dans `DATA_DIR`.

## Contexte et fichiers concernés

- `src/server/db.ts` (à créer, le dossier `src/server/` n'existe pas encore) — module unique d'accès à la base : ouverture de `DATA_DIR/educhat.db`, mode WAL, migrations idempotentes au démarrage.
- `src/pages/api/auth.ts` — les fichiers d'état sont aujourd'hui résolus depuis `process.cwd()` : `auth_lock.json` (auth.ts:15), `auth_log.txt` (auth.ts:52), `failed_attempts.json` (auth.ts:62 et auth.ts:81). À faire pointer vers `DATA_DIR`, sans migration en base.
- `conf/educh-at.service` — unité systemd (User=fedora, `WorkingDirectory=/var/www/html/educh-at/src`) : ajouter `Environment=DATA_DIR=/var/lib/educhat` dans la section `[Service]`.
- `conf/(dot)env.txt` — gabarit d'environnement versionné : documenter `DATA_DIR`.
- `README.md` — documenter le répertoire de données et sa création en prod.
- `conf/var-spool-cron-root.txt` — pattern existant de crontab, à imiter pour le cron de sauvegarde (mais sous l'utilisateur `fedora`, pas root).
- Script de seed (ex. `scripts/seed.ts`, à créer) — insertion de 2-3 prompts socratiques d'exemple.

## Tâches

1. Ajouter la dépendance `better-sqlite3` et créer `src/server/db.ts` : ouverture de `DATA_DIR/educhat.db` (variable d'env `DATA_DIR`, défaut `./data/` en dev), activation du mode WAL, exécution de migrations idempotentes au démarrage du module.
2. Créer le schéma v2 versionné, TOUTES tables incluses :
   - `users(email PK, name, verified_at, is_promptagogue, is_teacher, etablissement_id NULL, sync_optin, quota_bytes_used)` — comptes vérifiés par email sans mot de passe (promptagogues, enseignants, admins) ; jamais d'élèves.
   - `etablissements(id PK, name, ips TEXT, respire BOOL, token_quota_monthly, active_provider, billing_email, created_at)` — entité de gestion « clients » : résolution IP → établissement, quotas de tokens, clé/fournisseur actif, facturation (RESPIRE = gratuit).
   - `prompts(id, name UNIQUE, author_email NULL, language, description, body, version, status['draft','pending','published','retired'], share_token, web_search BOOL, created_at, updated_at, usage_count, tokens_total, rating_sum, rating_count, size_bytes)` — `author_email NULL` = proposition anonyme ; `share_token` = URL secrète de test d'un `draft` ; `web_search` = recherche web autorisée par le promptagogue.
   - `prompt_versions(prompt_id, version, body, created_at)` — une conversation reste sur sa version, la bascule est toujours un choix explicite de l'utilisateur.
   - `prompt_translations(prompt_id, locale, name, description, body, auto BOOL, updated_at)` — traductions automatiques fr/en/it/de (étape 10).
   - `email_codes(email, code_hash, expires_at, attempts)` — flux de vérification par code XXX-XXX (étape 6).
   - `usage_log(id, ts, etablissement_id NULL, teacher_email NULL, prompt_id NULL, provider, tokens)` — base des quotas (étape 9) et de la facturation par établissement et par enseignant (étapes 9/14).
   - `profiles(email PK, data JSON, updated_at)` — sync serveur opt-in du profil (étape 15).
   - `session_settings(etablissement_id PK, default_prompt_id NULL, web_search BOOL, set_by_email, expires_at)` — réglages de session posés par le prof au déverrouillage (étape 14).
3. Déplacer les fichiers d'état d'auth (`auth_lock.json`, `failed_attempts.json`, `auth_log.txt`) de `process.cwd()` vers `DATA_DIR` — ils restent des fichiers, on ne les migre pas en base.
4. Ajouter `Environment=DATA_DIR=/var/lib/educhat` à `conf/educh-at.service` (répertoire appartenant à l'utilisateur `fedora`) ; documenter `DATA_DIR` dans `conf/(dot)env.txt` et dans le README.
5. Écrire un script de seed insérant 2-3 prompts socratiques d'exemple (status `published`, version 1 recopiée dans `prompt_versions`) exploitant les balises `<thinking>` / `<encouragement>`.
6. Mettre en place et documenter un cron de sauvegarde quotidienne `sqlite3 .backup` vers `DATA_DIR/backups/` avec rotation 14 jours, exécuté sous l'utilisateur `fedora` (PAS root), sur le pattern de `conf/var-spool-cron-root.txt`.

## Livrables

- `src/server/db.ts` + schéma v2 versionné complet (9 tables, migrations idempotentes)
- Base seedée (2-3 prompts d'exemple publiés)
- `conf/educh-at.service` et `conf/(dot)env.txt` mis à jour
- Cron de backup documenté

## Vérification

- Redémarrage du service (ou relance locale) → base créée/migrée sans erreur, les 9 tables du schéma v2 existent, et relance sans effet de bord (migrations idempotentes).
- Test d'incréments concurrents de `usage_count` par deux process → aucun incrément perdu, aucune corruption.
- Un `body` de 300 Ko est rejeté par la couche d'accès (limite 256 Ko).
- `curl https://educh.at/data/educhat.db` et `curl https://educh.at/educhat.db` → 404 (la base n'est pas servie par le web).

## Prompt à copier-coller dans Claude Code

```text
Tu travailles sur EduChat, un chatbot éducatif Next.js 14 (pages-router, TypeScript, Yarn), développé par un enseignant seul assisté par IA et déployé sur un VPS OVH : Apache en reverse proxy + service systemd conf/educh-at.service (User=fedora, WorkingDirectory=/var/www/html/educh-at/src). Contrainte permanente : simplicité maximale, aucun service supplémentaire à administrer.

Commence par lire planning/00-analyse-existant.md, planning/decisions-techniques.md, puis la fiche de l'étape 2 dans planning/ (cette étape en dépend) et planning/04-base-sqlite.md.

Décisions d'architecture à respecter strictement :
- Persistance serveur unique : SQLite via better-sqlite3 (API synchrone, pas d'async dans les routes), fichier DATA_DIR/educhat.db. DATA_DIR est une variable d'environnement : défaut ./data/ en dev, /var/lib/educhat en prod. La base doit rester HORS de la racine web /var/www/html (un VirtualHost Apache sert ce dossier en statique avec Options Indexes : tout fichier sous la racine serait téléchargeable).
- Mono-instance Node (systemd, Restart=always) ; mode WAL activé.
- Les élèves n'ont JAMAIS de compte (principe RGPD central) : la table users ne concerne que les promptagogues, enseignants et admins (comptes vérifiés par email, sans mot de passe).
- Crée TOUTES les tables du schéma v2 dès maintenant, même celles exploitées par des étapes ultérieures (6 à 9, 14, 15) : migrations simples, pas de refonte plus tard.
- Les fichiers d'état d'auth (auth_lock.json, failed_attempts.json, auth_log.txt) restent des FICHIERS : on les déplace dans DATA_DIR, on ne les migre pas en base.

Tâches :
1. Ajouter better-sqlite3 (et ses types). Créer src/server/db.ts : résolution de DATA_DIR (process.env.DATA_DIR, défaut ./data/, création du répertoire si absent), ouverture de DATA_DIR/educhat.db, PRAGMA journal_mode=WAL, migrations idempotentes exécutées au chargement (versionnage via user_version ou table dédiée).
2. Schéma v2 complet : users(email TEXT PRIMARY KEY, name, verified_at, is_promptagogue, is_teacher, etablissement_id NULL, sync_optin, quota_bytes_used) ; etablissements(id INTEGER PRIMARY KEY, name, ips TEXT, respire BOOL, token_quota_monthly, active_provider, billing_email, created_at) ; prompts(id INTEGER PRIMARY KEY, name UNIQUE, author_email NULL — NULL = proposition anonyme —, language, description, body, version, status CHECK(status IN ('draft','pending','published','retired')), share_token UNIQUE, web_search BOOL, created_at, updated_at, usage_count, tokens_total, rating_sum, rating_count, size_bytes) ; prompt_versions(prompt_id, version, body, created_at) ; prompt_translations(prompt_id, locale, name, description, body, auto BOOL, updated_at) ; email_codes(email, code_hash, expires_at, attempts) ; usage_log(id, ts, etablissement_id NULL, teacher_email NULL, prompt_id NULL, provider, tokens) ; profiles(email PK, data JSON, updated_at) ; session_settings(etablissement_id PK, default_prompt_id NULL, web_search BOOL, set_by_email, expires_at). Dans la couche d'accès, rejeter tout body > 256 Ko avant insertion/mise à jour.
3. Dans src/pages/api/auth.ts, remplacer process.cwd() par DATA_DIR pour auth_lock.json (ligne 15), auth_log.txt (ligne 52) et failed_attempts.json (lignes 62 et 81) ; factoriser la résolution de DATA_DIR dans un module partagé (ex. exportée par src/server/db.ts).
4. conf/educh-at.service : ajouter Environment=DATA_DIR=/var/lib/educhat dans [Service] ; documenter dans le README la création du répertoire en prod (mkdir + chown fedora:fedora). Documenter DATA_DIR dans conf/(dot)env.txt.
5. Créer un script de seed (ex. scripts/seed.ts, lançable en une commande yarn) insérant 2-3 prompts socratiques d'exemple (status 'published', version 1 recopiée dans prompt_versions) utilisant les balises <thinking> et <encouragement>.
6. Documenter (sur le pattern de conf/var-spool-cron-root.txt) un cron QUOTIDIEN exécuté sous l'utilisateur fedora (PAS root) : sqlite3 DATA_DIR/educhat.db ".backup 'DATA_DIR/backups/educhat-$(date +%Y%m%d).db'" + rotation des sauvegardes de plus de 14 jours.

Critères d'acceptation obligatoires :
- Relance de l'app → base créée/migrée sans erreur et les 9 tables du schéma v2 existent ; deuxième relance idempotente.
- Deux process Node incrémentant usage_count en parallèle (écris un petit script de test) → aucun incrément perdu, aucune corruption.
- Un body de 300 Ko est rejeté par la couche d'accès.
- curl https://educh.at/data/educhat.db et https://educh.at/educhat.db → 404 (en local, vérifier que ./data/ n'est jamais servi par Next).

Termine par : yarn build sans erreur, vérification manuelle des comportements ci-dessus, puis un commit git avec un message descriptif en français. INTERDIT de commiter .env, secret.txt, data/, *.db ou tout secret — vérifie le .gitignore avant de commiter. N'ouvre jamais secret.txt.
```
