# Étape 11 — Export/import consolidés et robustesse de l'historique

**Dépend de :** Étape 8 · **Estimation :** 1 session

## Objectif
Fiabiliser l'exigence 11 (portabilité des conversations entre navigateurs), qui est déjà largement implémentée : l'export .md + .json existe dans `Conversation.tsx:72-99` et l'import par drag-and-drop dans `ChatSidebar.tsx:18-42`. Il s'agit de corriger les défauts connus de l'existant — double téléchargement bloqué par les navigateurs, tuteur absent du JSON exporté, `createdAt` écrasé, suppressions sans confirmation — plutôt que de réécrire. Les conversations restant stockées à 100 % dans le navigateur (localStorage), cet export/import est la seule voie de sauvegarde et de transfert pour l'utilisateur.

## Contexte et fichiers concernés
- `src/chatSidebar/Conversation.tsx` — carte d'une conversation dans la sidebar : `handleDownload` (lignes 72-99) déclenche aujourd'hui deux `.click()` successifs (.md ligne 90, .json ligne 98) ; `sanitizeFilename` (lignes 74-79) peut produire un nom de fichier vide ; `handleDelete` (lignes 68-70) supprime sans confirmation.
- `src/chatSidebar/ChatSidebar.tsx` — sidebar : import drag-and-drop via react-dropzone (lignes 18-42, `JSON.parse` avec simple `console.error` en cas d'échec) ; bouton « Tout effacer » sans confirmation (lignes 67-70).
- `src/context/AnthropicProvider.tsx` — contexte global du chat : la sauvegarde écrase `createdAt` par `Date.now()` à chaque modification (ligne 56) ; `importConversation` (ligne 97) reconstruit la conversation importée sans notion de tuteur.
- `src/chatSidebar/Conversations.tsx` — liste de la sidebar, triée sur `createdAt` (lignes 13-14), à faire pointer sur `lastMessage`.

## Tâches
1. Remplacer le double téléchargement simultané .md + .json de `handleDownload` (`Conversation.tsx:90` et `:98`), souvent bloqué par les navigateurs, par deux boutons distincts « Exporter .md » et « Exporter .json ».
2. Inclure `promptName`/`promptVersion` dans le JSON exporté ; à l'import, relier la conversation au tuteur s'il existe encore, sinon afficher la mention « tuteur retiré » et replier sur le chat libre.
3. Durcir `sanitizeFilename` (`Conversation.tsx:74-79`) contre les noms vides (repli sur un nom par défaut) ; s'appuyer sur la validation d'import mise en place à l'étape 3.
4. Corriger `createdAt` écrasé à chaque sauvegarde (`AnthropicProvider.tsx:56`) : conserver la vraie date de création, et trier la sidebar sur `lastMessage` (`Conversations.tsx:13-14`).
5. Ajouter une confirmation sur « Tout effacer » (`ChatSidebar.tsx:67-70`) et sur la suppression unitaire d'une conversation.
6. Option : exporter/importer aussi les favoris sous forme de profil léger (jeton promptagogue strictement exclu).

## Livrables
- Export/import fidèles inter-navigateurs, tuteur inclus.
- Confirmations de suppression (unitaire et « Tout effacer »).
- Dates de conversations correctes (création conservée, tri sur dernier message).

## Vérification
- Exporter une conversation avec tuteur sur Chrome, l'importer sur Firefox : messages, titre et tuteur restaurés, poursuite du dialogue fonctionnelle.
- Importer un JSON malformé : rejet propre (message utilisateur, pas de corruption de l'historique).
- Cliquer « Tout effacer » : une confirmation est demandée avant toute suppression.

## Prompt à copier-coller dans Claude Code
```text
Contexte : EduChat est un chatbot éducatif Next.js 14 (pages-router, React/TypeScript, Tailwind), développé par un enseignant seul assisté par IA, hébergé sur un VPS OVH (Apache en reverse proxy + service systemd). Les conversations vivent à 100 % dans le navigateur (localStorage) : l'export/import de discussions est la seule voie de portabilité entre navigateurs. Décisions d'architecture à respecter : aucun stockage serveur des conversations ; les favoris sont dans localStorage 'prompt-favorites' et peuvent être inclus dans un export de profil ; le jeton promptagogue (localStorage 'promptagogue-token') ne doit JAMAIS figurer dans un export.

Commence par lire, dans l'ordre : planning/00-analyse-existant.md, planning/decisions-techniques.md, puis planning/08-*.md (étape 8, prérequis : elle a introduit le lien conversation↔tuteur via promptName/promptVersion). Lis ensuite chaque fichier concerné avant de le modifier.

L'export (.md + .json) et l'import drag-and-drop existent déjà : corrige leurs défauts, ne réécris pas.

Tâches :
1. src/chatSidebar/Conversation.tsx (handleDownload, lignes 72-99) : le double téléchargement simultané .md + .json (deux .click() successifs, lignes 90 et 98) est souvent bloqué par les navigateurs. Remplace-le par deux boutons distincts « Exporter .md » et « Exporter .json ».
2. Inclus promptName et promptVersion dans le JSON exporté. À l'import (src/context/AnthropicProvider.tsx, importConversation ligne 97), si le tuteur existe encore, relie la conversation à ce tuteur ; sinon affiche la mention « tuteur retiré » et replie sur le chat libre.
3. Durcis sanitizeFilename (Conversation.tsx lignes 74-79) : un nom composé uniquement d'accents ou de symboles produit un fichier sans nom — prévois un repli (ex. « discussion »). Réutilise la validation d'import mise en place à l'étape 3 (contrôle du schéma JSON, rejet propre avec message utilisateur au lieu du console.error de ChatSidebar.tsx lignes 25-31).
4. src/context/AnthropicProvider.tsx ligne 56 : createdAt est écrasé par Date.now() à chaque sauvegarde. Conserve la vraie date de création (fixée une seule fois), mets à jour lastMessage, et trie la sidebar (src/chatSidebar/Conversations.tsx lignes 13-14) sur lastMessage décroissant.
5. Ajoute une confirmation avant « Tout effacer » (src/chatSidebar/ChatSidebar.tsx lignes 67-70) et avant la suppression unitaire (Conversation.tsx, handleDelete lignes 68-70).
6. Optionnel, seulement si le reste est terminé : export/import d'un « profil léger » incluant les favoris (localStorage 'prompt-favorites'), en EXCLUANT strictement 'promptagogue-token'.

Critères d'acceptation :
- Export d'une conversation avec tuteur sur Chrome puis import sur Firefox : messages, titre et tuteur restaurés, poursuite du dialogue OK.
- JSON malformé importé → rejet propre avec message à l'utilisateur, historique intact.
- « Tout effacer » et la suppression unitaire demandent confirmation.
- Les dates de création ne bougent plus ; le tri de la sidebar suit lastMessage.

Termine par : yarn build sans erreur, vérification manuelle du comportement dans le navigateur (deux exports, import valide, import invalide, confirmations, tri), puis un commit git avec un message descriptif en français. Interdiction absolue de commiter .env, secret.txt, le dossier data/ ou tout autre secret.
```
