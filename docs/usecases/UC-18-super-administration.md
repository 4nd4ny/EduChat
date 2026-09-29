# UC-18 — Super-administrer les établissements et les comptes

| | |
|---|---|
| **Acteur principal** | Super-administrateur (adresse listée dans `SECRET_ADMIN_EMAILS`) |
| **Acteurs secondaires** | Administrateur d'école (liste et rôles des comptes de SON école), administration (notifiée d'une création d'école) |
| **Déclencheur** | Le super-administrateur ouvre `/admin` ; l'administrateur d'école ouvre la zone « comptes » de `/etablissement` |
| **Pages** | `src/pages/admin.tsx`, `src/pages/admin-demo.tsx` (vitrine statique, aucun appel serveur), `src/administration/Etablissements.tsx`, `src/administration/Comptes.tsx` |
| **API** | `GET`/`POST`/`DELETE /api/admin/etablissements`, `GET`/`POST /api/admin/users` |
| **Code serveur** | `src/server/admin.ts` (`requireAdmin`, `requireSuperAdmin`, `requireGestionTuteurs`, `porteeEcoleActive`, `tuteurDeLEcole`, `dansLaPortee`, `monthStartUtc`), `src/server/token.ts` (`isAdminEmail`), `src/server/appartenance.ts` (`definirAdminEcole`, `lierCompte`, `delierCompte`, `ecolePrincipale`), `src/server/etablissements.ts` (`getEtablissementById`, `resolveEtablissementByIp`), `src/server/mail.ts` (`notifyAdmin`) |

## Objectif

Permettre au **site** de créer et régler les établissements (nom, IP de reconnaissance, statut
RESPIRE, quotas, fournisseur actif, email de facturation) et de gérer les comptes : rattacher un
enseignant à son école principale, nommer ou révoquer un administrateur d'école, retirer ou donner
les rôles enseignant et promptagogue. Un administrateur d'école dispose d'une partie de ces
pouvoirs, **bornée à son école**. Rien ne se supprime.

## Préconditions

- Le compte est vérifié (jeton, UC-04).
- Super-administrateur : son adresse figure dans `SECRET_ADMIN_EMAILS` — aucune interface ne
  permet d'en créer un ; il n'a pas besoin d'exister en base.
- Administrateur d'école : lien `is_admin = 1` sur son **école active** (voir UC-17).

## Scénario nominal — créer une école et y nommer son administrateur

1. Sur `/admin` (réservé au super, `useEcoles().isSuper`), l'écran liste les écoles
   (`GET /api/admin/etablissements`, triées par nom sans égard à la casse).
