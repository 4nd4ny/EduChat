# UC-19 — Facturer la consommation d'une école

| | |
|---|---|
| **Acteur principal** | Super-administrateur (le site) |
| **Acteurs secondaires** | Administrateur d'école (lit sa facture, saisit ses mentions), service comptable de l'école (destinataire du document imprimé) |
| **Déclencheur** | Fin de mois : le site ouvre l'onglet « Factures » de `/admin` ; une école ouvre sa facture depuis `/etablissement` |
| **Pages** | `src/pages/facture.tsx` (document imprimable), `src/administration/Factures.tsx`, `src/administration/MentionsFacture.tsx` |
| **API** | `GET /api/admin/billing` (relevé brut, CSV compris), `GET /api/admin/factures`, `POST /api/admin/factures` (`emettre`, `payee`, `impayee`, `mentions`) |
| **Code serveur** | `src/server/facturation.ts`, `src/server/porteMonnaie.ts` (`coutAuTarif`, `contributionDe`), `src/server/admin.ts` (`requireAdmin`, `requireSuperAdmin`, `monthStartUtc`) |

## Objectif

Relever, pour un mois donné, ce que la **clé interne** a coûté à chaque école, **au prix
coûtant** et de façon **recalculable** : une ligne par modèle (et par couple de prix appliqués),
avec jetons d'entrée, jetons de sortie, nombre d'appels et les deux prix au million. Le montant
de chaque ligne est la **somme des montants figés appel par appel** dans `usage_log` (ce que le
porte-monnaie a réellement prélevé), jamais un recalcul au tarif du jour. Le site **émet** la
facture (le montant est figé dans `factures`), puis la **marque payée**.

## Préconditions

- Le demandeur est connecté et administrateur : super-administrateur (`SECRET_ADMIN_EMAILS`) ou
  administrateur de son **école active** (`user_etablissements.is_admin = 1`).
- Le journal `usage_log` contient la consommation sur clé interne (`used_server_key = 1`) rattachée
  aux établissements.

## Scénario nominal — du relevé à la facture payée

1. Le site ouvre `/admin` › Factures : `GET /api/admin/factures?year=AAAA&month=M`.
2. `facturesDuMois(year, month, null)` rend une facture par école (y compris sans consommation) :
   lignes regroupées par `(école, fournisseur, modèle, prix d'entrée, prix de sortie, ancienne?)`,
   triées par montant décroissant ; `consommation` = somme des montants, arrondie **vers le haut** ;
   `participation = 0` ; `participationPct` = taux de contribution de l'école (information) ;
   `devise = SECRET_BILLING_CURRENCY` ; `mentions` du mois.
3. La réponse du site inclut aussi `impayees` (toutes écoles, toutes périodes) et `participation`
   (`bilanParticipation` : contribution collectée au registre du porte-monnaie, face au coût de ce
   qui a été offert — démonstration publique et écoles RESPIRE).
4. Le site émet : `POST { action: 'emettre', etablissementId, year, month }` → `emettre` fige
   jetons, consommation, participation, total et devise dans `factures` (`emise_at`).
5. Le paiement reçu, le site marque la facture : `POST { action: 'payee', etablissementId, periode }`.
6. Une facture payée ne se réémet plus : un nouvel `emettre` rend la facture recalculée sans
   toucher le montant figé ; l'écart éventuel est signalé par `tarifChange: true`.

## Scénarios alternatifs

- **A1 — Lecture par l'administrateur d'école.** Même route : la portée vient de `requireAdmin`
  (école active revérifiée en base) ; il ne reçoit **que sa facture**, sans `impayees` ni bilan.
  Un en-tête `x-educhat-ecole` désignant une école où il n'est pas membre est ignoré.
- **A2 — Vue du site.** Toutes les écoles (ordre alphabétique), les impayées et le bilan.
- **A3 — École RESPIRE.** Ses lignes restent visibles (la consommation existe), mais
  `consommation = total = 0` ; `emettre` rend `null` → `409 ERR_NOTHING_TO_INVOICE`.
