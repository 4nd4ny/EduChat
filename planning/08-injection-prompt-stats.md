# Étape 8 — Injection serveur du prompt système + statistiques d'usage

**Dépend de :** Étape 7 · **Estimation :** 1 session

## Objectif
C'est le cœur pédagogique du projet (exigence 1) : le tuteur choisi sur l'accueil doit réellement piloter la conversation. La cartographie prouve qu'aujourd'hui AUCUN prompt système n'est envoyé aux fournisseurs — `completion.ts:71` ne transmet que les messages user/assistant nettoyés. Cette étape injecte côté serveur le texte du prompt (jamais exposé au client), dans la version exacte que la conversation a mémorisée — jamais de bascule automatique de version — et fait vivre les statistiques à chaque complétion (exigence 3) : compteurs `usage_count`/`tokens_total` du catalogue ET journal `usage_log`, socle des quotas d'établissement (étape 9) et de la facturation (étapes 9/14).

## Contexte et fichiers concernés
- `src/pages/api/completion.ts` — endpoint unique de complétion multi-fournisseurs ; `cleanMessages` (l.71) n'inclut aucun `system` ; corps Anthropic à l.90-95 ; recherche web activée en dur pour tous les fournisseurs (l.82-112) ; `usageFromResponse` (l.44-47) extrait déjà le total de tokens. À modifier : résolution du prompt en base (statut + version), injection `system`, incrément des compteurs, insertion `usage_log`, recherche web pilotée par prompt.
- `src/context/AnthropicProvider.tsx` — provider React du chat ; `send()` construit le body du POST `/api/completion` (l.77). À modifier : état `promptName`/`promptVersion` et ajout au body.
- `src/context/History.tsx` — persistance localStorage des conversations ; type `Conversation` (l.7-12). À étendre avec `promptName` + `promptVersion` pour que `/chat/[id]` restaure son tuteur ET sa version.
- `src/pages/chat/[id].tsx` — page de conversation : recharge le tuteur associé et affiche la bannière discrète « nouvelle version disponible » (bascule uniquement sur choix explicite).
- `src/chatSidebar/ChatSidebar.tsx` et l'en-tête de conversation (layout `src/context/Layout.tsx`) — affichage du nom du tuteur actif.
- Module SQLite créé à l'étape 4 (better-sqlite3, base dans `DATA_DIR` hors racine web), schéma v2 : `prompts` (statuts `draft`/`pending`/`published`/`retired`, `share_token`, `web_search`), `prompt_versions` (texte exact de chaque version), `usage_log`, `etablissements` (résolution IP → établissement).

## Tâches
1. Côté client : ajouter `promptName`/`promptVersion` à l'état d'`AnthropicProvider` et au body envoyé par `send()` (`AnthropicProvider.tsx:77`) ; étendre le type `Conversation` (`History.tsx:7-12`) pour que le rechargement de `/chat/[id]` restaure le tuteur ET sa version.
2. Versions à bascule explicite : une conversation NE change JAMAIS de version automatiquement ; si une version publiée plus récente existe, afficher une bannière discrète et laisser l'utilisateur choisir explicitement de poursuivre avec la nouvelle version.
3. Côté serveur (`completion.ts`) : résoudre `promptName`+`promptVersion` dans SQLite — `status='published'` résoluble par nom (texte de la version mémorisée via `prompt_versions`) ; un `draft` uniquement si le body fournit son `share_token` valide (flux de test de l'étape 7) ; `pending`/`retired` jamais injectés ; sinon code d'erreur stable. Injecter le texte comme champ `system` de l'API Anthropic (l.90-95) ou comme message `role:system` pour openai/gemini/openrouter/grok/mistral ; le texte du prompt n'est JAMAIS renvoyé dans les réponses de chat.
4. Après chaque complétion réussie : transaction SQLite incrémentant `usage_count` de 1 et `tokens_total` du `tokenUsage` retourné (réutiliser `usageFromResponse`), PLUS insertion d'une ligne `usage_log` (ts, etablissement_id résolu par IP si clé interne — NULL sinon, teacher_email NULL pour l'instant, prompt_id, provider, tokens) — base des quotas (étape 9) et de la facturation (étapes 9/14).
5. Afficher le nom du tuteur actif dans l'en-tête de conversation et dans la sidebar.
6. Recherche web pilotée par le champ `web_search` du prompt (choix du promptagogue, désactivée par défaut pour un tuteur — économie de tokens et réduction de la surface de contenu) ; comportement actuel conservé pour le chat libre sans tuteur. L'override par session (réglage prof au déverrouillage) arrivera à l'étape 14 : ne pas le coder ici, prévoir le point de branchement.

## Livrables
- Chat réellement socratique de bout en bout, stable sur la version mémorisée du tuteur.
- Compteurs uses/tokens vivants sur l'accueil + journal `usage_log` alimenté (socle quotas/facturation).
- Bannière « nouvelle version disponible » avec bascule explicite.
- Conversations liées à leur tuteur et à sa version (localStorage).

