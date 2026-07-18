# Étape 12 — Mise en conformité RGPD/nLPD

**Dépend de :** Étape 6, Étape 9, Étape 10 · **Estimation :** 1 session

## Objectif
Rendre le discours public du site à nouveau vrai. La page `src/pages/rgpd.tsx` promet aujourd'hui « aucune donnée serveur, pas de cookies » (l.14-27), ce qui devient faux dès que des comptes existent : le serveur conserve désormais le nom et l'email des promptagogues, des enseignants et des admins, les prompts déposés, les données de gestion des établissements (clients facturés) et, pour les comptes qui l'ont choisi, un profil synchronisé. Le principe central reste inchangé et doit être affirmé clairement : **les élèves n'ont JAMAIS de compte** — « sans login » vaut pour les élèves uniquement. Cette étape réécrit la politique de confidentialité pour qu'elle corresponde exactement à la réalité technique, et met en place les mesures d'accompagnement (purges, droits d'accès/rectification/suppression, mention de la suppression du journal public). Elle doit être terminée AVANT toute ouverture des publications.

## Contexte et fichiers concernés
- `src/pages/rgpd.tsx` — page actuelle de politique de confidentialité, en français uniquement ; les promesses obsolètes sont aux l.14-27 et les liens `http://167.114.159.114/...` en dur aux l.17-20. À réécrire entièrement en quadrilingue.
- `src/i18n/fr.json`, `src/i18n/en.json`, `src/i18n/it.json`, `src/i18n/de.json` — dictionnaires du mécanisme i18n natif (hook `useT()`), qui reçoivent les clés de la nouvelle page /rgpd.
- Schéma SQLite v2 (étape 4) — tables contenant des données personnelles à décrire : `users` (nom, email, rôles, `sync_optin`), `etablissements` (nom, IPs, contact de facturation), `usage_log` (agrégats de tokens par établissement et, à terme, par enseignant — aucune donnée élève), `profiles` (sync opt-in, étape 15), `email_codes` (codes hachés éphémères).
- `conf/log_to_web.sh` et sa ligne cron — **journal public abandonné** : retirés du dépôt à l'étape 1, supprimés du serveur à l'étape 13. Cette étape vérifie qu'il n'en reste aucune trace et l'acte dans la page /rgpd. La règle « jamais de secret en query string » est conservée par principe (défense en profondeur).
- `conf/var-spool-cron-root.txt` — gabarit du cron ; à passer sous l'utilisateur `fedora` et à compléter avec les purges.
- `README.md` — accueille la procédure d'exercice des droits (accès, rectification, suppression) et la liste synchronisée des variables d'environnement.
- `conf/(dot)env.txt` — gabarit d'environnement, à synchroniser avec TOUTES les variables (SMTP, `SECRET_TOKEN_KEY`, `SECRET_ADMIN_EMAILS`, `SECRET_ALLOWED_IPS`, `SECRET_ALLOWED_HOURS`, `SECRET_MAX_UNLOCK_MINUTES`, `DATA_DIR`).
- Nouveau script de purge (cron) pour la table `email_codes` et la rotation de `auth_log`.

## Tâches
1. Réécrire `src/pages/rgpd.tsx` dans les 4 langues (fr, en, it, de) avec un contenu exact : **élèves = aucun compte, aucune donnée personnelle serveur** (l'adresse IP sert uniquement à identifier l'établissement, jamais un individu) ; données conservées côté serveur = comptes vérifiés (nom + email) des promptagogues, des enseignants responsables (facturés) et des admins, prompts déposés avec leur attribution (ou anonymes, `author_email` NULL), données de gestion des établissements (nom, IPs, quota, contact de facturation) et agrégats de tokens de `usage_log` à des fins de facturation — aucune donnée élève ; profil synchronisé (conversations, favoris, réglages) UNIQUEMENT pour les comptes ayant coché l'opt-in `sync_optin` ; données restant exclusivement dans le navigateur = conversations, clés API personnelles, favoris, quota de tokens (sauf sync opt-in) ; aucun cookie (le jeton signé est en localStorage) ; durées de conservation : codes de vérification 15 minutes, jetons 90 jours ; mention explicite que les logs serveur ne sont plus publiés (journal public supprimé) ; droits d'accès, de rectification et de suppression exerçables via l'email admin.
2. Documenter la procédure d'exercice des droits : suppression ou anonymisation d'un compte (promptagogue ou enseignant) et de son profil synchronisé éventuel ; pour ses prompts, l'auteur authentifié choisit entre suppression et anonymisation (`author_email` → NULL, le prompt devient anonyme et seul l'admin peut alors le supprimer) — conformément aux droits de suppression actés à l'étape 7.
3. Retirer les liens `http` vers l'IP serveur en dur `167.114.159.114` (rgpd.tsx:17-20) et les remplacer par des liens `https` vers le domaine.
4. Vérifier qu'aucune trace du journal public ne subsiste dans le dépôt (`conf/log_to_web.sh` et sa ligne cron ont été retirés à l'étape 1 ; la suppression côté serveur est exécutée à l'étape 13) ; conserver la règle « jamais de secret en query string » (code de vérification transmis en fragment d'URL).
5. Mettre en place les purges automatiques par cron (sous l'utilisateur `fedora`, pas root) : suppression des `email_codes` expirés et rotation de `auth_log` ; synchroniser `README.md` et `conf/(dot)env.txt` avec TOUTES les variables d'environnement (SMTP, `TOKEN_KEY`, `ADMIN_EMAILS`, `ALLOWED_IPS`, `ALLOWED_HOURS`, `MAX_UNLOCK_MINUTES`, `DATA_DIR`).

## Livrables
- Page /rgpd exacte et quadrilingue (élèves sans compte, comptes email, facturation par établissement, sync opt-in, journal public supprimé)
- Cron de purge
- Procédure d'exercice des droits (accès, rectification, suppression)
- README et gabarit d'environnement synchronisés

## Vérification
- Relecture croisée : chaque affirmation de /rgpd correspond à une réalité vérifiable en base ou dans le code (y compris : aucune table ne contient de donnée élève, `usage_log` n'agrège que des tokens par établissement/enseignant).
- Aucun lien vers une IP en dur ne subsiste.
- Aucune référence à `log_to_web.sh` ou au journal public ne subsiste dans le dépôt (hors mention historique dans planning/).
- Les codes expirés disparaissent effectivement de `email_codes` après passage de la purge.

## Prompt à copier-coller dans Claude Code
```text
Contexte. EduChat est un chatbot éducatif Next.js 14 (pages-router, TypeScript, Tailwind), développé et maintenu par un enseignant seul assisté par IA, hébergé sur un VPS OVH (Apache en reverse-proxy + service systemd). Décisions d'architecture déjà tranchées, à respecter sans les rediscuter : les ÉLÈVES n'ont JAMAIS de compte (principe RGPD central) ; trois types de comptes vérifiés par email sans mot de passe (code XXX-XXX) : promptagogues, enseignants (rattachés à un établissement facturé) et admins (SECRET_ADMIN_EMAILS) ; base SQLite via better-sqlite3 dans DATA_DIR hors racine web, schéma v2 : users (nom, email, rôles, sync_optin), etablissements (nom, IPs, flag RESPIRE, quota mensuel de tokens, contact de facturation), prompts (statuts draft/pending/published/retired, author_email NULL = anonyme), email_codes (codes hachés, expiration 15 minutes), usage_log (agrégats de tokens par établissement/enseignant, aucune donnée élève), profiles (sync opt-in de l'étape 15) ; jeton signé HMAC-SHA256 en localStorage, SANS cookie, expiration ~90 jours ; favoris et conversations purement navigateur sauf sync opt-in ; le journal public des logs (conf/log_to_web.sh) a été SUPPRIMÉ du dépôt à l'étape 1 ; i18n natif Next (locales fr/en/it/de, dictionnaires src/i18n/*.json, hook useT()).

Commence par lire planning/00-analyse-existant.md et planning/decisions-techniques.md, puis les fiches des étapes 6, 9 et 10 dont dépend celle-ci (planning/06-*.md, planning/09-*.md, planning/10-*.md), et enfin planning/12-rgpd.md.

Objectif de cette étape : rendre le discours public à nouveau vrai. src/pages/rgpd.tsx promet « aucune donnée serveur, pas de cookies » (l.14-27), désormais faux pour les titulaires de comptes et les établissements. À corriger avant toute ouverture des publications.

Tâches :
1. Réécris src/pages/rgpd.tsx en quadrilingue via le mécanisme i18n existant (clés dans src/i18n/{fr,en,it,de}.json, hook useT()). Contenu exigé : élèves = aucun compte, aucune donnée personnelle serveur (l'IP identifie l'établissement, jamais un individu) ; données serveur = comptes vérifiés (nom + email) des promptagogues, enseignants et admins, prompts déposés attribués ou anonymes, données de gestion des établissements (nom, IPs, quota, contact de facturation) et agrégats de tokens de usage_log pour la facturation ; profil synchronisé UNIQUEMENT si opt-in sync_optin ; données restant dans le navigateur = conversations, clés API personnelles, favoris, quota de tokens (sauf sync opt-in) ; aucun cookie (jeton en localStorage) ; conservation : codes 15 minutes, jetons 90 jours ; les logs serveur ne sont plus publiés ; droits d'accès, de rectification et de suppression par email à l'adresse admin.
2. Rédige dans README.md (section dédiée) la procédure d'exercice des droits : suppression ou anonymisation d'un compte et de son profil synchronisé ; pour ses prompts, l'auteur choisit entre suppression et anonymisation (author_email → NULL ; un prompt anonyme n'est ensuite supprimable que par l'admin).
3. Supprime les liens http vers l'IP en dur 167.114.159.114 (rgpd.tsx:17-20 actuels) : remplace-les par des liens https vers le domaine.
4. Vérifie qu'aucune trace de conf/log_to_web.sh ni du journal public ne subsiste dans le dépôt (retirés à l'étape 1) ; conserve la règle « jamais de secret en query string » (code transmis en fragment d'URL).
5. Mets en place les purges automatiques par cron sous l'utilisateur fedora (mets à jour conf/var-spool-cron-root.txt) : suppression des email_codes expirés et rotation de auth_log. Synchronise README.md et conf/(dot)env.txt avec TOUTES les variables d'environnement (SECRET_SMTP_HOST/PORT/USER/PASS/FROM, SECRET_TOKEN_KEY, SECRET_ADMIN_EMAILS, SECRET_ALLOWED_IPS, SECRET_ALLOWED_HOURS, SECRET_MAX_UNLOCK_MINUTES, DATA_DIR), avec uniquement des valeurs d'exemple.

Critères d'acceptation (tous obligatoires) :
- Chaque affirmation de /rgpd correspond à une réalité vérifiable dans le code ou la base ; aucune donnée élève nulle part.
- Plus aucun lien vers une IP en dur.
- Aucune référence au journal public dans le dépôt (hors planning/).
- Les codes expirés disparaissent effectivement de email_codes après la purge.
- La page /rgpd s'affiche correctement dans les 4 locales.

Termine par : yarn build sans erreur ; vérification manuelle (page /rgpd dans les 4 langues, purge testée sur un code expiré factice) ; puis un commit git avec un message descriptif en français.

Interdictions : ne commite jamais .env, secret.txt, le répertoire data/ ni aucun secret. N'ouvre pas secret.txt et ne recopie aucune valeur secrète — uniquement des noms de variables et des exemples fictifs.
```
