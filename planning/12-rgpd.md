# Étape 12 — Mise en conformité RGPD/nLPD

**Dépend de :** Étape 6, Étape 10 · **Estimation :** 1 session

## Objectif
Rendre le discours public du site à nouveau vrai. La page `src/pages/rgpd.tsx` promet aujourd'hui « aucune donnée serveur, pas de cookies » (l.14-27), ce qui devient faux dès que les promptagogues existent : le serveur conserve désormais leurs nom, email et prompts publiés. Cette étape réécrit la politique de confidentialité pour qu'elle corresponde exactement à la réalité technique, et met en place les mesures d'accompagnement (purges, droit à l'effacement, assainissement du log public). Elle doit être terminée AVANT toute ouverture des publications.

## Contexte et fichiers concernés
- `src/pages/rgpd.tsx` — page actuelle de politique de confidentialité, en français uniquement ; les promesses obsolètes sont aux l.14-27 et les liens `http://167.114.159.114/...` en dur aux l.17-20. À réécrire entièrement en quadrilingue.
- `src/i18n/fr.json`, `src/i18n/en.json`, `src/i18n/it.json`, `src/i18n/de.json` — dictionnaires du mécanisme i18n natif (hook `useT()`), qui reçoivent les clés de la nouvelle page /rgpd.
- `conf/log_to_web.sh` — script cron qui publie chaque minute un `tail -100` du log Apache vers `/var/www/html/ip-direct/educh-at.log` ; à durcir (filtrage `/api/`, `/verifier`, query-strings).
- `conf/var-spool-cron-root.txt` — gabarit du cron, aujourd'hui sous root ; à passer sous l'utilisateur `fedora` et à compléter avec les purges.
- `README.md` — accueille la procédure de droit à l'effacement et la liste synchronisée des variables d'environnement.
- `conf/(dot)env.txt` — gabarit d'environnement, à synchroniser avec TOUTES les variables (SMTP, `SECRET_TOKEN_KEY`, `SECRET_ADMIN_EMAILS`, `DATA_DIR`).
- Nouveau script de purge (cron) pour la table `email_codes` et la rotation de `auth_log`.

