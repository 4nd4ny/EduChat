# Étape 2 — Verrouiller /api/completion (edge→Node) et reconnecter le compteur de tokens

**Dépend de :** Étape 1 · **Estimation :** 1 session

## Objectif
Fermer le trou de sécurité n°1 : `/api/completion` est aujourd'hui accessible sans aucune authentification et consomme les clés API payées par le serveur (exigences 10 et 15 côté serveur). Pour vérifier l'état de déverrouillage (`auth_lock.json`) avant de dépenser les clés, l'endpoint doit passer du runtime edge au runtime Node — ce qui est de toute façon requis par la décision SQLite pour la suite. En parallèle, réparer la chaîne du compteur de tokens, aujourd'hui cassée en trois morceaux : le serveur calcule `tokenUsage` mais le client le jette, alors que tout l'affichage (Layout, formatTokens) existe déjà (exigence 14).

## Contexte et fichiers concernés
- `src/pages/api/completion.ts` — l'endpoint de complétion multi-fournisseurs ; `runtime: "edge"` déclaré à la ligne 5, `defaults` des modèles dupliqués aux lignes 7-14, messages d'erreur français en dur. À convertir en Node et à protéger.
- `src/pages/api/auth.ts` — contient déjà tout le nécessaire : pattern `failed_attempts.json` + proper-lockfile (l.80-173), vérification des tranches horaires `isAccessAllowed()` (l.215-243), vérification IP. À factoriser, pas à réécrire.
- `src/server/access.ts` (à créer) — module partagé de contrôle d'accès extrait de auth.ts, importé par auth.ts et completion.ts.
- `src/pages/api/ip.ts` — duplique la lecture de `SECRET_ALLOWED_IPS` sans passer par la validation d'`env.ts` ; à re-brancher sur `src/utils/env.ts`.
- `src/context/AnthropicProvider.tsx` — `providerDefaults` dupliqués (l.10-17) ; `send()` (l.79-80) reçoit la réponse mais ignore `data.tokenUsage`.
- `src/shared/providers.ts` (à créer) — source unique des fournisseurs/modèles par défaut, partagée client/serveur.
- `src/context/Layout.tsx` (l.26-36 et 65) et `src/utils/formatTokens.ts` — affichage du total de tokens déjà implémenté (titre d'onglet), écoute l'événement `totalTokensUpdated`.
- `src/chat/ChatInput.tsx` ou sidebar — emplacement pour rendre le compteur visible dans l'UI.

## Tâches
1. Convertir `src/pages/api/completion.ts` du runtime edge (l.5) au runtime Node (`NextApiRequest`/`NextApiResponse`) ; tester les longues complétions avec reasoning « high » derrière Apache et ajuster le `ProxyTimeout` si nécessaire.
2. Extraire de `auth.ts` un module partagé `src/server/access.ts` exposant `checkAuthLock()` (lecture de `auth_lock.json`), `isAccessAllowed()` (tranches horaires, auth.ts:215-243) et la vérification IP (`AllowedIps`) ; faire importer ce module par `auth.ts` et `completion.ts` ; re-brancher aussi `src/pages/api/ip.ts` sur `env.ts` (duplication actuelle sans validation).
3. Implémenter la règle d'accès dans `completion.ts` : une `apiKey` personnelle dans le body (BYOK) est toujours permise, sans JAMAIS de repli silencieux sur les clés serveur ; sinon, clés serveur SEULEMENT si `checkAuthLock()` OU (IP autorisée ET plage horaire) ; sinon 401.
4. Ajouter un rate-limiting par IP sur `/api/completion` (ex. 30 requêtes/minute) en réutilisant le pattern `failed_attempts.json` + proper-lockfile (auth.ts:80-173) ; borner la taille du corps à 100 Ko et valider `provider`/`model` contre une liste blanche.
5. Côté client, dans `AnthropicProvider.send` (l.79-80) : lire `data.tokenUsage` (aujourd'hui jeté), cumuler dans `localStorage['totalTokens']` et dispatcher l'événement `totalTokensUpdated` — `Layout.tsx:26-36/65` et `formatTokens.ts` font déjà tout l'affichage.
6. Afficher le compteur de tokens aussi dans l'UI (bandeau dans `ChatInput` ou sidebar), pas seulement dans le titre d'onglet.
7. Unifier les `providerDefaults` dupliqués (`AnthropicProvider.tsx:10-17` vs `completion.ts:7-14`) dans `src/shared/providers.ts` ; remplacer les messages d'erreur français en dur par des CODES d'erreur stables (préparation i18n).

## Livrables
- `/api/completion` en runtime Node, protégé et rate-limité.
- Compteur de tokens fonctionnel de bout en bout et visible dans l'UI.
- `src/server/access.ts` et `src/shared/providers.ts` réutilisables par les étapes suivantes.

## Vérification
- `curl -X POST /api/completion` sans `apiKey` ni site déverrouillé → **401**.
- Site déverrouillé par mot de passe prof → **200**.
- 31e requête dans la même minute depuis la même IP → **429**.
- Avec `apiKey` personnelle (BYOK) et site verrouillé → **200**.
- Le total de tokens croît dans le titre d'onglet ET dans l'UI, et survit à un rechargement de page.

## Prompt à copier-coller dans Claude Code
```text
Tu travailles sur EduChat, un chatbot éducatif Next.js 14 (pages-router, TypeScript, yarn) développé par un enseignant seul assisté par IA, déployé sur un VPS OVH derrière Apache (ProxyPass) avec un service systemd mono-instance. Priorité : simplicité et maintenabilité, pas de nouvelle dépendance sans nécessité.

Commence par lire planning/00-analyse-existant.md, planning/decisions-techniques.md et la fiche de l'étape 1 (planning/01-*.md), dont cette étape dépend. Décisions d'architecture à respecter : /api/completion passe en runtime Node (indispensable pour lire auth_lock.json avant de dépenser les clés serveur, et requis plus tard par SQLite) ; le BYOK (apiKey personnelle envoyée dans le body) reste toujours permis mais ne doit JAMAIS se replier silencieusement sur les clés serveur ; l'état d'auth reste en fichiers JSON (auth_lock.json, failed_attempts.json) avec proper-lockfile — ne pas migrer ; les API renvoient des CODES d'erreur stables ({ error: "ERR_..." }) traduits côté client (préparation i18n), plus de messages français en dur côté serveur.

Tâches, dans l'ordre :
1. Convertis src/pages/api/completion.ts du runtime edge (export const config = { runtime: "edge" }, l.5) en handler Node NextApiRequest/NextApiResponse, en conservant le comportement multi-fournisseurs actuel.
2. Crée src/server/access.ts en extrayant de src/pages/api/auth.ts : checkAuthLock() (lecture auth_lock.json), isAccessAllowed() (tranches horaires, auth.ts:215-243) et la vérification IP AllowedIps. auth.ts et completion.ts importent ce module (zéro duplication). Re-branche aussi src/pages/api/ip.ts sur src/utils/env.ts au lieu de relire process.env.SECRET_ALLOWED_IPS directement.
3. Règle d'accès dans completion.ts : apiKey du body → toujours 200 possible, jamais de repli sur les clés serveur ; sinon clés serveur seulement si checkAuthLock() OU (IP autorisée ET plage horaire) ; sinon 401 avec un code d'erreur.
4. Rate-limiting par IP sur /api/completion (30 req/min) en réutilisant le pattern failed_attempts.json + proper-lockfile (auth.ts:80-173) → 429 au-delà. Borne le corps à 100 Ko et valide provider/model contre une liste blanche.
5. Crée src/shared/providers.ts unifiant les défauts dupliqués (AnthropicProvider.tsx:10-17 et completion.ts:7-14) ; importe-le des deux côtés.
6. Client : dans send() de src/context/AnthropicProvider.tsx (l.79-80), lis data.tokenUsage, cumule dans localStorage "totalTokens" et dispatche l'événement "totalTokensUpdated" (Layout.tsx:26-36/65 et src/utils/formatTokens.ts gèrent déjà l'affichage dans le titre d'onglet). Ajoute aussi un affichage visible du compteur dans l'UI (bandeau ChatInput ou sidebar).

Critères d'acceptation à vérifier toi-même : POST /api/completion sans apiKey ni déverrouillage → 401 ; site déverrouillé par mot de passe prof → 200 ; 31e requête/min même IP → 429 ; apiKey personnelle avec site verrouillé → 200 ; le total de tokens croît dans le titre d'onglet et dans l'UI et survit au rechargement. Note dans la fiche que le ProxyTimeout Apache devra être testé en prod avec une longue complétion reasoning "high".

Termine par : yarn build sans erreur, vérification manuelle des comportements ci-dessus en local, puis un commit git avec un message descriptif en français. Interdiction absolue de commiter .env, secret.txt, data/ ou tout secret ; n'ouvre pas secret.txt.
```
