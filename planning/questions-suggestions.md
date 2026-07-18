# Questions à trancher et suggestions d'amélioration

*Vos idées ne sont pas figées — ce document liste ce qui doit être clarifié, par ordre d'impact sur l'architecture, puis les améliorations que nous proposons. Les fiches d'étapes supposent les réponses « proposées » ci-dessous ; toute autre réponse reste intégrable, d'autant plus facilement qu'elle arrive tôt.*

## Questions (par impact décroissant)

1. **Favoris** (votre phrase était restée inachevée) : un favori purement **local au navigateur** (proposé : zéro donnée serveur, transportable via export) vous suffit-il, ou doit-il alimenter le ranking public ?
2. **Ranking** : classement **calculé automatiquement** (usages + fraîcheur — proposé en v1) ou **votes humains** ? Attention : derrière l'IP partagée d'un établissement, tout dédoublonnage par IP est illusoire (toute l'école = une IP).
3. **Modération** : un prompt publié est-il visible **immédiatement**, ou doit-il être **approuvé par un admin** avant publication ? Public cible = élèves mineurs : une validation a priori (statut `pending`) est prudente et quasi gratuite à développer — mais elle change le flux de publication, donc à trancher tôt.
4. **Visibilité du catalogue** : la page d'accueil (catalogue), `/publier` et `/p/[nom]` doivent-elles être visibles **sans déverrouillage** du site (vitrine publique pour recruter des promptagogues — proposé), le chat seul restant derrière le verrou ? Cela conditionne la liste `isProtected` et l'architecture d'accès.
5. **Texte des prompts** : le texte intégral est-il **public** (lisible par tous sur `/p/[nom]`, esprit open source — proposé) ou **secret** (seules les métadonnées visibles, texte injecté uniquement côté serveur) ? Cela change l'API, la page détail et la proposition de valeur.
6. **Quota 1 Mo / 256 Ko** : s'agit-il uniquement de prompts **textuels** (256 Ko ≈ 60 000 mots, très large) ou anticipez-vous des **pièces jointes** (images, PDF de cours) ? Des fichiers joints seraient un chantier supplémentaire complet (stockage, types MIME, sécurité) à cadrer maintenant.
7. **Quota de tokens** (exigence 14) : un affichage **informatif** côté navigateur (proposé, réutilise l'existant) vous suffit-il, ou voulez-vous un **plafond bloquant** ? Un plafond honnête exige un comptage serveur — nous proposons un budget global par fenêtre de déverrouillage (aucune donnée individuelle, RGPD-compatible).
8. **Email OVH** : confirmez-vous que le domaine (`educh.at` ?) est chez OVH avec MX Plan inclus, et que vous pouvez créer `noreply@educh.at` + accéder à la zone DNS pour SPF/DKIM ? C'est le prérequis matériel de toute la vérification email.
9. **Versions de prompts** : quand un prompt passe en version N+1, les conversations en cours continuent-elles avec l'**ancienne** version (reproductibilité pédagogique) ou basculent-elles sur la nouvelle ? Les anciennes versions sont-elles consultables publiquement ?
10. **Mot de passe prof** : « gabbagabbahey » a été transmis en clair (donc à considérer compromis). Acceptez-vous d'en choisir un autre, ajouté à la liste `SECRET_PASSWD` existante (mécanisme bcrypt + durée en suffixe conservé), avec une durée maximale bornée (480 min proposé) ?
11. **Suppression et RGPD** : quand un admin retire un prompt ou qu'un promptagogue demande l'effacement de son compte : suppression définitive, anonymisation de l'auteur en conservant le prompt, ou dépublication réversible (proposé) ? Un promptagogue peut-il retirer lui-même ses propres prompts ?
12. **Clés RESPIRE (exigence 18)** : le multi-fournisseurs + clé personnelle existe déjà — s'agit-il seulement d'**ajouter les clés RESPIRE au `.env`**, ou de **réserver les modèles coûteux** à un contexte précis (second mot de passe prof « premium », IP école uniquement) ? Le mécanisme multi-mots de passe existant permet deux niveaux sans nouveau code.
13. **Journal public et /police** : conserver le log public (`/ip-direct/educh-at.log`) comme preuve de transparence (avec filtrage des chemins sensibles — proposé) ou le remplacer par une mention dans la page RGPD ? La page `/police` : conservée, traduite en 4 langues, ou hors périmètre ?

## Suggestions d'amélioration

1. **Plafond de tokens serveur par fenêtre de déverrouillage** (ex. 500 K tokens par pose de `auth_lock`, compteur SQLite remis à zéro) : LA protection budgétaire qui manque au modèle « verrou global anonyme », parfaitement RGPD (aucune donnée individuelle).
2. **Statut « en attente de validation »** pour les nouveaux prompts (+ email de notification à l'admin) : protège les élèves mineurs d'un contenu inapproprié pour un coût quasi nul — fortement recommandé en contexte scolaire.
3. **Gabarit socratique guidé** à la publication (rôle / matière / niveau / règles « ne jamais donner la réponse » / ton) plutôt qu'une zone de texte vide : abaisse la barrière d'entrée et homogénéise la qualité du catalogue.
4. **Prévisualisation « tester avant de publier »** et bouton « Essayer » sur chaque carte du catalogue : la démonstration vaut mieux que la description ; réutilise le chat existant sans persistance.
5. **Officialiser les balises `<thinking>`/`<encouragement>`** déjà rendues par `AssistantMessageContent.tsx:59-76` comme convention des prompts socratiques, documentée dans un « guide du promptagogue » sur `/publier` (avec charte : ne jamais collecter de données personnelles d'élèves via le prompt).
6. **Streaming des réponses (SSE)** une fois `completion.ts` en Node : les élèves voient la réponse se construire — gain pédagogique réel sur les longues réponses socratiques. Chantier bonus naturel post-v1.
7. **Sauvegarde hors VPS** : le cron local ne protège pas d'une perte du serveur — rclone hebdomadaire chiffré de `DATA_DIR` vers un stockage à vous, ou téléchargement manuel documenté.
8. **Métadonnées pédagogiques légères** par prompt (matière, niveau scolaire, langue) + **QR code / lien direct** `educh.at/t/NomPropre` : le prof projette le QR, chaque élève démarre avec le bon tuteur — friction zéro, idéal avec l'auto-login par IP d'établissement.
9. **Recherche web désactivable par prompt** (aujourd'hui activée en dur pour les 6 fournisseurs) : un tuteur de maths n'en a pas besoin — économie de tokens et de surface non maîtrisée, au choix du promptagogue.
10. **Tableau de bord admin de pilotage du coût** (tokens par prompt et global, quotas par promptagogue) + healthcheck `GET /api/health` + `MemoryMax` dans l'unité systemd : exploitation sereine d'un VPS solo.
11. **Amorcer le catalogue avant l'ouverture** : 8-10 tuteurs de qualité couvrant les matières principales, idéalement dans les 4 langues — un catalogue vide ne recrute ni élèves ni promptagogues.

## Risques majeurs à garder en tête

- `/api/completion` est aujourd'hui un **proxy ouvert sans authentification** qui consomme les clés serveur — à corriger (étape 2) **avant toute publicité** de la plateforme.
- **XSS via prompts tiers** (rendu HTML non assaini) — la sanitisation (étape 3) doit précéder l'ouverture des publications (étape 7). L'ordre du plan le garantit.
- **Écart déclaratif RGPD** : `/rgpd` promet « aucune donnée serveur, pas de cookies » — l'étape 12 doit être en production **avant** l'ouverture réelle des comptes promptagogues.
- **Le journal public des logs** est un piège permanent : jamais de secret en GET, règle d'or à respecter dans toute évolution future.
- **Délivrabilité email** : sans SPF/DKIM corrects, les codes finissent en spam et le parcours promptagogue meurt à la première étape — tester avec de vraies boîtes dès l'étape 6.
- **Le dépôt vit dans Dropbox** : le `.gitignore` ne protège pas de la synchro cloud de `.env`/`data/` — exclure ces chemins de Dropbox ou développer hors Dropbox.
- **~14-17 sessions de travail** au total : le plan est ordonné pour un palier déployable dès l'étape 8 (catalogue + tuteurs fonctionnels et sécurisés) ; ne pas réordonner au détriment des étapes de sécurité.
