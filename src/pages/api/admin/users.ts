import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../../server/db';
import { requireAdmin, dansLaPortee } from '../../../server/admin';
import { definirAdminEcole, delierCompte, ecolePrincipale, lierCompte } from '../../../server/appartenance';
import { getEtablissementById } from '../../../server/etablissements';
import { isAdminEmail } from '../../../server/token';
import { ERR } from '../../../shared/providers';

// Gestion des comptes vérifiés par l'ADMINISTRATION :
//  - liste complète (promptagogues, enseignants, rattachements, dates) ;
//  - rattachement d'un enseignant à un établissement (étape 14) ;
//  - ajustement des rôles (retirer le statut promptagogue à un compte
//    problématique, promouvoir un enseignant...).
// PRINCIPE : on ne supprime pas de compte ici — retirer les deux rôles
// neutralise déjà tous les droits d'écriture ; l'effacement RGPD complet
// reste un geste manuel et réfléchi de l'administrateur en base.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = requireAdmin(req);
  if (!admin) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
  const db = getDb();

  if (req.method === 'GET') {
    // Un administrateur d'école ne voit QUE son école. Le filtre est porté par
    // la requête et non par l'affichage : ce qui ne doit pas être lu ne doit
    // pas sortir de la base.
    const filtre = admin.niveau === 'ecole' ? 'WHERE u.etablissement_id = @ecole' : '';
    return res.status(200).json({
      users: (db.prepare(`
        SELECT u.email, u.name, u.is_promptagogue AS isPromptagogue, u.is_teacher AS isTeacher,
               -- Le rang d'administrateur vit sur le LIEN, école par école. Un
               -- administrateur d'école doit donc lire celui de SON école, et
               -- non le miroir users.is_school_admin (« admin d'au moins une
               -- école ») : il verrait sinon cochée la case de quelqu'un qui
               -- administre AILLEURS, et la décocher ne changerait rien.
               -- Le site, lui, regarde toutes les écoles à la fois : le miroir
               -- est exactement la réponse qu'il attend.
               CASE WHEN @ecole IS NULL THEN u.is_school_admin ELSE COALESCE(
                 (SELECT l.is_admin FROM user_etablissements l
                  WHERE l.email = u.email AND l.etablissement_id = @ecole), 0) END AS isSchoolAdmin,
               u.etablissement_id AS etablissementId, e.name AS etablissementName,
               u.sync_optin AS syncOptin, u.created_at AS createdAt, u.verified_at AS verifiedAt,
               -- users.adult_verified_at / adult_verified_by NE SORTENT PLUS.
               -- La « majorité certifiée » n'existe plus (src/server/db.ts dit
               -- pourquoi les colonnes, elles, restent) ; les renvoyer offrirait
               -- à une administration d'école la date et le nom d'un garant sur
               -- une décision que plus rien n'applique. Ce qui ne sert plus à
               -- rien ne doit pas sortir de la base.
               (SELECT COUNT(*) FROM prompts p WHERE p.author_email = u.email) AS promptCount
        FROM users u LEFT JOIN etablissements e ON e.id = u.etablissement_id
        ${filtre}
        ORDER BY u.is_teacher DESC, u.email
      `).all({ ecole: admin.niveau === 'ecole' ? admin.etablissementId : null }) as any[])
        // Le rang de super vient du fichier de configuration : la base ne le
        // connaît pas, et l'interface doit pourtant savoir qu'une ligne est
        // intouchable — sans quoi elle offre des cases qui répondent 403.
        .map(u => ({ ...u, isSuper: isAdminEmail(String(u.email)) })),
    });
  }

  if (req.method === 'POST') {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: { code: 'ERR_EMAIL_INVALID' } });
    const user = db.prepare('SELECT email FROM users WHERE email = ?').get(email);
    if (!user) return res.status(404).json({ error: { code: 'ERR_USER_UNKNOWN' } });
    // Hors de sa portée : un administrateur d'école ne touche ni les comptes
    // d'une autre école, ni un super-administrateur — dont le rang vient du
    // fichier de configuration et ne se reprend pas depuis une interface.
    if (!dansLaPortee(admin, email)) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });

    // Mise à jour partielle : seuls les champs PRÉSENTS dans la requête bougent.
    //
    // TOUT CE QUI PEUT REFUSER EST ÉVALUÉ AVANT LA PREMIÈRE ÉCRITURE. Depuis
    // que le rattachement touche DEUX endroits (la liaison et l'école
    // principale), un refus prononcé entre les deux laisserait un compte
    // délié d'une école dont il porte encore l'identifiant — et l'interface,
    // qui a lu « échec », n'aurait aucune raison de revenir corriger. La
    // phase de validation ne fait donc que CALCULER ; la phase d'écriture,
    // plus bas, ne peut plus rien refuser.
    const sets: string[] = [];
    const params: any[] = [];

    // ÉCOLE PRINCIPALE (users.etablissement_id). Depuis le multi-écoles, ce
    // champ ne dit plus « la seule école du compte » mais « son école par
    // défaut » — celle que lisent le catalogue, la séance et la facturation.
    // undefined = absent de la requête, null = détacher.
    let ecoleVisee: number | null | undefined;
    if ('etablissementId' in (req.body ?? {})) {
      // Déplacer quelqu'un d'une école à l'autre revient à le faire sortir de
      // sa propre portée : réservé au site. Sans cela, un administrateur
      // d'école pourrait s'attribuer les membres d'une autre.
      if (admin.niveau !== 'super') return res.status(403).json({ error: { code: 'ERR_SUPER_ONLY' } });
      if (req.body.etablissementId) {
        const id = Number(req.body.etablissementId);
        // Un identifiant illisible produirait un NaN, donc un rattachement
        // vide écrit sans bruit : on refuse plutôt que d'écrire n'importe quoi.
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: { code: 'ERR_ETABLISSEMENT_INVALID' } });
        }
        // L'ÉCOLE DOIT EXISTER. Auparavant un identifiant fantaisiste ne
        // faisait que dormir dans une colonne ; il nourrit désormais la
        // liaison, donc estMembre, donc requireAdmin — c'est-à-dire une
        // portée d'administration sur une école qui n'existe pas.
        if (!getEtablissementById(id)) {
          return res.status(404).json({ error: { code: 'ERR_ETABLISSEMENT_UNKNOWN' } });
        }
        ecoleVisee = id;
      } else {
        ecoleVisee = null;
      }
      sets.push('etablissement_id = ?');
      params.push(ecoleVisee);
    }
    // Nommer un administrateur d'école. Un administrateur d'école PEUT en
    // nommer d'autres — dans son établissement, et nulle part ailleurs
    // (décision du client) : c'est ce qui rend l'école autonome, y compris
    // pour organiser sa propre succession. La portée a déjà été vérifiée.
    let rangVise: { etablissementId: number; admin: boolean } | undefined;
    if ('isSchoolAdmin' in (req.body ?? {})) {
      if (isAdminEmail(email)) return res.status(409).json({ error: { code: 'ERR_SUPER_IMMUTABLE' } });
      // LE RANG S'ÉCRIT SUR UN LIEN, PAS SUR UN COMPTE : « administrateur »
      // n'a de sens que suivi d'une école. Pour un administrateur d'école,
      // c'est SON école active — celle de sa portée, déjà revérifiée, et la
      // seule qu'il puisse toucher. Pour le site, c'est l'école visée par la
      // même requête si elle en désigne une, sinon l'école principale du
      // compte : nommer administrateur quelqu'un qui n'a aucune école ne
      // veut rien dire, et on le dit plutôt que de l'écrire dans le vide.
      const cible = admin.niveau === 'ecole' ? admin.etablissementId
        : (ecoleVisee !== undefined ? ecoleVisee : ecolePrincipale(email));
      if (cible === null) return res.status(409).json({ error: { code: 'ERR_NO_ETABLISSEMENT' } });
      rangVise = { etablissementId: cible, admin: !!req.body.isSchoolAdmin };
    }
    // LA CERTIFICATION DE MAJORITÉ N'EST PLUS ACCEPTÉE ICI, ET C'EST LE POINT.
    //
    // Cette route lisait `adultVerifiedBy` et écrivait les deux colonnes
    // users.adult_verified_at / adult_verified_by, sous la garde « personne ne
    // se certifie soi-même majeur ». Le produit a supprimé la notion : l'accès
    // aux fournisseurs se décide sur le LIEU et le COMPTE
    // (src/server/accesFournisseurs.ts), et l'écran de gestion des comptes n'a
    // plus ni case ni champ de garant.
    //
    // POURQUOI RETIRER L'ÉCRITURE, ET PAS SEULEMENT L'AFFICHAGE. Une route qui
    // accepte encore un champ que plus aucune interface n'envoie est une porte
    // qu'on n'ouvre plus qu'à la main : elle peuplerait la base
    // d'auto-certifications le jour où quelqu'un rebrancherait quoi que ce soit
    // sur ces colonnes, et sa garde — qui n'avait de sens que couplée à la
    // règle disparue — se relirait comme la preuve que la règle vit encore.
    // Un corps de requête portant `adultVerifiedBy` est désormais IGNORÉ, ce
    // qui est le comportement de tout champ inconnu ; s'il est seul, la
    // requête tombe sur « rien à mettre à jour » plus bas, et c'est vrai.
    //
    // LES COLONNES RESTENT EN BASE (migrations additives, src/server/db.ts) :
    // elles gardent la trace de décisions réellement prises, et plus rien ne
    // les lit ni ne les écrit.
    if ('isTeacher' in (req.body ?? {})) {
      sets.push('is_teacher = ?');
      params.push(req.body.isTeacher ? 1 : 0);
    }
    if ('isPromptagogue' in (req.body ?? {})) {
      sets.push('is_promptagogue = ?');
      params.push(req.body.isPromptagogue ? 1 : 0);
    }
    if (!sets.length && !rangVise) {
      return res.status(400).json({ error: { code: 'ERR_NOTHING_TO_UPDATE' } });
    }

    // ---- ÉCRITURES : plus aucun refus possible à partir d'ici. ----
    // LE DÉPLACEMENT EMPORTE LE LIEN, dans les deux sens. Sans le retrait de
    // l'ancien lien, un administrateur déplacé de A vers B resterait
    // administrateur de A par sa liaison : les gardes lisent la liaison, pas
    // l'école principale, et le « déplacement » serait devenu un cumul. Les
    // AUTRES liens (reconnaissance par IP, futur écran multi-écoles) ne sont
    // pas concernés : ce champ ne parle que de l'école principale.
    if (ecoleVisee !== undefined) {
      const ancienne = ecolePrincipale(email);
      if (ancienne !== null && ancienne !== ecoleVisee) delierCompte(email, ancienne);
      if (ecoleVisee !== null) lierCompte(email, ecoleVisee);
    }
    // APRÈS le déplacement : nommer administrateur de l'école d'arrivée
    // suppose le lien déjà posé (definirAdminEcole le créerait sinon lui-même,
    // mais avec un horodatage qui ferait de l'école d'arrivée le lien le plus
    // ancien — donc l'école active de repli, avant même que la colonne
    // principale ne soit écrite).
    if (rangVise) definirAdminEcole(email, rangVise.etablissementId, rangVise.admin);
    if (sets.length) db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE email = ?`).run(...params, email);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: { code: ERR.METHOD } });
}
