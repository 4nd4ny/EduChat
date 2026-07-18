# Étape 14 — Espace enseignant et réglages de session

**Dépend de :** Étapes 6, 8 et 9 · **Estimation :** 1-2 sessions

## Objectif
Donner aux enseignants un espace propre (décisions du 18 juillet 2026) : un compte vérifié par email portant le rôle `is_teacher`, rattaché à un établissement après validation par un admin, et surtout un écran de réglages de session affiché au moment du déverrouillage de la salle de classe. Le prof — identifié par le mot de passe existant OU par son compte email — choisit le tuteur socratique par défaut et active/désactive la recherche web pour les élèves de SON établissement (résolu par IP). Ces réglages vivent dans la table `session_settings` et expirent avec le verrou. Chaque complétion de la fenêtre est attribuée à l'enseignant (`usage_log.teacher_email`), ce qui complète la facturation de l'étape 9 par un bilan mensuel par enseignant. Les élèves, eux, n'ont toujours JAMAIS de compte : c'est le principe RGPD central, ils héritent des réglages sans aucune identification.

## Contexte et fichiers concernés
- `src/pages/api/auth.ts` — flux de déverrouillage existant : mot de passe + durée (`extractPasswordAndDuration`, l.24-34), verrou global `auth_lock.json` (`setAuthLock`, l.195-204), résolution IP (`getClientIp`, l.37-40). Le verrou est aujourd'hui global (fichier unique) : les réglages de session, eux, sont par établissement. À étendre pour signaler au client un déverrouillage « mode prof » réussi.
- `src/context/ProtectedPage.tsx` — formulaire de mot de passe côté client (`handlePasswordSubmit`, l.44) ; à étendre avec l'écran de réglages de session post-déverrouillage.
- `src/pages/api/completion.ts` — endpoint unique de complétion multi-fournisseurs ; à modifier : override de session (recherche web forcée off, réglages expirés ignorés) et champ `teacher_email` dans l'insertion `usage_log` posée à l'étape 8.
- `src/pages/index.tsx` — accueil/catalogue : pré-sélection du tuteur par défaut de la session.
- `src/server/token.ts` (étape 6) — vérification du jeton HMAC ; les rôles (`is_teacher`, `etablissement_id`) sont relus en base à chaque requête sensible.
- `src/pages/admin.tsx` et la gestion des établissements (étape 9) — file de validation des rattachements enseignant ↔ établissement ; bilan de facturation à compléter par enseignant.
- Tables SQLite créées à l'étape 4 : `users`, `etablissements`, `session_settings(etablissement_id PK, default_prompt_id, web_search, set_by_email, expires_at)`, `usage_log`.
- `src/utils/env.ts` et `conf/(dot)env.txt` — `SECRET_MAX_UNLOCK_MINUTES` (étape 1) borne la durée du verrou, donc l'expiration des réglages ; `SECRET_ALLOWED_IPS` reste l'amorçage/secours de la résolution IP → établissement.
- À créer : `src/pages/api/session-settings.ts` (GET/PUT).

