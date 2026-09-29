# UC-14 — Ouvrir et refermer la salle de classe

| | |
|---|---|
| **Acteur principal** | Enseignant (connaît le mot de passe de salle `SECRET_PASSWD`) |
| **Acteurs secondaires** | Élèves de la salle (entrent sans compte), proxy inverse (pose `X-Real-IP`) |
| **Déclencheur** | L'enseignant saisit le mot de passe sur `/enseignant` (ou sur l'écran de mot de passe de `/school`) |
| **Pages** | `src/pages/enseignant.tsx` (console : ouvrir / refermer), `src/pages/school.tsx` + `src/context/ProtectedPage.tsx` (écran verrouillé de la classe), `src/pages/session.tsx` (ancienne adresse de la console) |
| **API** | `POST /api/auth { password }`, `POST /api/auth { action: 'close', password }`, `GET /api/auth` |
| **Code serveur** | `src/pages/api/auth.ts`, `src/server/access.ts` (`getClientIp`, `salleDepuisIp`, `setAuthLock`, `clearAuthLock`, `checkAuthLock`, `getAuthLockExpiry`, `isAccessAllowed`, `isKnownIp`, `mayUseServerKeys`, `isRateLimited`), `src/server/etablissements.ts` (`resolveEtablissementByIp`, `parseHours`, `isWithinSchedule`, `isValidClock`), `src/utils/env.ts` |

## Objectif

Permettre à un enseignant, **physiquement sur le réseau de son école**, d'ouvrir pour une durée
donnée la « salle » de cette école : pendant ce temps, tout poste de ce réseau utilise la clé
interne de la plateforme (dépense imputée à l'école), sans compte ni clé personnelle. La salle
se referme d'elle-même à l'échéance, ou avant par un geste explicite.

## Préconditions

- `SECRET_PASSWD` liste un ou plusieurs **hachés bcrypt** séparés par des virgules.
- L'adresse appelante appartient à une école : liste `ips` d'un établissement en base, ou, à
  défaut, `SECRET_ALLOWED_IPS` (portée d'**amorçage**, déploiement mono-établissement).
- L'IP est celle que voit le serveur (`getClientIp`) : `X-Real-IP` n'est honoré que si la
  requête vient d'un proxy de confiance (`SECRET_PROXY_TOKEN` via `X-Proxy-Token`, ou
  `TRUSTED_PROXY_IPS`) ; sans aucune des deux variables, mode historique non durci (honoré).

## Scénario nominal — ouvrir la salle

1. Sur `/enseignant`, l'enseignant tape le mot de passe et choisit une durée ; la console envoie
   `POST /api/auth { password: "<mot de passe><minutes>" }` (la durée est **suffixée**).
2. Le serveur résout la **portée** depuis l'adresse (`salleDepuisIp`) : `etab:<id>` pour une
   école en base, `amorcage` pour une adresse `SECRET_ALLOWED_IPS` — jamais depuis le corps.
3. Il compare au(x) haché(s) bcrypt les lectures possibles de la saisie, dans cet ordre : la
   saisie entière (sans suffixe), puis la saisie privée de 1 à 6 chiffres finaux, puis la
   coupure historique (tous les chiffres finaux) ; la première qui correspond donne la durée,
   plafonnée à `SECRET_MAX_UNLOCK_MINUTES` (600 par défaut).
4. Il écrit l'échéance de **cette salle seule** dans `DATA_DIR/auth_lock.json`
   (`{ version: 2, salles: { "etab:12": <ms> } }`, sous verrou de fichier) et répond
   `200 { success: true, message: "Connexion autorisée" }`. La tentative est journalisée dans
   `auth_log.txt` (durée, jamais le mot de passe).
5. Désormais `mayUseServerKeys(ip)` est vrai pour les adresses de cette école : les élèves
   discutent sur la clé de l'école ; `GET /api/auth` depuis ce réseau répond
   `{ success: true, message: "Autologin activé via verrou" }`.
6. À l'échéance, la salle est fermée (lecture : `Date.now() < échéance`).

## Scénarios alternatifs

- **A1 — Durée démesurée.** `motdepasse99999` est ramené au plafond `SECRET_MAX_UNLOCK_MINUTES`.
- **A1 bis — Sans suffixe de durée.** `motdepasse` seul (écran verrouillé `/school`, qui envoie
  le mot de passe tel que tapé) ouvre la salle pour la **durée par défaut de 60 min** (celle de la
  console `/enseignant`), plafonnée elle aussi par `SECRET_MAX_UNLOCK_MINUTES`.
- **A2 — Salle déjà ouverte.** Un `GET` du réseau court-circuite en « Autologin ». Un `POST`
  reste une demande d'ouverture : mot de passe vérifié (401 et échec compté s'il est faux) et,
  s'il est juste, l'échéance est **remplacée** par la nouvelle durée (y compris pour la
  raccourcir).
