# Étape 1 — Hygiène du dépôt : secrets, commit de référence, code mort

**Dépend de :** rien · **Estimation :** 1 session

## Objectif

Figer un état de référence propre et sûr avant toute évolution du site. Le working tree porte actuellement un gros refactor non commité (environ 789 suppressions) et la cartographie de l'existant décrit CET état, pas HEAD : il faut donc d'abord committer cette base, puis colmater les fuites de secrets (mots de passe journalisés en clair, fichiers sensibles non ignorés par git) et supprimer le code mort hérité de l'ancienne double intégration OpenAI/Anthropic. À l'issue de l'étape, le dépôt est sain, le site fonctionne à l'identique, et toutes les étapes suivantes partent d'un commit connu.

## Contexte et fichiers concernés

- **Les 9 fichiers modifiés du working tree** (`README.md`, `conf/(dot)env.txt`, `src/chat/ChatInput.tsx`, `src/chat/ChatMessage.tsx`, `src/chat/ChatMessages.tsx`, `src/context/AnthropicProvider.tsx`, `src/context/History.tsx`, `src/pages/_app.tsx`, `src/pages/api/completion.ts`) — le refactor non commité à figer en commit « baseline ».
- **`.gitignore`** (actuellement non suivi) — contient déjà `secret.txt`, à compléter puis committer.
- **`src/pages/api/auth.ts:43-58` et `:311`** — la fonction `logAttempt` écrit le mot de passe saisi EN CLAIR dans `auth_log.txt` ; c'est la fuite la plus grave de l'étape.
- **`src/pages/api/auth.ts:24-34`** — `extractPasswordAndDuration` accepte une durée de déverrouillage suffixée non bornée, à plafonner à 480 min.
- **`src/pages/chat/[id].tsx:32`** — monte un `<ChatSidebar />` en double ; **`src/context/Layout.tsx:89`** le monte déjà pour toutes les pages.
- **Code mort prouvé par grep** : `src/context/AIProviderManager.tsx`, `src/context/OpenAIProvider.tsx`, `src/utils/Anthropic/*`, `src/utils/OpenAI/*`, `src/utils/utils.ts` — vestiges de l'ancienne architecture multi-fournisseurs.
- **`src/chatSidebar/Conversation.tsx:21-26`** — importe encore des types legacy : les conserver/rapatrier avant suppression des dossiers ci-dessus.
- **`src/utils/env.ts:6`** — constante `SystemPrompt` inutilisée à supprimer ; **`env.ts:3`** lit la variable `SECRET_PASSWD` (nom de référence).
- **`conf/pwd_crypt.py:42`** — écrit `AUTH_PASSWORD_HASH=` dans `.env` alors que `env.ts:3` lit `SECRET_PASSWD` : le script est cassé, à aligner.
- **`package.json`** — dépendance `react-secure-storage` inutilisée à retirer.
- **`next.config.js`** — n'existe pas, à créer minimal vide (préparation du routage i18n natif de l'étape dédiée).

## Tâches

1. Committer le working tree actuel (les 9 fichiers modifiés, dont `AnthropicProvider.tsx`, `completion.ts` et `README.md`) dans un commit « baseline » qui fige l'état décrit par la cartographie.
2. Compléter puis committer `.gitignore` (actuellement non suivi) : `secret.txt` (déjà présent), `.env`, `auth_lock.json`, `failed_attempts.json`, `auth_log.txt`, `data/`, `*.db`, `.DS_Store` ; vérifier par `git status` qu'aucun fichier secret n'est suivi par git.
3. Supprimer le code mort prouvé par grep : `src/context/AIProviderManager.tsx`, `src/context/OpenAIProvider.tsx`, `src/utils/Anthropic/*`, `src/utils/OpenAI/*`, `src/utils/utils.ts`, la dépendance `react-secure-storage` et la constante `SystemPrompt` (`src/utils/env.ts:6`) — en conservant/rapatriant au préalable les types legacy encore importés par `src/chatSidebar/Conversation.tsx:21-26`.
4. Corriger `src/pages/api/auth.ts:43-58` et `:311` : ne PLUS journaliser le mot de passe saisi en clair dans `auth_log.txt` (date/IP/succès-échec seulement) ; purger le fichier `auth_log.txt` existant sur le serveur.
5. Borner la durée de déverrouillage suffixée (`auth.ts:24-34`) à 480 minutes maximum.
6. Supprimer le double montage de la sidebar : retirer le `<ChatSidebar />` de `src/pages/chat/[id].tsx:32` (`src/context/Layout.tsx:89` le monte déjà).
7. Aligner `conf/pwd_crypt.py:42`, qui écrit `AUTH_PASSWORD_HASH`, sur le nom réel `SECRET_PASSWD` lu par `src/utils/env.ts:3`.
8. Créer un `next.config.js` minimal vide (préparation i18n) ; vérifier que le dépôt situé sous Dropbox n'y synchronise pas `.env` ni `data/` (exclusion Dropbox, ou avertissement documenté).

