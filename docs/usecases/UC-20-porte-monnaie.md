# UC-20 — Gérer un porte-monnaie et le recharger par PayPal

| | |
|---|---|
| **Acteur principal** | Administrateur d'école (porte-monnaie de son école) ; personne titulaire d'un compte vérifié (porte-monnaie personnel) |
| **Acteurs secondaires** | Super-administrateur (recharges et ajustements manuels), PayPal (paiement, notifications signées, remboursements) |
| **Déclencheur** | L'école ouvre l'onglet « Porte-monnaie » de `/etablissement` ; la personne ouvre « Mes données » (`/compte`) ; PayPal notifie un paiement ou un remboursement |
| **Pages** | `src/administration/PorteMonnaie.tsx`, `src/pages/compte.tsx` (porte-monnaie personnel) |
| **API** | `GET/POST /api/admin/credits`, `GET/POST /api/me/credits`, `GET/POST /api/paypal/recharge`, `POST /api/paypal/webhook` |
| **Code serveur** | `src/server/porteMonnaie.ts`, `src/server/paypal.ts`, `src/server/admin.ts`, `src/server/accountData.ts` (`isVerifiedAccount`), `src/server/access.ts` (limiteur) |

## Objectif

Provisionner un crédit consommé **au prix coûtant** par les appels à la clé interne. Le
porte-monnaie appartient à un **titulaire** — une école (`etablissements.solde`) ou une personne
(`users.solde`) — et chaque mouvement est inscrit au **registre** `credit_mouvements` dans la même
transaction que la mise à jour du solde. La **contribution** (3,5 à 10 % au choix de l'école,
3,5 % pour une personne, forfait minimal 0,50) est prélevée **une fois, à la recharge**.

## Préconditions

- École : le demandeur est administrateur de son école active, ou super-administrateur.
- Personne : jeton valide d'un compte **vérifié** et toujours présent en base.
- Recharge et remboursement PayPal : `SECRET_PAYPAL_CLIENT_ID`, `SECRET_PAYPAL_SECRET` et
  `SECRET_PAYPAL_WEBHOOK_ID` définis (sinon tout est éteint : `503 ERR_PAYPAL_OFF`).
  `SECRET_PAYPAL_ENV=live` bascule sur l'API de production, sinon bac à sable.

## Scénario nominal — une école recharge par PayPal

1. L'interface demande `GET /api/paypal/recharge` → `{ actif, environnement, devise }`.
2. `POST /api/paypal/recharge { montant }` (10 à 100 000) : `creerRecharge` crée la commande
   PayPal (`intent: CAPTURE`, devise de facturation, montant tronqué au centime, `custom_id: etab:ID`)
   et écrit l'**intention** (`recharges`, état `attente`) **avant** de répondre
   `{ orderId, approbation }`.
3. Le payeur approuve chez PayPal ; PayPal capture et envoie `PAYMENT.CAPTURE.COMPLETED`.
4. `POST /api/paypal/webhook` lit le **corps brut**, le renvoie octet pour octet à
   `verify-webhook-signature` avec les en-têtes `paypal-*` et `SECRET_PAYPAL_WEBHOOK_ID`.
5. `traiterEvenement` retrouve l'intention par `order_id`, **redemande la capture à PayPal**
   (montant, devise, statut — jamais ceux de la notification), vérifie statut `COMPLETED` et devise.
6. Deux mouvements : `recharge` (+montant, `paypal_id` = id de capture) puis `ajustement`
   (−commission, libellé `Contribution aux frais (x %)` ou `(forfait 0.50 CHF)`) ; l'intention
   passe à `creditee`. Le webhook répond `200 { ok: true }`.
7. L'école lit `GET /api/admin/credits` : solde, dépense des 30 jours, autonomie estimée,
   recharge conseillée (3 mois), mouvements.

## Scénarios alternatifs

- **A1 — Le site recharge pour une école** (`/api/paypal/recharge` avec `etablissementId`), ou
  **manuellement** : `POST /api/admin/credits { etablissementId, montant, genre: 'recharge', detail? }`
  (valeur absolue, contribution retenue) ou `genre: 'ajustement'` (signé, sans contribution).
- **A2 — Porte-monnaie personnel.** `GET /api/me/credits` (état, bornes 5–1 000, commission de
  référence, 24 derniers mouvements, `Cache-Control: private, no-store`) ; `POST { montant }`
  ouvre la commande — l'intention porte `etablissement_id = 0` (sentinelle) et l'adresse ; aucune
  adresse n'est envoyée à PayPal (`custom_id: 'compte'`).
