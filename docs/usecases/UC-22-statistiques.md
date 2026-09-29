# UC-22 — Consulter la fréquentation publique et la santé du service

| | |
|---|---|
| **Acteur principal** | Visiteur (bandeau de l'accueil) |
| **Acteurs secondaires** | Supervision / déploiement (contrôle de santé), futur administrateur d'école (formulaire d'inscription qui lit l'adresse) |
| **Déclencheur** | Affichage de l'accueil puis toutes les 30 s (onglet visible) ; sonde de supervision ; ouverture du formulaire d'inscription d'une école |
| **Pages** | `src/site/SiteStats.tsx` |
| **API** | `GET /api/stats?cid=…`, `GET /api/health`, `GET /api/ip` |
| **Code serveur** | `src/server/stats.ts` (`touchPresence`, `getSiteStats`), `src/server/access.ts` (`getClientIp`, `isKnownIp`), `src/server/etablissements.ts` (`resolveEtablissementByIp`), `src/server/accesFournisseurs.ts` (`fournisseurLibre`) |

## Objectif

Montrer la popularité du site en un coup d'œil — comptes, tuteurs, jetons produits, personnes
en ligne, crédits gratuits restants du jour — **sans traceur, sans cookie, sans donnée
personnelle nouvelle** : tout est agrégé depuis ce que la base contient déjà, plus une présence
anonyme (empreinte HMAC) et éphémère. Offrir aussi un contrôle de santé à la supervision, et
dire au navigateur quelle adresse le serveur voit.

## Préconditions

- Aucune. Les trois routes sont publiques.

## Scénario nominal — bandeau de fréquentation

1. L'accueil monte `SiteStats`, qui appelle `GET /api/stats?cid=<uuid anonyme du navigateur>`.
2. Le serveur valide `cid` (`/^[a-f0-9-]{8,64}$/i`), puis `touchPresence(cid, ip)` enregistre
   l'empreinte `HMAC-SHA256(SECRET_TOKEN_KEY, cid)` tronquée à 16 caractères et l'instant.
3. `getSiteStats()` rend (cache de 5 s) :
   - `accounts` — comptes **vérifiés** ;
   - `prompts` — tuteurs `published` non archivés ;
   - `tokens` — somme des `tokens_total` des tuteurs + jetons du chat libre (`usage_log` sans tuteur), sans double compte ;
   - `online` — empreintes actives dans les **5 dernières minutes** ;
   - `freeCreditsUsd` / `freeBudgetUsd` — si le repli gratuit est réellement servi.
4. Réponse `Cache-Control: no-store` ; le bandeau affiche les nombres dans la langue du site.
5. Rafraîchissement toutes les 30 s tant que l'onglet est visible, et au retour sur l'onglet.

## Scénarios alternatifs

- **A1 — Pas d'identifiant (ou identifiant invalide).** L'empreinte porte sur `ip:<adresse>` :
  tous les navigateurs sans identifiant d'une même adresse comptent pour un.
- **A2 — Repli gratuit servi** (`SECRET_FREE_PROVIDER` servable, voir UC-13). Budget
  `SECRET_FREE_DAILY_USD` (1 par défaut) moins le coût du jour du filet **payant** du repli :
  lignes `used_server_key = 1`, `ip = ''`, depuis minuit UTC, modèles `:free` comptés zéro,
  au prix `SECRET_FREE_PRICE_PER_MTOK`. Jamais négatif, arrondi au centime. Sans repli : `null`
  et la ligne n'est pas affichée.
- **A3 — Contrôle de santé.** `GET /api/health` → `{ ok: true, publishedPrompts }` si la base répond.
- **A4 — Adresse vue.** `GET /api/ip` → `{ ip, isIpAllowed, revendiquee }` : l'adresse retenue
  par le contrôle anti-usurpation, si elle est une IP d'amorçage (`SECRET_ALLOWED_IPS`), et si
  elle appartient **déjà** à un établissement — un booléen, jamais le nom de l'école.
- **A5 — Purge.** Les empreintes de plus de 15 minutes sont effacées (au plus une fois par
  minute), à l'écriture comme à la lecture : un site sans trafic ne garde rien.

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| `/api/stats` autre que `GET` | `405 ERR_METHOD_NOT_ALLOWED`, `Allow: GET` |
| `/api/stats`, base indisponible | `500 ERR_STATS` (le bandeau se masque) |
| `/api/health`, base indisponible | `500 { ok: false }` |
| Présence non enregistrable | journalisé, jamais d'échec (une statistique ne casse rien) |
| `/api/health`, `/api/ip` : méthode quelconque | pas de filtrage, `200` |

## Règles métier et sécurité

- Ni l'identifiant du navigateur ni l'IP ne sont stockés en clair ; l'empreinte dépend de `SECRET_TOKEN_KEY`.
- La présence est une **indication**, non une mesure opposable : l'identifiant vient du navigateur.
- L'adresse est celle de `getClientIp` : `X-Real-IP` seulement depuis un proxy de confiance
  (`SECRET_PROXY_TOKEN` ou `TRUSTED_PROXY_IPS`, sinon mode historique) ; jamais `X-Forwarded-For`.
- Le budget gratuit n'est annoncé que si `fournisseurLibre()` le sert — la même fonction que la complétion.

## Postconditions

- Ligne `presence` créée ou rafraîchie ; empreintes périmées purgées. Aucune autre écriture.

## Anomalies constatées

- **Deux décomptes différents des « tuteurs publiés ».** `src/pages/api/health.ts:9` compte
  `status = 'published'` **sans** exclure les tuteurs archivés, alors que le bandeau public
  (`src/server/stats.ts:93`) exclut `archived = 1`. Un tuteur archivé est donc « publié » pour la
  supervision et absent de l'accueil. Écart mineur (la sonde ne sert qu'à vérifier que la base
  répond), mais les deux chiffres divergent. Test : « compte aussi les tuteurs publiés ARCHIVÉS ».

## Tests

### Unitaires — `tests/unit/uc22-statistiques/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `stats.test.ts` | `touchPresence`, `getSiteStats` | empreinte HMAC de 16 caractères sans donnée en clair, un navigateur = une ligne, repli sur l'IP, agrégats (vérifiés, publiés non archivés, jetons sans double compte), fenêtre de 5 min, cache de 5 s, purge à 15 min, purge au plus une fois par minute, crédits gratuits (absents, intacts, filet payant du jour seul, plancher à zéro) |
| `adresseIp.test.ts` | `getClientIp`, `isKnownIp` | mode historique, en-tête invalide, `X-Forwarded-For` ignoré, socket illisible, `SECRET_PROXY_TOKEN`, `TRUSTED_PROXY_IPS`, IP d'amorçage valides seules |

### Fonctionnels — `tests/functional/uc22-statistiques/statistiques.test.ts`

| Scénario | Test |
|---|---|
| Nominal | agrégats + visiteur compté en ligne, `no-store` |
| Nominal | un navigateur compte une fois ; rien en clair en base |
| Nominal | cache de 5 s puis recalcul |
| A5 / fenêtre | inactif depuis plus de 5 min → plus en ligne |
| A1 | identifiant invalide → compté par l'adresse |
| A2 | budget gratuit affiché quand le repli est servi |
| Erreurs | `405` ; base indisponible → `500 ERR_STATS` |
| A3 | santé ok ; tuteurs archivés comptés (anomalie) ; méthode libre ; base indisponible → `500` |
| A4 | adresse non revendiquée ; revendiquée sans nom d'école ; IP d'amorçage ; `X-Real-IP` forgé ignoré derrière un proxy à secret |
