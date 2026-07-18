# Étape 9 — Administration : établissements, quotas, modération et facturation

**Dépend de :** Étapes 7 et 8 · **Estimation :** 2-3 sessions

## Objectif
Donner aux administrateurs — définis en dur côté serveur via `SECRET_ADMIN_EMAILS` (exigence 9) — une page `/admin` complète couvrant la gestion des **établissements** (« clients » : IPs, quota mensuel de tokens, fournisseur/clé active, flag RESPIRE, contact de facturation), l'**application des quotas** sur la clé interne (blocage `ERR_QUOTA_ETABLISSEMENT`, remise à zéro mensuelle), la **modération a priori** (file des prompts `pending`, approbation par un admin OU un promptagogue vérifié, dépublication réversible `status='retired'`), la **facturation mensuelle** par établissement (export CSV, RESPIRE affiché à 0) et un tableau de bord des coûts, complétés par un signalement anonyme, un healthcheck `/api/health` et un garde-fou `MemoryMax` systemd.

## Contexte et fichiers concernés
- `src/utils/env.ts` (lignes 1-5) — point d'entrée unique des variables `SECRET_*` ; y ajouter l'export de `SECRET_ADMIN_EMAILS` en suivant le pattern existant (split sur virgule + trim, comme `SecretPasswords` ligne 3). `SECRET_ALLOWED_IPS`/`SECRET_ALLOWED_HOURS` (lignes 4-5) restent en **amorçage/secours** : la résolution IP → établissement se fait désormais en base.
- `conf/(dot)env.txt` — gabarit du `.env` de production ; y documenter la nouvelle variable avec sa valeur par défaut.
- `src/pages/api/completion.ts` et `src/pages/api/auth.ts` — y brancher le module de résolution IP → établissement et le blocage de quota sur la clé interne.
- Tables du **schéma SQLite v2** créées à l'étape 4 : `etablissements`, `usage_log` (alimentée à l'étape 8), `users` (rôles `is_promptagogue`/`is_teacher`), `prompts` (statuts `draft`/`pending`/`published`/`retired`, `author_email NULL` = proposition anonyme).
- `src/pages/api/prompts/[name].ts` — endpoint CRUD des prompts créé aux étapes précédentes ; y brancher `DELETE` et la dépublication selon les droits de la fiche 07.
- `src/pages/p/[name].tsx` et `src/pages/index.tsx` — page publique d'un prompt et accueil ; y placer les boutons contextuels dépublier/restaurer/supprimer et le bouton « signaler ».
- `src/chatSidebar/ChatSidebar.tsx` (ligne 69) — le bouton « Tout effacer » existant, déclenché sans confirmation : contre-exemple explicite, les actions de modération devront, elles, être confirmées.
- Module serveur d'authentification par jeton HMAC des étapes 6-7 — y ajouter les middlewares `requireAdmin` et `requireModerator` (rôles relus en base/env à chaque requête).
- À créer : `src/pages/admin.tsx`, endpoints admin (établissements, modération, facturation), `src/pages/api/report.ts` (signalement anonyme), `src/pages/api/health.ts`, journal des actions admin dans `DATA_DIR` (fichier ou table simple).

