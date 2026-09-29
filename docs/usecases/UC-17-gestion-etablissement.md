# UC-17 — Administrer son établissement

| | |
|---|---|
| **Acteur principal** | Administrateur d'école (lien `user_etablissements.is_admin = 1` sur l'école active) |
| **Acteurs secondaires** | Enseignant rattaché (lecture seule), super-administrateur (règle ce que l'école ne règle pas) |
| **Déclencheur** | L'administrateur ouvre `/etablissement` (ou la zone « établissement » de `/enseignant`) |
| **Pages** | `src/pages/etablissement.tsx`, `src/pages/enseignant.tsx`, `src/administration/TuteursEcole.tsx`, `src/administration/TarifEcole.tsx` (via `Factures.tsx`), `src/administration/PorteMonnaie.tsx` (curseur de contribution) |
| **API** | `GET`/`PUT /api/etablissement`, `POST /api/admin/etablissements { action: "catalogue" }`, `POST /api/admin/credits { action: "contribution" }`, `GET /api/admin/tarifs?portee=ecole` |
| **Code serveur** | `src/server/appartenance.ts` (`choixEcole`, `ecoleActivePourCompte`, `estAdminDe`, `estEnseignantDe`, `definirAdminEcole`, `lierCompte`, `ecoleEnseignante`…), `src/server/etablissements.ts` (`parseHours`, `isValidClock`, `isWithinSchedule`, `monthUsage`, `studentDayUsage`, `consommationDuMois`), `src/server/admin.ts` (`requireAdmin`), `src/server/porteMonnaie.ts` (`reglerContribution`, `contributionDe`), `src/server/access.ts` (`isRateLimited`) |

## Objectif

Donner à une école la main sur **ce qui la concerne elle seule** : ses horaires d'accès libre,
le quota quotidien par élève, le plafond mensuel, l'ouverture de l'atelier de promptagogue sur
son accueil, l'ouverture de son catalogue aux tuteurs des autres écoles et son taux de
contribution aux frais (3,5 à 10 %). Tout enseignant rattaché peut **lire** ces réglages et la
consommation du mois ; seul un administrateur de l'école peut les **modifier**. Les IP, le statut
RESPIRE, le fournisseur actif et l'email de facturation restent la main du site (UC-18).

## Préconditions

- Le compte est vérifié (jeton `Authorization: Bearer`, UC-04).
- Le compte a une **école active** : le choix annoncé par `x-educhat-ecole` s'il est lié en base,
  sinon l'école principale (`users.etablissement_id`) si elle est liée, sinon le plus ancien lien.
- Sur cette école active, le compte est **administrateur** (lien `is_admin = 1`) — ou, pour la
  seule lecture, **enseignant au sens où l'école en répond** (`is_teacher = 1` **et** école
  principale = école active).

## Scénario nominal — régler horaires, quotas et atelier

1. La page `/etablissement` appelle `GET /api/etablissement` avec le jeton et l'en-tête
   `x-educhat-ecole` posé par le sélecteur d'école.
2. Le serveur résout l'école active (`ecoleActivePourCompte`), puis le rang (`estAdminDe`) ; il
   rend `{ isAdmin: true, etablissement: { name, ips, respire, hours, quotaPerStudentDaily,
   tokenQuotaMonthly, atelierPromptagogue }, usage: { monthTokens, byProvider } }`.
3. L'administrateur édite les créneaux (jour 0 = dimanche, `HH:MM`), les quotas et la case
   « atelier », puis enregistre.
4. `PUT /api/etablissement { hours, quotaPerStudentDaily, tokenQuotaMonthly, atelierPromptagogue }` :
   le rang est **revérifié** sur l'école active, chaque créneau est validé, les quotas sont bornés,
   puis la ligne `etablissements` est mise à jour. Réponse `200 { ok: true }`.

## Scénarios alternatifs

- **A1 — Enseignant rattaché.** `GET` répond `isAdmin: false` : l'écran montre les réglages
  inertes et la consommation. Un `PUT` est refusé `403 ERR_NOT_SCHOOL_ADMIN`.
