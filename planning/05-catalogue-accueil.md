# Étape 5 — API prompts (lecture + vote) et page d'accueil catalogue triable

**Dépend de :** Étape 4 — Base SQLite et modèle de données · **Estimation :** 1-2 sessions

## Objectif

Transformer la page d'accueil — aujourd'hui quasi vide (`src/pages/index.tsx` se contente de rendre `<ChatMessages />`) — en catalogue public des tuteurs socratiques, alimenté par de nouveaux endpoints GET en lecture seule sur la base SQLite de l'étape 4. Le catalogue est triable colonne par colonne selon les données de l'exigence 3-4 (usage, jetons, fraîcheur, ranking calculé) et propose des favoris purement locaux au navigateur (exigence 5, v1 tranchée : ranking serveur calculé, pas de vote humain). Au passage, la vitrine devient réellement publique : logos rapatriés en local, mention obsolète « O1 » retirée, et le verrou d'accès ne protège plus que le chat lui-même.

## Contexte et fichiers concernés

- `src/pages/index.tsx` (9 lignes, rend uniquement `ChatMessages`) — le point d'extension identifié par la cartographie ; à refondre entièrement en page catalogue.
- `src/pages/api/prompts/index.ts` (à créer) — endpoint GET de liste publique des prompts, runtime Node, requêtes SQL via le module d'accès de l'étape 4.
- `src/pages/api/prompts/[name].ts` (à créer) — GET détail + historique de versions ; squelettes POST/PUT/DELETE renvoyant 401 (le contrat est posé, l'authentification Bearer arrive à l'étape 7).
- `src/server/db.ts` (créé à l'étape 4) — accès better-sqlite3 à `DATA_DIR/educhat.db` ; les nouvelles requêtes s'y appuient.
- `src/server/promptName.ts` (à créer) — validation du nom de prompt (charset, longueur, unicité, noms réservés), utilisée dès maintenant par le contrat d'API puis par l'étape 7.
- `src/chat/ChatPlaceholder.tsx:52-61` — deux `<img>` pointant vers `https://chamblandes.education/*.png` (dépendance réseau externe à supprimer) ; ligne 13, mention obsolète « Claude et O1 pour l'enseignement ».
- `public/logo.png` et `public/regular-logo.png` — déjà présents dans le dépôt ; serviront de sources locales aux deux images.
- `src/context/Layout.tsx:20` — `isProtected` n'exclut aujourd'hui que `/rgpd` et `/police` ; à étendre pour rendre publics le catalogue et les pages de publication/vérification.

## Tâches

1. Créer `GET /api/prompts` (runtime Node) : liste publique `{name, author_name, language, description, created_at, version, ranking, usage_count, tokens_total}`, où `ranking` est calculé côté serveur (usage + fraîcheur) ; paramètres `?sort=&dir=&language=` traduits en SQL (liste blanche de colonnes, jamais d'interpolation directe).
2. Créer `GET /api/prompts/[name]` : détail d'un prompt + historique de ses versions (`prompt_versions`) ; sur la même route, squelettes POST/PUT/DELETE qui renvoient 401 — le contrat est posé, l'auth réelle vient à l'étape 7.
3. Implémenter la validation du nom de prompt : unicité insensible à la casse et aux accents, charset lettres/chiffres/tirets, longueur 3-64, liste de noms réservés (`admin`, `api`, `verifier`, `publier`, …).
4. Refondre `src/pages/index.tsx` : cartes ou tableau triable par en-têtes cliquables (deux sens), recherche simple sur nom/description, filtre par langue, bouton « Démarrer avec ce tuteur », lien discret « chat libre sans tuteur ».
5. Ajouter les favoris locaux : clé localStorage `prompt-favorites`, étoile sur chaque carte, tri « favoris d'abord ».
6. Remplacer la vitrine `ChatPlaceholder` : pointer les deux `<img>` (`ChatPlaceholder.tsx:52-61`) vers les logos locaux de `public/` (suppression de la dépendance `https://chamblandes.education`) et retirer la mention obsolète « O1 ».
7. Étendre `isProtected` (`Layout.tsx:20`) : `/` (catalogue), `/p/[name]`, `/publier`, `/verifier` deviennent publics — le chat reste derrière le verrou (à confirmer, question client n° 3).

## Livrables

- Endpoints `GET /api/prompts*`
- Accueil catalogue triable + favoris
- Assets locaux, vitrine publique

## Vérification

- Chaque colonne du catalogue trie dans les deux sens sur les données de seed (étape 4).
- L'étoile de favori survit à un rechargement de page ; une fenêtre de navigation privée n'affiche aucun favori.
- Le catalogue est visible sans déverrouillage, mais envoyer un message dans le chat mène à l'écran mot de passe.
- Aucune requête réseau sortante vers `chamblandes.education` (onglet Réseau vide de ce domaine).

## Prompt à copier-coller dans Claude Code

```text
Contexte : tu travailles sur EduChat, un chatbot éducatif Next.js 14 en pages-router (TypeScript, yarn), hébergé sur un VPS OVH derrière Apache (reverse proxy) avec un service systemd. Le projet est développé par un enseignant seul assisté par IA : privilégie les solutions simples, sans nouvelle dépendance. Le site migre vers une plateforme de « tuteurs socratiques » publiés par des promptagogues.

Commence par lire, dans l'ordre : planning/00-analyse-existant.md, planning/decisions-techniques.md, puis la fiche de l'étape 4 (planning/04-*.md, base SQLite), dont cette étape dépend, et enfin planning/05-catalogue-accueil.md (cette étape).

Décisions d'architecture à respecter impérativement :
- Persistance : SQLite via better-sqlite3 (synchrone), fichier DATA_DIR/educhat.db hors racine web, accès via src/server/db.ts créé à l'étape 4. Routes API en runtime Node (pas edge).
- Ranking v1 : calculé côté serveur à partir de usage_count, tokens_total et de la fraîcheur (created_at/updated_at). Aucun vote humain, aucun endpoint de vote.
- Favoris : purement localStorage (clé 'prompt-favorites', tableau de noms). Zéro donnée serveur, zéro cookie.
- Les API renvoient des codes d'erreur stables ({error:'ERR_...'}), jamais de messages en français en dur.

Tâches :
1. Crée src/pages/api/prompts/index.ts : GET renvoyant la liste publique des prompts publiés {name, author_name, language, description, created_at, version, ranking, usage_count, tokens_total}. Paramètres ?sort=&dir=&language= traduits en SQL avec liste blanche stricte des colonnes triables et de dir (asc/desc) — aucune interpolation de valeur utilisateur dans la requête.
2. Crée src/pages/api/prompts/[name].ts : GET = détail + historique des versions (table prompt_versions) ; POST/PUT/DELETE = squelettes renvoyant 401 {error:'ERR_UNAUTHORIZED'} (l'auth Bearer arrive à l'étape 7).
3. Crée src/server/promptName.ts : validation du nom — 3 à 64 caractères, lettres/chiffres/tirets, unicité insensible à la casse et aux accents, liste de noms réservés (admin, api, verifier, publier, chat, rgpd, police, p, data). Exporte la fonction et la liste ; branche l'unicité sur la base.
4. Refonds src/pages/index.tsx (aujourd'hui il rend seulement <ChatMessages />) : catalogue en cartes ou tableau, en-têtes cliquables triant dans les deux sens (via l'API), champ de recherche nom/description, filtre langue, bouton « Démarrer avec ce tuteur » et lien discret « chat libre sans tuteur » vers le chat existant.
5. Favoris : étoile sur chaque carte, persistée dans localStorage 'prompt-favorites', tri « favoris d'abord ».
6. Dans src/chat/ChatPlaceholder.tsx, remplace les deux src distantes https://chamblandes.education/... (lignes ~52-61) par /logo.png et /regular-logo.png — ces fichiers existent déjà dans public/ — et retire la mention « O1 » (ligne ~13).
7. Dans src/context/Layout.tsx (ligne ~20), étends isProtected : '/', '/p/[name]', '/publier', '/verifier' publics ; le chat reste protégé.

Critères d'acceptation : chaque colonne trie dans les deux sens sur le seed ; l'étoile survit au rechargement et une fenêtre privée n'a aucun favori ; le catalogue est visible sans déverrouillage mais envoyer un message mène à l'écran mot de passe ; aucune requête réseau vers chamblandes.education.

Termine par : yarn build sans erreur, vérification manuelle du comportement (yarn dev, tris, favoris, verrou du chat, onglet Réseau), puis un commit git avec un message descriptif en français. Interdiction absolue de commiter .env, secret.txt, data/ ou tout secret, et n'ouvre jamais secret.txt.
```