## Tâches
1. Réécrire `src/pages/rgpd.tsx` dans les 4 langues (fr, en, it, de) avec un contenu exact : données conservées côté serveur = prompts publiés + nom/email des promptagogues (base légale : exécution du service ; finalités : attribution et modération) ainsi que des compteurs d'usage anonymes ; données restant exclusivement dans le navigateur = conversations, clés API personnelles, favoris, quota de tokens ; aucun cookie (le jeton signé est en localStorage) ; durées de conservation : codes de vérification 15 minutes, jetons 90 jours ; droit d'accès et d'effacement exerçable via l'email admin.
2. Documenter la procédure de droit à l'effacement : suppression ou anonymisation d'un compte promptagogue, le sort des prompts publiés (suppression ou anonymisation de l'auteur) étant laissé au choix du client.
3. Retirer les liens `http` vers l'IP serveur en dur `167.114.159.114` (rgpd.tsx:17-20) et les remplacer par des liens `https` vers le domaine.
4. Revoir `conf/log_to_web.sh` : filtrer du tail publié les chemins `/api/` et `/verifier` ainsi que les query-strings (défense en profondeur, en plus du code transmis en fragment d'URL) ; faire tourner le cron sous l'utilisateur `fedora` au lieu de root.
5. Mettre en place les purges automatiques par cron : suppression des `email_codes` expirés et rotation de `auth_log` ; synchroniser `README.md` et `conf/(dot)env.txt` avec TOUTES les variables d'environnement (SMTP, `TOKEN_KEY`, `ADMIN_EMAILS`, `DATA_DIR`).

## Livrables
- Page /rgpd exacte et quadrilingue
- Cron de purge
- Procédure de droit à l'effacement
- README et gabarit d'environnement synchronisés

## Vérification
- Relecture croisée : chaque affirmation de /rgpd correspond à une réalité vérifiable en base ou dans le code.
- Aucun lien vers une IP en dur ne subsiste.
- Le log public ne contient ni `/api`, ni `/verifier`, ni query-string.
- Les codes expirés disparaissent effectivement de `email_codes` après passage de la purge.

## Prompt à copier-coller dans Claude Code
```text
Contexte. EduChat est un chatbot éducatif Next.js 14 (pages-router, TypeScript, Tailwind), développé et maintenu par un enseignant seul assisté par IA, hébergé sur un VPS OVH (Apache en reverse-proxy + service systemd). Le projet migre vers une version où des « promptagogues » publient des prompts après vérification de leur email. Décisions d'architecture déjà tranchées, à respecter sans les rediscuter : base SQLite via better-sqlite3 dans un répertoire DATA_DIR hors racine web (tables promptagogues, prompts, email_codes…) ; emails via SMTP OVH et nodemailer ; authentification promptagogue par code email haché (expiration 15 minutes) puis jeton signé HMAC-SHA256 stocké en localStorage, SANS cookie, expiration ~90 jours ; favoris purement localStorage ; ranking calculé côté serveur depuis des compteurs anonymes ; i18n natif Next (locales fr/en/it/de, dictionnaires src/i18n/*.json, hook useT()).

Commence par lire planning/00-analyse-existant.md et planning/decisions-techniques.md, puis les fiches des étapes 6 et 10 dont dépend celle-ci (planning/06-*.md et planning/10-*.md), et enfin planning/12-rgpd.md.

Objectif de cette étape : rendre le discours public à nouveau vrai. src/pages/rgpd.tsx promet « aucune donnée serveur, pas de cookies » (l.14-27), désormais faux pour les promptagogues. À corriger avant toute ouverture des publications.

Tâches :
1. Réécris src/pages/rgpd.tsx en quadrilingue via le mécanisme i18n existant (clés dans src/i18n/{fr,en,it,de}.json, hook useT()). Contenu exigé : données conservées côté serveur = prompts publiés + nom/email des promptagogues (base légale : exécution du service ; finalités : attribution et modération) et compteurs d'usage anonymes ; données restant exclusivement dans le navigateur = conversations, clés API personnelles, favoris, quota de tokens ; aucun cookie (jeton signé en localStorage) ; durées de conservation : codes de vérification 15 minutes, jetons 90 jours ; droit d'accès et d'effacement par email à l'adresse admin (variable SECRET_ADMIN_EMAILS).
2. Rédige la procédure de droit à l'effacement dans README.md (section dédiée) : suppression ou anonymisation d'un compte promptagogue, le sort des prompts publiés (suppression ou anonymisation de l'auteur) restant au choix du client.
3. Supprime les liens http vers l'IP en dur 167.114.159.114 (rgpd.tsx:17-20 actuels) : remplace-les par des liens https vers le domaine.
4. Durcis conf/log_to_web.sh : l'extrait publié dans /var/www/html/ip-direct/educh-at.log doit exclure les lignes contenant /api/ ou /verifier ainsi que toute query-string (défense en profondeur, en plus du code transmis en fragment d'URL, qui n'atteint jamais les logs). Fais tourner le cron sous l'utilisateur fedora au lieu de root et mets à jour conf/var-spool-cron-root.txt en conséquence.
5. Mets en place les purges automatiques par cron : suppression des email_codes expirés et rotation de auth_log. Synchronise README.md et conf/(dot)env.txt avec TOUTES les variables d'environnement (SECRET_SMTP_HOST/PORT/USER/PASS/FROM, SECRET_TOKEN_KEY, SECRET_ADMIN_EMAILS, DATA_DIR), avec uniquement des valeurs d'exemple.

Critères d'acceptation (tous obligatoires) :
- Relecture croisée : chaque affirmation de /rgpd correspond à une réalité vérifiable dans le code ou la base.
- Plus aucun lien vers une IP en dur.
- Le log public ne contient ni /api, ni /verifier, ni query-string.
- Les codes expirés disparaissent effectivement de email_codes après la purge.
- La page /rgpd s'affiche correctement dans les 4 locales.

Termine par : yarn build sans erreur ; vérification manuelle (page /rgpd dans les 4 langues, log_to_web.sh exécuté sur un extrait de log de test, purge testée sur un code expiré factice) ; puis un commit git avec un message descriptif en français.

Interdictions : ne commite jamais .env, secret.txt, le répertoire data/ ni aucun secret. N'ouvre pas secret.txt et ne recopie aucune valeur secrète — uniquement des noms de variables et des exemples fictifs.
```
