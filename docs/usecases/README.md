# Cas d'utilisation d'EduChat

Ce répertoire documente **tout ce que fait EduChat**, cas d'utilisation par cas d'utilisation.
Chaque fiche décrit les acteurs, le parcours nominal, les variantes, les erreurs et les règles
métier, puis renvoie aux **jeux de tests** qui les vérifient. Les tests vivent à part, dans
[`tests/`](../../tests) :

```
docs/usecases/            ← cette documentation (Markdown)
tests/
  setup.ts                ← environnement commun (DATA_DIR temporaire, clés factices)
  helpers/                ← appel des routes sans serveur, fabrique de données, doublure réseau
  unit/ucXX-slug/         ← tests unitaires du code sollicité par le cas
  functional/ucXX-slug/   ← tests fonctionnels : le scénario du cas, par les vraies routes d'API
```

## Lancer les tests

```bash
yarn install
yarn test               # tout
yarn test:unit          # unitaires seulement
yarn test:functional    # fonctionnels seulement
npx vitest run tests/functional/uc11-conversation   # un seul cas
```

- **Unitaires** : une fonction ou un module (`src/server`, `src/shared`, `src/utils`) isolé, avec
  la base SQLite réelle quand le module l'interroge.
- **Fonctionnels** : la route d'API Next.js entière est exécutée (gardes, base, règles), appelée
  par `tests/helpers/api.ts` sans serveur HTTP. Seuls le réseau sortant (fournisseurs d'IA, PayPal,
  OpenRouter — `tests/helpers/fetch.ts`) et l'envoi de courriels sont doublés.
- Chaque fichier de test reçoit **sa propre base** dans un répertoire temporaire : aucun test ne
  touche aux données du poste, et les fichiers tournent en parallèle sans se gêner.
- Aucune clé réelle n'est nécessaire ; `tests/setup.ts` efface celles de l'environnement.

## Acteurs

| Acteur | Qui | Identité |
|---|---|---|
| **Visiteur** | Toute personne sur Internet | Aucune — repli gratuit ou sa propre clé |
| **Élève** | Un visiteur sur le réseau d'une école | Aucune — reconnu par l'**IP** de l'école, jamais par un compte |
| **Promptagogue** | Auteur de tuteurs | Compte vérifié par email |
| **Enseignant** | Promptagogue rattaché à une école par une administration | Compte + rattachement |
| **Administrateur d'école** | Gère SON établissement | Compte + lien `is_admin` |
| **Super-administrateur** | Gère la plateforme | Adresse listée dans `SECRET_ADMIN_EMAILS` |
| **Systèmes externes** | Fournisseurs d'IA, OpenRouter, PayPal, SMTP | — |

## Liste des cas d'utilisation

### Découvrir et utiliser les tuteurs

| # | Cas d'utilisation | Acteurs |
|---|---|---|
| [UC-01](UC-01-catalogue.md) | Consulter le catalogue des tuteurs | Visiteur, élève, enseignant |
| [UC-02](UC-02-notation.md) | Noter un tuteur | Visiteur |
| [UC-03](UC-03-commentaires.md) | Commenter un tuteur et modérer les commentaires | Visiteur, auteur, école, super-admin |
| [UC-11](UC-11-conversation.md) | Discuter avec un tuteur | Visiteur, élève |
| [UC-12](UC-12-echelle-modeles.md) | Régénérer une réponse en montant l'échelle des modèles | Visiteur, super-admin |
| [UC-13](UC-13-fournisseurs-modeles.md) | Choisir un fournisseur et un modèle | Visiteur, super-admin |
| [UC-23](UC-23-voix.md) | Dicter et écouter les réponses | Visiteur |
| [UC-25](UC-25-historique-local.md) | Conserver son historique, ses favoris, et les transporter | Visiteur |
| [UC-26](UC-26-langues.md) | Utiliser le site dans sa langue | Tous |

### Compte et données personnelles

| # | Cas d'utilisation | Acteurs |
|---|---|---|
| [UC-04](UC-04-identification.md) | Créer un compte ou se reconnecter par code email | Visiteur |
| [UC-05](UC-05-identite-compte.md) | Gérer son identité et changer d'adresse email | Titulaire d'un compte |
| [UC-06](UC-06-donnees-personnelles.md) | Exercer ses droits RGPD : consulter, exporter, effacer | Titulaire d'un compte |
| [UC-07](UC-07-cles-api.md) | Mémoriser ses clés API | Titulaire d'un compte |
| [UC-08](UC-08-sync-profil.md) | Synchroniser son profil entre navigateurs | Titulaire d'un compte |

### Écrire et publier des tuteurs

| # | Cas d'utilisation | Acteurs |
|---|---|---|
| [UC-09](UC-09-atelier-tuteur.md) | Rédiger, tester et soumettre un tuteur | Promptagogue, visiteur anonyme |
| [UC-10](UC-10-moderation-tuteur.md) | Modérer le cycle de vie d'un tuteur | Super-admin, admin d'école, enseignant |
| [UC-24](UC-24-traduction.md) | Traduire automatiquement un tuteur | Système |

### La classe et l'établissement

| # | Cas d'utilisation | Acteurs |
|---|---|---|
| [UC-14](UC-14-salle-classe.md) | Ouvrir et refermer la salle de classe | Enseignant |
| [UC-15](UC-15-seance.md) | Déployer une séance sur la classe et suivre son état | Enseignant, élève |
| [UC-16](UC-16-inscription-etablissement.md) | Inscrire un établissement et accueillir ses élèves | Responsable d'école, élève |
| [UC-17](UC-17-gestion-etablissement.md) | Administrer son établissement | Administrateur d'école, enseignant |

### Plateforme, argent et exploitation

| # | Cas d'utilisation | Acteurs |
|---|---|---|
| [UC-18](UC-18-super-administration.md) | Super-administrer les établissements et les comptes | Super-admin, admin d'école |
| [UC-19](UC-19-facturation.md) | Facturer la consommation d'une école | Super-admin, admin d'école |
| [UC-20](UC-20-porte-monnaie.md) | Gérer un porte-monnaie et le recharger par PayPal | Admin d'école, titulaire d'un compte, PayPal |
| [UC-21](UC-21-tarifs.md) | Régler les tarifs de la clé interne | Super-admin, système (sonde) |
| [UC-22](UC-22-statistiques.md) | Consulter la fréquentation publique et la santé du service | Visiteur, supervision |

## Anomalies

Les comportements qui semblent être des défauts sont recensés dans [ANOMALIES.md](ANOMALIES.md).

## Gabarit d'une fiche

Chaque fiche suit la même structure : tableau d'en-tête (acteurs, déclencheur, pages, API, code
serveur) · Objectif · Préconditions · Scénario nominal · Scénarios alternatifs · Scénarios
d'erreur · Règles métier et sécurité · Postconditions · Tests (unitaires puis fonctionnels, avec
la correspondance scénario ↔ test) · et, lorsqu'il y a lieu, Anomalies constatées.
