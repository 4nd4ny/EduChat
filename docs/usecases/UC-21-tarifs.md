# UC-21 — Régler les tarifs de la clé interne

| | |
|---|---|
| **Acteur principal** | Super-administrateur (vue du site, réglage, relance de la sonde) |
| **Acteurs secondaires** | Administrateur d'école (lecture des barreaux de son fournisseur), catalogue public d'OpenRouter, Frankfurter (taux de change BCE), `refreshAllModels` (relance automatique) |
| **Déclencheur** | Le site ouvre l'onglet factures de `/admin` (tableau des tarifs, bouton « sonder ») ; une école ouvre l'onglet factures de `/etablissement` ; une liste de modèles change |
| **Pages** | `src/pages/admin.tsx` → `src/administration/Factures.tsx` (variante `site`), `src/pages/etablissement.tsx` → `Factures.tsx` (variante `ecole`) → `src/administration/TarifEcole.tsx` |
| **API** | `GET /api/admin/tarifs`, `GET /api/admin/tarifs?portee=ecole`, `POST /api/admin/tarifs` |
| **Code serveur** | `src/server/sondeTarifs.ts` (`sonderTarifs`, `propositions`, `tarifsAppliques`, `lienVerification`, `RATIO_ENTREE`), `src/server/facturation.ts` (`tarifs`, `reglerTarif`, `repliObserves`), `src/server/porteMonnaie.ts` (`tarifDuModele`), `src/server/admin.ts` (`requireAdmin`, `requireSuperAdmin`, `porteeEcoleActive`), `src/server/ladder.ts` (`getLadder`) |

## Objectif

Connaître **ce que coûte un million de jetons** de chaque modèle payé par la clé interne, pour
décompter les porte-monnaie au prix coûtant. La **sonde** lit le catalogue public d'OpenRouter
(seule source lisible par une machine), retrouve les trois barreaux d'échelle des trois
fournisseurs d'école (Anthropic, OpenAI, Mistral), convertit les dollars dans la monnaie de
facturation et **écrit** un prix d'entrée et un prix de sortie par barreau (`tarifs_modeles`) : c'est
ce qui facture. Le site garde en outre un **prix unique** par fournisseur (`tarifs.prix_mtok`), réglé à
la main, qui ne sert plus que de dernier recours. Une école lit, en lecture seule, les barreaux de
**son** fournisseur actif.

## Préconditions

- Vue du site, réglage et sonde : jeton d'un super-administrateur (`SECRET_ADMIN_EMAILS`).
- Vue d'école : jeton d'un administrateur de l'école active, ou d'un super-administrateur rattaché
  à au moins une école (l'école active est désignée par l'en-tête `x-educhat-ecole`, revérifié en base).
- Monnaie de facturation `SECRET_BILLING_CURRENCY` (défaut `CHF`) ; en `USD`, aucun taux n'est lu.

## Scénario nominal — le site sonde, lit et règle

