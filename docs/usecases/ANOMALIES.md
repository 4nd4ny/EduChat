# Anomalies constatées — synthèse

En écrivant les tests, plusieurs comportements du code ont paru contraires à son intention
(commentaires, fiches du planning) ou à la cohérence d'ensemble. Les anomalies marquées ✅ **Corrigée** ont été
corrigées depuis : leurs tests vérifient désormais le comportement corrigé, et la fiche du cas
dit comment. Pour les autres, chaque test fige le comportement **actuel**, porte un commentaire (souvent préfixé « ANOMALIE ») et renvoie
à la section « Anomalies constatées » de sa fiche, qui donne le détail. Corriger une anomalie
revient donc à corriger le code **et** à inverser l'assertion du test correspondant.

Classement indicatif par gravité.

## Sécurité et argent

| Fiche | Anomalie | Où |
|---|---|---|
| [UC-14](UC-14-salle-classe.md) | ✅ **Corrigée** — L'action « fermer la salle » est traitée avant le verrouillage après 5 échecs : oracle de force brute illimité sur le mot de passe | `src/pages/api/auth.ts:204-238` |
| [UC-20](UC-20-porte-monnaie.md) | ✅ **Corrigée** — Un remboursement demandé est repris une seconde fois quand PayPal notifie `PAYMENT.CAPTURE.REFUNDED` (solde négatif) | `src/server/paypal.ts:258` |
| [UC-20](UC-20-porte-monnaie.md) | ✅ **Corrigée** — Paiement capturé pour un titulaire disparu pris pour un doublon : argent encaissé crédité nulle part, sans alerte | `src/server/paypal.ts:230` |
| [UC-23](UC-23-voix.md) | ✅ **Corrigée** — Dictée et lecture dépensent la clé de l'école sans contrôle de crédit, quotas ni séance, et sans montant au journal | `src/pages/api/transcribe.ts:75-91`, `src/pages/api/speak.ts:75-78` |
| [UC-19](UC-19-facturation.md) | ✅ **Corrigée** — Lignes de journal sans ventilation entrée/sortie (anciennes, voix, traduction) valorisées à 0 | `src/server/facturation.ts:347` |
| [UC-09](UC-09-atelier-tuteur.md) | ✅ **Corrigée** — L'URL secrète d'un brouillon reste une clé d'écriture après publication | `src/pages/api/prompts/[name]/index.ts:58` |
| [UC-10](UC-10-moderation-tuteur.md) | ⏳ **En attente d'une décision** — Tout promptagogue (donc tout compte vérifié) peut approuver, y compris son propre tuteur — « décision client » à confirmer | `src/pages/api/prompts/[name]/index.ts:246` |
| [UC-05](UC-05-identite-compte.md) | ✅ **Corrigée** — Le changement d'adresse ne migre pas le porte-monnaie personnel (mouvements, recharges en attente) | `src/pages/api/me/email.ts:90-128` |
| [UC-21](UC-21-tarifs.md) | ✅ **Corrigée** — La sonde peut retenir le prix d'un autre modèle (comparaison sur 8 caractères, homonyme d'un autre vendeur) et il est facturé | `src/server/sondeTarifs.ts:193,221` |
| [UC-21](UC-21-tarifs.md) | ✅ **Corrigée** — D'anciennes colonnes de prix, invisibles à l'écran, priment sur le prix unique réglé par le site | `src/server/porteMonnaie.ts:174-175` |
| [UC-19](UC-19-facturation.md) | ✅ **Corrigée** — Consommation d'un porte-monnaie personnel comptée comme « démonstration offerte » dans le bilan | `src/server/facturation.ts:489` |

## Données perdues ou écrasées en silence