2. Le super remplit le formulaire et enregistre :
   `POST /api/admin/etablissements { name, ips, respire, tokenQuotaMonthly, quotaPerStudentDaily, billingEmail }`.
   Les IP sont découpées, nettoyées et rejointes par des virgules, chacune doit être une adresse IPv4
   ou IPv6 et ne doit être revendiquée par **aucune autre** école (comparaison sur la forme canonique,
   comme l'inscription) ; les quotas négatifs deviennent 0 ; le fournisseur actif n'est retenu que
   s'il figure dans `SCHOOL_PROVIDER_IDS`. En modification (`id`), seuls le nom et les champs
   **présents** dans le corps sont écrits ; le formulaire renvoie le fournisseur actif qu'il connaît.
3. Réponse `201 { ok, id }` ; l'administration reçoit « Nouvel établissement : … ».
4. Dans la liste des comptes (`GET /api/admin/users`), le super rattache un enseignant :
   `POST /api/admin/users { email, etablissementId }` — `users.etablissement_id` est posé et le lien
   d'appartenance créé.
5. Il le nomme administrateur : `POST /api/admin/users { email, isSchoolAdmin: true }` — le rang est
   écrit sur le lien de l'école principale, et le miroir `users.is_school_admin` rafraîchi.

## Scénarios alternatifs

- **A1 — Modifier une école.** `POST { id, … }` réécrit **toutes** les colonnes du formulaire
  (`200 { ok, id }`), sans notification.
- **A2 — Déplacer un compte.** `etablissementId: B` sur un compte de A : le lien vers A (et le rang
  qui allait avec) est supprimé, le lien vers B créé. Dans la même requête, `isSchoolAdmin` vise
  l'école d'arrivée. `etablissementId: null` détache de l'école principale sans toucher aux autres
  liens (ceux gagnés par IP).
- **A3 — Neutraliser un compte.** `isTeacher: false, isPromptagogue: false` retire tous les droits
  d'écriture ; le compte n'est pas supprimé (effacement RGPD : geste manuel en base).
- **A4 — Administrateur d'école.** Il lit les seuls comptes dont son école est l'école principale,
  avec le rang lu **sur le lien de son école** (et non le miroir) ; il règle leurs rôles et nomme ou
  révoque des administrateurs de son école. Sur `/api/admin/etablissements` il ne lit que sa ligne.
- **A5 — Super rattaché à une école.** Il garde la vue du site : le rang de super est lu avant
  l'école.
- **A6 — Vitrine.** `/admin-demo` montre l'interface avec des données inventées, sans appel serveur.

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| Sans jeton, ou sans rang d'administration | `403 ERR_FORBIDDEN` (les deux routes) |
| Administrateur d'école : créer / modifier une école, supprimer | `403 ERR_FORBIDDEN` |
| Nom d'école vide | `400 ERR_NAME_INVALID` |
| Action « catalogue » par le super sans `id` | `400 ERR_ETAB_UNKNOWN` |
| Modification ou action « catalogue » sur un `id` inexistant | `404 ERR_ETAB_UNKNOWN`, rien n'est écrit |
| IP mal formée (ni IPv4 ni IPv6, plage CIDR comprise) | `400 ERR_IP_INVALID`, rien n'est écrit |
| IP déjà revendiquée par une autre école (toutes graphies) | `409 ERR_IP_TAKEN`, rien n'est écrit |
| `DELETE /api/admin/etablissements` (super) | `403 ERR_DELETE_DISABLED` — la ligne demeure |
| Autre méthode | `405 ERR_METHOD_NOT_ALLOWED` (`Allow: GET, POST, DELETE` / `GET, POST`) |
| Adresse vide / compte inconnu | `400 ERR_EMAIL_INVALID` / `404 ERR_USER_UNKNOWN` |
| Compte hors portée (autre école, lien d'IP seul, super) pour un admin d'école | `403 ERR_FORBIDDEN` |
| Rattachement demandé par un admin d'école | `403 ERR_SUPER_ONLY`, rien n'est écrit |
| École illisible / inexistante | `400 ERR_ETABLISSEMENT_INVALID` / `404 ERR_ETABLISSEMENT_UNKNOWN`, rien n'est écrit |
| Nommer administrateur un compte sans école | `409 ERR_NO_ETABLISSEMENT` |
| Toucher au rang d'un super | `409 ERR_SUPER_IMMUTABLE` |
| Aucun champ reconnu (y compris l'ancien `adultVerifiedBy`) | `400 ERR_NOTHING_TO_UPDATE` |
| `DELETE /api/admin/users` | `405` — aucune suppression de compte |

## Règles métier et sécurité

- **Deux niveaux**, en union discriminée (`AdminScope`) : `super` ne filtre rien, `ecole` porte
  toujours un `etablissementId`. Le super est testé **d'abord**, sans regarder son école.
- La portée « ecole » se lit sur l'**école active** revérifiée ; le miroir `users.is_school_admin`
  ne donne aucun droit.
- `dansLaPortee` : une école ne répond que des comptes dont elle est l'**école principale** —
  jamais d'un compte rattaché par la seule IP, jamais d'un super.
- Tout ce qui peut refuser est évalué **avant** la première écriture (pas d'état partiel).
- Le fournisseur actif d'une école ne peut être qu'un fournisseur payable par la clé d'école
  (`SCHOOL_PROVIDER_IDS` : ni OpenRouter, ni fournisseurs écartés).
- On ne supprime rien : ni établissement (factures passées), ni compte.
- `requireGestionTuteurs` ajoute une troisième portée (`enseignant`) pour les tuteurs de l'école ;
  `tuteurDeLEcole` ne rattache jamais un tuteur de la plateforme (`NULL`) à une école.

## Postconditions

- `etablissements` créée ou réécrite ; `users.etablissement_id`, `is_teacher`, `is_promptagogue`,
  `is_school_admin` et `user_etablissements` mis à jour ; notification « Nouvel établissement ».

## Anomalies constatées

- **Corrigée** — un champ absent n'est plus écrit en modification, et le formulaire renvoie le
  fournisseur actif qu'il a lu. Constat d'origine :
  **Le formulaire du site efface le fournisseur actif.** `src/administration/Etablissements.tsx:48`
  n'envoie jamais `activeProvider`, et `src/pages/api/admin/etablissements.ts:66,71` réécrit
  `active_provider = ''` quand le champ est absent. Aucune autre interface ne le pose : chaque
  modification d'une école depuis `/admin` lui retire son fournisseur actif (et donc son tarif
  d'école, UC-17 A5). Test devenu « corrigé : un champ absent n'est plus remis à zéro… ».
- **Corrigée** — une IP mal formée est refusée (`400 ERR_IP_INVALID`), une IP d'une autre école
  aussi (`409 ERR_IP_TAKEN`, forme canonique dupliquée de l'inscription). Constat d'origine :
  **Pas d'unicité des IP côté site.** `src/pages/api/admin/etablissements.ts:56` accepte une IP
  déjà revendiquée par une autre école (l'inscription en libre-service, elle, la refuse) ; la
  résolution `resolveEtablissementByIp` retient alors la première ligne rencontrée. Les IP ne sont
  pas non plus validées (toute chaîne est acceptée). Test devenu « corrigé : une IP déjà revendiquée… ».
- **Corrigée** — un `id` inexistant répond `404 ERR_ETAB_UNKNOWN`, en modification comme pour
  l'action « catalogue ». Constat d'origine :
  **Modifier une école inexistante répond « ok ».** `src/pages/api/admin/etablissements.ts:70-73` :
  `POST { id: 424242, … }` rend `200 { ok: true }` sans rien écrire. Même chose pour l'action
  « catalogue » du super avec un `id` inconnu (`:42-46`).

## Tests

### Unitaires — `tests/unit/uc18-super-administration/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `admin.test.ts` | `isAdminEmail`, `requireAdmin`, `requireSuperAdmin`, `requireGestionTuteurs`, `porteeEcoleActive`, `tuteurDeLEcole`, `dansLaPortee`, `monthStartUtc` | super insensible à la casse, super avant l'école (même rattaché, même absent de la base), portée d'école sur l'école active, école annoncée non liée, miroir sans effet, trois portées de tuteurs, super ramené à l'école active, tuteurs de la plateforme, portée par école principale (pas par IP, jamais un super), début de mois UTC |

### Fonctionnels — `tests/functional/uc18-super-administration/`

| Scénario | Fichier | Test |
|---|---|---|
| Nominal | `etablissements.test.ts` | création 201 + IP normalisées + notification ; modification ; liste triée |
| Règles | `etablissements.test.ts` | fournisseurs non payables ramenés à vide ; bornage des quotas, nom tronqué |
| Anomalies corrigées | `etablissements.test.ts` | fournisseur actif conservé, seuls les champs présents écrits ; IP d'une autre école refusée (409, graphies), IP propres conservées, IP mal formée (400) ; id inexistant 404 (modification et catalogue) |
| A1/A5 | `etablissements.test.ts` | catalogue par id ; super rattaché garde la vue du site |
| Erreurs | `etablissements.test.ts` | nom vide ; catalogue sans id ; DELETE désactivé ; 405 |
| Droits | `etablissements.test.ts` | anonymes/enseignants/promptagogues 403 ; admin d'école : sa ligne seule, ni création ni modification ni suppression |
| Nominal | `comptes.test.ts` | liste complète (isSuper, promptCount, sans majorité) ; rattacher, nommer, promouvoir |
| A2/A3 | `comptes.test.ts` | déplacement A→B emporte lien et rang ; déplacer + nommer ; détacher ; neutraliser |
| A4 | `comptes.test.ts` | liste filtrée et rang lu sur le lien de l'école ; nommer/révoquer un collègue ; rôles |
| Erreurs | `comptes.test.ts` | email vide/inconnu ; école illisible/inexistante sans écriture ; 409 sans école ; 409 super ; rien à mettre à jour ; pas de DELETE |
| Droits | `comptes.test.ts` | 403 sans rang ; rattachement réservé au super sans écriture partielle ; hors portée ; école active non administrée |
