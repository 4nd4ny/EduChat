# Étape 3 — Assainir le rendu (anti-XSS) et durcir l'import JSON

**Dépend de :** Étape 1 · **Estimation :** 1 session

## Objectif
Fermer la faille XSS du rendu des messages assistants : aujourd'hui `rehypeRaw` et un `dangerouslySetInnerHTML` rendent tel quel le HTML émis par le modèle, si bien qu'un prompt malveillant peut faire exécuter du JavaScript dans le navigateur de l'élève. C'est un prérequis NON négociable avant d'ouvrir le site aux prompts tiers (ordonnancement repris du plan B), et c'est aussi la condition de sûreté du jeton promptagogue stocké en localStorage (décision d'architecture). L'étape durcit au passage l'import de conversations JSON, qui ne valide actuellement que `Array.isArray(messages)`.

## Contexte et fichiers concernés
- `src/chat/AssistantMessageContent.tsx` — rendu markdown des messages assistants via ReactMarkdown ; importe `rehype-raw` (l.5) et l'active dans `rehypePlugins` (l.207) ; renderers personnalisés `<thinking>`/`<encouragement>` (l.59-76) ; renderer `mathml` à `dangerouslySetInnerHTML` (l.198-200).
- `src/context/AnthropicProvider.tsx` — contexte global du chat ; `importConversation` (l.97) injecte le JSON importé quasi sans validation.
- `src/chatSidebar/ChatSidebar.tsx` — barre latérale ; zone react-dropzone d'import de fichier JSON (`useDropzone`, l.37-42), sans limite de taille.
- `src/chat/ChatMessages.tsx` — liste des messages ; clé React `${message.id}-${message.role}` (l.92) où `id` est l'index d'insertion, ce qui fragilise « Supprimer à partir d'ici ».

## Tâches
1. Dans `src/chat/AssistantMessageContent.tsx`, remplacer `rehypeRaw` (import l.5, usage l.207) par `rehype-sanitize` configuré avec un schéma liste-blanche qui conserve KaTeX, les tableaux GFM, la coloration Prism, ainsi que les balises pédagogiques `<thinking>` et `<encouragement>` (renderers l.59-76).
2. Supprimer, ou à défaut sanitiser, le renderer `mathml` qui injecte `node.outerHTML` via `dangerouslySetInnerHTML` (l.198-200).
3. Durcir `importConversation` (`src/context/AnthropicProvider.tsx:97`) : validation message par message (`role` ∈ {user, assistant}, `content` de type string), normalisation du format legacy `{reply, tokenUsage}`, taille maximale de 2 Mo, rejet propre avec message clair — l'implémentation actuelle ne vérifie que `Array.isArray(messages)`.
4. Limiter la taille de fichier acceptée par react-dropzone (`src/chatSidebar/ChatSidebar.tsx:37-42`).
5. Stabiliser les clés React des messages (`src/chat/ChatMessages.tsx:92`) : remplacer l'`id` = index d'insertion par un uuid, pour fiabiliser « Supprimer à partir d'ici ».

## Livrables
- Rendu markdown sans HTML brut exécutable (balises pédagogiques préservées).
- Import JSON validé par schéma.

## Vérification
- Un message assistant contenant `<img src=x onerror=alert(1)>` s'affiche inerte (aucune exécution de script).
- Les formules KaTeX, les tableaux GFM, le code coloré Prism et les balises `<thinking>`/`<encouragement>` fonctionnent toujours.
- Un JSON piégé est rejeté avec un message clair dans chacun des cas : `content` objet, `role` inconnu, fichier de 10 Mo.

## Prompt à copier-coller dans Claude Code
```text
Contexte : EduChat est un chatbot éducatif en Next.js 14 (pages-router, TypeScript, Tailwind), développé par un enseignant seul assisté par IA et hébergé sur un VPS OVH (Apache + systemd). Le site va accueillir des prompts publiés par des tiers ; il faut d'abord fermer la faille XSS du rendu. Décisions d'architecture à respecter : le jeton promptagogue sera stocké en localStorage (pas de cookie), décision qui REPOSE sur la sanitisation faite ici ; les conversations restent dans le navigateur (localStorage + export/import JSON) ; on minimise les dépendances (dev solo).

Commence par lire planning/00-analyse-existant.md, planning/decisions-techniques.md et la fiche de l'étape 1 (planning/01-*.md), dont cette étape dépend, ainsi que planning/03-sanitisation-xss.md.

Problème : src/chat/AssistantMessageContent.tsx rend le HTML émis par le modèle tel quel via rehype-raw (import l.5, activé l.207) et un renderer mathml à dangerouslySetInnerHTML (l.198-200). Un prompt malveillant peut donc exécuter du JS chez l'élève. Par ailleurs importConversation (src/context/AnthropicProvider.tsx:97) n'effectue quasiment aucune validation du JSON importé.

Tâches :
1. Dans src/chat/AssistantMessageContent.tsx, remplace rehype-raw par rehype-sanitize avec un schéma liste-blanche (basé sur defaultSchema) qui conserve : les classes/attributs nécessaires à KaTeX (rehype-katex), les tableaux GFM (remark-gfm), les classes language-* pour la coloration Prism (renderer code l.158-196), la balise <del>, et les balises pédagogiques <thinking> et <encouragement> (renderers l.59-76). Ajoute rehype-sanitize aux dépendances (yarn add).
2. Supprime le renderer mathml (l.198-200) qui injecte node.outerHTML via dangerouslySetInnerHTML, ou sanitise son contenu si sa suppression casse le rendu des formules.
3. Durcis importConversation (src/context/AnthropicProvider.tsx:97) : valide message par message (role ∈ {user, assistant}, content de type string), normalise le format legacy {reply, tokenUsage}, refuse tout contenu > 2 Mo, et rejette proprement avec un message d'erreur clair pour l'utilisateur (pas seulement un return silencieux).
4. Limite la taille de fichier acceptée par react-dropzone dans src/chatSidebar/ChatSidebar.tsx (useDropzone, l.37-42) : maxSize cohérent avec la limite de 2 Mo, et signale le rejet.
5. Stabilise les clés React des messages dans src/chat/ChatMessages.tsx:92 : remplace id = index d'insertion (posé dans AnthropicProvider) par un uuid (uuid est déjà en dépendance), afin de fiabiliser « Supprimer à partir d'ici ».

Critères d'acceptation obligatoires :
- Un message assistant contenant <img src=x onerror=alert(1)> s'affiche inerte.
- Formules KaTeX, tableaux GFM, code coloré Prism et balises <thinking>/<encouragement> fonctionnent toujours.
- Un JSON piégé (content objet, role inconnu, fichier de 10 Mo) est rejeté avec un message clair.

Termine par : yarn build sans erreur ; vérification manuelle en dev des cas ci-dessus (payload XSS, formule LaTeX, tableau, bloc de code, import d'un JSON valide et d'un JSON piégé) ; puis un commit git avec un message descriptif en français. Interdiction absolue de commiter .env, secret.txt, data/ ou tout secret. N'ouvre pas secret.txt.
```
