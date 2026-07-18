# Décisions techniques

*Version 2 — intègre les réponses complètes du client (18 juillet 2026, voir [questions-suggestions.md](questions-suggestions.md)). Les fiches d'étapes 01 à 15 supposent ces décisions acquises.*

## 1. Persistance serveur : SQLite (better-sqlite3) dans `DATA_DIR`, hors racine web

- Un fichier SQLite unique via `better-sqlite3`, dans un répertoire défini par `DATA_DIR` (défaut `./data/` en dev, `/var/lib/educhat/` en prod via `Environment=` dans `conf/educh-at.service`).
- **Pourquoi** : compteurs incrémentés à chaque complétion (le pattern fichiers JSON + proper-lockfile ne tient pas sans races), tris multi-critères du catalogue, quotas et facturation par établissement = des requêtes. MySQL OVH serait un service de plus à administrer. `better-sqlite3` est synchrone, ACID, sans démon, sauvegardable par `sqlite3 .backup` dans le cron existant.
- **Impératif** : la base vit **hors** `/var/www/html` (un des deux VirtualHost sert ce répertoire en statique avec `Options Indexes`).
- **Conséquence** : `/api/completion` passe du runtime edge au runtime **Node**. Mono-instance assumée (déploiement systemd réel).
- **Schéma v2** :
  - `users(email PK, name, verified_at, is_promptagogue, is_teacher, etablissement_id NULL, sync_optin, quota_bytes_used)`
  - `etablissements(id PK, name, ips, respire, token_quota_monthly, active_provider, billing_email, created_at)`
  - `prompts(id, name UNIQUE, author_email NULL, language, description, body, version, status, share_token, web_search, created_at, updated_at, usage_count, tokens_total, rating_sum, rating_count, size_bytes)` — `author_email NULL` = proposition anonyme
  - `prompt_versions(prompt_id, version, body, created_at)`
  - `prompt_translations(prompt_id, locale, name, description, body, auto, updated_at)`
  - `email_codes(email, code_hash, expires_at, attempts)`
  - `usage_log(id, ts, etablissement_id NULL, teacher_email NULL, prompt_id NULL, provider, tokens)` — base des quotas et de la facturation
  - `profiles(email PK, data JSON, updated_at)` — sync opt-in
  - `session_settings(etablissement_id PK, default_prompt_id NULL, web_search, set_by_email, expires_at)` — réglages posés par le prof
- Les fichiers d'état existants (`auth_lock.json`, `failed_attempts.json`) restent en fichiers, déplacés dans `DATA_DIR`.

## 2. Envoi d'email : SMTP authentifié OVH via nodemailer

- Boîte dédiée `noreply@educh.at` sur le MX Plan inclus avec le domaine OVH (`ssl0.ovh.net:465/587`), pilotée par `nodemailer`. Variables `SECRET_SMTP_HOST/PORT/USER/PASS/FROM`.
- ⚠️ **La boîte n'existe pas encore** : création manuelle dans l'espace OVH + SPF/DKIM dans la zone DNS = prérequis bloquant de l'étape 6.
- **Format du message** : code `123-456` en clair (saisie manuelle) + lien `https://educh.at/verifier#123-456` — code dans le **fragment** d'URL, jamais en query string ni en chemin. Vérification exclusivement en POST. (Le journal public des logs est supprimé — décision 8 — mais cette règle de défense en profondeur est conservée.)
- **Anti-abus** : rate-limiting par IP et par email (pattern `proper-lockfile` existant), réponse indistincte (anti-énumération).

## 3. Comptes et rôles : jamais de compte élève, comptes vérifiés par email sans mot de passe

Principe RGPD central : **les élèves n'ont JAMAIS de compte ni de login**. Trois rôles de comptes vérifiés par email (même flux code `XXX-XXX`, aucun mot de passe) :

- **Promptagogue** (`is_promptagogue`) : publie et gère ses prompts.
- **Enseignant** (`is_teacher`) : rattaché à un établissement (validation admin), débloque le site pour ses élèves, configure la session, et porte la refacturation de sa consommation.
- **Admin** : liste `SECRET_ADMIN_EMAILS` en dur (défaut `blanvillain@harmonia.education`), relue côté serveur à chaque requête sensible.

Mécanique : code `crypto.randomInt` formaté `XXX-XXX`, stocké haché (bcrypt), 15 min, 5 essais, usage unique → upsert `users` → **jeton HMAC-SHA256** (crypto natif, zéro dépendance) `{name, email, exp ≈ 90 j}` signé par `SECRET_TOKEN_KEY`, stocké en localStorage `educhat-token` (pas de cookie). Les endpoints d'écriture exigent `Authorization: Bearer` ; les rôles sont relus en base/env à chaque requête. Jeton perdu = on refait la vérification (30 s) ; compromission = rotation de `SECRET_TOKEN_KEY`.

**Circuit élève/prof existant conservé tel quel** : déverrouillage global par mot de passe bcrypt à durée suffixée, ou auto-login IP + tranches horaires. **« gabbagabbahey » est conservé** (le client le considère non sensible : simple déblocage de salle de classe) ; la durée max devient configurable (`SECRET_MAX_UNLOCK_MINUTES`, défaut 600). `/api/completion` (Node) vérifie le déverrouillage avant de servir les clés internes ; la clé personnelle (BYOK) reste toujours permise.

