# Étape 9 — Administration et modération

**Dépend de :** Étape 7 · **Estimation :** 1 session

## Objectif
Donner aux administrateurs — définis en dur côté serveur via `SECRET_ADMIN_EMAILS` (exigence 9) — le pouvoir de retirer n'importe quel prompt publié, de façon réversible (soft-delete `status='hidden'`, le prompt reste en base). L'étape ajoute aussi une page `/admin` sobre offrant la visibilité sur le coût (tokens cumulés de la plateforme) et un bouton public de signalement anonyme, rendant la modération a posteriori praticable pour un enseignant seul.

## Contexte et fichiers concernés
- `src/utils/env.ts` (lignes 1-5) — point d'entrée unique des variables `SECRET_*` ; y ajouter l'export de `SECRET_ADMIN_EMAILS` en suivant le pattern existant (split sur virgule + trim, comme `SecretPasswords` ligne 3).
- `conf/(dot)env.txt` — gabarit du `.env` de production ; y documenter la nouvelle variable avec sa valeur par défaut.
- `src/pages/api/prompts/[name].ts` — endpoint CRUD des prompts créé aux étapes précédentes ; y brancher la méthode `DELETE` protégée.
- `src/pages/p/[name].tsx` et `src/pages/index.tsx` — page publique d'un prompt et accueil ; y placer les boutons contextuels retirer/restaurer et le bouton « signaler ».
- `src/chatSidebar/ChatSidebar.tsx` (ligne 69) — le bouton « Tout effacer » existant, déclenché sans confirmation : contre-exemple explicite, les actions de modération devront, elles, être confirmées.
- Module serveur d'authentification promptagogue de l'étape 7 (vérification du jeton HMAC) — y ajouter le middleware `requireAdmin`.
- À créer : `src/pages/admin.tsx` (page d'administration), endpoint de signalement anonyme (ex. `src/pages/api/report.ts`), journal des actions admin dans `DATA_DIR` (fichier ou table simple).

## Tâches
1. Ajouter `SECRET_ADMIN_EMAILS` dans `src/utils/env.ts` et `conf/(dot)env.txt` (valeur par défaut : `blanvillain@harmonia.education`), puis écrire un middleware `requireAdmin` = `requireAuth` (jeton valide) **et** email présent dans la liste — liste relue à CHAQUE requête, un vieux jeton seul ne suffit jamais.
2. Implémenter `DELETE /api/prompts/[name]` : autorisé pour un admin (sur tout prompt) ou pour l'auteur (sur les siens uniquement) ; soft-delete réversible (`status='hidden'`, jamais de suppression physique) ; journaliser chaque action de modération (fichier admin dans `DATA_DIR` ou table simple).
3. Ajouter des boutons contextuels retirer/restaurer sur `/p/[name]` et sur l'accueil, visibles uniquement selon le jeton (auteur ou admin), AVEC dialogue de confirmation — contrairement au « Tout effacer » existant de la sidebar.
4. Créer la page `/admin`, sobre : liste complète des prompts y compris masqués et `pending`, et statistiques globales (tokens cumulés de la plateforme = pilotage du budget).
5. Ajouter un bouton public « signaler ce prompt », anonyme (aucune donnée personnelle), dont les signalements alimentent la page `/admin`.
6. Option (selon la réponse du client) : statut `pending` à la création d'un prompt, publication effective seulement après validation admin.

## Livrables
- `DELETE /api/prompts/[name]` protégé (admin ou auteur) + page `/admin`
- `SECRET_ADMIN_EMAILS` documenté dans `env.ts` et `conf/(dot)env.txt`
- Signalement anonyme fonctionnel, visible dans `/admin`

## Vérification
- [ ] Avec un jeton promptagogue non-admin, `DELETE` sur le prompt d'autrui → réponse 403.
- [ ] Avec un jeton `blanvillain@harmonia.education`, retirer un prompt → il disparaît de l'accueil mais reste présent en base (`status='hidden'`).
- [ ] La restauration du même prompt le fait réapparaître sur l'accueil.
- [ ] Un signalement anonyme envoyé depuis `/p/[name]` apparaît dans la page `/admin`.

## Prompt à copier-coller dans Claude Code
```text
Tu travailles sur EduChat, un chatbot éducatif Next.js 14 (pages-router, TypeScript, Tailwind) développé par un enseignant seul assisté par IA, déployé sur un VPS OVH (Apache en reverse proxy + service systemd, mono-instance Node). Les données vivent dans une base SQLite (better-sqlite3, synchrone) stockée dans DATA_DIR hors racine web. Les promptagogues s'authentifient par un jeton HMAC-SHA256 (module crypto natif, payload {name, email, exp}) stocké en localStorage 'promptagogue-token' et envoyé en Authorization: Bearer — pas de cookie ; la signature est revérifiée côté serveur à chaque requête.

Commence par lire planning/00-analyse-existant.md, planning/decisions-techniques.md, puis la fiche planning/07-*.md (étape dont celle-ci dépend) et planning/09-administration.md. Prends connaissance du module serveur de vérification du jeton créé à l'étape 7 avant d'écrire du code.

Objectif de cette étape : administration et modération. Admins définis en dur côté serveur, retrait réversible de tout prompt, page /admin, signalement anonyme.

Tâches :
1. Dans src/utils/env.ts, ajoute l'export SECRET_ADMIN_EMAILS (liste d'emails séparés par des virgules, split + trim comme SecretPasswords ligne 3 ; défaut : blanvillain@harmonia.education). Documente la variable dans conf/(dot)env.txt.
2. Écris un middleware serveur requireAdmin = requireAuth (jeton valide) ET email du jeton présent dans SECRET_ADMIN_EMAILS. La liste est relue à CHAQUE requête sensible : la liste en dur est la source de vérité, un vieux jeton ne suffit pas.
3. Dans src/pages/api/prompts/[name].ts, implémente DELETE : autorisé si admin (tout prompt) ou si auteur (ses propres prompts), sinon 403 avec un code d'erreur stable (ex. {error:'ERR_FORBIDDEN'}) traduit côté client. Soft-delete uniquement : status='hidden', réversible (restauration possible), jamais de suppression physique. Journalise chaque action de modération (qui, quoi, quand) dans un fichier admin sous DATA_DIR ou une table simple.
4. Sur /p/[name] et sur l'accueil, ajoute des boutons contextuels retirer/restaurer, visibles seulement si le jeton local correspond à l'auteur ou à un admin, AVEC dialogue de confirmation (contrairement au bouton « Tout effacer » de src/chatSidebar/ChatSidebar.tsx ligne 69, qui n'en a pas).
5. Crée src/pages/admin.tsx, page sobre réservée aux admins : liste complète des prompts y compris masqués et 'pending', statistiques globales dont les tokens cumulés de la plateforme (somme de tokens_total, pour piloter le budget).
6. Ajoute un bouton public « signaler ce prompt » : POST anonyme (aucune donnée personnelle stockée), signalements listés dans /admin.
7. Optionnel, seulement si planning/decisions-techniques.md l'indique validé par le client : statut 'pending' à la création, publication après validation admin.

Critères d'acceptation obligatoires : jeton non-admin sur le prompt d'autrui → 403 ; jeton blanvillain@harmonia.education → le prompt disparaît de l'accueil mais reste en base ; restauration OK ; un signalement apparaît dans /admin.

Termine par : yarn build sans erreur, vérification manuelle des quatre critères ci-dessus en local, puis un commit git avec un message descriptif en français. Interdiction absolue de commiter .env, secret.txt, data/ ou tout secret ; vérifie le .gitignore avant de commiter.
```
