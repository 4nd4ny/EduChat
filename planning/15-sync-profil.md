# Étape 15 — Synchronisation serveur du profil (opt-in)

**Dépend de :** Étapes 6 et 11 · **Estimation :** 1 session

## Objectif
Permettre aux comptes vérifiés (promptagogues, enseignants) qui l'ont choisi à la création de compte (`sync_optin`, étape 6) de sauvegarder sur le serveur l'équivalent de la mémoire du navigateur — conversations, favoris, réglages — pour basculer d'un navigateur à l'autre sans friction. La charge utile réutilise TEL QUEL le format d'export de profil de l'étape 11, stockée dans `profiles.data` (table créée à l'étape 4). Fusion volontairement simple : « le plus récent gagne », au niveau du profil entier. Principe RGPD central inchangé : les élèves n'ont jamais de compte et ne sont donc jamais concernés ; par défaut, tout reste dans le navigateur, et le profil serveur est supprimable à la demande.

## Contexte et fichiers concernés
- `src/pages/api/profile.ts` (à créer) — endpoint GET/PUT/DELETE, authentifié par `Authorization: Bearer` (jeton HMAC-SHA256 de l'étape 6).
- `src/server/token.ts` (créé à l'étape 6) — middleware `requireAuth`, à réutiliser pour les trois méthodes.
- `src/utils/profileSync.ts` (à créer) — module client : construction du profil local, comparaison d'horodatages, application du profil gagnant.
- Module SQLite de l'étape 4 (better-sqlite3, base dans `DATA_DIR` hors racine web) — tables `profiles(email PK, data JSON, updated_at)` et `users(…, sync_optin)`.
- `src/context/History.tsx` — persistance localStorage des conversations, source du profil local.
- `src/context/AnthropicProvider.tsx` — `importConversation`, logique d'import à réutiliser pour appliquer un profil serveur.
- `src/chatSidebar/ChatSidebar.tsx` — sidebar, emplacement du bouton « Synchroniser maintenant » près de l'export/import de l'étape 11.
- `src/pages/verifier.tsx` (créée à l'étape 6) — point de connexion : déclencher la synchronisation après confirmation du code.
- Format d'export de profil de l'étape 11 (conversations + favoris `prompt-favorites` + réglages) — le jeton `educhat-token` en est strictement exclu et ne doit jamais atteindre le serveur.

## Tâches
1. Créer `src/pages/api/profile.ts` (runtime Node) protégé par `requireAuth` : GET renvoie `{data, updated_at}` du profil lié à l'email du jeton ; PUT écrit `profiles.data` + `updated_at` serveur, en refusant les comptes sans `sync_optin` (code stable `ERR_SYNC_OPTOUT`), les corps > 1 Mo (`ERR_PROFILE_TOO_LARGE`) et les JSON hors schéma d'export de l'étape 11 ; DELETE supprime la ligne (droit à l'effacement).
2. Créer `src/utils/profileSync.ts` : assemblage du profil local au format d'export de l'étape 11 avec horodatage ; fusion « le plus récent gagne » au niveau du profil entier (aucune fusion fine) ; application du profil gagnant via la logique d'import existante.
3. UI : bouton « Synchroniser maintenant » dans la sidebar (visible seulement si jeton présent et opt-in actif), synchronisation automatique après connexion réussie sur `/verifier`, bouton « Supprimer mon profil serveur » avec confirmation.
4. Documenter la sync opt-in au README (données concernées, suppression) pour alimenter la page RGPD de l'étape 12.

## Livrables
- Endpoint `/api/profile` (GET/PUT/DELETE) authentifié, avec codes d'erreur stables.
- Module client de synchronisation + boutons « Synchroniser maintenant » et « Supprimer mon profil serveur ».
- Sync automatique au login pour les comptes opt-in.

## Vérification
- Parcours croisé : synchroniser sur Chrome, se connecter sur Firefox → conversations, favoris et réglages restaurés, poursuite d'une conversation fonctionnelle.
- PUT sans jeton → 401 ; compte sans opt-in → `ERR_SYNC_OPTOUT` ; profil > 1 Mo → `ERR_PROFILE_TOO_LARGE`.
- DELETE efface la ligne `profiles` (contrôle `sqlite3`).
- `educhat-token` n'apparaît nulle part dans `profiles.data` (contrôle `sqlite3`).

## Prompt à copier-coller dans Claude Code
```text
Contexte : EduChat est un chatbot éducatif (https://educh.at) en Next.js 14 pages-router (React/TypeScript, Tailwind), développé par un enseignant seul assisté par IA, hébergé sur un VPS OVH (Apache en reverse proxy + service systemd, mono-instance Node). Je réalise l'étape 15 du plan de migration : synchronisation serveur OPT-IN du profil pour les comptes vérifiés (promptagogues/enseignants). Principe RGPD central : les élèves n'ont JAMAIS de compte et ne sont jamais concernés ; par défaut, tout reste dans le navigateur.

Commence par lire, dans l'ordre : planning/00-analyse-existant.md, planning/decisions-techniques.md, puis les fiches des dépendances : planning/06-*.md (comptes vérifiés par email, jeton HMAC-SHA256 en localStorage, middleware requireAuth de src/server/token.ts, choix sync_optin enregistré à la création de compte) et planning/11-*.md (format d'export de profil : conversations + favoris + réglages — ce format sert TEL QUEL de charge utile de la sync). Lis ensuite chaque fichier avant de le modifier.

Décisions d'architecture à respecter impérativement :
- SQLite better-sqlite3 (synchrone), base unique dans DATA_DIR hors racine web ; les tables profiles(email PK, data JSON, updated_at) et users(…, sync_optin) existent depuis l'étape 4.
- Authentification par jeton HMAC-SHA256 transmis en en-tête Authorization: Bearer (jamais en query string — règle absolue du projet), vérifié par requireAuth (src/server/token.ts).
- Le jeton (localStorage 'educhat-token') ne doit JAMAIS figurer dans profiles.data.
- Erreurs = codes stables ({error:'ERR_...'}) traduits côté client, pas de phrases en dur.

Tâches :
1. Crée src/pages/api/profile.ts (runtime Node) : GET renvoie {data, updated_at} du profil de l'email porté par le jeton (code stable si absent) ; PUT stocke le JSON reçu dans profiles.data avec updated_at serveur — refuse si users.sync_optin est faux (ERR_SYNC_OPTOUT), si le corps dépasse 1 Mo (ERR_PROFILE_TOO_LARGE) ou si le JSON ne respecte pas le schéma d'export de l'étape 11 (réutilise sa validation) ; DELETE supprime la ligne (droit RGPD à l'effacement). Toutes les méthodes exigent requireAuth ; 401 sans jeton valide.
2. Crée un module client src/utils/profileSync.ts : construit le profil local au format d'export de l'étape 11 (conversations de src/context/History.tsx, favoris 'prompt-favorites', réglages), avec un horodatage local ; fusion simple « le plus récent gagne » au niveau du profil ENTIER (compare updated_at serveur et horodatage local, aucune fusion fine) ; applique le profil gagnant via la logique d'import existante (importConversation de src/context/AnthropicProvider.tsx).
3. UI : bouton « Synchroniser maintenant » dans src/chatSidebar/ChatSidebar.tsx, près de l'export/import de l'étape 11, visible uniquement si un jeton est présent et sync_optin actif ; déclenche aussi la sync automatiquement après connexion réussie sur src/pages/verifier.tsx. Ajoute un bouton « Supprimer mon profil serveur » (DELETE) avec confirmation.
4. Documente au README la sync opt-in (données concernées, suppression sur demande) pour alimenter la page RGPD de l'étape 12.

Critères d'acceptation (à vérifier réellement, pas seulement compiler) :
- Parcours croisé : sync sur Chrome, connexion sur Firefox → conversations, favoris et réglages restaurés, poursuite d'une conversation OK.
- PUT sans jeton → 401 ; compte sans opt-in → ERR_SYNC_OPTOUT ; profil > 1 Mo → ERR_PROFILE_TOO_LARGE ; JSON invalide rejeté proprement.
- DELETE efface la ligne profiles (contrôle sqlite3).
- 'educhat-token' n'apparaît nulle part dans profiles.data (contrôle sqlite3).

Termine par : yarn build sans erreur, vérification manuelle du parcours croisé ci-dessus, puis un commit git avec un message descriptif en français. Interdiction absolue de commiter .env, secret.txt, le dossier data/ ou tout autre secret ; n'ouvre pas secret.txt.
```