- **A3 — Remboursement.** `POST /api/me/credits { action: 'rembourser' }` ou
  `POST /api/admin/credits { action: 'rembourser' }` (école : la sienne ; site : toutes) : le
  solde est vidé **d'abord**, puis `solde × (1 − 3,5 %)` est rendu capture par capture, de la plus
  récente à la plus ancienne, uniquement parmi les captures du titulaire ; ce que PayPal refuse
  revient au porte-monnaie.
- **A4 — Taux de contribution.** `POST /api/admin/credits { action: 'contribution', pct }` :
  l'école règle le sien, borné à [3,5 ; 10] ; le site celui de n'importe quelle école.
- **A5 — Litige, annulation, remboursement notifié** (`PAYMENT.CAPTURE.REFUNDED|REVERSED|DENIED|DECLINED`,
  `CUSTOMER.DISPUTE.CREATED`) : la capture d'origine est retrouvée (lien `up` ou
  `disputed_transactions`), le montant de la recharge est repris (`paypal_id = annul:<capture>`),
  le solde peut passer sous zéro, l'intention passe à `reprise`.
- **A6 — Consommation.** À chaque appel, `/api/completion` résout `tarifDuModele` (prix du modèle →
  barreau le plus cher du fournisseur → prix unique → zéro, dans la devise de facturation) et
  `decompter` prélève `coutAuTarif` **arrondi vers le haut par appel** ; RESPIRE n'est jamais
  décompté ; un coût nul sur un appel réel est crié au journal d'erreurs.

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| `/api/admin/credits`, `/api/paypal/recharge` sans rang d'administration | `403 ERR_FORBIDDEN` |
| École qui se crédite ou s'ajuste | `403 ERR_SUPER_ONLY` |
| Taux ou remboursement sur l'école d'autrui, ou sans école cible | `403 ERR_FORBIDDEN` |
| Recharge PayPal pour une autre école, ou site sans `etablissementId` | `403 ERR_FORBIDDEN` |
| Recharge manuelle sans école | `400 ERR_SCHOOL_UNKNOWN` |
| Montant nul/non numérique ; taux non numérique ; montant hors bornes (école 10–100 000, personne 5–1 000) | `400 ERR_AMOUNT_INVALID` |
| PayPal non configuré | `503 ERR_PAYPAL_OFF` (webhook : `503` sans corps) |
| PayPal en panne à la création de commande | `502 ERR_PAYPAL_UPSTREAM` |
| Rien à rembourser / montant trop faible après frais | `502 ERR_REFUND_FAILED` |
| `/api/me/credits` sans jeton, ou compte effacé | `401 ERR_AUTH_REQUIRED` |
| Plus de 20 appels/min/IP sur `/api/me/credits` | `429 ERR_RATE_LIMIT` |
| Webhook : signature refusée ou vérification impossible ; JSON illisible | `400` |
| Webhook : corps > 256 Kio | `413` |
| Webhook : traitement impossible (capture introuvable chez PayPal…) | `500` (PayPal réessaiera) |
| Webhook : doublon, devise différente, capture non aboutie, type ignoré | `200` (compris), rien n'est crédité |
| Méthode non autorisée | `405` + `Allow` |

## Règles métier et sécurité

- Le montant crédité vient **toujours** de la capture relue chez PayPal ; le titulaire vient de
  l'**intention** créée par le serveur, jamais d'un champ renvoyé par le client.
- Idempotence par l'index `UNIQUE` sur `credit_mouvements.paypal_id` (commun aux deux titulaires) :
  la violation annule la transaction, solde compris.
- Arrondis directionnels : ce qu'on prélève monte au centime, ce qu'on crédite descend.
- `aDuCredit` : solde **strictement** positif, ou école RESPIRE ; une personne n'a pas d'exonération.
- Un titulaire introuvable fait **lever** `bouger` : aucun mouvement orphelin.
- Sentinelle `etablissement_id = 0` + `titulaire_email` pour les lignes personnelles ; les
  lectures par école les ignorent.
- `/api/me/credits` ne désigne jamais d'autre titulaire que l'appelant (adresse du jeton).

## Postconditions

- `recharges` : intention `attente` → `creditee` (avec `capture_id`, `credite_at`) → éventuellement `reprise`.
- `credit_mouvements` : un mouvement par événement d'argent, avec le solde **après**.
- `etablissements.solde` / `users.solde` mis à jour dans la même transaction ;
  `etablissements.contribution_pct` réglé.

## Anomalies constatées