| Fiche | Anomalie | Où |
|---|---|---|
| [UC-17](UC-17-gestion-etablissement.md) | ✅ **Corrigée** — Un `PUT` partiel de l'établissement remet horaires et quotas à zéro (illimités) | `src/pages/api/etablissement.ts:135-159` |
| [UC-18](UC-18-super-administration.md) | ✅ **Corrigée** — Modifier une école depuis `/admin` efface son fournisseur actif | `src/administration/Etablissements.tsx:48`, `src/pages/api/admin/etablissements.ts:66,71` |
| [UC-18](UC-18-super-administration.md) | ✅ **Corrigée** — Aucune unicité des IP côté super-administrateur (l'inscription, elle, la contrôle) | `src/pages/api/admin/etablissements.ts:56` |
| [UC-13](UC-13-fournisseurs-modeles.md) | ✅ **Corrigée** — Catalogue périmé + fournisseur en panne : la liste est remplacée 24 h par le seul modèle par défaut | `src/server/models.ts:217` |
| [UC-12](UC-12-echelle-modeles.md) | ✅ **Corrigée** — `PUT /api/admin/ladder` sans `rungs` valide efface l'échelle au lieu d'un 400 | `src/pages/api/admin/ladder.ts:51` |
| [UC-08](UC-08-sync-profil.md) | ✅ **Corrigée** — `DELETE /api/profile` avec une sélection vide efface tout et retire le consentement | `src/pages/api/profile.ts:104` |
| [UC-24](UC-24-traduction.md) | ✅ **Corrigée** — Une retraduction forcée qui échoue retire du service une traduction à jour | `src/server/traduction.ts:153-172` |
| [UC-25](UC-25-historique-local.md) | ✅ **Corrigée** — Import de profil peu validé (rôle `system`, favoris arbitraires) et partiel en cas d'erreur | `src/utils/profile.ts:44-70` |

## Parcours cassés ou trompeurs

| Fiche | Anomalie | Où |
|---|---|---|
| [UC-14](UC-14-salle-classe.md) | ✅ **Corrigée** (durée par défaut de 60 min) — Mot de passe sans suffixe de durée : « Connexion autorisée », mais salle fermée ; également corrigé (la saisie entière est essayée d'abord) : un mot de passe finissant par des chiffres est inutilisable | `src/pages/api/auth.ts:28-38, 304-353` |
| [UC-14](UC-14-salle-classe.md) | ✅ **Corrigée** — `/api/auth` ignore les écoles en base et leurs horaires propres | `src/pages/api/auth.ts:253` |
| [UC-01](UC-01-catalogue.md) | ✅ **Corrigée** — La fiche et la notation d'un tuteur réservé sont appelées sans jeton (enseignant hors campus → 404) | `src/pages/p/[name].tsx:92,104` |
| [UC-03](UC-03-commentaires.md) | ✅ **Corrigée** — La file de modération de l'admin d'école contient des commentaires qu'il ne peut pas modérer (403) | `src/pages/api/admin/comments.ts:35` |
| [UC-15](UC-15-seance.md) | ✅ **Corrigée** — La console affiche « déployé » un tuteur archivé que les élèves ne reçoivent plus | `src/pages/api/session-status.ts:80` |
| [UC-11](UC-11-conversation.md) | ✅ **Corrigée** — Une version épinglée inexistante est servie au texte courant mais renvoyée comme épinglée | `src/pages/api/completion.ts:116-123` |
| [UC-05](UC-05-identite-compte.md) | ✅ **Corrigée** — Le code de changement d'adresse n'accepte pas « 123456 » ni « 123 456 » (contrairement à la connexion) | `src/pages/api/me/email.ts:70` |
| [UC-16](UC-16-inscription-etablissement.md) | ✅ **Corrigée** — `/api/ip` et l'inscription ne jugent pas une IP « revendiquée » de la même façon | `src/pages/api/ip.ts:21` |
| [UC-26](UC-26-langues.md) | ✅ **Corrigée** — Clé `admin.tarif.helpSchool` vide dans les quatre langues ; `useT` ne remplace pas une valeur vide | `src/i18n/dictionaries.ts:889`, `src/i18n/useT.ts:10` |

## Restant ouvert

| Fiche | Anomalie | Où |
|---|---|---|
| [UC-10](UC-10-moderation-tuteur.md) | Auto-validation d'un tuteur par son auteur — décision du client à confirmer (voir plus haut) | `src/pages/api/prompts/[name]/index.ts:246` |
| [UC-10](UC-10-moderation-tuteur.md) | `/api/admin/prompts` liste à l'administrateur d'école les tuteurs de la plateforme, sur lesquels la modération lui répond 403 (même incohérence que celle corrigée pour les commentaires) | `src/pages/api/admin/prompts.ts:46` |
| [UC-17](UC-17-gestion-etablissement.md) | Les deux quotas s'écrivent par l'école ET par le super-administrateur, la dernière écriture l'emporte — arbitrage produit | `src/pages/api/etablissement.ts`, `src/pages/api/admin/etablissements.ts` |
| [UC-25](UC-25-historique-local.md) | Le champ de version du profil s'appelle `educhatProfile` et non `formatVersion` (planning) — laissé en l'état pour la compatibilité des fichiers exportés | `src/utils/profile.ts` |

Les autres anomalies mineures (codes d'erreur approximatifs, commentaires périmés, affichages) ont
été corrigées avec leur fiche ; chacune dit ce qui a été fait.