- **A4 — Mentions administratives.** `POST { action: 'mentions', periode, adresse?, reference?, note? }`
  est la **seule écriture ouverte à l'école** (chez elle ; le site partout). Trois champs nommés,
  rognés et bornés (500 / 120 / 500) ; un champ absent est conservé ; sans adresse propre au mois,
  l'adresse du profil (`billing_address`) est reprise (`adresseParDefaut: true`) sans être écrite.
  Elles n'entrent dans **aucun calcul** et survivent à une réémission (table `facture_mentions`
  séparée).
- **A5 — Relevé brut.** `GET /api/admin/billing` : requêtes et jetons par école × IP × fournisseur
  (libellés « (IP hors base) » et « (démo publique — non facturable) »), plus un bilan par
  enseignant ; restreint à son école pour un administrateur d'école (filtre dans le SQL).
- **A6 — Export CSV.** `format=csv` (séparateur `;`, nom d'école entre guillemets) ;
  `format=csv&by=teacher` pour le bilan par enseignant ; `Content-Disposition` nommé par période.
- **A7 — Période par défaut.** Sans `year`/`month`, le mois courant UTC.
- **A8 — Lignes anciennes.** Une ligne sans prix figé (`tarif_at = 0`) est relue au prix unique
  du fournisseur (table `tarifs`), appliqué à l'entrée comme à la sortie (`ancien: true`).
- **A9 — Rouvrir.** `POST { action: 'impayee' }` remet `payee_at` à `NULL`.
- **A10 — Document imprimable.** `/facture?periode=AAAA-MM&etablissement=ID` relit la même route
  et n'affiche que ce que le serveur a consenti à envoyer.

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| Sans jeton, ou compte sans rang d'administration | `403 ERR_FORBIDDEN` (avant tout contrôle de méthode) |
| École qui tente `emettre`, `payee` ou `impayee` | `403 ERR_SUPER_ONLY` |
| `mentions` sur l'école d'autrui | `403 ERR_FORBIDDEN` |
| `mentions` sans école cible (site sans `etablissementId`) | `400 ERR_SCHOOL_UNKNOWN` |
| `mentions` sur une école inexistante | `404 ERR_SCHOOL_UNKNOWN` |
| Période mal formée (`mentions`, `payee`, `impayee`) | `400 ERR_PERIOD_INVALID` |
| Action du site sans `etablissementId` | `400 ERR_SCHOOL_UNKNOWN` |
| `emettre` pour une école RESPIRE (ou inexistante) | `409 ERR_NOTHING_TO_INVOICE` |
| `payee`/`impayee` sur une facture jamais émise | `404 ERR_INVOICE_UNKNOWN` |
| Action inconnue | `400 ERR_ACTION_UNKNOWN` |
| Méthode autre que `GET`/`POST` (`GET` seul pour `/billing`) | `405` avec en-tête `Allow` |

## Règles métier et sécurité

- Seule la clé interne rattachée à un établissement se facture (`used_server_key = 1`, jointure
  sur `etablissements`) ; la démonstration publique et les autres mois sont exclus.
- Le montant d'une ligne est la somme des prélèvements réels : jamais `jetons × prix` recalculé
  (l'arrondi du porte-monnaie monte appel par appel). Les prix affichés sont ceux appliqués.
- Un changement de prix en cours de mois produit deux lignes pour le même modèle.
- La contribution (3,5 à 10 %) est prélevée **à la recharge** (UC-20), jamais sur la facture :
  `participation` vaut toujours 0.
- Une facture émise fait foi ; une facture payée est immuable ; une école ne peut ni émettre ni
  se déclarer payée.
- Les mentions ne sont lues que champ par champ : aucun montant, devise ou date ne peut être
  atteint par un corps de requête.

## Postconditions

- `factures` : ligne `(etablissement_id, periode)` créée ou mise à jour tant qu'impayée ;
  `payee_at` posé ou effacé.
- `facture_mentions` : ligne du mois créée ou mise à jour (`updated_at`, `par`).
- Rien n'est écrit par une simple lecture (`GET`).

## Anomalies constatées

1. **Lignes anciennes sans ventilation entrée/sortie facturées 0** —
   `src/server/facturation.ts:347`. La relecture « à l'ancienne » (`tarif_at = 0`) multiplie
   `tokens_in`/`tokens_out`, qui valent 0 sur les lignes antérieures à leur séparation et sur
   celles qu'écrivent encore `/api/speak`, `/api/transcribe` et la traduction (qui ne renseignent
   que `tokens`). Le commentaire promet « exactement comme hier » (jetons × prix unique) ; le
   montant rendu est 0. Test : `facturation.test.ts` « ANOMALIE : une ligne ancienne… ».
2. **Bilan de la contribution : offert valorisé au seul prix unique** —
   `src/server/facturation.ts:493`. `bilanParticipation` ignore les prix par modèle figés sur les
   lignes (`prix_entree_mtok`/`prix_sortie_mtok`) et applique `tarifs.prix_mtok` au total des
   jetons ; sans prix unique réglé, la démonstration et les écoles RESPIRE « coûtent » 0.
3. **Consommation d'un porte-monnaie personnel comptée comme démonstration offerte** —
   `src/server/facturation.ts:489` (et libellé `src/pages/api/admin/billing.ts:39`).
   `/api/completion` journalise ces appels avec `ip = ''` et `etablissement_id NULL` : ils tombent
   dans l'origine `demo` du bilan et dans la ligne « (démo publique — non facturable) » du relevé,
   alors qu'ils ont été payés.
4. **Mineur — école inexistante à l'émission** — `src/pages/api/admin/factures.ts:89` : répond
   `409 ERR_NOTHING_TO_INVOICE` (code prévu pour RESPIRE) au lieu d'un 404.
5. **Mineur — zéro négatif** — `coutAuTarif` rend `-0` pour un coût nul
   (`Math.ceil(0 − 1e-9)`, `src/server/porteMonnaie.ts:75`) ; sans effet visible à l'affichage.

## Tests

### Unitaires — `tests/unit/uc19-facturation/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `journal.ts` | (utilitaire) | écriture de lignes `usage_log` comme `/api/completion` |
| `facturation.test.ts` | `periodeDe`, `tarifs`, `reglerTarif`, `facturesDuMois`, `emettre`, `marquerPayee`, `impayees` | format de période ; prix unique borné ; somme des montants figés ; deux prix → deux lignes ; ligne ancienne au prix unique ; anomalie 1 ; exclusions (clé perso, autres mois/écoles, démo) ; bornes de décembre ; école sans conso ; RESPIRE ; participation nulle et taux borné ; repli ; émission qui fige ; RESPIRE/inconnue → null ; `tarifChange` ; réémission impayée vs payée ; bascule payée/impayée ; tri des impayées |
| `mentionsEtBilan.test.ts` | `mentionsDe`, `reglerMentions`, `bilanParticipation`, `repliObserves` | repli sur l'adresse du profil ; rognage, auteur, date ; patch partiel ; adresse vidée ; bornes de longueur ; mentions par mois ; aucune incidence sur le montant et survie à la réémission ; contribution relue au registre ; taux nul ; valorisation de l'offert ; anomalies 2 et 3 ; filtres des replis observés |

### Fonctionnels — `tests/functional/uc19-facturation/facturation.test.ts`

| Scénario | Test |
|---|---|
| Nominal | le site lit, émet, marque payée ; la facture payée ne bouge plus (`tarifChange`) |
| A9 | marquer « impayée » rouvre la facture |
| A1 | l'administrateur d'école ne lit que sa facture ; l'en-tête d'une autre école est sans effet |
| A2 | le site voit toutes les écoles, les impayées et le bilan |
| A3 | RESPIRE : consommation visible, total nul, émission refusée (409) |
| A4 | mentions par l'école sans effet sur le montant ; mentions par le site conservées à la réémission |
| A5 | relevé brut (IP hors base, démo, enseignants) ; restriction à l'école |
| A6 | export CSV par établissement et par enseignant |
| A7 | période par défaut = mois courant UTC |
| Erreurs / droits | 403 sans rang ; `ERR_SUPER_ONLY` ; mentions 403/404/400 ; actions 400/404 ; école inexistante 409 ; 405 |
