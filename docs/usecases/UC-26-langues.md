# UC-26 — Utiliser le site dans sa langue

| | |
|---|---|
| **Acteur principal** | Tout visiteur (élève, enseignant, promptagogue, administrateur) |
| **Acteurs secondaires** | Routeur de Next.js (routage localisé `/en`, `/it`, `/de`) |
| **Déclencheur** | Le visiteur clique une langue dans le sélecteur, ou arrive par une URL préfixée |
| **Pages** | Toutes ; sélecteur `src/i18n/LanguageSwitcher.tsx` |
| **API** | Aucune directement ; les appels d'API reçoivent la locale via `currentLocale()` |
| **Code** | `src/i18n/dictionaries.ts` (`fr`, `en`, `it`, `de`, `dictionaries`), `src/i18n/useT.ts` (`translate`, `useT`, `currentLocale`), `next.config.js` (`i18n`) |

## Objectif

Afficher toute l'interface en français, anglais, italien ou allemand, sans bibliothèque :
Next fournit le routage localisé, un hook de vingt lignes traduit à partir de dictionnaires
plats. Le français est la langue par défaut (sans préfixe d'URL) et la **référence** : chaque
autre dictionnaire doit en répéter toutes les clés.

## Préconditions

- Aucune. La langue n'est liée ni à un compte ni au stockage du navigateur : elle est portée
  par l'URL.

## Scénario nominal — bascule de langue

1. Le visiteur est sur une page en français (`router.locale = 'fr'`).
2. Le sélecteur affiche un bouton par locale déclarée (`fr en it de`), la courante en gras,
   chacun étiqueté « Langue : xx ».
3. Il clique « en » : `router.push(router.asPath, undefined, { locale: 'en' })` — **même page**,
   URL préfixée `/en`.
4. Next change `router.locale` ; `useT()` relit chaque libellé dans `dictionaries.en`.
5. Les gabarits `{variable}` sont remplacés, **toutes** leurs occurrences.

## Scénarios alternatifs

- **A1 — Routeur sans liste de locales.** Le sélecteur ne propose que « fr ».
- **A2 — Locale non gérée ou absente** (`es`, `undefined`, chaîne vide). Tout retombe sur le
  français.
- **A3 — Clé absente d'une langue** (oubli à l'exécution). `translate` retombe sur la valeur
  française ; clé inconnue partout : la clé elle-même est affichée.
- **A4 — Code hors composant** (utilitaires, appels d'API). `currentLocale()` lit
  `window.__NEXT_DATA__.locale`, sinon `<html lang>`, sinon `fr` (et `fr` côté serveur).

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| Variable non fournie | Le gabarit reste visible (`Factures impayées ({n})`) |
| Variable superflue | Ignorée |
| Valeur de remplacement contenant `{n}` | Insérée telle quelle, jamais réinterprétée |
| Valeur **vide** dans un dictionnaire | Rendue vide : `??` ne replie que sur `null`/`undefined` (voir anomalies) |

## Règles métier et sécurité

- Pas de `...fr` dans `en`/`it`/`de` : le type `Record<TranslationKey, string>` fait signaler
  par `tsc` toute clé oubliée. Les tests reconfirment à l'exécution l'égalité des jeux de clés.
- Mêmes gabarits `{variable}` dans les quatre langues, clé par clé ; aucune accolade orpheline.
- Les locales de `next.config.js` et les dictionnaires doivent coïncider exactement.

## Postconditions

- L'URL porte la nouvelle locale ; l'interface est entièrement rendue dans cette langue.

## Anomalies constatées

1. **Corrigée** — **Clé vide dans les quatre langues** : `admin.tarif.helpSchool` valait `''`
   (`src/i18n/dictionaries.ts:889`, `:2050`, `:3209`, `:4368`) et n'était employée nulle part
   dans `src/`. Elle est supprimée des quatre dictionnaires ; `CLES_VIDES_CONNUES`
   (`dictionnaires.test.ts`) est désormais vide : toute clé vide fera échouer le test.
2. **Corrigée** — **Pas de repli sur une valeur vide** (`src/i18n/useT.ts:10`) : `dict[key] ?? fr[key]`
   ne remplaçait pas une chaîne vide par le français. `translate` utilise désormais `||` : une
   traduction vide se replie sur le français, puis sur la clé.

Aucune clé manquante ou superflue, ni aucun gabarit divergent n'a été trouvé.

## Tests

### Unitaires — `tests/unit/uc26-langues/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `dictionnaires.test.ts` | `dictionaries`, `fr`, `en`, `it`, `de`, `next.config.js` | locales déclarées = dictionnaires, forme des clés, aucune clé manquante/superflue par langue, valeurs chaînes, aucune clé vide, traductions non recopiées du français (< 5 %), mêmes gabarits par clé, accolades bien formées |
| `useT.test.ts` | `translate`, `useT`, `currentLocale` | traduction par locale, repli locale inconnue/absente, clé inconnue, clé manquante → français, valeur vide → français puis clé, remplacement de toutes les occurrences, variables manquantes/superflues/auto-référentes, `router.locale`, lecture de la locale hors composant |

### Fonctionnels — `tests/functional/uc26-langues/langues.test.ts`

Sans jsdom, le parcours est joué au niveau des fonctions : `LanguageSwitcher` est appelé comme
une fonction qui rend son arbre d'éléments React, le clic est l'appel de `onClick`, et un
routeur doublé (`next/router`) change de locale comme Next ; `useT` relit ensuite les libellés.
Le routage d'URL `/en`, `/it`, `/de` appartient à Next et n'est pas rejoué : seule sa
déclaration dans `next.config.js` est vérifiée.

| Scénario | Test |
|---|---|
| Nominal | le sélecteur propose les quatre locales, la courante en évidence |
| Nominal | parcours fr → en → it → de → fr : même page, libellés de la barre latérale traduits à chaque étape |
| Nominal | variables remplacées dans chaque langue |
| A1 | routeur sans liste de locales : « fr » seul |
| A2 | locale non gérée : repli intégral sur le français |
| Couverture | pour chaque locale de `next.config.js`, chaque clé rend le texte de sa langue, jamais la clé brute |
