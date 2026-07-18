# Étape 8 — Injection serveur du prompt système + statistiques d'usage

**Dépend de :** Étape 7 · **Estimation :** 1 session

## Objectif
C'est le cœur pédagogique du projet (exigence 1) : le tuteur choisi sur l'accueil doit réellement piloter la conversation. La cartographie prouve qu'aujourd'hui AUCUN prompt système n'est envoyé aux fournisseurs — `completion.ts:71` ne transmet que les messages user/assistant nettoyés. Cette étape injecte côté serveur le texte du prompt publié (jamais exposé au client) et fait vivre les compteurs `usage_count`/`tokens_total` du catalogue à chaque complétion (exigence 3).

## Contexte et fichiers concernés
- `src/pages/api/completion.ts` — endpoint unique de complétion multi-fournisseurs ; `cleanMessages` (l.71) n'inclut aucun `system` ; corps Anthropic à l.90-95 ; recherche web activée en dur pour tous les fournisseurs (l.82-112) ; `usageFromResponse` (l.44-47) extrait déjà le total de tokens. À modifier : résolution du prompt en base, injection `system`, incrément des compteurs, option recherche web par prompt.
- `src/context/AnthropicProvider.tsx` — provider React du chat ; `send()` construit le body du POST `/api/completion` (l.77). À modifier : état `promptName`/`promptVersion` et ajout au body.
- `src/context/History.tsx` — persistance localStorage des conversations ; type `Conversation` (l.7-12). À étendre pour que `/chat/[id]` restaure son tuteur.
- `src/pages/chat/[id].tsx` — page de conversation, doit recharger le tuteur associé.
- `src/chatSidebar/ChatSidebar.tsx` et l'en-tête de conversation (layout `src/context/Layout.tsx`) — affichage du nom du tuteur actif.
- Module SQLite créé à l'étape 4 (better-sqlite3, base dans `DATA_DIR` hors racine web) — source des prompts `status='published'` et des compteurs.

## Tâches
1. Côté client : ajouter `promptName`/`promptVersion` à l'état d'`AnthropicProvider` et au body envoyé par `send()` (`AnthropicProvider.tsx:77`) ; étendre le type `Conversation` (`History.tsx:7-12`) pour que le rechargement de `/chat/[id]` restaure le tuteur de la conversation.
2. Côté serveur (`completion.ts`) : résoudre `promptName` dans la base SQLite (uniquement les prompts `status='published'`) et injecter le texte comme champ `system` de l'API Anthropic (l.90-95) ou comme message `role:system` pour openai/gemini/openrouter/grok/mistral ; le texte du prompt n'est JAMAIS renvoyé dans les réponses de chat.
3. Après chaque complétion réussie : transaction SQLite incrémentant `usage_count` de 1 et `tokens_total` du `tokenUsage` retourné (réutiliser `usageFromResponse` existant).
4. Afficher le nom du tuteur actif dans l'en-tête de conversation et dans la sidebar.
5. Rendre l'option « recherche web » paramétrable par prompt (aujourd'hui activée en dur pour tous les fournisseurs, `completion.ts:82-112`) : c'est le promptagogue qui la décide, désactivée par défaut pour un tuteur — économie de tokens et réduction de la surface de contenu.

## Livrables
- Chat réellement socratique de bout en bout.
- Compteurs uses/tokens vivants sur l'accueil.
- Conversations liées à leur tuteur (localStorage).

## Vérification
- Poser une question factuelle à un tuteur « ne donne jamais la réponse » : la réponse est socratique (questions en retour) sur 3 essais consécutifs.
- `sqlite3` montre `usage_count` et `tokens_total` incrémentés après chaque complétion, et la page d'accueil reflète ces valeurs.
- Recharger `/chat/[id]` restaure le tuteur de la conversation.
- Le texte du prompt système n'apparaît nulle part dans l'onglet réseau du navigateur (ni requête, ni réponse de chat).

## Prompt à copier-coller dans Claude Code
```text
Contexte : EduChat est un chatbot éducatif Next.js 14 (pages-router, TypeScript), développé par un enseignant seul assisté par IA, hébergé sur un VPS OVH (Apache en reverse proxy + systemd). Je réalise l'étape 8 du plan de migration : injection serveur du prompt système du tuteur choisi + statistiques d'usage.

Commence par lire, dans l'ordre : planning/00-analyse-existant.md, planning/decisions-techniques.md, puis la fiche de l'étape 7 (planning/07-*.md) dont cette étape dépend.

Décisions d'architecture à respecter impérativement :
- Les prompts et leurs compteurs vivent dans SQLite (better-sqlite3, synchrone), base unique dans DATA_DIR hors racine web — le module d'accès existe depuis l'étape 4. /api/completion tourne en runtime Node (plus edge).
- Le texte d'un prompt système n'est JAMAIS renvoyé au client dans les réponses de chat : il est résolu et injecté exclusivement côté serveur.
- Le classement de l'accueil est calculé serveur à partir de compteurs anonymes (usage_count, tokens_total) : ces compteurs doivent devenir vivants ici.
- Les erreurs API sont des codes stables (ex. {error:'ERR_PROMPT_UNKNOWN'}) traduits côté client, pas des phrases en dur.

Tâches :
1. Client — dans src/context/AnthropicProvider.tsx : ajoute promptName et promptVersion à l'état du provider et au body du fetch de send() (actuellement l.77). Étends le type Conversation de src/context/History.tsx (l.7-12) avec le tuteur associé, pour que src/pages/chat/[id].tsx restaure promptName au rechargement.
2. Serveur — dans src/pages/api/completion.ts : si promptName est fourni, résous-le en base (uniquement status='published' ; sinon code d'erreur stable) et injecte son texte comme champ system de l'appel Anthropic (corps construit l.90-95) ou comme message role:system pour openai, gemini, openrouter, grok et mistral. Aucun texte de prompt dans la réponse JSON.
3. Statistiques — après chaque complétion réussie uniquement, exécute une transaction SQLite : usage_count = usage_count + 1 et tokens_total = tokens_total + tokenUsage (réutilise usageFromResponse, completion.ts:44-47).
4. UI — affiche le nom du tuteur actif dans l'en-tête de conversation et dans src/chatSidebar/ChatSidebar.tsx.
5. Recherche web — aujourd'hui les tools de recherche web sont activés en dur pour tous les fournisseurs (completion.ts:82-112). Rends cette option paramétrable par prompt (colonne/champ décidé par le promptagogue), désactivée par défaut pour un tuteur ; conserve le comportement actuel pour le chat libre sans tuteur.

Critères d'acceptation (à vérifier réellement, pas seulement compiler) :
- Une question factuelle posée à un tuteur « ne donne jamais la réponse » produit une réponse socratique (questions en retour) sur 3 essais.
- sqlite3 montre usage_count et tokens_total incrémentés, et l'accueil reflète ces valeurs.
- Recharger /chat/[id] restaure le tuteur de la conversation.
- Le texte du system n'apparaît pas dans l'onglet réseau du navigateur.

Termine par : yarn build sans erreur, vérification manuelle du comportement ci-dessus, puis un commit git avec un message descriptif en français. Interdiction absolue de commiter .env, secret.txt, data/ ou tout secret ; n'ouvre pas secret.txt.
```