- **A3 — Fermeture anticipée.** `POST /api/auth { action: 'close', password }` depuis le réseau
  de l'école : le mot de passe est exigé (un élève ne peut pas couper la classe), seule **la
  salle de cette école** est retirée du fichier (les autres restent ouvertes) ;
  `200 { success: true, message: "Accès fermé" }`. Idempotent.
- **A4 — État.** `GET /api/auth` : `{ authorized: false }` si rien n'est ouvert pour ce réseau.
- **A5 — Poste d'école dans ses horaires.** En `GET`, une adresse d'école — en base, dans ses
  horaires propres (à défaut les horaires globaux), ou d'amorçage `SECRET_ALLOWED_IPS` dans
  `SECRET_ALLOWED_HOURS` — entre sans mot de passe (`"Connexion autorisée via IP"`) et pose un
  **verrou de courtoisie** de 30 min sur la salle de cette école (au mieux : un échec d'écriture
  n'empêche pas l'entrée). Même règle que `mayUseServerKeys` (`horairesOuverts`).
- **A6 — Préparer de chez soi.** Impossible d'ouvrir hors du réseau (voir erreurs) ; un
  **jeton d'enseignant n'est pas accepté** par `/api/auth` : il rouvrirait la dépense à
  distance. On prépare la séance via `/api/session-settings` (UC-15).

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| Bon mot de passe, adresse d'aucune école (ou `X-Real-IP` forgé sans proxy de confiance) | `403 { error: { code: 'ERR_NO_ETABLISSEMENT' } }` — **non compté** comme échec |
| Mauvais mot de passe (ouverture ou fermeture, salle ouverte ou non, dans les horaires ou non) | `401 { success: false, message: 'Mot de passe incorrect' }`, **un** échec compté pour l'IP (quel que soit le nombre de lectures essayées) |
| 5 échecs pour une IP (ouverture et fermeture confondues) | verrouillage 15 min : `429` sur `POST` (**y compris** `action: 'close'`) **et** `GET`, compteur remis à zéro |
| Fermeture hors réseau scolaire | `403 ERR_NO_ETABLISSEMENT` |
| Champ `password` absent, corps absent ou mot de passe non textuel | `400 { message: 'Erreur du formulaire de connexion' }` — non compté |
| Bon mot de passe avec durée nulle explicite (`motdepasse0`) | `400 { message: "Durée d'ouverture invalide" }` — non compté, salle non ouverte |
| Écriture du verrou impossible (disque, verrou de fichier) | `500 { error: { code: 'ERR_LOCK_WRITE' } }` — jamais un faux « ouvert » / « fermé » |
| `SECRET_PASSWD` absent | tout mot de passe → `401` |
| Méthode autre que `GET`/`POST` (salle ouverte ou non) | `405`, en-tête `Allow: POST, GET` |

## Règles métier et sécurité

