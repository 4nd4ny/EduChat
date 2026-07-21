# Analyse du site EduChat existant

*Cartographie réalisée le 18 juillet 2026 sur l'état du working tree (gros refactor multi-fournisseurs non encore commité — désormais dans la PR « Refactorisation multi-fournisseurs du chat »).*

## Vue d'ensemble

EduChat est une application **Next.js 14 (pages router)** en TypeScript/Tailwind. Il n'y a **aucune base de données** : tout l'état utilisateur vit dans le navigateur, et l'état serveur tient dans trois fichiers JSON/texte à la racine du process.

> ⚠️ **Correctif du 21 juillet 2026 — le dossier `conf/` est LEGACY.** Il décrit un VPS **Fedora** avec Apache en reverse proxy et un service systemd. Le serveur cible réel (`91.134.241.141`) est un **Debian 12 sous Docker**, hébergeant déjà Decidim, Kasm Workspaces, Portainer et un **Nginx Proxy Manager** propriétaire des ports 80/443. Voir la décision 11 de [decisions-techniques.md](decisions-techniques.md) et l'[étape 13](13-deploiement-ovh.md). Toutes les mentions d'Apache, de systemd et de `/var/www/html` ci-dessous concernent l'ancienne machine.

Arborescence utile :

- `src/pages/` — 5 pages (`index`, `chat/[id]`, `police`, `rgpd`, `_app`) + 3 routes API (`auth`, `ip`, `completion`)
- `src/chat/` — UI du chat (saisie, messages, rendu markdown/KaTeX, placeholder d'accueil)
- `src/chatSidebar/` — historique des conversations (liste, renommage, export, import)
- `src/context/` — `AnthropicProvider` (contexte global du chat, malgré son nom il gère 6 fournisseurs), `History` (localStorage), `Layout`, `ProtectedPage`
- `src/utils/` — env, formatage tokens, **code mort** (`Anthropic/`, `OpenAI/`, `AIProviderManager`, `OpenAIProvider`)
- `conf/` — configuration serveur versionnée (Apache, systemd, cron, gabarit `.env`, `pwd_crypt.py`)

## Ce qui existe déjà et recoupe la demande

| Exigence demandée | État actuel |
|---|---|
| Mot de passe prof qui déverrouille le site | ✅ **Existe** — `api/auth.ts` : liste de hashs bcrypt (`SECRET_PASSWD`), la durée de déverrouillage en minutes est encodée en suffixe du mot de passe (`motdepasse90` = 90 min) |
| IPs d'établissements codées en dur | ✅ **Existe** — `SECRET_ALLOWED_IPS`, auto-login 30 min depuis ces IPs (`auth.ts:260-265`) |
| Tranches horaires prédéfinies | ✅ **Existe** — `SECRET_ALLOWED_HOURS` (JSON `{day,start,end}`), fuseau `SET_TIME_ZONE`, luxon (`auth.ts:215-243`) |
| Sans login ni mot de passe pour les élèves | ✅ **Existe** — déverrouillage **global** du site via `auth_lock.json`, aucun cookie ni session (revendiqué dans `/rgpd`) |
| Export JSON + markdown des conversations | ✅ **Existe** — `Conversation.tsx:72-99` (double téléchargement `.md` + `.json`) |
| Import dans un autre navigateur | ✅ **Existe** — drag-and-drop JSON dans la sidebar (`ChatSidebar.tsx:18-42`) |
| Conversations en mémoire navigateur | ✅ **Existe** — localStorage `pg-history` (`History.tsx:4`) |
| Clés API privées jamais sur le serveur | ✅ **Existe** — champ « Clé personnelle » en state React volatile, jamais persisté ; clés serveur `SECRET_*` en variables d'env |
| Multi-fournisseurs / modèles frontières | ✅ **Existe** — `api/completion.ts` : 6 fournisseurs (Anthropic, OpenAI, Gemini, OpenRouter, Grok, Mistral), niveaux de raisonnement, recherche web |
| Affichage du quota de tokens | ⚠️ **À moitié** — l'API renvoie `tokenUsage`, `Layout.tsx` sait afficher un total (`localStorage 'totalTokens'`)… mais **rien ne relie les deux** : le compteur n'est jamais alimenté |
| Prompt système (socratique) | ❌ **Rien d'actif** — la constante `SystemPrompt` (`env.ts:6`) est du code mort ; `completion.ts` n'envoie **aucun** champ `system`. Vestige intéressant : le rendu gère déjà des balises pédagogiques `<thinking>` et `<encouragement>` (`AssistantMessageContent.tsx:59-76`) |
| Base de données de prompts, comptes promptagogues, page d'accueil catalogue, favoris, ranking, quotas d'upload, admin, emails | ❌ **Tout à créer** |
| Interface multilingue fr/en/it/de | ❌ **Rien** — pas de `next.config.js`, aucune lib i18n, toutes les chaînes en dur (majoritairement français, quelques restes anglais) |

## Architecture d'authentification actuelle (à bien comprendre)

Le modèle est un **verrou global anonyme**, pas des comptes : un POST `/api/auth` avec un bon mot de passe (ou une visite depuis une IP autorisée en plage horaire) écrit `auth_lock.json` côté serveur, et **tout visiteur** est alors autorisé pendant N minutes. C'est un choix RGPD assumé (aucune donnée individuelle). Il y a un anti-bruteforce (5 essais / 15 min par IP, `failed_attempts.json` + proper-lockfile) et un journal `auth_log.txt`.

Les nouveaux comptes « promptagogues » devront donc être un **second circuit indépendant**, sans toucher au circuit élève/prof.

## Failles et pièges découverts (à traiter dans le plan)

1. **`/api/completion` est un proxy ouvert** : runtime edge, aucune vérification du verrou d'auth — quiconque atteint l'endpoint consomme les clés serveur des 6 fournisseurs. **Priorité absolue** (étape 2).
2. **XSS potentiel** : `rehypeRaw` + `dangerouslySetInnerHTML` rendent tel quel le HTML émis par le modèle (`AssistantMessageContent.tsx:198-208`). Inacceptable dès que des prompts tiers sont publiés (étape 3).
3. **`auth_log.txt` journalise les mots de passe erronés en clair** (`auth.ts:51, 311`) — à corriger et purger (étape 1).
4. **Durée de déverrouillage non bornée** (suffixe `99999` accepté).
5. **La page `/rgpd` promet publiquement « aucune donnée serveur, pas de cookies »** — stocker noms/emails de promptagogues sans réécrire cette page exposerait juridiquement l'école (étape 12).
6. **Le cron `log_to_web.sh` publie chaque minute le tail du log Apache sur le web** (`/ip-direct/educh-at.log`) : tout secret passé en GET (futur code de vérification email !) y fuiterait. Règle d'or du projet : **jamais de secret en query string**.
7. **Deux VirtualHost `*:443` concurrents** (`educh.at.conf` avec proxy, `ssl.conf` sans proxy servant `/var/www/html` avec `Options Indexes`) : une base de données posée sous la racine web serait téléchargeable. La future base **doit** vivre hors `/var/www/html` (variable `DATA_DIR`).
8. **Code mort trompeur** : `src/utils/Anthropic/*`, `src/utils/OpenAI/*`, `AIProviderManager`, `OpenAIProvider` ne sont plus le flux réel (c'est `AnthropicProvider` → `/api/completion`). Risque de brancher une évolution sur du code non exécuté (nettoyage à l'étape 1).
9. **Compteur de tokens cassé en 3 morceaux** : serveur calcule → client ignore → affichage lit une clé jamais écrite (étape 2 le reconnecte).
10. **Divers** : `ChatSidebar` monté deux fois sur `/chat/[id]` ; `createdAt` écrasé à chaque sauvegarde (tri faussé) ; `pwd_crypt.py` écrit `AUTH_PASSWORD_HASH` alors que le serveur lit `SECRET_PASSWD` ; import JSON sans validation ; le dépôt vit dans Dropbox (attention à la synchro de `.env` et des futures données).

## Stockage actuel — récapitulatif

| Où | Quoi |
|---|---|
| localStorage `pg-history` | Toutes les conversations `{name, createdAt, lastMessage, messages[]}` |
| localStorage `totalTokens` | Compteur de tokens (lu mais jamais écrit — orphelin) |
| State React volatile | Clé API personnelle, fournisseur, modèle, niveau de raisonnement |
| Serveur `auth_lock.json` | Fin du déverrouillage global `{timestamp}` |
| Serveur `failed_attempts.json` | Anti-bruteforce par IP |
| Serveur `auth_log.txt` | Journal des tentatives (⚠️ mots de passe en clair) |
| Variables d'env `.env` | Hashs des mots de passe prof, clés API des 6 fournisseurs, IPs, horaires, fuseau |
