# UC-16 — Inscrire un établissement en libre-service et accueillir ses élèves

| | |
|---|---|
| **Acteur principal** | Titulaire d'un compte vérifié (futur responsable d'école) |
| **Acteurs secondaires** | Élèves et visiteurs du réseau de l'école (accueil public), super-administration (notifiée, accorde RESPIRE / crédit) |
| **Déclencheur** | Le responsable ouvre `/etablissement` ; faute d'école reconnue, la page propose le formulaire d'inscription |
| **Pages** | `src/pages/etablissement.tsx` (accueil public, inscription, puis espace responsable), `src/pages/etablissements.tsx` (guide des établissements), `src/site/SelecteurEcole.tsx` (école active après inscription, via `/api/me`) |
| **API** | `GET /api/ip`, `POST /api/etablissement/inscription`, `GET /api/etablissement/accueil` (et `?bref=1`) |
| **Code serveur** | `src/pages/api/etablissement/inscription.ts`, `src/pages/api/etablissement/accueil.ts`, `src/pages/api/ip.ts`, `src/server/appartenance.ts` (`definirAdminEcole`, `ecoleEnseignante`), `src/server/etablissements.ts` (`resolveEtablissementByIp`, `getEtablissementById`), `src/server/prompts.ts` (`porteeAppelant`, `listPublished`, `nomsDeLEcole`), `src/server/access.ts` (`getClientIp`, `isRateLimited`, `isKnownIp`), `src/server/mail.ts` (`notifyAdmin`) |

## Objectif

