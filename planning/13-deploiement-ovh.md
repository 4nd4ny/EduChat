# Étape 13 — Déploiement Docker, Nginx Proxy Manager, DNS et recette v1

**Dépend de :** Étape 11, Étape 12 · **Estimation :** 1-2 sessions (+ actions manuelles OVH et NPM)

## Objectif
Mettre EduChat en production sur le serveur Harmonia `91.134.241.141` sous forme de **conteneur Docker** routé par le **Nginx Proxy Manager** déjà en place, basculer le DNS d'`educh.at`, puis valider la totalité du **palier v1** (étapes 1-12) en conditions réelles — les étapes 14 et 15 sont des incréments post-v1. Contrainte dominante : cette machine héberge **d'autres services en production**, le déploiement doit être strictement **additif**.

## ⚠️ État réel du serveur (relevé le 21 juillet 2026)

Le dossier `conf/` du dépôt (Apache, systemd, `/var/www/html`, Fedora, utilisateur `fedora`) décrit **l'ANCIEN serveur** et ne s'applique plus à la cible. Ne pas s'y fier.

La machine cible est un **Debian 12** exécutant **23 conteneurs** :

| Service | Rôle |
|---|---|
| **Nginx Proxy Manager** | Détient les ports 80/443, TLS Let's Encrypt, admin sur `127.0.0.1:81` |
| **Decidim** prod + sandbox | Plateforme Harmonia, en service |
| **Kasm Workspaces** | ~10 conteneurs (VDI) |
| **Portainer** | Gestion Docker, `127.0.0.1:9443` |

- Réseau partagé : **`proxy-network`** (y sont déjà `nginx-proxy-manager`, `decidim-app-1`, `decidim_sandbox-app-1`).
- Projets compose : `/home/debian/docker-home/`.
- **Disque à 89 %** (22 Go libres sur 197) — Docker y détient ~84 Go récupérables.
- **Aucun Apache ni nginx sur l'hôte** : tout passe par des conteneurs.