## Tâches
1. Compte enseignant : réutiliser le flux email de l'étape 6 pour poser le rôle `is_teacher`, avec demande de rattachement à un établissement ; le rattachement (`users.etablissement_id`) n'est effectif qu'après validation par un admin dans l'interface de l'étape 9.
2. Créer GET/PUT `/api/session-settings` : écriture réservée à un prof (déverrouillage par mot de passe réussi OU jeton valide avec `is_teacher` relu en base) ; établissement résolu par IP en base (`etablissements.ips`, secours `SECRET_ALLOWED_IPS`) ; upsert `session_settings` avec `expires_at` aligné sur le verrou ; `set_by_email` renseigné si compte. Lecture publique limitée aux réglages actifs de l'IP appelante, sans donnée personnelle.
3. Écran de réglages post-déverrouillage dans `ProtectedPage.tsx` : choix du tuteur par défaut parmi les prompts `status='published'` + interrupteur recherche web on/off ; bouton « passer » qui n'écrit rien.
4. Héritage élèves : l'accueil pré-sélectionne le tuteur par défaut ; `completion.ts` force la recherche web off si le prof l'a coupée (override du champ par prompt de l'étape 8) ; réglages expirés ignorés.
5. Attribution : les insertions `usage_log` de l'étape 8 portent `teacher_email` quand des réglages actifs existent pour l'établissement ; ajouter dans l'admin le bilan mensuel par enseignant (agrégat de tokens + export CSV), complément de la facturation par établissement de l'étape 9.

## Livrables
- Compte enseignant rattaché à un établissement, validé par un admin.
- Écran de réglages de session au déverrouillage + endpoint `/api/session-settings`.
- Héritage effectif des réglages par les élèves de l'IP (tuteur par défaut, recherche web).
- Bilan mensuel par enseignant dans la page d'administration (export CSV).

## Vérification
- Après un déverrouillage par mot de passe, l'écran de réglages apparaît ; choisir un tuteur + recherche web off crée une ligne `session_settings` avec `expires_at` correct (contrôle via `sqlite3`).
- Depuis l'IP de l'établissement, l'accueil pré-sélectionne ce tuteur et une question d'actualité ne déclenche aucun outil de recherche web (onglet réseau).
- Après expiration du verrou, les réglages ne s'appliquent plus (accueil neutre, recherche web selon le prompt).
- Les lignes `usage_log` de la fenêtre portent `teacher_email` et le bilan mensuel par enseignant affiche un agrégat cohérent, exportable en CSV.
- Un PUT `/api/session-settings` sans mot de passe ni jeton enseignant est refusé (code d'erreur stable).

## Prompt à copier-coller dans Claude Code
```text
Contexte : EduChat est un chatbot éducatif Next.js 14 (pages-router, TypeScript, Tailwind), développé par un enseignant seul assisté par IA, hébergé sur un VPS OVH (Apache en reverse proxy + service systemd, mono-instance Node). Les données vivent dans SQLite (better-sqlite3, synchrone) sous DATA_DIR hors racine web. Les comptes (promptagogues, enseignants, admins) sont vérifiés par code email et portent un jeton HMAC-SHA256 stocké en localStorage, envoyé en Authorization: Bearer ; les rôles sont relus en base à chaque requête sensible. Les élèves n'ont JAMAIS de compte (principe RGPD central). Je réalise l'étape 14 : espace enseignant et réglages de session.

Commence par lire, dans l'ordre : planning/00-analyse-existant.md, planning/decisions-techniques.md, puis les fiches des dépendances planning/06-*.md, planning/08-*.md et planning/09-*.md, et enfin planning/14-espace-enseignant.md.

Décisions à respecter impérativement :
- Tables déjà créées à l'étape 4 : users(is_teacher, etablissement_id), etablissements(ips, ...), session_settings(etablissement_id PK, default_prompt_id, web_search, set_by_email, expires_at), usage_log(teacher_email, ...).
- La résolution IP → établissement se fait en base (etablissements.ips), avec SECRET_ALLOWED_IPS en secours.
- Le mot de passe prof existant (liste de hashs bcrypt dans SECRET_PASSWD, lue par src/utils/env.ts:3) est conservé tel quel ; ne recopie jamais de valeur secrète et n'ouvre pas secret.txt.
- Les erreurs API sont des codes stables (ex. {error:'ERR_FORBIDDEN'}) traduits côté client, pas des phrases en dur.

Tâches :
1. Compte enseignant : étends le flux email de l'étape 6 pour permettre le rôle is_teacher avec demande de rattachement à un établissement ; le rattachement (users.etablissement_id) n'est effectif qu'après validation par un admin — ajoute cette file de validation dans src/pages/admin.tsx (interface de l'étape 9).
2. Crée src/pages/api/session-settings.ts (GET/PUT). PUT réservé à un prof : soit dans la foulée d'un déverrouillage par mot de passe réussi (src/pages/api/auth.ts, setAuthLock l.195-204), soit avec un jeton valide dont is_teacher est vrai en base. Résous l'établissement par l'IP (getClientIp, auth.ts l.37-40) ; upsert dans session_settings avec expires_at aligné sur la durée du verrou (bornée par SECRET_MAX_UNLOCK_MINUTES) ; set_by_email renseigné si un compte est présent. GET : renvoie uniquement les réglages actifs (non expirés) de l'établissement de l'IP appelante, sans aucune donnée personnelle.
3. Dans src/context/ProtectedPage.tsx (handlePasswordSubmit, l.44), après un déverrouillage réussi, affiche un écran de réglages de session : sélection du tuteur par défaut parmi les prompts status='published' + interrupteur recherche web on/off ; bouton « passer » qui n'écrit rien.
4. Héritage côté élèves : sur src/pages/index.tsx, pré-sélectionne le tuteur par défaut de la session active ; dans src/pages/api/completion.ts, si les réglages actifs indiquent web_search=0, force la désactivation des outils de recherche web quel que soit le champ par prompt de l'étape 8 ; ignore les réglages expirés.
5. Attribution : complète l'insertion usage_log de l'étape 8 avec teacher_email quand des réglages actifs existent pour l'établissement résolu ; dans l'admin, ajoute le bilan mensuel par enseignant (tokens par mois, export CSV), qui complète la facturation par établissement de l'étape 9.

Critères d'acceptation (à vérifier réellement, pas seulement compiler) : l'écran de réglages apparaît après déverrouillage et l'upsert est visible via sqlite3 ; depuis l'IP de l'établissement, l'accueil pré-sélectionne le tuteur et la recherche web reste inactive ; après expiration du verrou, les réglages ne s'appliquent plus ; les lignes usage_log de la fenêtre portent teacher_email et le bilan mensuel par enseignant est cohérent ; un PUT sans mot de passe ni jeton enseignant est refusé avec un code d'erreur stable.

Termine par : yarn build sans erreur, vérification manuelle des critères ci-dessus, puis un commit git avec un message descriptif en français. Interdiction absolue de commiter .env, secret.txt, data/ ou tout secret ; vérifie le .gitignore avant de commiter.
```