Permettre à n'importe quel compte vérifié de **créer son école sans intervention** de la
plateforme, en deux champs (nom de l'école, nom du responsable), sans pouvoir s'attribuer ni
avantage (RESPIRE, solde, quotas) ni le réseau d'une autre école. L'école est reconnue par
l'**adresse d'où l'on s'inscrit** ; depuis ce réseau, sa page d'accueil publique montre ensuite
aux élèves ses tuteurs, sans compte.

## Préconditions

- Le demandeur a un compte vérifié (UC-04) et son jeton ; il n'a pas encore d'**école
  principale** (`users.etablissement_id` nul).
- Idéalement, il écrit depuis le réseau de son école (l'adresse sera constatée, pas saisie).

## Scénario nominal

1. Sur `/etablissement`, la page lit `GET /api/ip` → `{ ip, isIpAllowed, revendiquee }` et
   `GET /api/etablissement/accueil` → `ecole: null` : elle affiche le formulaire, et l'adresse
   que verra le serveur (pour information : elle n'est pas transmise).
2. Le responsable saisit le nom de l'école et le sien ;
   `POST /api/etablissement/inscription { name, adminName }` avec `Authorization: Bearer`.
3. Dans **une transaction** : refus si le compte a déjà une école principale ; adresse constatée
   (`getClientIp`) retenue si aucune école ne la revendique (comparaison **canonique**) ; insertion
   de l'école avec **seulement** `name`, `ips`, `billing_email` (= adresse du jeton), `created_at` ;
   le compte devient `is_teacher = 1`, `etablissement_id = <école>`, nom écrit s'il était vide ;
   `definirAdminEcole` pose le lien `is_admin = 1` et le miroir `is_school_admin`.
4. Hors transaction, l'administration est notifiée (nom, responsable, IP retenue, « RESPIRE non
   accordé »). Réponse `201 { ok: true, id, ipRetenue }`.
5. La page affiche l'adresse réellement enregistrée ; le sélecteur d'école (`/api/me`) montre la
   nouvelle école, administrée.
6. Depuis ce réseau, un élève sans compte ouvre `/etablissement` :
   `GET /api/etablissement/accueil` → `{ ecole: { name }, tuteurs: [...] }` — les tuteurs
   **de l'école** qu'il peut voir (publics ou réservés), ni ceux de la plateforme ni ceux des autres.

## Scénarios alternatifs

- **A1 — Adresse déjà revendiquée.** L'inscription **réussit**, l'école est créée **sans adresse**
  (`ipRetenue: ''`) ; l'école voisine garde ses élèves ; la notification le signale.
- **A2 — Graphies équivalentes.** `::ffff:198.51.100.7` et `198.51.100.7`, ou deux écritures d'une
  même IPv6, sont reconnues comme la même machine au dédoublonnage.
- **A3 — Adresse libre.** Elle est enregistrée **telle que vue** (sans canonisation), pour que
  `resolveEtablissementByIp` (comparaison exacte) la reconnaisse ensuite.
- **A4 — Depuis le réseau d'une autre école** (« mon établissement n'est pas celui-ci ») :
  inscription possible, sans adresse.
- **A5 — Compte simplement lié** à une école (rattaché par IP, sans école principale) : peut
  inscrire la sienne.
- **Accueil — hors réseau scolaire** : `{ ecole: null, atelierPromptagogue: false, tuteurs: [] }`
  (la page bascule sur l'inscription).
- **Accueil — enseignant chez lui** avec son jeton : l'école de son titre (`ecoleEnseignante`) ;
  un élève simplement rattaché n'en a pas.
- **Accueil « bref »** (`?bref=1`, ligne de profils de l'accueil du site) : résolu par l'**IP
  seule** → `{ ecole, atelierPromptagogue, tuteurs: [] }`.

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| Sans jeton ou jeton invalide | `401 ERR_AUTH_REQUIRED` |
| Plus de 3 appels / min depuis une IP (échecs compris — le débit est compté avant la validation) | `429 ERR_RATE_LIMIT` |
| Nom d'école vide | `400 ERR_NAME_INVALID` |
| Nom du responsable vide | `400 ERR_ADMIN_NAME_INVALID` |
| Compte déjà doté d'une école principale | `409 ERR_ALREADY_ATTACHED` |
| Jeton valide, compte absent de la base | `500 ERR_SIGNUP_FAILED`, école annulée (rollback) |
| Méthode autre que `POST` (inscription) / `GET` (accueil) | `405 ERR_METHOD_NOT_ALLOWED` |

## Règles métier et sécurité

- **L'inscrit n'écrit que deux champs.** `respire`, `solde`, `token_quota_monthly`,
  `quota_per_student_daily`, `contribution_pct`, `billing_address`, `ips`, `billing_email` du
  corps sont **ignorés** : ils ne sont même pas nommés dans l'INSERT (défauts de la base).
- **L'adresse de reconnaissance est constatée**, jamais saisie ; deux écoles ne partagent jamais
  une adresse.
- **L'email de facturation vient du jeton** (adresse vérifiée). L'**adresse postale** n'est plus
  demandée : elle se saisit au moment de la facture (mentions de facture).
- Le rang d'administrateur vaut pour **cette école seule** (lien `user_etablissements`).
- Noms bornés à 120 caractères ; un nom de compte déjà choisi n'est pas écrasé.
- L'accueil public ne sort que le **nom** de l'école et des cartes de tuteurs passées par
  `CLAUSE_VISIBLE` ; `Cache-Control: private, no-store` (réponse dépendante de l'IP).
- Une école fraîchement inscrite ne dépense rien : ni RESPIRE, ni horaires, ni salle ouverte.

## Postconditions

- Ligne `etablissements` (défauts partout sauf nom, adresse, email, date) ; `users` : enseignant,
  école principale, `is_school_admin = 1` ; `user_etablissements` : lien `is_admin = 1` ;
  notification à l'administration.

## Tests

### Unitaires — `tests/unit/uc16-inscription-etablissement/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `appartenance.test.ts` | `definirAdminEcole`, `estAdminDe`, `estMembre`, `listerEcoles`, `delierCompte`, `resolveEtablissementByIp`, `getEtablissementById` | création du lien et du miroir, promotion sans doublon, rang par école, retrait (lien conservé, miroir à 0), déliaison, ordre et rangs de la liste des écoles, comparaison exacte des graphies d'adresse |

### Fonctionnels — `tests/functional/uc16-inscription-etablissement/`

| Scénario | Test |
|---|---|
| Nominal | `inscription.test.ts` — `/api/ip` libre → inscription 201 → colonnes par défaut, compte enseignant-admin, lien admin, notification → `/api/ip` revendiquée → accueil nommé ; école neuve sans droit de dépense |
| Règles | champs interdits ignorés ; nom borné ; nom du responsable écrit seulement s'il manque |
| A1 – A5 | adresse revendiquée (école sans adresse, voisine intacte) ; dédoublonnage IPv4 mappée / IPv6 ; adresse libre stockée telle quelle et reconnue ; depuis une autre école ; compte simplement lié |
| Erreurs | 401 ; 400 nom / responsable ; 409 (et seconde inscription) ; 500 + rollback ; 429 ; 405 |
| Accueil | `accueil.test.ts` — élève du réseau (tuteurs de l'école seulement, rien d'autre dans la réponse) ; hors réseau ; enseignant chez lui ; élève rattaché chez lui ; « bref » (atelier, IP seule) ; 405 |
| `/api/ip` | adresse et revendication ; X-Forwarded-For ignoré ; `isIpAllowed` avec `SECRET_ALLOWED_IPS` |

## Anomalies constatées

1. **`/api/ip` et l'inscription ne jugent pas « revendiquée » de la même façon** —
   `src/pages/api/ip.ts:21` compare les chaînes exactement (`resolveEtablissementByIp`), alors que
   l'inscription dédoublonne sur la forme canonique (`src/pages/api/etablissement/inscription.ts:170-180`).
   Pour une graphie différente d'une adresse déjà prise (ex. `::ffff:198.51.100.7`), le formulaire
   annonce une adresse libre puis l'école est créée **sans adresse** (`ipRetenue: ''`) — l'écran
   final le redit, mais l'avertissement préalable promis n'a pas lieu.
2. **Le débit est compté avant la validation** (`inscription.ts:96`) : trois saisies invalides
   (nom vide) suffisent à bloquer une minute l'inscription légitime depuis le même réseau.
   Comportement probablement voulu (anti-vandalisme) mais visible par l'utilisateur.