## Contexte et fichiers concernés
- `Dockerfile` — image multi-étapes, base `node:20-slim` (bcrypt est un module natif), sortie Next.js `standalone`.
- `next.config.js` — `output: 'standalone'` (+ bloc i18n activé à l'étape 10).
- `docker-compose.yml` — service `educhat` sur `proxy-network`, **sans publication de port**, volume `educhat-data:/data`, `mem_limit`, rotation des logs.
- `.dockerignore` — exclut `.env`, `secret.txt`, `data/`, `node_modules/`, `.next/`.
- `.env` — **créé à la main sur le serveur uniquement**, permissions `600`, jamais commité.
- `src/pages/api/auth.ts` — écrit encore dans `process.cwd()` : la refactorisation `DATA_DIR` (étapes 1 et 4) est un **prérequis bloquant**, sinon toutes les données sont perdues à chaque redéploiement.
- `conf/` — **legacy** : à archiver ; ne décrit plus la production.
- `README.md` — accueillera le runbook d'exploitation.

## Tâches
1. **Prérequis bloquants** : `DATA_DIR` effectif partout (plus aucun `process.cwd()` dans `src/`), `/api/completion` authentifié (étape 2), `/rgpd` réécrite (étape 12). Sans ces trois points, pas de mise en ligne publique.
2. **Espace disque** : décider avec Stéphane d'un nettoyage (`docker builder prune` libère ~9 Go sans risque ; images inutilisées ~74 Go de plus). **Ne rien supprimer unilatéralement** sur une machine partagée.
3. **Transfert du code** : `git clone` dans `/home/debian/docker-home/educhat/` (convention des autres projets).
4. **Créer le `.env` sur le serveur** (`chmod 600`) : hash bcrypt du mot de passe prof « gabbagabbahey » (**conservé tel quel**, choix assumé du client, généré par `conf/pwd_crypt.py`), les clés API des 6 fournisseurs, `SECRET_SMTP_*`, `SECRET_ADMIN_EMAILS`, `SECRET_TOKEN_KEY`, `SECRET_ALLOWED_IPS` / `SECRET_ALLOWED_HOURS` (amorçage/secours — la résolution IP → établissement se fait en base, étape 9), `SECRET_MAX_UNLOCK_MINUTES` (défaut 600), `DATA_DIR=/data`.
5. **Construire et démarrer** : `docker compose up -d --build`, puis `docker compose logs -f` ; vérifier `docker ps` et l'appartenance à `proxy-network`.
6. **Test interne AVANT exposition** : depuis un conteneur du réseau, `curl http://educhat:3000` doit répondre. Rien n'est public à ce stade.
7. **Basculer le DNS** chez OVH : enregistrement A d'`educh.at` (et `www`) vers `91.134.241.141`, TTL abaissé à 300 s au préalable, suppression de tout AAAA pointant vers l'ancienne machine.
8. **Créer le Proxy Host dans NPM** (action manuelle de l'utilisateur, via tunnel SSH) : `educh.at` + `www.educh.at` → `http://educhat:3000`, puis certificat Let's Encrypt **une fois le DNS propagé** (la validation l'exige).
9. **Sauvegardes** : intégrer le volume `educhat-data` au dispositif existant (le serveur exécute déjà `postgres-backup-local` pour Decidim) + copie hors VPS.
10. **Décommissionner l'ancien serveur** : une fois `educh.at` servi par la nouvelle machine et validé, décider avec Stéphane du sort du VPS Fedora (arrêt, ou conservation en secours). Y supprimer le journal public abandonné (crontab root `log_to_web.sh`, `/var/www/html/ip-direct/`) s'il tourne encore. Archiver `conf/` dans le dépôt.
11. **Recette fonctionnelle complète** : auto-login depuis une IP école en plage horaire / verrou hors plage / mot de passe prof à durée configurable ; cycle complet d'un prompt (`draft` + URL secrète → `pending` → approbation → `published`) ; chat socratique dans les 4 langues ; export/import de profil inter-navigateurs ; suppression par un admin ; restauration RÉELLE d'un backup SQLite sur une copie ; `curl` externe de `/api/completion` sans déverrouillage → 401.
12. **Runbook dans le README** : sauvegarde/restauration, mise à jour (`git pull && docker compose up -d --build`), ajout d'un admin, gestion d'un établissement (IPs, quota, clé active), rotation de `SECRET_TOKEN_KEY`, procédure de retour arrière.

## Livrables
- Conteneur `educhat` en service, routé en HTTPS par NPM, sans impact sur Decidim ni Kasm.
- `educh.at` résolvant vers `91.134.241.141` avec un certificat à son nom.
- Volume `educhat-data` sauvegardé (dont une copie hors VPS).
- Dépôt nettoyé de la configuration serveur obsolète, runbook rédigé.

## Vérification
- `https://educh.at` répond avec un certificat **au nom d'`educh.at`** (et non plus celui d'`andany.info`).
- `docker ps` : `educhat` en `Up`, **aucun port publié sur l'hôte**.
- **Decidim et Kasm restent joignables et sains** pendant et après le déploiement.
- Le **déverrouillage par mot de passe fonctionne dans le conteneur** — preuve que le binaire natif de bcrypt a bien été embarqué par le traçage de Next.js.
- Après `docker compose down && docker compose up -d`, la base SQLite et les compteurs d'authentification **survivent** (le volume fonctionne).
- `df -h /` n'a pas franchi 95 %.
- `curl https://educh.at/api/completion` sans déverrouillage → 401.
- Recette des 4 parcours (élève, prof, promptagogue, admin) complète dans les 4 langues.

## Prompt à copier-coller dans Claude Code
```text
Contexte : EduChat est un chatbot éducatif Next.js 14 (pages-router, TypeScript), développé par un enseignant seul assisté par IA. Je réalise l'étape 13 : mise en production du palier v1.

Commence par lire planning/00-analyse-existant.md, planning/decisions-techniques.md, les fiches des étapes 11 et 12, puis planning/13-deploiement-ovh.md en entier.

ARCHITECTURE RÉELLE (vérifiée sur la machine — ne PAS se fier au dossier conf/ du dépôt, qui décrit l'ANCIEN serveur Fedora/Apache et n'est plus valable) :
- Cible : Debian 12 à 91.134.241.141, accès SSH par l'alias `educhat` (utilisateur debian).
- La machine héberge DÉJÀ en production : Decidim (prod + sandbox), Kasm Workspaces, Portainer. Tout déploiement doit être strictement ADDITIF : ne jamais toucher à leurs conteneurs, réseaux, volumes ou configurations.
- Les ports 80/443 appartiennent à Nginx Proxy Manager (projet compose dans /home/debian/docker-home/nginx-proxy-manager, admin sur 127.0.0.1:81).
- Le conteneur educhat ne publie AUCUN port : il rejoint le réseau externe `proxy-network` et NPM le joint par son nom d'hôte, exactement comme decidim-app-1.
- Disque à 89 % : ne lance AUCUN nettoyage Docker sans accord explicite de l'utilisateur ET de Stéphane, l'administrateur du serveur.

Les fichiers Dockerfile, next.config.js, docker-compose.yml et .dockerignore existent déjà à la racine du dépôt : relis-les avant toute modification.

Tâches :
1. Vérifie les prérequis bloquants : plus aucun process.cwd() dans src/ (DATA_DIR effectif, étapes 1 et 4), /api/completion authentifié (étape 2), page /rgpd à jour (étape 12). Si l'un manque, ARRÊTE-TOI et signale-le.
2. Prépare la procédure de déploiement : clone dans /home/debian/docker-home/educhat/, création du .env sur le serveur en permissions 600 (jamais commité, jamais affiché), puis docker compose up -d --build.
3. Avant toute exposition publique, teste en interne : depuis un conteneur de proxy-network, curl http://educhat:3000 doit répondre.
4. Rédige pour l'utilisateur la marche à suivre MANUELLE qu'il exécutera lui-même : bascule DNS chez OVH (A vers 91.134.241.141, TTL 300, suppression des AAAA obsolètes) PUIS création du Proxy Host dans NPM avec certificat Let's Encrypt — dans cet ordre, la validation du certificat exigeant que le DNS soit déjà propagé.
5. Intègre le volume educhat-data aux sauvegardes et documente une copie hors VPS.
6. Archive le dossier conf/ (obsolète) et écris le runbook dans le README : mise à jour, sauvegarde/restauration, ajout d'un admin, gestion d'un établissement, rotation de SECRET_TOKEN_KEY, retour arrière.
7. Déroule la recette : verrou/déverrouillage, cycle complet d'un prompt (draft + URL secrète → pending → publié), chat socratique dans les 4 langues, export/import inter-navigateurs, suppression admin, restauration réelle d'un backup, curl externe de /api/completion → 401.

Critères d'acceptation : https://educh.at répond avec un certificat à son nom ; docker ps montre educhat en Up sans port publié ; Decidim et Kasm intacts ; le déverrouillage par mot de passe fonctionne dans le conteneur (preuve que bcrypt natif est embarqué) ; après docker compose down puis up -d, la base SQLite et les compteurs d'auth survivent ; df -h / sous 95 %.

RÈGLE ABSOLUE : toute commande destructive ou affectant un service tiers (docker system prune, redémarrage ou modification de NPM, de Decidim, de Kasm) doit être proposée à l'utilisateur et attendre son accord explicite. Ne commite jamais .env, secret.txt ni data/. Termine par yarn build, la vérification manuelle, puis un commit git avec un message descriptif en français.
```