1. `Factures.tsx` (site) lit `GET /api/admin/tarifs` : `{ devise, participationPct, ratioEntree,
   appliques, manquants, replis, tarifs[] }` ; `tarifs` a une ligne par fournisseur (les onze) avec
   `prixMtok`, `proposition` (ou `null`) et `verifier` (lien du catalogue public, `null` hors fournisseurs d'école).
2. Le site clique « sonder » : `POST { action: 'sonder' }` → `sonderTarifs()` :
   1. `GET https://openrouter.ai/api/v1/models` (prix en $ **par jeton**) ;
   2. `GET https://api.frankfurter.app/latest?from=USD&to=<devise>` (taux) ;
   3. pour chaque fournisseur d'école, ses barreaux (`getLadder(provider).slice(0, 3)`) sont
      rapprochés du catalogue du bon vendeur (`correspond`), convertis (`× 1e6 × taux`, arrondis à six
      chiffres significatifs — jamais à zéro pour un prix non nul) et accompagnés d'un mélange indicatif (75 % entrée / 25 % sortie) ;
   4. chaque barreau chiffré est écrit dans `tarifs_modeles` (clé : fournisseur + nom **de l'échelle**,
      `source` : identifiant OpenRouter, `devise`) ;
   5. la proposition (barreau **le plus haut** retenu, les trois barreaux en JSON, devise, date) est
      écrite dans les colonnes `propose_*` de `tarifs` — **jamais** `prix_mtok`.
   La réponse est `200 { ok: true, propositions }` ; l'écran relit la vue du site.
3. `manquants` se vide, `appliques` liste les neuf prix ; `/api/completion` facture désormais chaque
   appel au prix de son modèle (`tarifDuModele`, niveau 1).
4. Le site peut régler le prix unique : `POST { provider, prixMtok }` → `reglerTarif` (ligne créée
   ou mise à jour, négatif ramené à 0) → `200 { ok: true }`.

## Scénarios alternatifs

- **A1 — Vue d'une école.** `TarifEcole.tsx` lit `GET /api/admin/tarifs?portee=ecole` →
  `{ providerActif, echelle }` où `echelle = { devise, at, barreaux[{ rang, barreau, modele,
  entreeMtok, sortieMtok, detail }], verifier }` : les barreaux du **seul** fournisseur actif, sans
  mélange ni tarif retenu. `echelle` vaut `null` si aucun fournisseur n'est réglé, s'il n'est pas
  sondé (hors fournisseurs d'école) ou si la sonde n'a jamais tourné.
- **A2 — Super-administrateur sur la page de son école.** Avec `?portee=ecole`, sa portée est
  **resserrée** à l'école active (`porteeEcoleActive`) ; sans le drapeau, il reçoit la vue du site.
  Un administrateur d'école ne peut pas désigner une autre école par l'en-tête (repli sur la sienne).
- **A3 — Taux de change injoignable ou illisible.** La proposition reste **en dollars** et le dit
  (`devise: 'USD'`), **aucune** ligne `tarifs_modeles` n'est écrite : les prix de la veille restent
  appliqués. En monnaie `USD`, le taux vaut 1 sans appel.
- **A4 — Catalogue injoignable** (HTTP ≠ 2xx ou exception). Chaque barreau porte
  `Catalogue OpenRouter injoignable : <raison ≤ 200 car.>`, la proposition est réécrite à zéro,
  `tarifs_modeles` n'est pas touchée.
- **A5 — Barreau introuvable ou sans prix.** Détail explicite (`Aucune correspondance pour « … »`,
  `Aucune entrée du vendeur « … » dans le catalogue OpenRouter : « … » n'est pas chiffré (les
  homonymes d'autres vendeurs sont ignorés).`, `« … » ne porte pas de prix.`), aucune ligne écrite : le barreau apparaît dans `manquants` et la
  consommation retombe sur la chaîne de repli de `tarifDuModele` (barreau le plus cher → prix unique → 0).
- **A6 — Relance automatique.** `refreshAllModels` (`src/server/models.ts`) lance la sonde en
  arrière-plan quand une liste de modèles a changé.
- **A7 — Échelle réglée par le site.** La sonde et `manquants` suivent l'échelle effective
  (`provider_ladder`) ; une échelle de deux barreaux retient le deuxième.

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| Sans jeton, ou compte sans rang d'administration (enseignant simple) | `403 ERR_FORBIDDEN` |
| Administrateur d'école sur la vue du site (sans `?portee=ecole`) | `403 ERR_SUPER_ONLY` |
| `?portee=ecole` pour un super sans aucune école | `403 ERR_NO_ETABLISSEMENT` |
| `POST` (prix ou sonde) par une école ou sans jeton | `403 ERR_SUPER_ONLY`, aucun appel sortant |
| Fournisseur absent ou hors `PROVIDER_IDS` | `400 ERR_PROVIDER_UNKNOWN` |
| Prix négatif, non numérique, infini, absent, `null`, `''` ou blanc | `400 ERR_PRICE_INVALID` (un `0` ou `"0"` explicite reste accepté) |
| Catalogue ou taux de change en panne pendant `action: 'sonder'` | `200`, panne dite dans chaque `detail` / `devise: 'USD'` |
| Méthode autre que `GET`/`POST` | `405 ERR_METHOD_NOT_ALLOWED` + `Allow: GET, POST` |

## Règles métier et sécurité

- La **portée vient de l'écran** (`?portee=ecole`), jamais du seul rang ; le drapeau ne peut que
  resserrer une portée déjà accordée. L'école active est revérifiée en base.
- La vue d'école ne transporte **ni le mélange ni le tarif retenu** : les champs sont recopiés un à un.
- Écriture réservée au site : le tarif vaut pour toutes les écoles.
- La sonde n'écrit **jamais** `tarifs.prix_mtok` (absent du `DO UPDATE`) ; une ligne neuve naît à 0.
- Un prix n'est appliqué que s'il est **dans la monnaie de facturation** et non nul ; un barreau sans
  prix n'écrit rien plutôt que zéro. Les lignes d'une autre devise ne comblent pas `manquants`.
- Correspondance : recherche **toujours** restreinte au vendeur (`anthropic`, `openai`, `mistralai`,
  sinon l'identifiant du fournisseur) — jamais d'homonyme d'un autre vendeur, même si le vendeur a
  disparu du catalogue ; la cible et ses variantes **horodatées** (≥ 4 chiffres) forment un ensemble
  où la plus récente gagne ; en dernier recours, préfixe **par segments** : le candidat reprend tous
  les segments de la cible (`latest` et date ôtés) et n'y ajoute que des segments numériques
  (`mistral-medium-3-5` pour `mistral-medium-latest`, jamais `mistral-saba` ni `gpt-5.5-pro`) ; un
  barreau réduit à `latest` ne correspond à rien. Sans correspondance sûre, rien n'est écrit.
- Précision : les prix par million sont gardés à six chiffres significatifs (plus d'arrondi au
  centime) ; un prix non nul ne devient jamais 0. Les écrans affichent toujours deux décimales.
- Le barreau retenu pour la proposition est le **plus haut**, pas le plus cher.
- Seuls les trois fournisseurs d'école (`SCHOOL_PROVIDER_IDS`) sont sondés ; `verifier` est `null` pour les autres.
- Une proposition mal formée en base (JSON vide ou illisible) est relue comme « aucun barreau », sans erreur.

## Postconditions

- `tarifs_modeles` : un prix d'entrée/sortie par barreau chiffré, avec devise, source et date.
- `tarifs` : colonnes `propose_*` réécrites à chaque sonde ; `prix_mtok`/`updated_at` modifiés
  uniquement par `POST { provider, prixMtok }`.
- Aucune facture ni ligne de journal existante n'est modifiée (les appels déjà décomptés portent leur prix figé).

## Anomalies constatées

1. **Corrigée** — le préfixe de dernier recours compare des segments entiers et n'accepte que des
   segments de version numériques en plus. Constat d'origine : **Préfixe approximatif trop court** — `src/server/sondeTarifs.ts:221`. La recherche de dernier
   recours compare `cible.slice(0, max(8, longueur − 4))` : pour `mistral-small-latest` (cible
   `mistralsmall`), le préfixe `mistrals` est partagé par `mistralai/mistral-saba`. Si Saba est plus
   récent au catalogue, le barreau Small est chiffré — et **facturé** — au prix de Saba.
   Test : `sondeTarifs.test.ts` « corrigé — la recherche par préfixe respecte les segments… ».
2. **Corrigée** — arrondi à six chiffres significatifs (jamais 0 pour un prix non nul), détail
   calculé sur la valeur arrondie. Constat d'origine : **Prix minuscule arrondi à zéro sans explication** — `src/server/sondeTarifs.ts:313-323` et `:363`.
   Le `detail` est calculé sur la valeur non arrondie (vide), les montants sur la valeur arrondie au
   centime (0) : un modèle à moins de 0,005 par million n'écrit aucun tarif et la proposition ne dit pas
   pourquoi (seul `manquants` le signale). L'arrondi au centime du prix **par million** fausse aussi de
   quelques pour cent les modèles bon marché. Test : « corrigé — un prix inférieur à 0,005… ».
3. **Corrigée** — plus de repli sur le catalogue entier : sans entrée du vendeur, le barreau n'est
   pas chiffré et le détail le dit. Constat d'origine : **Garde-fou du vendeur contournable** — `src/server/sondeTarifs.ts:193`. Si le catalogue ne
   contient plus aucune entrée du vendeur attendu, la recherche retombe sur le catalogue entier et un
   homonyme d'un autre vendeur (`autre/claude-sonnet-5`, 99 $) est retenu et appliqué. Comportement
   voulu par le commentaire, mais contraire au « garde-fou » qu'il décrit.
   Test : « corrigé — sans aucune entrée du vendeur… ».
4. **Corrigée** — un prix absent, `null`, vide ou blanc est refusé `400 ERR_PRICE_INVALID`.
   Constat d'origine : **Prix vide ou `null` accepté comme 0** — `src/pages/api/admin/tarifs.ts:141,145`.
   `Number('')` et `Number(null)` valent 0 : un champ vidé remet le prix unique à zéro au lieu d'être
   refusé (`ERR_PRICE_INVALID`). Test fonctionnel « corrigé — un prix vide, blanc ou null est refusé… ».
5. **Corrigée** — `tarifDuModele` ignore ces colonnes mortes et n'applique que `prix_mtok` ; les
   factures émises n'en dépendent pas (prix figés sur `usage_log`, lignes anciennes relues au seul
   `prix_mtok`). Constat d'origine : **Anciens prix entrée/sortie de `tarifs` prioritaires sur le prix unique** —
   `src/server/porteMonnaie.ts:174-175`. `tarifDuModele` lit `tarifs.prix_entree_mtok ||
   prix_mtok` : ces colonnes (migration ancienne, `src/server/db.ts:470-471`) ne sont plus écrites ni
   montrées par aucun écran (`tarifs.ts:122` ne sert que `prixMtok`), mais si elles portent une valeur,
   le prix réglé par le site est sans effet. Test : « corrigé — d'anciens prix entrée/sortie… ».
6. **Corrigée** — le commentaire de `refreshAllModels` dit désormais que la sonde écrit les prix
   relevés dans `tarifs_modeles` (qui facturent) et une proposition de prix unique.
   *Constat d'origine :* **Observation** — le commentaire de `src/server/models.ts:291-293` dit encore que la sonde
   « PROPOSE — elle n'applique rien », alors qu'elle écrit désormais `tarifs_modeles`, qui facture.

## Tests

### Unitaires — `tests/unit/uc21-tarifs/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `catalogue.ts` | (utilitaire) | faux catalogue OpenRouter reproduisant les pièges (pointeur `~…-latest`, `gpt-5.5-pro`, variantes Mistral, homonyme) et faux taux Frankfurter, via `doublerFetch` |
| `sondeTarifs.test.ts` | `sonderTarifs`, `RATIO_ENTREE` | périmètre (3 fournisseurs × 3 barreaux) et URL appelées ; correspondances Anthropic/OpenAI/Mistral ; homonyme écarté ; vendeur absent sans repli sur un homonyme (anomalie 3 corrigée) ; `latest` seul ; Small/Saba distingués (anomalie 1 corrigée) ; préfixe suivi d'un autre produit sans correspondance ; conversion et précision ; mélange 75/25 ; barreau le plus haut retenu ; échelle courte ; prix minuscule conservé (anomalie 2 corrigée) ; écriture `tarifs_modeles` et `propose_*` sans toucher `prix_mtok` ; mise à jour ; entrée sans prix ; barreau introuvable ; taux injoignable ou illisible ; catalogue HTTP 500 / exception tronquée ; panne qui réécrit la proposition mais garde les prix |
| `deviseUsd.test.ts` | `sonderTarifs`, `tarifDuModele` (avec `SECRET_BILLING_CURRENCY=USD`) | taux 1 sans appel à Frankfurter ; prix écrits et appliqués en USD |
| `lectureTarifs.test.ts` | `lienVerification`, `tarifs`, `reglerTarif`, `propositions`, `tarifsAppliques`, `tarifDuModele` | lien limité aux fournisseurs d'école ; création/mise à jour/plancher 0 ; indépendance prix unique / proposition ; relecture, lignes jamais sondées, lignes antérieures à la migration, JSON illisible ; manquants (base vide, sonde complète, autre devise, prix nuls, casse, échelle réglée) ; tri ; prix relevé appliqué ; prix unique en dernier recours ; colonnes mortes ignorées (anomalie 5 corrigée) |

### Fonctionnels — `tests/functional/uc21-tarifs/tarifs.test.ts`

| Scénario | Test |
|---|---|
| Nominal | vue du site avant sonde : onze fournisseurs, neuf manques, liens `verifier` |
| Nominal | `action: 'sonder'` → propositions converties, `appliques` complet, `prixMtok` inchangé, `tarifDuModele` au prix relevé |
| Nominal | réglage du prix unique (chaîne numérique acceptée), dernier recours ; fournisseur hors école à 0 |
| Nominal | `replis` des 30 derniers jours |
| A1 | vue d'école : champs exacts, aucun mélange ; chaque école son fournisseur |
| A3 | taux injoignable : l'école lit des montants en USD |
| A1 / A5 | `echelle: null` sans fournisseur, avant sonde, fournisseur non sondé |
| A2 | super : école choisie par l'en-tête, vue du site sans drapeau ; école d'autrui non désignable |
| Erreurs | 403 `ERR_FORBIDDEN` / `ERR_SUPER_ONLY` / `ERR_NO_ETABLISSEMENT` ; POST d'école sans appel sortant ni écriture |
| Erreurs | `ERR_PROVIDER_UNKNOWN`, `ERR_PRICE_INVALID` ; prix vide/blanc/`null` refusé (anomalie 4 corrigée) ; zéro explicite accepté |
| A4 | catalogue en panne pendant la sonde : 200, détail, prix appliqués conservés |
| Erreurs | 405 + `Allow` |
