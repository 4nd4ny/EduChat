# Étape 13 — Déploiement OVH, DNS et recette finale

**Dépend de :** Étape 11, Étape 12 · **Estimation :** 1-2 sessions (+ actions manuelles OVH)

## Objectif
Mettre EduChat en production sur le VPS OVH existant (Apache en proxy inverse + service systemd) et valider la totalité du produit en conditions réelles. L'étape assainit d'abord la configuration serveur (conflit de VirtualHost, certificat, systemd, .env, crons), puis déroule une recette complète des 4 parcours (élève, prof, promptagogue, admin) dans les 4 langues, et livre enfin le runbook d'exploitation pour un enseignant seul.

## Contexte et fichiers concernés
- `conf/educh.at.conf:20-41` — VirtualHost *:443 avec ProxyPass vers `localhost:3000` ; ses lignes 38-39 réutilisent les certificats Let's Encrypt de `andany.info` au lieu d'un certificat propre à `educh.at`.
- `conf/ssl.conf:56-218` — second VirtualHost *:443 SANS proxy, qui sert `/var/www/html` en statique : c'est le conflit à trancher, sinon une partie du trafic contourne Next (et pourrait exposer des fichiers).
- `conf/httpd.conf:149` — `Options Indexes FollowSymLinks` : le listage de répertoires est actif, à désactiver.
- `conf/educh-at.service:7` — `WorkingDirectory=/var/www/html/educh-at/src` alors que `package.json` est à la racine du projet ; c'est aussi le fichier où injecter `Environment=DATA_DIR=/var/lib/educhat` (décision d'architecture : base SQLite hors racine web).
- `conf/(dot)env.txt` — modèle du `.env` de production, à compléter avec toutes les variables `SECRET_*`.
- `conf/pwd_crypt.py` — générateur du hash bcrypt du mot de passe prof (corrigé lors d'une étape précédente).
- `conf/var-spool-cron-root.txt` — crontab existante (publication des logs chaque minute), modèle pour installer les nouveaux crons (backup SQLite, purges).
- `README.md` — accueillera le runbook d'exploitation.

## Tâches
1. Trancher le conflit des DEUX VirtualHost *:443 : celui de `conf/educh.at.conf:20-41` (avec proxy vers Next) et celui de `conf/ssl.conf:56-218` (sans proxy, servant `/var/www/html` en statique). Neutraliser le vhost sans proxy pour que TOUT le trafic passe par Next, et désactiver `Options Indexes` (`conf/httpd.conf:149`).
2. Émettre un certificat Let's Encrypt couvrant explicitement `educh.at` (aujourd'hui, ce sont les certificats `andany.info` qui sont réutilisés, `conf/educh.at.conf:38-39`).
3. Clarifier le `WorkingDirectory` systemd (`conf/educh-at.service:7` pointe sur `.../src` alors que `package.json` est à la racine) ; vérifier les droits d'écriture de l'utilisateur `fedora` sur `DATA_DIR` ; adapter le `ProxyTimeout` Apache aux longues complétions.
4. Compléter le `.env` de production : hash bcrypt du mot de passe prof généré par `conf/pwd_crypt.py` corrigé — en recommandant de NE PAS réutiliser « gabbagabbahey », cité en clair dans la demande et donc compromis —, `SECRET_SMTP_*`, `SECRET_ADMIN_EMAILS`, `SECRET_TOKEN_KEY`, `SECRET_ALLOWED_IPS`, `SECRET_ALLOWED_HOURS` ; installer les crons (backup SQLite, purges).
5. Documenter les actions manuelles côté client : zone DNS OVH → `91.134.241.141` (exigence 17), enregistrements SPF/DKIM, création de la boîte d'envoi ; en option (exigence 18), ajout des clés RESPIRE dans le `.env` via le mécanisme multi-clés existant.
6. Dérouler la recette complète : auto-login depuis une IP école en plage horaire / verrou hors plage / mot de passe prof à durée bornée ; publication réelle d'un prompt ; chat socratique dans les 4 langues ; export/import de profil inter-navigateurs ; suppression par un admin ; restauration RÉELLE d'un backup SQLite sur une copie ; `curl` externe de `/api/completion` sans déverrouillage → 401.
7. Rédiger le runbook dans le README : sauvegarde/restauration, ajout d'un admin, rotation du mot de passe prof et de `SECRET_TOKEN_KEY`.

