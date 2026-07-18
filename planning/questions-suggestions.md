# Questions et réponses actées — suggestions retenues

*Toutes les questions ont été tranchées par le client le 18 juillet 2026. Ce document est l'enregistrement de référence ; les décisions détaillées sont dans [decisions-techniques.md](decisions-techniques.md), leur mise en œuvre dans les fiches 01 à 15.*

## Réponses aux 13 questions

1. **Favoris** → locaux au navigateur (localStorage, transportables via export et sync opt-in).
2. **Ranking** → automatique (usages + tokens + fraîcheur), pas de vote humain en v1.
3. **Modération** → validation a priori ; approbation par **un admin ou un promptagogue authentifié**. En complément : **création de comptes en option** pour que les promptagogues basculent d'un navigateur à l'autre — dans ce cas l'équivalent de la mémoire du navigateur est sauvegardé sur le serveur (→ étape 15, sync opt-in).
4. **Visibilité** → catalogue visible et public, seul le chat reste derrière le verrou.
5. **Texte des prompts** → public en intégral (« l'école est gratuite »).
6. **Uploads** → texte uniquement, pas de pièces jointes. Quotas 1 Mo / 256 Ko inchangés.
7. **Quota de tokens** → défini **par établissement** (donc par adresse IP) via l'interface d'administration. Tokens de la clé interne **refacturés à l'établissement** ; **gratuit pour les écoles RESPIRE** (financées par les revenus générés autrement) (→ étapes 4, 9, 14).
8. **Email OVH** → confirmé, mais la boîte `noreply@educh.at` **n'est pas encore créée** (prérequis manuel de l'étape 6).
9. **Versions** → le changement de version exige une **action explicite de l'utilisateur**, qui choisit le nouveau prompt pour poursuivre ; les conversations restent sinon sur leur version (→ étape 8).
10. **Mot de passe prof** → « gabbagabbahey » **conservé** : ce n'est pas un mot de passe sensible, juste un déblocage de salle de TP pour cadrer les heures d'usage. Vision du client : donner accès aux LLM frontières aux élèves rétablit l'équilibre sociétal — c'est à l'école de payer.
11. **Suppression** → un prompt publié par un promptagogue peut être supprimé **par son auteur** ; un prompt **anonyme** validé par l'admin ne peut être supprimé **que par l'admin** (→ étapes 7, 9).
12. **Clés API** → une clé par moteur LLM. Si un LLM gratuit avec clé API existe, accès pour tout le monde ; sinon **choix de la clé active par école** → gestion de clients avec suivi des coûts (→ étape 9).
13. **Journal public** → **supprimé** (cron `log_to_web.sh` retiré). Le code sera audité si besoin par quelqu'un de l'établissement (→ étapes 1, 13).

## Suggestions : sort réservé

| # | Suggestion | Décision |
|---|---|---|
| 1 | Plafond de tokens serveur | ✅ Retenu, décliné **par établissement** (étape 9) |
| 2 | Statut « en attente de validation » | ✅ Retenu (étapes 7, 9) |
| 3 | Gabarit socratique guidé | ✅ Retenu + **exemples fournis par le client à intégrer** (placeholder, étape 7) |
| 4 | Prévisualisation « tester avant de publier » | ✅ Étendu : statut **« en construction »** (`draft`) testable et partageable par **URL secrète** non verrouillée, invisible du catalogue, pour inviter des testeurs (étape 7) |
| 5 | Officialiser `<thinking>`/`<encouragement>` | ✅ Retenu (étape 7, guide du promptagogue) |
| 6 | Streaming SSE | ✅ Retenu (bonus post-v1) |
| 7 | Sauvegarde hors VPS | ✅ Retenu (runbook, étape 13) |
| 8 | Métadonnées pédagogiques + QR code | ✅ Retenu (étapes 5, 7) |
| 9 | Recherche web désactivable par prompt | ✅ Étendu : **par prompt ET par session** — au déverrouillage, le prof (compte email sans mot de passe, comme les promptagogues) accède à une interface de réglages pour les élèves de son établissement (identifié par IP) : prompt par défaut + recherche web on/off (étapes 8, **14**) |
| 10 | Tableau de bord admin des coûts | ✅ Étendu : **bilan de facturation mensuel par enseignant et par établissement** (étapes 9, 14) |
| 11 | Amorcer le catalogue | ✅ Retenu + **traduction automatique des prompts publiés** dans les langues du site (étape 10) |

## Risques : arbitrages du client

- Proxy ouvert `/api/completion`, XSS : d'accord, ordre du plan conservé (étapes 2 et 3 en tête).
- **RGPD** : ⚠ texte à revoir précisément — « sans login » vaut pour les **élèves uniquement** ; login et compte pour les promptagogues, les enseignants responsables facturés, les admins (étape 12).
- **Journal public** : supprimé, c'est plus simple.
- **Dropbox** : pas un problème — usage personnel assumé pour stocker les secrets. Ne plus alerter.
- Les « Failles et pièges découverts » de [00-analyse-existant.md](00-analyse-existant.md) : **tous validés par le client**.