- **A2 — Compte multi-écoles.** L'en-tête `x-educhat-ecole` désigne l'école à lire/régler ; un
  identifiant non lié au compte est **ignoré** (retour à l'école principale, jamais à l'école
  annoncée). Administrateur de A et simple membre de B : avec B active, aucun accès (`403`).
- **A3 — Ouvrir / fermer le catalogue.** `POST /api/admin/etablissements { action: "catalogue",
  catalogueOuvert }` (`TuteursEcole.tsx`) : n'écrit que `catalogue_ouvert`, **sur l'école de la
  portée** — l'`id` envoyé par un administrateur d'école est ignoré. Un super-administrateur doit
  fournir l'`id` (sinon `400 ERR_ETAB_UNKNOWN`).
- **A4 — Choisir la contribution.** `POST /api/admin/credits { action: "contribution", pct }` :
  taux ramené dans `[3.5 ; 10]` et rendu tel qu'enregistré. Sans choix (`-1`), le réglage du
  serveur (`SECRET_BILLING_SURCHARGE_PCT`, 10 % par défaut) s'applique.
- **A5 — Lire le tarif de son fournisseur.** `GET /api/admin/tarifs?portee=ecole` (`TarifEcole.tsx`)
  rend `providerActif` (réglé par le site) et les barreaux relevés par la sonde, ou `echelle: null`.
- **A6 — Préparer sa classe hors du réseau.** `ecoleEnseignante` rend l'école active à
  l'administrateur ou à l'enseignant rattaché même hors IP de l'école (pédagogie), mais **jamais**
  au simple membre reconnu par l'IP ; elle ne décide jamais qui paie.

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| Pas de jeton (même depuis l'IP de l'école) | `401 ERR_AUTH_REQUIRED` |
| Aucune école active, ou ni admin ni enseignant rattaché (lien gagné par IP + case « enseignant ») | `403 ERR_NO_ETABLISSEMENT` |
| `PUT` par un enseignant sans rang | `403 ERR_NOT_SCHOOL_ADMIN` |
| Créneau invalide (jour hors 0-6, heure mal formée, début ≥ fin) | `400 ERR_HOURS_INVALID`, rien n'est écrit |
| Plus de 10 `PUT` / minute depuis une IP | `429 ERR_RATE_LIMIT` |
| Méthode autre que `GET`/`PUT` | `405 ERR_METHOD_NOT_ALLOWED`, en-tête `Allow: GET, PUT` |
| Action « catalogue » ou « contribution » sans rang d'administration | `403 ERR_FORBIDDEN` |
| Contribution pour l'école d'autrui | `403 ERR_FORBIDDEN` |
| Contribution illisible | `400 ERR_AMOUNT_INVALID` |
| Grand formulaire d'établissement (IP, RESPIRE…) par une école | `403 ERR_FORBIDDEN` |
| Vue « site » des tarifs demandée par une école | `403 ERR_SUPER_ONLY` |

## Règles métier et sécurité

- La gestion ne repose **jamais** sur l'IP : jeton obligatoire, appartenance relue en base à chaque requête.
- L'école active est une **proposition** du navigateur (`choixEcole` : en-tête d'abord, sinon
  `ecoleActiveId` du corps — jamais `etablissementId`), revérifiée par `ecoleActivePourCompte`.
- L'école d'abord, le rang ensuite : un identifiant annoncé ne peut jamais désigner l'école d'autrui.
- Le simple lien d'appartenance (gagné en vérifiant son adresse depuis l'IP de l'école) ne donne
  **aucun** accès : `estEnseignantDe` exige `is_teacher` **et** l'école principale.
- Quotas bornés : quota par élève `[0 ; 10 000 000]`, plafond mensuel `[0 ; 10 000 000 000]`,
  valeur illisible → 0 ; au plus 30 créneaux (les suivants sont ignorés).
- `atelierPromptagogue` n'est écrit que si le champ est **présent** dans le corps.
- Le `PUT` ignore tout autre champ (nom, IP, RESPIRE, fournisseur, facturation).
- Le relevé par fournisseur énumère les fournisseurs servis par une clé serveur (zéro compris), puis
  ceux consommés mais plus servis (`servi: false`) ; seule la clé serveur y entre.