## Livrables

- Commit « baseline » + `.gitignore` effectif
- Environ 600 lignes de code mort supprimées
- `auth_log.txt` sans mots de passe en clair
- Sidebar unique sur `/chat/[id]`
- `pwd_crypt.py` cohérent avec `env.ts`

## Vérification

- `yarn build` passe sans erreur.
- Le site fonctionne à l'identique : déverrouillage prof, chat, export/import de conversations.
- Une tentative de mot de passe erronée n'écrit plus le mot de passe dans `auth_log.txt`.
- `grep -rn "AIProviderManager\|OpenAIProvider\|AUTH_PASSWORD_HASH" src conf` ne renvoie plus rien.
- `git status` est propre (aucun fichier sensible suivi, aucun reste non commité).

## Prompt à copier-coller dans Claude Code

```text
Contexte : EduChat est un chatbot éducatif Next.js 14 (pages-router, TypeScript, Yarn), développé par un enseignant seul assisté par IA, hébergé sur un VPS OVH (Apache en proxy + service systemd). Une migration par étapes est planifiée ; ceci est l'ÉTAPE 1, sans dépendance : hygiène du dépôt (secrets, commit de référence, code mort). Décisions d'architecture à respecter : les futures données vivront en SQLite dans un répertoire data/ hors racine web (d'où data/ et *.db dans .gitignore dès maintenant) ; l'i18n utilisera le routage natif de Next sans bibliothèque (d'où un next.config.js minimal à créer).

Commence par lire planning/00-analyse-existant.md et planning/decisions-techniques.md à la racine du projet.

RÈGLE ABSOLUE : ne commite JAMAIS .env, secret.txt, auth_log.txt, auth_lock.json, failed_attempts.json, data/ ni aucun secret. N'ouvre pas secret.txt. Ne recopie aucune valeur secrète dans le code ou les messages de commit.

Tâches, dans cet ordre :

1. Commit « baseline » : commite le working tree actuel (9 fichiers modifiés dont src/context/AnthropicProvider.tsx, src/pages/api/completion.ts, README.md) tel quel, message en français indiquant qu'il fige l'état de référence de la cartographie.
2. Complète .gitignore (fichier existant mais non suivi) : secret.txt (déjà présent), .env, auth_lock.json, failed_attempts.json, auth_log.txt, data/, *.db, .DS_Store. Commite-le et vérifie par git status / git ls-files qu'aucun fichier sensible n'est suivi (utilise git rm --cached si besoin).
3. Supprime le code mort : src/context/AIProviderManager.tsx, src/context/OpenAIProvider.tsx, src/utils/Anthropic/ (tout le dossier), src/utils/OpenAI/ (tout le dossier), src/utils/utils.ts, la dépendance react-secure-storage dans package.json (puis yarn install), et la constante SystemPrompt dans src/utils/env.ts (ligne 6). ATTENTION : src/chatSidebar/Conversation.tsx (imports vers lignes 21-26) utilise encore des types legacy issus de ces modules — rapatrie ces types dans un fichier vivant (par exemple src/context/History.tsx ou un fichier de types dédié) AVANT de supprimer, et mets à jour tous les imports.
4. Dans src/pages/api/auth.ts, corrige la fonction logAttempt (lignes 43-58) et son appel ligne 311 : le mot de passe saisi ne doit PLUS JAMAIS être écrit dans auth_log.txt — journalise uniquement date, IP, méthode et succès/échec. Ajoute au README ou à la doc une note demandant de purger l'auth_log.txt existant sur le serveur.
5. Toujours dans auth.ts, borne la durée de déverrouillage suffixée extraite par extractPasswordAndDuration (lignes 24-34) à 480 minutes maximum.
6. Retire le <ChatSidebar /> monté en double dans src/pages/chat/[id].tsx (ligne 32) : src/context/Layout.tsx (ligne 89) le monte déjà.
7. Corrige conf/pwd_crypt.py ligne 42 : le script doit écrire SECRET_PASSWD (nom lu par src/utils/env.ts ligne 3), pas AUTH_PASSWORD_HASH.
8. Crée un next.config.js minimal vide (module.exports = {}) en préparation de l'i18n. Vérifie que le dépôt, situé sous Dropbox, ne synchronise pas .env ni data/ ; sinon documente l'exclusion Dropbox à faire (attribut com.dropbox.ignored) dans le README.

Critères d'acceptation (tous obligatoires) :
- yarn build passe sans erreur ;
- vérification manuelle : déverrouillage prof, chat et export/import fonctionnent à l'identique, sidebar unique sur /chat/[id] ;
- une tentative de mot de passe erronée n'écrit plus le mot de passe dans auth_log.txt ;
- grep -rn "AIProviderManager\|OpenAIProvider\|AUTH_PASSWORD_HASH" src conf ne renvoie plus rien ;
- git status propre.

Termine par : yarn build, la vérification manuelle ci-dessus, puis un ou plusieurs commits git avec des messages descriptifs en français.
```