## Tâches
1. Ajouter `SECRET_ADMIN_EMAILS` dans `src/utils/env.ts` et `conf/(dot)env.txt` (valeur par défaut : `blanvillain@harmonia.education`), puis écrire deux middlewares : `requireAdmin` = `requireAuth` (jeton valide) **et** email présent dans la liste — liste relue à CHAQUE requête, un vieux jeton seul ne suffit jamais — et `requireModerator` = admin OU promptagogue vérifié (`users.is_promptagogue`, relu en base).
2. **CRUD des établissements** dans `/admin` : nom, adresses IP, flag RESPIRE (gratuit), quota mensuel de tokens, fournisseur/clé API active pour cette école, contact de facturation. Écrire un module de résolution IP → établissement partagé par `auth.ts` et `completion.ts` ; les env `SECRET_ALLOWED_IPS`/`SECRET_ALLOWED_HOURS` restent en amorçage/secours.
3. **Application des quotas** : sur la clé interne, sommer `usage_log` de l'établissement sur le mois civil courant ; quota atteint → refus avec code stable `ERR_QUOTA_ETABLISSEMENT` (traduit côté client), remise à zéro mensuelle de fait. Option « **fournisseur gratuit pour tous** » : un fournisseur marqué gratuit est accessible hors quota, même sans établissement.
4. **Modération a priori** : file des prompts `pending` dans `/admin`, approbation (→ `published`) par un admin OU un promptagogue vérifié ; dépublication réversible (→ `retired`, jamais de suppression physique silencieuse) ; suppression définitive selon la fiche 07 : l'auteur pour SES prompts, l'admin pour tout, un prompt anonyme (`author_email NULL`) par l'admin uniquement. Boutons contextuels sur `/p/[name]` et l'accueil, AVEC dialogue de confirmation. Journaliser chaque action de modération.
5. **Facturation** : bilan mensuel par établissement à partir des agrégats de `usage_log` (tokens par fournisseur, coût estimé ; établissements RESPIRE affichés à 0), export CSV. Le bilan par enseignant sera complété à l'étape 14.
6. **Tableau de bord des coûts** dans `/admin` : tokens par prompt, par établissement et global (pilotage du budget).
7. Ajouter un bouton public « signaler ce prompt », anonyme (aucune donnée personnelle), dont les signalements alimentent `/admin` — complément a posteriori de la validation a priori.
8. Ajouter `GET /api/health` (healthcheck simple pour supervision) et documenter `MemoryMax` dans le gabarit d'unité systemd de `conf/`.

## Livrables
- Page `/admin` : CRUD établissements, file de modération `pending`, facturation mensuelle avec export CSV, tableau de bord des coûts, signalements
- Module de résolution IP → établissement + blocage de quota `ERR_QUOTA_ETABLISSEMENT` actif sur la clé interne
- `SECRET_ADMIN_EMAILS` documenté dans `env.ts` et `conf/(dot)env.txt` ; middlewares `requireAdmin`/`requireModerator` ; journal des actions admin
- Signalement anonyme fonctionnel, `/api/health`, `MemoryMax` documenté

## Vérification
- [ ] Avec un jeton ni admin ni promptagogue vérifié, l'approbation d'un prompt `pending` → réponse 403.
- [ ] Avec un jeton promptagogue vérifié, approuver un `pending` → il passe `published` et apparaît au catalogue.
- [ ] `DELETE` sur un prompt anonyme avec un jeton promptagogue non-admin → 403 ; avec `blanvillain@harmonia.education` → OK.
- [ ] Dépublier un prompt → il disparaît du catalogue mais reste en base (`status='retired'`) ; la restauration le fait réapparaître.
- [ ] Établissement de test avec quota 1000 tokens : une fois dépassé, la complétion sur clé interne → `ERR_QUOTA_ETABLISSEMENT` ; l'augmentation du quota (ou le mois suivant) débloque.
- [ ] Export CSV du bilan mensuel cohérent avec `usage_log` ; établissement RESPIRE affiché à 0.
- [ ] Un signalement anonyme envoyé depuis `/p/[name]` apparaît dans la page `/admin` ; `GET /api/health` répond 200.

