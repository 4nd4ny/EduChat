# Étape 7 — Publication, versionnement, quotas d'upload

**Dépend de :** Étape 3, Étape 5, Étape 6 · **Estimation :** 1-2 sessions

## Objectif
Permettre à un promptagogue dont l'email est vérifié de publier ou de mettre à jour ses tuteurs en moins de 5 minutes (exigences 3 et 8). Le parcours comprend un gabarit socratique pré-rempli (pas de page blanche), une prévisualisation « tester avant de publier » et une page publique par prompt. Côté serveur, les écritures sont protégées par le jeton Bearer HMAC de l'étape 6, versionnées dans `prompt_versions`, et bornées par des quotas stricts (256 Ko par prompt, 1 Mo cumulés par compte, 10 écritures/jour).

## Contexte et fichiers concernés
- `src/pages/api/prompts.ts` (à créer) — endpoint POST/PUT d'écriture des prompts : vérification du Bearer HMAC-SHA256, création/versionnement, quotas, rate-limit. Écrit dans la base SQLite (better-sqlite3, `DATA_DIR`) mise en place à l'étape 3 (tables `prompts`, `prompt_versions`, `promptagogues`).
- `src/pages/publier.tsx` (à créer) — page de publication : bloc de vérification email (étape 6) si aucun jeton `promptagogue-token` valide en localStorage, puis formulaire complet avec gabarit, import de fichier, quotas restants et prévisualisation.
- `src/pages/p/[name].tsx` (à créer) — page publique d'un prompt : corps affiché en texte brut échappé, métadonnées, historique des versions, boutons « essayer » / « modifier ».
- `src/chatSidebar/ChatSidebar.tsx:18-42` — pattern `react-dropzone` existant (`onDrop` + `useDropzone` avec filtre de type) à réutiliser pour l'import `.txt`/`.md` sur `/publier`.
- `src/chat/AssistantMessageContent.tsx:59-69` — rendus personnalisés des balises `<thinking>` et `<encouragement>`, dont le gabarit socratique documente l'usage.
- `src/pages/api/completion.ts` — utilisé tel quel par la prévisualisation : le brouillon est passé en `system` dans le body de la requête, rien n'est persisté.
- Module DB/quota de l'étape 3 (ex. `src/utils/db.ts`) — requêtes préparées à compléter pour `quota_bytes_used`, `size_bytes` et l'historisation.