- **La portée vient de l'adresse, jamais du corps** : un mot de passe échappé ne peut ouvrir que
  la salle du réseau d'où il est tapé ; depuis Internet, il n'ouvre rien.
- Le verrou est **par école** : plusieurs écoles ouvertes en même temps ne se voient pas ; une
  fermeture ou une expiration ne touche qu'une entrée. Seule une écriture purge les échéances
  dépassées ; une lecture ne modifie jamais le fichier.
- L'**ancien format** `{ timestamp }` (verrou global), un fichier tronqué, une échéance non
  numérique : tenus pour **fermés** ; la première écriture remplace le document.
- `setAuthLock` et `clearAuthLock` **lèvent** en cas d'échec d'écriture : l'appelant dit l'échec.
- Salle ouverte **prime** sur l'horaire ; sinon, horaires propres de l'école (`hours`, jours
  0 = dimanche, bornes incluses, fuseau `SET_TIME_ZONE`), à défaut horaires globaux
  (`SECRET_ALLOWED_HOURS`, JSON invalide ⇒ fermé). Hors de toute école : jamais de dépense.
- `getClientIp` : `X-Forwarded-For` jamais lu ; `X-Real-IP` invalide ⇒ adresse socket
  (`::ffff:` retiré) ⇒ `unknown`.
- `isRateLimited(ip, max, périmètre)` : fenêtre d'une minute par couple périmètre/IP, fichier
  `rate_limit.json` sous verrou, purge des fenêtres expirées, et **laisse passer** en cas
  d'incident de fichier.
- Le mot de passe saisi n'est **jamais journalisé**.

## Postconditions

- Ouverture : entrée `salles["etab:<id>" | "amorcage"]` = échéance dans `auth_lock.json`.
- Fermeture : entrée supprimée, autres entrées intactes.
- Échec : `failed_attempts.json[ip] = { count, lockUntil }` mis à jour ; ligne dans `auth_log.txt`.

## Tests

### Unitaires — `tests/unit/uc14-salle-classe/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `clientIp.test.ts` | `getClientIp`, `isKnownIp` | mode historique (X-Real-IP honoré, repli socket, `::ffff:`, `unknown`, X-Forwarded-For ignoré), `SECRET_PROXY_TOKEN` (bon / mauvais / absent, prime sur la liste), `TRUSTED_PROXY_IPS` (pair listé ou non), `SECRET_ALLOWED_IPS` (entrées invalides écartées) |
| `verrou.test.ts` | `salleDepuisIp`, `porteeEtablissement`, `setAuthLock`, `clearAuthLock`, `checkAuthLock`, `getAuthLockExpiry` | portée école / amorçage / aucune, priorité de la base, format v2, isolement entre écoles, écritures concurrentes, durée nulle/négative/NaN/décimale, échéance, purge à l'écriture seulement, fermeture ciblée et idempotente, ancien format et fichiers corrompus tenus pour fermés |
| `horaires.test.ts` | `isValidClock`, `parseHours`, `isWithinSchedule`, `isAccessAllowed`, `mayUseServerKeys` | bornes horaires, créneaux invalides écartés, bornes incluses, dimanche = 0, horaires globaux (absents, invalides), priorité horaires propres / globaux, salle ouverte qui prime, amorçage, refus hors école |
| `rateLimit.test.ts` | `isRateLimited` | plafond, séparation IP/périmètre, fenêtre glissante d'une minute, fichier corrompu |

### Fonctionnels — `tests/functional/uc14-salle-classe/`