## 4. Établissements, quotas, clés par école, facturation

Les **établissements** sont l'entité de gestion centrale (« clients »), administrés via l'interface admin :

- Identifiés par leurs **adresses IP** (résolution IP → établissement en base ; `SECRET_ALLOWED_IPS/HOURS` restent en amorçage/secours).
- **Quota mensuel de tokens par établissement**, défini par l'admin ; blocage des complétions sur clé interne quand il est atteint (`ERR_QUOTA_ETABLISSEMENT`), remise à zéro mensuelle.
- **Clé API active par école** : une clé par moteur LLM ; l'admin choisit quel fournisseur/clé est actif pour chaque école. Si un LLM gratuit avec clé API existe, il peut être offert à tout le monde, hors quota.
- **Refacturation** : les tokens consommés sur clé interne sont refacturés à l'établissement — **gratuit pour les écoles RESPIRE** (flag `respire`). Bilan mensuel par établissement **et par enseignant** (agrégats de `usage_log`, export CSV).
- L'affichage local du compteur de tokens (navigateur) reste informatif ; la vraie comptabilité est serveur (`usage_log`).

## 5. Cycle de vie et droits des prompts

- **Statuts** : `draft` (« en construction » : invisible au catalogue, testable dans le chat et partageable via une **URL secrète** `share_token` — simple lien non verrouillé, pour inviter des testeurs) → `pending` (soumis) → `published` → `retired` (dépublié).
- **Modération a priori** : un prompt `pending` est approuvé par **un admin ou un promptagogue vérifié** (conséquence assumée : un promptagogue vérifié peut de facto approuver ses propres prompts ; la validation protège surtout le flux anonyme).
- **Propositions anonymes** : dépôt possible sans compte (`author_email NULL`), publication après validation admin uniquement, **suppression par l'admin uniquement**.
- **Suppression** : l'auteur authentifié peut supprimer/dépublier ses propres prompts ; l'admin peut tout supprimer.
- **Versions** : bascule **jamais automatique** — une conversation reste sur sa version (`prompt_versions`) ; si une version plus récente existe, l'UI le signale et l'utilisateur choisit explicitement le nouveau prompt.
- **Contenu** : texte uniquement (pas de pièces jointes). Quotas : 1 Mo par utilisateur, 256 Ko par fichier. Le texte intégral des prompts publiés est **public** (l'école est gratuite).
- **Recherche web** : désactivable **par prompt** (choix du promptagogue) et **par session** (choix du prof au déverrouillage — étape 14).

## 6. Favoris et ranking

- **Favoris** : purement locaux au navigateur (localStorage `prompt-favorites`), inclus dans l'export/import de profil — et dans la sync serveur opt-in (décision 9).
- **Ranking** : calculé côté serveur à partir des compteurs anonymes (`usage_count`, `tokens_total`, fraîcheur). Pas de vote humain en v1 (IP partagée par toute une école = dédoublonnage illusoire). Tri par défaut mêlant ranking et fraîcheur.

## 7. Internationalisation : i18n natif Next + traduction automatique des prompts

- `next.config.js` avec `i18n: {locales: ['fr','en','it','de'], defaultLocale: 'fr'}` + dictionnaires JSON plats maison + hook `useT()` (~30 lignes). Pas de bibliothèque.
- Côté API : codes d'erreur stables (`ERR_LOCKED`, `ERR_QUOTA_EXCEEDED`…) traduits côté client.
- **Traduction automatique des prompts publiés** vers les 4 langues via la clé interne (table `prompt_translations`, badge « traduction automatique », corrigeable par l'auteur) — déclenchée à l'approbation ou à la demande.

## 8. Journal public des logs : supprimé

`conf/log_to_web.sh` et la ligne cron sont retirés du dépôt (étape 1) et du serveur (étape 13) ; `/var/www/html/ip-direct/` est supprimé. La transparence passe par la page RGPD et un audit du code par l'établissement si besoin. La règle « jamais de secret en query string » reste en vigueur par principe.

## 9. Synchronisation serveur du profil (opt-in)

Pour les comptes vérifiés qui l'activent (`sync_optin`) : l'équivalent de la mémoire du navigateur (conversations, favoris, réglages) est sauvegardé sur le serveur (`profiles.data`, format = export de l'étape 11) via `GET/PUT /api/profile` authentifié par jeton — pour basculer d'un navigateur à l'autre sans friction. Fusion « le plus récent gagne », suppression à la demande. **Jamais pour les élèves** (pas de compte).

## 10. RGPD (réécriture de la page `/rgpd`, étape 12)

Le texte public doit refléter la réalité v2 : **sans login pour les élèves uniquement** ; comptes email (nom + email) pour promptagogues, enseignants responsables (facturés) et admins ; agrégats de facturation par établissement (aucune donnée élève) ; sync de profil opt-in ; suppression du journal public ; droits d'accès, de rectification et de suppression des comptes.