- `definirAdminEcole` écrit le rang **et** le miroir `users.is_school_admin` dans la même
  transaction ; retirer le rang laisse le lien.

## Postconditions

- `etablissements.hours` (JSON), `quota_per_student_daily`, `token_quota_monthly`,
  éventuellement `atelier_promptagogue`, `catalogue_ouvert`, `contribution_pct` mis à jour pour
  **la seule école active**.

## Anomalies constatées

- **PUT partiel destructeur** — `src/pages/api/etablissement.ts:135-159`. Le commentaire promet
  qu'« un futur appelant partiel ne cassera rien en silence », mais seule la case atelier suit la
  règle « présence du champ ». Un `PUT { atelierPromptagogue: true }` remet `hours` à `[]` et les
  deux quotas à `0` (quota illimité). L'écran actuel envoie toujours tout, donc sans effet visible
  aujourd'hui ; test : « ANOMALIE : un PUT partiel efface pourtant horaires et quotas… ».
- **Plafond mensuel : deux commentaires qui se contredisent** — `src/pages/api/etablissement.ts:23-27`
  le dit réglable par l'école (et le code l'écrit), alors que `src/pages/api/admin/etablissements.ts:7-10`
  et `:49-50` réservent « les quotas » au site. Le super-administrateur et l'école écrivent donc
  la même colonne ; le dernier qui enregistre l'emporte.

## Tests

### Unitaires — `tests/unit/uc17-gestion-etablissement/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `etablissements.test.ts` | `isValidClock`, `parseHours`, `isWithinSchedule`, `getEtablissementById`, `monthUsage`, `studentDayUsage`, `monthUsageByProvider`, `consommationDuMois` | heures valides/invalides, filtrage des créneaux, JSON illisible, créneau en heure locale Zurich et bornes incluses, jour de la semaine, total du mois par école, usage du jour par navigateur, détail clé serveur trié, fournisseurs servis/non servis selon les clés |
| `appartenance.test.ts` | `choixEcole`, `ecoleActivePourCompte`, `ecoleActive`, `estMembre`, `estAdminDe`, `estEnseignantDe`, `listerEcoles`, `listerMembres`, `ecolePrincipale`, `definirAdminEcole`, `delierCompte`, `ecoleEnseignante` | en-tête/corps/valeurs rejetées, choix lié/non lié, repli principale puis plus ancien lien, rang par lien, enseignant = case + principale, ordre du sélecteur, miroir `is_school_admin`, refus du simple membre |
| `contribution.test.ts` | `reglerContribution`, `contributionDe`, `CONTRIBUTION_MIN/MAX` | bornes 3,5–10, taux enregistré, écrêtage, défaut serveur, plancher pour une personne |

### Fonctionnels — `tests/functional/uc17-gestion-etablissement/etablissement.test.ts`

| Scénario | Test |
|---|---|
| Nominal | GET : réglages, consommation, `isAdmin` ; PUT puis relecture ; champs réservés au site ignorés |
| A1 | enseignant rattaché : lecture `isAdmin=false`, PUT `403 ERR_NOT_SCHOOL_ADMIN` |
| A2 | admin de deux écoles : l'en-tête choisit ; école non liée ignorée ; membre simple de B → 403 |
| Droits | sans jeton ; sans école ; case enseignant + lien d'IP ; IP de l'école sans jeton |
| Erreurs | créneaux invalides ; bornage des quotas ; 30 créneaux max ; 429 après 10 PUT/min ; 405 |
| Règle atelier | présence du champ ; **anomalie** PUT partiel |
| A3 | catalogue de SON école quel que soit l'id ; enseignant refusé ; lecture de sa seule ligne, grand formulaire refusé |
| A4 | contribution bornée ; illisible 400 ; école d'autrui et enseignant 403 |
| A5 | tarif de l'école : fournisseur actif, `echelle: null` ; vue site refusée |