## Vérification
- Poser une question factuelle à un tuteur « ne donne jamais la réponse » : la réponse est socratique (questions en retour) sur 3 essais consécutifs.
- `sqlite3` montre `usage_count`/`tokens_total` incrémentés ET une ligne `usage_log` par complétion (provider et tokens corrects) ; la page d'accueil reflète ces valeurs.
- Recharger `/chat/[id]` restaure le tuteur ET sa version ; après publication d'une nouvelle version, une conversation existante reste sur l'ancienne, affiche la bannière, et ne bascule qu'au clic.
- Un prompt avec `web_search` désactivé ne déclenche aucun tool de recherche web chez le fournisseur.
- Le texte du prompt système n'apparaît nulle part dans l'onglet réseau du navigateur (ni requête, ni réponse de chat).

## Prompt à copier-coller dans Claude Code
```text
Contexte : EduChat est un chatbot éducatif Next.js 14 (pages-router, TypeScript), développé par un enseignant seul assisté par IA, hébergé sur un VPS OVH (Apache en reverse proxy + systemd). Je réalise l'étape 8 du plan de migration : injection serveur du prompt système du tuteur choisi + statistiques d'usage.

Commence par lire, dans l'ordre : planning/00-analyse-existant.md, planning/decisions-techniques.md, puis la fiche de l'étape 7 (planning/07-*.md) dont cette étape dépend.

Décisions d'architecture à respecter impérativement :
- Les prompts vivent dans SQLite (better-sqlite3, synchrone), base unique dans DATA_DIR hors racine web — module d'accès et schéma v2 créés à l'étape 4 (tables prompts, prompt_versions, usage_log, etablissements). /api/completion tourne en runtime Node (plus edge).
- Statuts : seuls les prompts status='published' sont résolubles par nom ; un draft n'est injectable que si le body fournit son share_token valide (flux de test de l'étape 7) ; pending et retired ne sont jamais injectés.
- Versions : une conversation reste sur sa version, AUCUNE bascule automatique ; l'injection utilise le texte exact de la version mémorisée via prompt_versions.
- Le texte d'un prompt système n'est JAMAIS renvoyé au client dans les réponses de chat : il est résolu et injecté exclusivement côté serveur.
- Les erreurs API sont des codes stables (ex. {error:'ERR_PROMPT_UNKNOWN'}) traduits côté client, pas des phrases en dur.

Tâches :
1. Client — dans src/context/AnthropicProvider.tsx : ajoute promptName et promptVersion à l'état du provider et au body du fetch de send() (actuellement l.77). Étends le type Conversation de src/context/History.tsx (l.7-12) avec promptName + promptVersion, pour que src/pages/chat/[id].tsx restaure le tuteur ET sa version au rechargement.
2. Versions — si une version publiée plus récente que celle de la conversation existe, affiche une bannière discrète dans la conversation ; l'utilisateur choisit explicitement de passer à la nouvelle version, jamais de bascule automatique.
3. Serveur — dans src/pages/api/completion.ts : résous promptName + promptVersion en base selon les règles de statut ci-dessus (texte via prompt_versions) et injecte-le comme champ system de l'appel Anthropic (corps construit l.90-95) ou comme message role:system pour openai, gemini, openrouter, grok et mistral. Aucun texte de prompt dans la réponse JSON.
4. Statistiques — après chaque complétion réussie uniquement, une transaction SQLite : usage_count = usage_count + 1 et tokens_total = tokens_total + tokenUsage (réutilise usageFromResponse, completion.ts:44-47), PLUS une ligne usage_log(ts, etablissement_id résolu par IP si la clé interne est utilisée — NULL sinon, teacher_email NULL pour l'instant (il arrivera à l'étape 14), prompt_id, provider, tokens). Ce journal est la base des quotas (étape 9) et de la facturation (étapes 9/14).
5. UI — affiche le nom du tuteur actif dans l'en-tête de conversation et dans src/chatSidebar/ChatSidebar.tsx.
6. Recherche web — les tools sont aujourd'hui activés en dur pour tous les fournisseurs (completion.ts:82-112). Pilote-les par le champ web_search du prompt (choix du promptagogue, désactivé par défaut pour un tuteur) ; conserve le comportement actuel pour le chat libre sans tuteur. Ne code PAS l'override par session (réglage prof) : il arrivera à l'étape 14, laisse un commentaire au point de branchement.

Critères d'acceptation (à vérifier réellement, pas seulement compiler) :
- Une question factuelle posée à un tuteur « ne donne jamais la réponse » produit une réponse socratique (questions en retour) sur 3 essais.
- sqlite3 montre les compteurs incrémentés ET une ligne usage_log par complétion ; l'accueil reflète ces valeurs.
- Après publication d'une nouvelle version, une conversation existante reste sur l'ancienne, affiche la bannière et ne bascule qu'au clic.
- Un prompt avec web_search désactivé ne déclenche aucun tool de recherche web.
- Le texte du system n'apparaît pas dans l'onglet réseau du navigateur.

Termine par : yarn build sans erreur, vérification manuelle du comportement ci-dessus, puis un commit git avec un message descriptif en français. Interdiction absolue de commiter .env, secret.txt, data/ ou tout secret ; n'ouvre pas secret.txt.
```
