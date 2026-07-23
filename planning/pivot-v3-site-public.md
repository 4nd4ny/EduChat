# Pivot v3 — Site public centré sur les prompts socratiques (22 juillet 2026)

*Directive client. Ce document PRÉVAUT sur les fiches 01-15 et sur decisions-techniques.md en cas de contradiction. Environnement de développement : personne n'utilise le site, on déploie au fil de l'eau pour test.*

## Le changement de cap

EduChat n'est pas « un logiciel pour chatter avec une IA » : c'est **un espace pour déployer différentes versions de prompts socratiques**. Le choix du prompt est **au centre de l'expérience**.

1. **Le site est ouvert à tout le monde, sans verrou**, en usage « clé API personnelle » (BYOK). Plus de mot de passe pour accéder au site public.
2. **`educh.at/school`** est le point d'entrée des institutions : c'est là que vit l'expérience actuelle — déverrouillage par l'enseignant (mot de passe type « gabbagabbahey ») en dehors des heures d'accès libre pré-programmées par IP d'établissement. **Cette partie fonctionne avec la clé interne** de la plateforme.
3. **Facturation** : la consommation de **chaque IP d'établissement** est conservée en base (table `usage_log`) pour générer une **facture mensuelle** des usages de la clé interne.
4. **Fonctionnalités prompt-centriques accessibles à tout le monde** : comparer, évaluer, recommander, mettre en favori, déployer sur une classe, éditer, personnaliser les prompts socratiques.
5. **Statuts** : via `/school`, il y a des enseignants et des élèves ; **en accès public, tout le monde a le même statut**. (La vérification email pour publier sur le serveur demeure — exigence d'origine.)

## Vérification de conformité (état au 22 juillet)

- Étapes 1-3 (hygiène, verrouillage API, anti-XSS) : **conformes** au cahier des charges, rien à reprendre.
- La règle d'accès de `/api/completion` (étape 2) implémente **déjà** la sémantique du pivot : BYOK toujours permis, clés serveur uniquement si déverrouillé OU IP+plage horaire. Aucun changement d'API nécessaire — seul le **périmètre du verrou UI** change.
- Le seul point en contradiction avec le pivot : `Layout.tsx:20` protège tout le site sauf `/rgpd` et `/police`. → Le verrou ne doit plus couvrir que `/school`.

## Impact sur les étapes restantes

| Étape | Adaptation pivot |
|---|---|
| 4 (SQLite) | `usage_log` porte l'**IP d'établissement** (donnée de facturation, IP d'école, pas personnelle) + `used_server_key` ; le reste inchangé |
| 5 (catalogue) | **Renforcée** : l'accueil public EST le catalogue (tri, recherche, favoris, note, « Essayer ») ; le chat passe sous `/chat` ; **création de `/school`** (expérience verrouillée actuelle, clé interne) ; `ProtectedPage` ne gate plus que `/school` |
| 6 (email) | Inchangée ; en dev sans SMTP configuré, le code de vérification est journalisé côté serveur (repli console) pour pouvoir tester |
| 7 (publication) | Inchangée + édition/personnalisation : « proposer une variante » d'un prompt existant (pré-remplissage du formulaire) |
| 8 (injection) | `usage_log` : insérer IP + used_server_key à chaque complétion sur clé interne — le socle de la facture mensuelle |
| 9 (admin) | Facturation **par IP d'établissement** (agrégats mensuels, export CSV) en plus de par établissement |
| 10-12 | Inchangées |
| 14 | « Déployer sur une classe » = le réglage de session prof (prompt par défaut) ; réaffirmé |

## Évaluation et recommandation (précision du pivot)

Le client demande explicitement de pouvoir **évaluer** et **recommander** les prompts, pour tout le monde. Décision v2 amendée : la **note humaine (1-5 étoiles)** arrive dès la v1 (colonnes `rating_sum`/`rating_count` déjà prévues), avec dédoublonnage localStorage assumé comme suffisant pour une communauté scolaire (l'anti-revote par IP est illusoire derrière le NAT d'un établissement). Le tri par défaut du catalogue reste un mélange usage/fraîcheur ; la note est une colonne triable de plus. « Recommander » = partage du lien direct de la fiche prompt.