## Prompt à copier-coller dans Claude Code
```text
Tu travailles sur EduChat, un chatbot éducatif Next.js 14 (pages-router, TypeScript, Tailwind) développé par un enseignant seul assisté par IA, déployé sur un VPS OVH (Apache en reverse proxy + service systemd, mono-instance Node). Les données vivent dans une base SQLite (better-sqlite3, synchrone) stockée dans DATA_DIR hors racine web, avec le schéma v2 : users (comptes vérifiés par email, rôles is_promptagogue/is_teacher — les élèves n'ont JAMAIS de compte), etablissements (IPs, flag RESPIRE, quota mensuel de tokens, fournisseur actif, contact facturation), prompts (statuts 'draft'/'pending'/'published'/'retired', author_email NULL = proposition anonyme), usage_log (alimentée à l'étape 8). L'authentification repose sur un jeton HMAC-SHA256 {name, email, exp} envoyé en Authorization: Bearer ; les rôles sont relus en base/env côté serveur à chaque requête sensible.

Commence par lire planning/00-analyse-existant.md, planning/decisions-techniques.md, puis les fiches planning/07-*.md et planning/08-*.md (étapes dont celle-ci dépend) et planning/09-administration.md.

Objectif de cette étape : administration complète — gestion des établissements (« clients »), quotas de tokens, modération a priori, facturation.

Tâches :
1. Dans src/utils/env.ts, ajoute SECRET_ADMIN_EMAILS (split virgule + trim comme SecretPasswords ligne 3 ; défaut : blanvillain@harmonia.education), documenté dans conf/(dot)env.txt. Écris deux middlewares : requireAdmin (jeton valide ET email dans SECRET_ADMIN_EMAILS, liste relue à CHAQUE requête — un vieux jeton seul ne suffit jamais) et requireModerator (admin OU promptagogue vérifié en base users).
2. CRUD des établissements dans /admin : nom, adresses IP, flag RESPIRE (gratuit), quota mensuel de tokens, fournisseur/clé API active pour cette école, contact de facturation. Écris un module de résolution IP → établissement utilisé par src/pages/api/auth.ts et src/pages/api/completion.ts ; les variables SECRET_ALLOWED_IPS/SECRET_ALLOWED_HOURS restent en amorçage/secours.
3. Quotas : pour chaque complétion sur la clé interne, somme mensuelle (mois civil) de usage_log pour l'établissement résolu par IP ; quota atteint → refus avec le code stable {error:'ERR_QUOTA_ETABLISSEMENT'} traduit côté client ; la remise à zéro est mensuelle de fait. Prévois l'option « fournisseur gratuit pour tous » : un fournisseur marqué gratuit est accessible hors quota, même sans établissement.
4. Modération a priori : dans /admin, file des prompts 'pending' avec approbation (→ 'published') par un admin OU un promptagogue vérifié ; dépublication réversible (→ 'retired', jamais de suppression physique silencieuse) ; suppression définitive : l'auteur pour SES prompts, l'admin pour tout, un prompt anonyme (author_email NULL) par l'admin uniquement, sinon 403 avec code stable. Boutons contextuels sur /p/[name] et l'accueil, AVEC dialogue de confirmation (contrairement au « Tout effacer » de src/chatSidebar/ChatSidebar.tsx ligne 69). Journalise chaque action de modération (qui, quoi, quand) sous DATA_DIR.
5. Facturation : bilan mensuel par établissement à partir des agrégats de usage_log (tokens par fournisseur, coût estimé ; établissements RESPIRE affichés à 0) avec export CSV. Le bilan par enseignant sera complété à l'étape 14.
6. Tableau de bord des coûts dans /admin : tokens par prompt, par établissement et global.
7. Bouton public « signaler ce prompt » : POST anonyme (aucune donnée personnelle stockée), signalements listés dans /admin — complément a posteriori de la validation a priori.
8. Ajoute GET /api/health (healthcheck simple) et documente MemoryMax dans le gabarit d'unité systemd de conf/.

Critères d'acceptation obligatoires : approbation refusée (403) à un jeton ni admin ni promptagogue vérifié ; un promptagogue vérifié fait passer un 'pending' en 'published' ; suppression d'un prompt anonyme réservée à l'admin ; dépublication → 'retired' réversible ; quota dépassé → ERR_QUOTA_ETABLISSEMENT ; export CSV cohérent avec usage_log ; un signalement apparaît dans /admin.

Termine par : yarn build sans erreur, vérification manuelle des critères ci-dessus en local, puis un commit git avec un message descriptif en français. Interdiction absolue de commiter .env, secret.txt, data/ ou tout secret ; vérifie le .gitignore avant de commiter.
```
