# Étape 11 — Export/import consolidés et robustesse de l'historique

**Dépend de :** Étape 8 · **Estimation :** 1 session

## Objectif
Fiabiliser l'exigence 11 (portabilité des conversations entre navigateurs), qui est déjà largement implémentée : l'export .md + .json existe dans `Conversation.tsx:72-99` et l'import par drag-and-drop dans `ChatSidebar.tsx:18-42`. Il s'agit de corriger les défauts connus de l'existant — double téléchargement bloqué par les navigateurs, tuteur absent du JSON exporté, `createdAt` écrasé, suppressions sans confirmation — plutôt que de réécrire. Les conversations restant stockées à 100 % dans le navigateur (localStorage) — les élèves n'ont jamais de compte, principe RGPD central —, cet export/import est la seule voie de sauvegarde et de transfert pour l'utilisateur. Cette étape définit en outre un **format de profil** (conversations + favoris + réglages) qui servira **tel quel** à la synchronisation serveur opt-in des comptes vérifiés à l'étape 15.

## Contexte et fichiers concernés
- `src/chatSidebar/Conversation.tsx` — carte d'une conversation dans la sidebar : `handleDownload` (lignes 72-99) déclenche aujourd'hui deux `.click()` successifs (.md ligne 90, .json ligne 98) ; `sanitizeFilename` (lignes 74-79) peut produire un nom de fichier vide ; `handleDelete` (lignes 68-70) supprime sans confirmation.
- `src/chatSidebar/ChatSidebar.tsx` — sidebar : import drag-and-drop via react-dropzone (lignes 18-42, `JSON.parse` avec simple `console.error` en cas d'échec) ; bouton « Tout effacer » sans confirmation (lignes 67-70).
- `src/context/AnthropicProvider.tsx` — contexte global du chat : la sauvegarde écrase `createdAt` par `Date.now()` à chaque modification (ligne 56) ; `importConversation` (ligne 97) reconstruit la conversation importée sans notion de tuteur.
- `src/chatSidebar/Conversations.tsx` — liste de la sidebar, triée sur `createdAt` (lignes 13-14), à faire pointer sur `lastMessage`.
- Étape 15 (à venir) : la sync serveur opt-in (`/api/profile`, table `profiles`) stockera l'équivalent de la mémoire du navigateur au format de profil défini ici — d'où l'importance d'un format propre et versionné.

## Tâches
1. Remplacer le double téléchargement simultané .md + .json de `handleDownload` (`Conversation.tsx:90` et `:98`), souvent bloqué par les navigateurs, par deux boutons distincts « Exporter .md » et « Exporter .json ».
2. Inclure `promptName`/`promptVersion` dans le JSON exporté ; à l'import, restaurer ce lien tel quel : la conversation reste sur SA version mémorisée (jamais de bascule automatique — si une version plus récente existe, la bannière de l'étape 8 propose le changement, au choix explicite de l'utilisateur). Si le tuteur n'existe plus ou est au statut `retired`, afficher la mention « tuteur retiré » et replier sur le chat libre.
3. Durcir `sanitizeFilename` (`Conversation.tsx:74-79`) contre les noms vides (repli sur un nom par défaut) ; s'appuyer sur la validation d'import mise en place à l'étape 3.
4. Corriger `createdAt` écrasé à chaque sauvegarde (`AnthropicProvider.tsx:56`) : conserver la vraie date de création, et trier la sidebar sur `lastMessage` (`Conversations.tsx:13-14`).
5. Ajouter une confirmation sur « Tout effacer » (`ChatSidebar.tsx:67-70`) et sur la suppression unitaire d'une conversation.
6. Définir et implémenter l'export/import d'un **profil** : conversations + favoris (localStorage `prompt-favorites`) + réglages locaux, dans un JSON versionné (champ `formatVersion`), en excluant strictement le jeton de compte (localStorage `educhat-token`, généralisé aux comptes promptagogue/enseignant à l'étape 6). Ce format sera réutilisé tel quel par la sync serveur opt-in de l'étape 15.

## Livrables
- Export/import fidèles inter-navigateurs, tuteur inclus (version mémorisée conservée).
- Confirmations de suppression (unitaire et « Tout effacer »).
- Dates de conversations correctes (création conservée, tri sur dernier message).
- Format de profil (conversations + favoris + réglages) documenté et versionné, réutilisable tel quel par la sync serveur de l'étape 15 ; jeton de compte jamais exporté.

## Vérification
- Exporter une conversation avec tuteur sur Chrome, l'importer sur Firefox : messages, titre et tuteur restaurés sur la même version, poursuite du dialogue fonctionnelle.
- Importer un JSON malformé : rejet propre (message utilisateur, pas de corruption de l'historique).
- Cliquer « Tout effacer » : une confirmation est demandée avant toute suppression.
- Exporter puis réimporter un profil : conversations, favoris et réglages restaurés ; aucun jeton de compte dans le fichier exporté.

## Prompt à copier-coller dans Claude Code
```text
Contexte : EduChat est un chatbot éducatif Next.js 14 (pages-router, React/TypeScript, Tailwind), développé par un enseignant seul assisté par IA, hébergé sur un VPS OVH (Apache en reverse proxy + service systemd). Les conversations vivent à 100 % dans le navigateur (localStorage) : les élèves n'ont jamais de compte (principe RGPD central), l'export/import est donc leur seule voie de portabilité entre navigateurs. Décisions d'architecture à respecter : aucun stockage serveur des conversations ; les favoris sont dans localStorage 'prompt-favorites' ; le jeton de compte (localStorage 'educhat-token', généralisé à tous les comptes vérifiés — promptagogues/enseignants — depuis l'étape 6) ne doit JAMAIS figurer dans un export. Le format de « profil » défini ici (conversations + favoris + réglages) sera réutilisé TEL QUEL par la synchronisation serveur opt-in de l'étape 15 (endpoints /api/profile pour les comptes sync_optin) : structure-le proprement et versionne-le.

Commence par lire, dans l'ordre : planning/00-analyse-existant.md, planning/decisions-techniques.md, puis planning/08-*.md (étape 8, prérequis : elle a introduit le lien conversation↔tuteur via promptName/promptVersion, avec une règle stricte : une conversation ne change JAMAIS de version automatiquement ; la bascule vers une version plus récente est un choix explicite de l'utilisateur). Lis ensuite chaque fichier concerné avant de le modifier.

L'export (.md + .json) et l'import drag-and-drop existent déjà : corrige leurs défauts, ne réécris pas.

Tâches :
1. src/chatSidebar/Conversation.tsx (handleDownload, lignes 72-99) : le double téléchargement simultané .md + .json (deux .click() successifs, lignes 90 et 98) est souvent bloqué par les navigateurs. Remplace-le par deux boutons distincts « Exporter .md » et « Exporter .json ».
2. Inclus promptName et promptVersion dans le JSON exporté. À l'import (src/context/AnthropicProvider.tsx, importConversation ligne 97), restaure ce lien tel quel : la conversation reste sur sa version mémorisée, sans bascule automatique (si une version plus récente existe, c'est la bannière de l'étape 8 qui proposera le changement). Si le tuteur n'existe plus ou est au statut 'retired', affiche la mention « tuteur retiré » et replie sur le chat libre.
3. Durcis sanitizeFilename (Conversation.tsx lignes 74-79) : un nom composé uniquement d'accents ou de symboles produit un fichier sans nom — prévois un repli (ex. « discussion »). Réutilise la validation d'import mise en place à l'étape 3 (contrôle du schéma JSON, rejet propre avec message utilisateur au lieu du console.error de ChatSidebar.tsx lignes 25-31).
4. src/context/AnthropicProvider.tsx ligne 56 : createdAt est écrasé par Date.now() à chaque sauvegarde. Conserve la vraie date de création (fixée une seule fois), mets à jour lastMessage, et trie la sidebar (src/chatSidebar/Conversations.tsx lignes 13-14) sur lastMessage décroissant.
5. Ajoute une confirmation avant « Tout effacer » (src/chatSidebar/ChatSidebar.tsx lignes 67-70) et avant la suppression unitaire (Conversation.tsx, handleDelete lignes 68-70).
6. Export/import d'un « profil » : un JSON versionné (champ formatVersion) contenant conversations + favoris (localStorage 'prompt-favorites') + réglages locaux, en EXCLUANT strictement le jeton de compte. Ce format servira tel quel à la sync serveur de l'étape 15 : documente sa structure en tête du module qui le construit.

Critères d'acceptation :
- Export d'une conversation avec tuteur sur Chrome puis import sur Firefox : messages, titre et tuteur restaurés sur la même version, poursuite du dialogue OK, aucune bascule de version automatique.
- JSON malformé importé → rejet propre avec message à l'utilisateur, historique intact.
- « Tout effacer » et la suppression unitaire demandent confirmation.
- Les dates de création ne bougent plus ; le tri de la sidebar suit lastMessage.
- Un profil exporté puis réimporté restaure conversations, favoris et réglages ; le fichier ne contient aucun jeton.

Termine par : yarn build sans erreur, vérification manuelle du comportement dans le navigateur (deux exports, import valide, import invalide, confirmations, tri, aller-retour de profil), puis un commit git avec un message descriptif en français. Interdiction absolue de commiter .env, secret.txt, le dossier data/ ou tout autre secret.
```
