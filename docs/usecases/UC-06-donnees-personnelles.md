# UC-06 — Exercer ses droits RGPD : consulter, exporter, effacer ses données

| | |
|---|---|
| **Acteur principal** | Titulaire d'un compte vérifié |
| **Acteurs secondaires** | Administration (suppression du compte lui-même, sur demande écrite) |
| **Déclencheur** | Le titulaire ouvre « Mes données » (`/compte`, icône de compte) ou suit le lien de la politique de confidentialité (`/rgpd`) |
| **Pages** | `src/pages/compte.tsx`, `src/pages/rgpd.tsx` (texte des droits) |
| **API** | `GET /api/me/data`, `GET /api/me/export` ; effacement : `DELETE /api/profile`, `DELETE /api/keys`, `PUT /api/keys { optin: false }` ; reconsentement : `PUT /api/me { syncOptin }` |
| **Code serveur** | `src/server/accountData.ts` (`isVerifiedAccount`, `resumeConversations`, `collectAccountData`, `collectAccountExport`), `src/server/userKeys.ts` (`listUserKeys`, `forgetUserKey`, `setKeysOptin`), `src/server/porteMonnaie.ts` (`etatDuCompte`, `mouvements`) |

## Objectif

Donner au titulaire d'un compte, **en libre-service**, l'accès (art. 15), la portabilité
(art. 20) et l'effacement (art. 17) de ce que le serveur conserve à son sujet : identité et
rôles, consommation qui lui est rattachable, clés mémorisées (inventaire, jamais le secret),
porte-monnaie personnel et son relevé, trace de ses modérations, conversations synchronisées,
tuteurs dont il est l'auteur.

> `src/server/accountData.ts` ne contient **aucune fonction d'effacement** : il ne fait que lire.
> L'effacement en libre-service passe par `/api/profile` (conversations) et `/api/keys` (clés),
> que la page appelle. La **suppression du compte** n'a pas de route : `rgpd.tsx` la renvoie à une
> demande écrite à l'administration, et `src/pages/api/admin/users.ts` confirme qu'elle reste un
> geste manuel en base. Les tuteurs publiés ne sont jamais supprimés (dépublication, UC dédié).

## Préconditions

- Jeton de compte valide ; compte **vérifié en base** (contrairement à `/api/me`, ces routes
  refusent un jeton dont le compte a disparu).

## Scénario nominal

1. La page appelle `GET /api/me/data` (un seul appel : le seau de débit est partagé par l'IP
   d'une école). Réponse `Cache-Control: private, no-store` avec :
   `identite`, `consommation` (compteur déclaré par les navigateurs, quota d'auteur hors
   archivés, jetons pilotés par l'enseignant, jetons de clé interne de son école ce mois),
   `keys` (fournisseur, date, lisible — jamais la clé), `porteMonnaie` (50 derniers mouvements),
   `moderations`, `conversations` (résumés : nom, dates, nombre de messages, taille — **jamais le
   contenu**), `deletedConversations`, `prompts`, `anonymousPromptsWarning`.
2. **Exporter** : `GET /api/me/export` rend un fichier `educhat-mes-donnees.json`
   (`Content-Disposition: attachment`) contenant en plus le profil complet, le corps des tuteurs,
   leurs versions (bornées à 8 Mo), le relevé **complet** et la liste des modérations. La page y
   ajoute ce que garde le navigateur (`navigateurLocal`).
3. **Effacer** une sélection de conversations : `DELETE /api/profile { conversations: [ids] }`
   (pierres tombales, voir UC-08) ; ou **tout** : `DELETE /api/profile` sans corps (profil
   supprimé, pierre tombale sur chaque conversation, **consentement retiré**).
4. **Effacer ses clés** : `DELETE /api/keys?provider=x` (une) ou `PUT /api/keys { optin: false }`
   (consentement retiré et toutes les clés supprimées, voir UC-07).
5. La page recharge `/api/me/data`, qui reflète l'effacement.

## Scénarios alternatifs

- **A1 — Reconsentir.** Après un effacement total, `PUT /api/me { syncOptin: true }` rétablit la
  sauvegarde (UC-05).
- **A2 — Profil illisible.** Un profil serveur corrompu donne une liste vide de conversations
  (la date de mise à jour reste affichée) au lieu d'une erreur.
- **A3 — Tuteurs très retouchés.** Au-delà de 8 Mo de versions, les plus anciennes sont listées
  dans `versionsNonDetaillees` (nom, version, date, taille) au lieu d'être omises en silence.
- **A4 — Clé indéchiffrable** (SECRET_TOKEN_KEY changée) : toujours inventoriée, `readable: false`.

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| Pas de jeton, jeton invalide, compte absent ou non vérifié | `401 ERR_AUTH_REQUIRED` |
| Plus de 20 consultations / min / IP | `429 ERR_RATE_LIMIT` |
| Plus de 5 exports / min / IP | `429 ERR_RATE_LIMIT` |
| Méthode autre que GET | `405` (`Allow: GET`) |

## Règles métier et sécurité

- Chacun ne lit que **ses** données : l'adresse vient du jeton signé, jamais d'un paramètre.
- Aucun secret ne sort, sous aucune forme (clés API : ni en clair, ni tronquées, ni en empreinte).
- Le journal de consommation (`usage_log`, IP d'école + pseudonymes d'élèves) n'est **pas** exporté :
  seuls les totaux rattachables au titulaire sont montrés.
- On n'invente aucun chiffre : `null` plutôt que `0` quand une donnée n'existe pas.
- Le relevé du porte-monnaie est un document comptable : jamais effacé, exporté en entier.
- Réponses personnelles : `Cache-Control: private, no-store`.

## Postconditions

- Consultation/export : aucune écriture (hors compteur de débit).
- Effacement total : `profiles` sans ligne pour le compte, `profile_deletions` complétée,
  `users.sync_optin = 0` ; retrait des clés : `user_keys` vide, `users.keys_optin = 0`.

## Tests

### Unitaires — `tests/unit/uc06-donnees-personnelles/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `accountData.test.ts` | `resumeConversations`, `collectAccountData`, `collectAccountExport` | résumés sans contenu, tri par activité, profil malformé (bornes 64/200, types) ; dossier complet (quota hors archivés, jetons pilotés, mois de clé interne, clés sans secret, modérations, pierres tombales) ; compte vide → `null` ; profil illisible ; super-admin ; relevé limité à 50 ; export intégral sans journal ni secret, relevé complet ; borne de 8 Mo des versions |

### Fonctionnels — `tests/functional/uc06-donnees-personnelles/donnees.test.ts`

| Scénario | Test |
|---|---|
| Nominal (consulter) | rend tout ce que le serveur conserve, sans contenu de message ni secret |
| Nominal (exporter) | fichier JSON téléchargeable, contenu compris, en-têtes |
| Nominal (effacer) | sélection puis effacement total reflétés par `/api/me/data`, consentement retiré, tuteur conservé |
| Nominal (effacer) | oubli d'une clé, retrait du consentement et de toutes les clés |
| A1 | reconsentement après effacement total |
| Erreurs | 401 (sans jeton, compte absent, non vérifié) ; 429 (20/min, 5/min) ; 405 |
| Droits | chacun ne voit que ses données |