1. **Double débit après un remboursement demandé** — `src/server/paypal.ts:258` (et `rembourser`,
   l. 290-349). `rembourser` vide le solde puis rembourse la capture, mais laisse l'intention à
   l'état `creditee`. La notification `PAYMENT.CAPTURE.REFUNDED` que PayPal envoie ensuite pour ce
   même remboursement est traitée comme un litige : le **montant entier de la recharge** est repris
   une seconde fois (solde 0 → −20 dans le test). Le débit porte d'ailleurs toujours sur le montant
   de la recharge, même pour un remboursement partiel.
   Test : `rechargePaypal.test.ts` « ANOMALIE — un remboursement DEMANDÉ… ».
2. **Paiement reçu pour un titulaire disparu confondu avec un doublon** — `src/server/paypal.ts:230`.
   Le `catch` générique autour des deux `bouger` transforme toute erreur (ex. « Porte-monnaie
   introuvable » pour un compte effacé entre la commande et la capture) en « Déjà créditée
   (idempotence) » ; le webhook répond 200, PayPal ne réessaie pas, l'intention reste en `attente`
   et l'argent encaissé n'est crédité nulle part, sans alerte au journal d'erreurs.
   Test : `paypal.test.ts` « ANOMALIE : un titulaire disparu… ».
3. **Recharge manuelle d'une école inexistante non gérée** — `src/pages/api/admin/credits.ts:86` :
   `bouger` lève et l'exception n'est pas rattrapée (erreur 500 de Next) au lieu d'un
   `404 ERR_SCHOOL_UNKNOWN`. Aucune écriture n'a lieu (transaction annulée).
4. **Observation** — `POST /api/paypal/recharge` n'est appelée par aucune page :
   `PorteMonnaie.tsx` ne propose que la recharge manuelle du site, le taux et le remboursement.

## Tests

### Unitaires — `tests/unit/uc20-porte-monnaie/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `fauxPaypal.ts` | (utilitaire) | doublure de l'API PayPal : OAuth, commande, signature, capture, remboursement |
| `porteMonnaie.test.ts` | `titulaireEcole/Compte`, `mouvements`, `contributionDe`, `reglerContribution`, `commissionRecharge`, `detailCommission`, `partParticipation`, `coutAuTarif`, `aDuCredit`, `soldeDe`, `aUnPorteMonnaie`, `bouger`, `decompter`, `tarifDuModele`, `etatDuCompte`, `etatDesComptes` | sentinelle 0 ; séparation des registres ; ordre et limite ; plancher personnel ; bornes du taux ; forfait vs pourcentage et libellé ; arrondis directionnels ; accès strictement positif, RESPIRE ; titulaire introuvable ; `paypal_id` unique inter-titulaires ; arrondi par appel ; dépassement autorisé ; RESPIRE/inconnue ; coût nul crié ; repli au registre ; quatre niveaux de tarif et devise ; autonomie et recharge conseillée |
| `paypal.test.ts` | `paypalActif`, `paypalEnvironnement`, `creerRecharge`, `verifierSignature`, `traiterEvenement`, `rembourser` | configuration incomplète éteinte ; sandbox/live ; intention avant réponse, troncature, aucune adresse envoyée ; bornes ; panne ; corps brut relayé ; échecs de signature ; montant relu ; plancher personnel ; doublon ; refus (identifiant, intention, statut, devise) ; anomalie 2 ; reprise unique et solde négatif ; litige ; type ignoré ; remboursement ordonné, partiel, par titulaire, impossible |

### Fonctionnels — `tests/functional/uc20-porte-monnaie/`

| Scénario | Test |
|---|---|
| A1 (manuel) | `porteMonnaie.test.ts` : recharge 100 → 95 crédités, registre ; vue du site ; forfait 0.50 ; ajustements ± |
| A4 | `porteMonnaie.test.ts` : l'école règle son taux, borné |
| A2 | `porteMonnaie.test.ts` : lecture personnelle sans cache ; `rechargePaypal.test.ts` : recharge, lecture, remboursement |
| Erreurs / droits (PayPal éteint) | `porteMonnaie.test.ts` : 403, `ERR_SUPER_ONLY`, école d'autrui, saisies invalides, école inexistante (anomalie 3), 503, 401, 429, 405 |
| Nominal | `rechargePaypal.test.ts` : commande → notification signée (corps brut) → crédit du montant relu ; doublon |
| A1 (PayPal) | `rechargePaypal.test.ts` : le site recharge l'école désignée |
| A3 | `rechargePaypal.test.ts` : remboursement du crédit de l'école |
| A5 | `rechargePaypal.test.ts` : annulation → reprise, solde négatif ; anomalie 1 |
| Erreurs (PayPal allumé) | `rechargePaypal.test.ts` : signature 400, JSON 400, 413, 500, devise/statut, école d'autrui, bornes, panne 502, rien à rembourser 502 |
