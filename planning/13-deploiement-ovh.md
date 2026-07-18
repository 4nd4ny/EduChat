# Étape 13 — Déploiement OVH, DNS et recette finale

**Dépend de :** Étape 11, Étape 12 · **Estimation :** 1-2 sessions (+ actions manuelles OVH)

## Objectif
Mettre EduChat en production sur le VPS OVH existant (Apache en proxy inverse + service systemd) et valider la totalité du **palier v1** (étapes 1-12) en conditions réelles — les étapes 14 (espace enseignant) et 15 (sync serveur du profil) sont des incréments post-v1 déployables ensuite. L'étape assainit d'abord la configuration serveur (conflit de VirtualHost, certificat, systemd, .env, crons), supprime côté serveur le journal public de logs abandonné, puis déroule une recette complète des 4 parcours (élève, prof, promptagogue, admin) dans les 4 langues, et livre enfin le runbook d'exploitation pour un enseignant seul.

## Contexte et fichiers concernés
- `conf/educh.at.conf:20-41` — VirtualHost *:443 avec ProxyPass vers `localhost:3000` ; ses lignes 38-39 réutilisent les certificats Let's Encrypt de `andany.info` au lieu d'un certificat propre à `educh.at`.
- `conf/ssl.conf:56-218` — second VirtualHost *:443 SANS proxy, qui sert `/var/www/html` en statique : c'est le conflit à trancher, sinon une partie du trafic contourne Next (et pourrait exposer des fichiers).
- `conf/httpd.conf:149` — `Options Indexes FollowSymLinks` : le listage de répertoires est actif, à désactiver.
- `conf/educh-at.service:7` — `WorkingDirectory=/var/www/html/educh-at/src` alors que `package.json` est à la racine du projet ; c'est aussi le fichier où injecter `Environment=DATA_DIR=/var/lib/educhat` (décision d'architecture : base SQLite hors racine web).
- `conf/(dot)env.txt` — modèle du `.env` de production, à compléter avec toutes les variables `SECRET_*` (dont `SECRET_MAX_UNLOCK_MINUTES`, plafond configurable du déverrouillage prof, défaut 600 min).
- `conf/pwd_crypt.py` — générateur du hash bcrypt du mot de passe prof (corrigé lors d'une étape précédente) ; le mot de passe « gabbagabbahey » est **conservé tel quel** (choix assumé du client, non sensible).
- `conf/var-spool-cron-root.txt` — crontab existante, modèle pour installer les nouveaux crons (backup SQLite, purges) ; la ligne du journal public (`log_to_web.sh` chaque minute) a été retirée du dépôt à l'étape 1, mais reste à supprimer **sur le serveur** (crontab root, `/usr/local/bin/log_to_web.sh`, répertoire public `/var/www/html/ip-direct/`).
- `README.md` — accueillera le runbook d'exploitation.

## Tâches
1. Trancher le conflit des DEUX VirtualHost *:443 : celui de `conf/educh.at.conf:20-41` (avec proxy vers Next) et celui de `conf/ssl.conf:56-218` (sans proxy, servant `/var/www/html` en statique). Neutraliser le vhost sans proxy pour que TOUT le trafic passe par Next, et désactiver `Options Indexes` (`conf/httpd.conf:149`).
2. Émettre un certificat Let's Encrypt couvrant explicitement `educh.at` (aujourd'hui, ce sont les certificats `andany.info` qui sont réutilisés, `conf/educh.at.conf:38-39`).
3. Clarifier le `WorkingDirectory` systemd (`conf/educh-at.service:7` pointe sur `.../src` alors que `package.json` est à la racine) ; vérifier les droits d'écriture de l'utilisateur `fedora` sur `DATA_DIR` ; adapter le `ProxyTimeout` Apache aux longues complétions.
4. Compléter le `.env` de production : hash bcrypt du mot de passe prof « gabbagabbahey » (conservé, généré par `conf/pwd_crypt.py` corrigé), `SECRET_SMTP_*`, `SECRET_ADMIN_EMAILS`, `SECRET_TOKEN_KEY`, `SECRET_ALLOWED_IPS`, `SECRET_ALLOWED_HOURS` (amorçage/secours — la résolution IP → établissement se fait en base, étape 9), `SECRET_MAX_UNLOCK_MINUTES` (défaut 600) ; installer les crons (backup SQLite, purges).
5. Supprimer effectivement côté serveur le journal public de logs (abandonné, retiré du dépôt à l'étape 1) : ligne `log_to_web.sh` de la crontab root, script `/usr/local/bin/log_to_web.sh`, répertoire public `/var/www/html/ip-direct/`.
6. Documenter les actions manuelles côté client : zone DNS OVH → `91.134.241.141` (exigence 17), création de la boîte `noreply@educh.at` — elle n'existe **pas encore** : prérequis bloquant pour le SMTP de l'étape 6 — plus enregistrements SPF/DKIM ; en option (exigence 18), ajout des clés RESPIRE dans le `.env` via le mécanisme multi-clés existant.
7. Dérouler la recette complète : auto-login depuis une IP école (résolue en base établissements, env en secours) en plage horaire / verrou hors plage / mot de passe prof à durée configurable ; cycle complet d'un prompt (`draft` + URL secrète → `pending` → approbation → `published` au catalogue) ; chat socratique dans les 4 langues ; export/import de profil inter-navigateurs ; suppression par un admin ; restauration RÉELLE d'un backup SQLite sur une copie ; `curl` externe de `/api/completion` sans déverrouillage → 401.
8. Rédiger le runbook dans le README : sauvegarde/restauration, ajout d'un admin, gestion d'un établissement (IPs, quota, clé active), procédure de changement du mot de passe prof (si souhaité un jour) et rotation de `SECRET_TOKEN_KEY`.

## Livrables
- Production fonctionnelle sur educh.at (palier v1, étapes 1-12)
- Journal public de logs supprimé du serveur, boîte `noreply@educh.at` opérationnelle (SPF/DKIM)
- Checklist de recette passée à 100 %
- Runbook d'exploitation

## Vérification
- Reboot du VPS → le service repart seul, avec la base de données intacte.
- Les 4 parcours (élève, prof, promptagogue, admin) passent en production.
- Le backup SQLite restauré est identique à l'original.
- Aucun accès statique ne contourne Next (le vhost sans proxy est neutralisé).
- Plus aucune trace du journal public : pas de cron `log_to_web`, `https://educh.at/ip-direct/` ne répond plus.
- Un email de code envoyé depuis `noreply@educh.at` arrive en boîte de réception (SPF/DKIM passés).

## Prompt à copier-coller dans Claude Code
```text
Contexte : EduChat est un chatbot éducatif Next.js 14 (pages-router, TypeScript, Yarn), développé par un enseignant seul assisté par IA, déployé sur un VPS OVH (Fedora, Apache en proxy inverse + service systemd, utilisateur fedora, IP 91.134.241.141, domaine educh.at). Décisions d'architecture à respecter : base SQLite (better-sqlite3) dans DATA_DIR HORS racine web (/var/lib/educhat/ en prod, injecté par Environment= dans le service systemd) ; comptes vérifiés par email sans mot de passe (promptagogues, enseignants, admins — les élèves n'ont JAMAIS de compte) ; établissements gérés en base (IPs, quotas de tokens, clé API active), les env SECRET_ALLOWED_IPS/HOURS restant un amorçage/secours ; emails par SMTP authentifié OVH via nodemailer (SECRET_SMTP_*) ; jetons signés HMAC-SHA256 avec SECRET_TOKEN_KEY, sans cookie ; admins dans SECRET_ADMIN_EMAILS ; i18n natif Next (fr/en/it/de). Cette étape déploie le palier v1 (étapes 1-12) ; les étapes 14-15 sont des incréments post-v1.

Commence par lire planning/00-analyse-existant.md et planning/decisions-techniques.md, puis les fiches des étapes 11 et 12 (planning/11-*.md et planning/12-*.md), dont cette étape dépend.

Objectif de cette étape 13 : mise en production sur le VPS existant, recette finale, runbook.

Tâches :
1. Apache : deux VirtualHost *:443 coexistent — conf/educh.at.conf:20-41 (avec ProxyPass vers localhost:3000) et conf/ssl.conf:56-218 (SANS proxy, servant /var/www/html en statique). Neutralise le vhost sans proxy pour que TOUT le trafic passe par Next, et désactive Options Indexes (conf/httpd.conf:149).
2. Certificat : conf/educh.at.conf:38-39 réutilise les certificats andany.info. Prépare l'émission d'un certificat Let's Encrypt couvrant explicitement educh.at (et www.educh.at) et mets à jour le vhost.
3. systemd : conf/educh-at.service:7 pointe WorkingDirectory sur /var/www/html/educh-at/src alors que package.json est à la racine du projet — corrige. Ajoute Environment=DATA_DIR=/var/lib/educhat, documente la création du répertoire et les droits d'écriture de l'utilisateur fedora dessus, et ajoute un ProxyTimeout Apache adapté aux longues complétions en streaming.
4. .env de production : complète le modèle conf/(dot)env.txt et documente les valeurs à poser sur le VPS : hash bcrypt du mot de passe prof « gabbagabbahey » généré par conf/pwd_crypt.py (mot de passe CONSERVÉ tel quel, choix assumé du client — ne recommande pas de le changer), SECRET_SMTP_HOST/PORT/USER/PASS/FROM, SECRET_ADMIN_EMAILS, SECRET_TOKEN_KEY, SECRET_ALLOWED_IPS et SECRET_ALLOWED_HOURS (simple amorçage/secours : la résolution IP → établissement se fait en base), SECRET_MAX_UNLOCK_MINUTES (plafond configurable du déverrouillage prof, défaut 600). Installe les crons (backup SQLite via sqlite3 .backup, purges) sur le modèle de conf/var-spool-cron-root.txt.
5. Journal public de logs (abandonné, déjà retiré du dépôt à l'étape 1) : supprime-le effectivement côté serveur — ligne log_to_web.sh de la crontab root, script /usr/local/bin/log_to_web.sh, répertoire public /var/www/html/ip-direct/.
6. Documente les actions manuelles côté client : zone DNS OVH → 91.134.241.141, création de la boîte noreply@educh.at (elle N'EXISTE PAS ENCORE : prérequis bloquant pour l'envoi des codes email), enregistrements SPF/DKIM ; en option, ajout des clés RESPIRE dans le .env (mécanisme multi-clés existant).
7. Rédige la checklist de recette et déroule-la en production : auto-login depuis IP école (résolue en base établissements, env en secours) en plage horaire, verrou hors plage, mot de passe prof à durée configurable (SECRET_MAX_UNLOCK_MINUTES) ; cycle complet d'un prompt : draft testable via son URL secrète, soumission en pending, approbation, publication au catalogue ; chat socratique dans les 4 langues ; export/import de profil entre deux navigateurs ; suppression par un admin ; restauration RÉELLE d'un backup SQLite sur une copie de la base ; curl externe de /api/completion sans déverrouillage → 401.
8. Runbook dans README.md : sauvegarde/restauration, ajout d'un admin, gestion d'un établissement (IPs, quota, clé active), procédure de changement du mot de passe prof (si souhaité un jour) et rotation de SECRET_TOKEN_KEY.

Critères d'acceptation : après reboot du VPS, le service repart seul avec la base intacte ; les 4 parcours (élève, prof, promptagogue, admin) passent en production ; le backup restauré est identique à l'original ; aucun accès statique ne contourne Next ; plus aucune trace du journal public (cron et /ip-direct/ supprimés) ; un email de code depuis noreply@educh.at arrive en boîte de réception.

Termine par : yarn build sans erreur, vérification manuelle du comportement, puis un commit git avec un message descriptif en français. INTERDIT de commiter .env, secret.txt, data/ ou tout autre secret.
```