| Scénario | Test |
|---|---|
| Nominal | `salle.test.ts` — ouverture suffixée : échéance exacte, `mayUseServerKeys` vrai ; second mot de passe de la liste ; isolement des autres écoles et d'Internet ; auto-login GET ; fermeture à l'échéance ; mot de passe absent du journal |
| A1 | durée ramenée au plafond |
| A2 | salle déjà ouverte : un POST au bon mot de passe remplace l'échéance (la raccourcit) |
| A3 | fermeture ciblée (autre école intacte, plus d'auto-login), fermeture idempotente |
| A4 | GET `{ authorized: false }` |
| A5 | `acces-ip-horaires.test.ts` — poste d'amorçage dans ses horaires (courtoisie 30 min partagée par les adresses d'amorçage), hors horaires (mot de passe requis), adresse inconnue, aucun verrou hors plage ; école en base dans / hors de ses horaires propres (aligné sur `mayUseServerKeys`) |
| A6 / droits | jeton d'enseignant sans mot de passe refusé |
| Erreurs | hors réseau (403, non compté) ; jeton sans mot de passe, corps absent, mot de passe non textuel (400, non compté) ; durée nulle explicite (400) ; mauvais mot de passe (401 compté) ; 5 échecs → 429 POST et GET, autre IP libre, reprise après 15 min ; 5 fermetures fausses → verrouillage ; fermeture fausse / sans mot de passe / hors réseau ; 405 ; X-Real-IP invalide |
| Anti-usurpation | `acces-ip-horaires.test.ts` — `SECRET_PROXY_TOKEN` (forgé → 403, jeton correct → 200), `TRUSTED_PROXY_IPS` (pair non listé → 403) ; serveur sans `SECRET_PASSWD` → 401 |
| Anomalies corrigées | `salle.test.ts` — sans suffixe → 60 min, fermeture soumise au verrouillage ; salle ouverte : POST faux → 401 compté, POST sans mot de passe → 400, DELETE → 405 ; traînée de 2000 chiffres → 401, un seul échec ; coupure historique (8 chiffres) toujours acceptée. `acces-ip-horaires.test.ts` — mot de passe `Salle2024` : suffixé (30 min), seul (60 min), suffixe d'un chiffre (5 min), amputé (`Salle30` → 401) ; école en base dans ses horaires ; POST faux dans les horaires → 401 |

## Anomalies constatées

1. **Corrigée** — sans suffixe, la durée vaut désormais 60 min (`DEFAULT_UNLOCK_MINUTES`, défaut
   de la console `/enseignant`), plafonnée par `SECRET_MAX_UNLOCK_MINUTES` ; une durée nulle
   explicite (`motdepasse0`) répond `400` au lieu d'un faux « Connexion autorisée ». *Choix :*
   le commentaire du code annonçait déjà une « durée par défaut », et l'écran `/school`
   (`ProtectedPage.tsx`) n'envoie jamais de suffixe — un refus 400 l'aurait rendu inutilisable
   pour ouvrir ; une durée par défaut bornée ne donne rien de plus que ce que la console permet
   déjà, et l'ouverture se referme d'elle-même.
   *Constat initial :* **Ouverture sans suffixe de durée annoncée comme réussie mais sans effet** —
   `src/pages/api/auth.ts:304-353` : sans chiffres finaux, la durée vaut 0, `setAuthLock(cle, 0)`
   pose une échéance égale à maintenant (salle fermée), et la route répond pourtant
   `200 "Connexion autorisée"`. L'écran hérité `ProtectedPage.tsx` envoie le mot de passe tel que
   tapé : l'enseignant voit la classe ouverte chez lui, les élèves restent bloqués.
2. **Corrigée** — la branche `close` vérifie `isIpLocked` en tête et répond `429` (même réponse
   que le mot de passe soit juste ou faux) ; ses échecs continuent d'alimenter le même compteur,
   si bien que 5 fermetures fausses verrouillent aussi l'ouverture.
   *Constat initial :* **La fermeture contourne le verrouillage après 5 échecs** — `src/pages/api/auth.ts:204-238` :
   la branche `action: 'close'` est traitée avant `isIpLocked` (l. 280). Une IP verrouillée peut
   donc tester indéfiniment des mots de passe via `close` (401 si faux, 200/403 si juste) : oracle
   de force brute sans limite.