## Tâches
1. Créer `POST /api/prompts` (en-tête `Authorization: Bearer` obligatoire, signature HMAC revérifiée à chaque requête) : si le `name` est libre, création du prompt en version 1 ; ajouter le chemin `PUT` de mise à jour : si le prompt existe et que `author_email` du jeton correspond, copier l'ancienne version dans `prompt_versions` puis incrémenter `version` ; sinon 403. Appliquer un rate-limit de 10 écritures/jour par compte.
2. Appliquer les quotas côté serveur : `body` ≤ 256 Ko (262 144 octets) et cumul de `size_bytes` par promptagogue ≤ 1 Mo ; en cas de dépassement, répondre 413 avec un code d'erreur stable et clair (ex. `ERR_PROMPT_TOO_LARGE`, `ERR_QUOTA_EXCEEDED`) ; tenir à jour `quota_bytes_used` dans `promptagogues`.
3. Créer la page `/publier` : afficher le bloc de vérification email de l'étape 6 tant qu'aucun jeton valide n'est présent ; sinon, formulaire de publication (nom propre avec vérification de disponibilité en direct, langue, description, corps) ; import `.txt`/`.md` par drag-and-drop en réutilisant le pattern react-dropzone de `src/chatSidebar/ChatSidebar.tsx:18-42` ; afficher les quotas restants du compte.
4. Pré-remplir le corps avec un gabarit socratique (rôle du tuteur, règles « ne jamais donner la réponse », usage documenté des balises `<thinking>`/`<encouragement>` déjà rendues par l'interface) — le promptagogue ne part pas d'une page blanche.
5. Ajouter la prévisualisation « tester avant de publier » : un chat qui envoie le brouillon comme prompt `system` dans le body de `/api/completion`, sans aucune persistance.
6. Créer la page `/p/[name]` : texte du prompt affiché en TEXTE BRUT échappé (jamais interprété), métadonnées, liste des versions, boutons « essayer » et « modifier » (ce dernier visible seulement si le visiteur est l'auteur).

## Livrables
- `POST`/`PUT /api/prompts` avec quotas appliqués
- Pages `/publier` et `/p/[name]`
- Gabarit socratique + prévisualisation

## Vérification
- [ ] Parcours complet dans un navigateur vierge : vérification email → gabarit pré-rempli → test en prévisualisation → publication → le prompt est visible sur l'accueil en version 1.
- [ ] Republication avec le même nom depuis le même email → version 2, l'ancienne version est historisée dans `prompt_versions`.
- [ ] Tentative de mise à jour du même nom depuis un autre email → 403.
- [ ] Envoi d'un fichier de 300 Ko → 413 avec code d'erreur clair.
- [ ] Publications successives dépassant 1 Mo cumulé pour un même compte → 413.

## Prompt à copier-coller dans Claude Code
```text
Contexte : EduChat est un chatbot éducatif Next.js 14 (pages-router, TypeScript, Tailwind), développé par un enseignant seul assisté par IA, hébergé sur un VPS OVH (Apache en reverse proxy + service systemd, mono-instance Node). Nous migrons le site vers une plateforme de « tuteurs » publiés par des promptagogues. Décisions d'architecture déjà tranchées et NON négociables : base SQLite via better-sqlite3 (synchro, requêtes préparées) dans DATA_DIR hors racine web (tables promptagogues, prompts, prompt_versions) ; écritures protégées par un jeton HMAC-SHA256 (module crypto natif, payload {name, email, exp} signé avec SECRET_TOKEN_KEY) stocké en localStorage 'promptagogue-token', SANS cookie, signature revérifiée serveur à CHAQUE requête ; les API renvoient des CODES d'erreur stables ({error:'ERR_...'}) traduits côté client.

Commence par lire : planning/00-analyse-existant.md, planning/decisions-techniques.md, puis les fiches des étapes 3, 5 et 6 (planning/03-*.md, planning/05-*.md, planning/06-*.md) dont cette étape dépend. Objectif de l'étape 7 : un promptagogue vérifié publie ou met à jour un tuteur en moins de 5 minutes.

Tâches :
1. Crée src/pages/api/prompts.ts. POST (Authorization: Bearer obligatoire, jeton HMAC revérifié) : si name libre → création en version 1. PUT : si le prompt existe et que author_email correspond à l'email du jeton → copie de l'ancienne version dans prompt_versions puis version+1 ; sinon 403. Rate-limit : 10 écritures/jour par compte.
2. Quotas serveur dans ce même endpoint : body ≤ 262144 octets et cumul size_bytes par promptagogue ≤ 1 Mo → réponse 413 avec code d'erreur clair (ERR_PROMPT_TOO_LARGE / ERR_QUOTA_EXCEEDED) ; mets à jour quota_bytes_used dans promptagogues.
3. Crée src/pages/publier.tsx : si pas de jeton valide en localStorage, affiche le bloc de vérification email de l'étape 6 ; sinon formulaire (nom avec vérification de disponibilité en direct, langue, description, corps), import .txt/.md par drag-and-drop en réutilisant le pattern react-dropzone de src/chatSidebar/ChatSidebar.tsx:18-42, et affichage des quotas restants.
4. Pré-remplis le corps avec un gabarit socratique : rôle du tuteur, règles « ne jamais donner la réponse », usage documenté des balises <thinking>/<encouragement> (déjà rendues par src/chat/AssistantMessageContent.tsx:59-69).
5. Ajoute une prévisualisation « tester avant de publier » : chat qui passe le brouillon en system dans le body envoyé à /api/completion, sans aucune persistance.
6. Crée src/pages/p/[name].tsx : corps du prompt affiché en TEXTE BRUT échappé (jamais interprété en HTML/Markdown), métadonnées, liste des versions, boutons « essayer » et « modifier » (si le jeton correspond à l'auteur).

Critères d'acceptation (à vérifier toi-même) : parcours navigateur vierge email vérifié → gabarit → prévisualisation → publication → visible sur l'accueil en v1 ; republication même nom/même email → v2 avec v1 historisée ; autre email → 403 ; fichier 300 Ko → 413 ; cumul > 1 Mo → 413.

Termine par : yarn build sans erreur, vérification manuelle du comportement ci-dessus, puis un commit git avec un message descriptif en français. INTERDIT de commiter .env, secret.txt, data/ ou tout secret ; vérifie le git status avant de commiter.
```