## Livrables
- Production fonctionnelle sur educh.at
- Checklist de recette passée à 100 %
- Runbook d'exploitation

## Vérification
- Reboot du VPS → le service repart seul, avec la base de données intacte.
- Les 4 parcours (élève, prof, promptagogue, admin) passent en production.
- Le backup SQLite restauré est identique à l'original.
- Aucun accès statique ne contourne Next (le vhost sans proxy est neutralisé).

## Prompt à copier-coller dans Claude Code
```text
Contexte : EduChat est un chatbot éducatif Next.js 14 (pages-router, TypeScript, Yarn), développé par un enseignant seul assisté par IA, déployé sur un VPS OVH (Fedora, Apache en proxy inverse + service systemd, utilisateur fedora, IP 91.134.241.141, domaine educh.at). Décisions d'architecture à respecter : base SQLite (better-sqlite3) dans DATA_DIR HORS racine web (/var/lib/educhat/ en prod, injecté par Environment= dans le service systemd) ; emails par SMTP authentifié OVH via nodemailer (variables SECRET_SMTP_*) ; jetons promptagogues signés HMAC-SHA256 avec SECRET_TOKEN_KEY, sans cookie ; admins listés dans SECRET_ADMIN_EMAILS ; i18n natif Next (fr/en/it/de).

Commence par lire planning/00-analyse-existant.md et planning/decisions-techniques.md, puis les fiches des étapes 11 et 12 (planning/11-*.md et planning/12-*.md), dont cette étape dépend.

Objectif de cette étape 13 : mise en production sur le VPS existant, recette finale, runbook.

Tâches :
1. Apache : deux VirtualHost *:443 coexistent — conf/educh.at.conf:20-41 (avec ProxyPass vers localhost:3000) et conf/ssl.conf:56-218 (SANS proxy, servant /var/www/html en statique). Neutralise le vhost sans proxy pour que TOUT le trafic passe par Next, et désactive Options Indexes (conf/httpd.conf:149).
2. Certificat : conf/educh.at.conf:38-39 réutilise les certificats andany.info. Prépare l'émission d'un certificat Let's Encrypt couvrant explicitement educh.at (et www.educh.at) et mets à jour le vhost.
3. systemd : conf/educh-at.service:7 pointe WorkingDirectory sur /var/www/html/educh-at/src alors que package.json est à la racine du projet — corrige. Ajoute Environment=DATA_DIR=/var/lib/educhat, documente la création du répertoire et les droits d'écriture de l'utilisateur fedora dessus, et ajoute un ProxyTimeout Apache adapté aux longues complétions en streaming.
4. .env de production : complète le modèle conf/(dot)env.txt et documente les valeurs à poser sur le VPS : hash bcrypt du mot de passe prof généré par conf/pwd_crypt.py (recommande explicitement de NE PAS réutiliser « gabbagabbahey », compromis car cité en clair dans la demande), SECRET_SMTP_HOST/PORT/USER/PASS/FROM, SECRET_ADMIN_EMAILS, SECRET_TOKEN_KEY, SECRET_ALLOWED_IPS, SECRET_ALLOWED_HOURS. Installe les crons (backup SQLite via sqlite3 .backup, purges) sur le modèle de conf/var-spool-cron-root.txt.
5. Documente les actions manuelles côté client : zone DNS OVH → 91.134.241.141, SPF/DKIM, création de la boîte d'envoi SMTP ; en option, ajout des clés RESPIRE dans le .env (mécanisme multi-clés existant).
6. Rédige la checklist de recette et déroule-la en production : auto-login depuis IP école en plage horaire, verrou hors plage, mot de passe prof à durée bornée ; publication réelle d'un prompt ; chat socratique dans les 4 langues ; export/import de profil entre deux navigateurs ; suppression par un admin ; restauration RÉELLE d'un backup SQLite sur une copie de la base ; curl externe de /api/completion sans déverrouillage → 401.
7. Runbook dans README.md : sauvegarde/restauration, ajout d'un admin, rotation du mot de passe prof et de SECRET_TOKEN_KEY.

Critères d'acceptation : après reboot du VPS, le service repart seul avec la base intacte ; les 4 parcours (élève, prof, promptagogue, admin) passent en production ; le backup restauré est identique à l'original ; aucun accès statique ne contourne Next.

Termine par : yarn build sans erreur, vérification manuelle du comportement, puis un commit git avec un message descriptif en français. INTERDIT de commiter .env, secret.txt, data/ ou tout autre secret.
```