3. **Corrigée** — la saisie n'est plus coupée une fois pour toutes : on compare aux hachés la
   saisie entière (durée par défaut), puis la saisie privée de 1 à 6 chiffres finaux, puis la
   coupure historique (tous les chiffres finaux) ; la première lecture qui correspond donne la
   durée (`lecturesPossibles` / `verifierMotDePasse`, `src/pages/api/auth.ts`). Rétrocompatible :
   toute saisie qui ouvrait avant ouvre encore, avec la même durée. Coût borné à 8 comparaisons
   bcrypt (asynchrones) par haché, quelle que soit la longueur de la saisie ; un seul échec
   compté par requête. *Ambiguïté résiduelle assumée :* si deux lectures correspondent à deux
   hachés différents, les chiffres restent au mot de passe (lecture la plus longue).
   *Constat initial :* **Un mot de passe de salle finissant par des chiffres est inutilisable** —
   `src/pages/api/auth.ts:28-38` : `/^(.+?)(\d+)$/` prend **tous** les chiffres finaux pour la
   durée ; `Salle2024` est comparé comme `Salle`.
4. **Corrigée** — `/api/auth` et `mayUseServerKeys` partagent désormais `horairesOuverts(portee)`
   (`src/server/access.ts`) : une école en base, dans ses horaires propres (à défaut les
   horaires globaux), entre en `GET` sans mot de passe et reçoit le verrou de courtoisie sur sa
   propre salle (`etab:<id>`).
   *Constat initial :* **Une école en base n'entre jamais par ses horaires sur `/api/auth`** —
   `src/pages/api/auth.ts:253` ne teste que `isKnownIp` (`SECRET_ALLOWED_IPS`) et les horaires
   globaux, alors que `mayUseServerKeys` (`src/server/access.ts:357-372`) honore les écoles en
   base et leurs horaires propres : l'écran verrouillé de `/school` demande le mot de passe à une
   classe qui aurait pourtant le droit de dépenser.
5. **Corrigée** (hors code mort) — `password` absent ou non textuel, ou corps absent, répond
   `400` sans compter d'échec ; le test `SecretPasswords === undefined`, inoffensif, est laissé.
   *Constat initial :* **Champ `password` manquant → 500** (`src/pages/api/auth.ts:297-301`) : erreur du client
   rendue comme erreur serveur ; un corps absent (`req.body` indéfini) ferait même lever la
   déstructuration l. 288. Le test `SecretPasswords === undefined` (l. 291) est du code mort
   (`SecretPasswords` vaut `[]` au pire).
6. **Corrigée** — les méthodes autres que `GET`/`POST` sont refusées (`405`) en tête de route ;
   les courts-circuits « salle ouverte » et « dans les horaires » ne valent plus que pour `GET`.
   Un `POST` est toujours vérifié (401 compté s'il est faux) et, juste, remplace l'échéance :
   la console `/enseignant` annonçait déjà « ouvert pour N minutes », c'est désormais exact même
   sur une salle ouverte. L'écran `/school` (`ProtectedPage.tsx`) n'est pas affecté : il
   interroge en `GET` et ne POSTe que salle fermée.
   *Constat initial :* **Salle ouverte : toute requête répond succès** (`src/pages/api/auth.ts:243-250`), y compris
   un `DELETE` ou un `POST` avec un mot de passe faux — sans conséquence de sécurité (la salle est
   déjà ouverte à ce réseau), mais la route ne renvoie jamais 405 / 401 dans ce cas.
7. **Corrigée** — tous les appels à `handleFailedAttempt` et `logAttempt` de la route sont
   attendus : le compteur est inscrit avant la réponse.
   *Constat initial :* `handleFailedAttempt` et `logAttempt` ne sont **pas attendus** (`auth.ts:209-210, 355-356`) :
   la réponse part avant l'écriture du compteur ; deux essais très rapprochés peuvent être vus
   avant que le verrouillage soit inscrit.
