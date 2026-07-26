import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../../server/db';
import { setAdultVerified } from '../../../server/adult';
import { requireAdmin, dansLaPortee } from '../../../server/admin';
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
               u.is_school_admin AS isSchoolAdmin,
               u.etablissement_id AS etablissementId, e.name AS etablissementName,
               u.sync_optin AS syncOptin, u.created_at AS createdAt, u.verified_at AS verifiedAt,
               u.adult_verified_at AS adultVerifiedAt, u.adult_verified_by AS adultVerifiedBy,
               (SELECT COUNT(*) FROM prompts p WHERE p.author_email = u.email) AS promptCount
        FROM users u LEFT JOIN etablissements e ON e.id = u.etablissement_id
        ${filtre}
        ORDER BY u.is_teacher DESC, u.email
      `).all(admin.niveau === 'ecole' ? { ecole: admin.etablissementId } : {}) as any[])
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
    const sets: string[] = [];
    const params: any[] = [];
    if ('etablissementId' in (req.body ?? {})) {
      // Déplacer quelqu'un d'une école à l'autre revient à le faire sortir de
      // sa propre portée : réservé au site. Sans cela, un administrateur
      // d'école pourrait s'attribuer les membres d'une autre.
      if (admin.niveau !== 'super') return res.status(403).json({ error: { code: 'ERR_SUPER_ONLY' } });
      sets.push('etablissement_id = ?');
      params.push(req.body.etablissementId ? Number(req.body.etablissementId) : null);
    }
    // Nommer un administrateur d'école. Un administrateur d'école PEUT en
    // nommer d'autres — dans son établissement, et nulle part ailleurs
    // (décision du client) : c'est ce qui rend l'école autonome, y compris
    // pour organiser sa propre succession. La portée a déjà été vérifiée.
    if ('isSchoolAdmin' in (req.body ?? {})) {
      if (isAdminEmail(email)) return res.status(409).json({ error: { code: 'ERR_SUPER_IMMUTABLE' } });
      sets.push('is_school_admin = ?');
      params.push(req.body.isSchoolAdmin ? 1 : 0);
    }
    // Certification de majorité : on n'enregistre QUE le nom de la personne
    // qui se porte garante — l'administration après un entretien vidéo, ou un
    // enseignant qui répond de ses élèves majeurs. Champ vide = retrait.
    // Aucune pièce d'identité n'est demandée ni conservée.
    // Elle ne passe pas par `sets` (colonnes doubles + horodatage) : sans ce
    // drapeau, une requête qui ne changeait QUE la certification tombait sur
    // le garde-fou « rien à mettre à jour » plus bas — l'écriture avait bien
    // lieu, mais l'interface annonçait un échec.
    let touche = false;
    if ('adultVerifiedBy' in (req.body ?? {})) {
      // PERSONNE NE SE CERTIFIE SOI-MÊME MAJEUR.
      //
      // Un garant répond de QUELQU'UN D'AUTRE (voir src/server/adult.ts :
      // « l'administration après un entretien vidéo, ou un enseignant qui
      // répond de ses élèves majeurs ») — se porter garant de soi ne vérifie
      // rien du tout. Tant que le rang d'administrateur d'école se recevait
      // du site, l'anomalie restait théorique. Depuis l'INSCRIPTION EN
      // LIBRE-SERVICE (src/pages/api/etablissement/inscription.ts), n'importe
      // qui obtient ce rang en trois champs : sans cette garde, il lui
      // suffirait de cocher sa propre case pour ouvrir les fournisseurs
      // écartés au titre de l'AI Act (Gemini, Grok, DeepSeek… hors réseau
      // scolaire, avec sa clé personnelle). Le contournement ne s'arrête pas
      // à un complice : rattacher un second compte à son école est réservé
      // au site, et deux inscrits en libre-service atterrissent dans DEUX
      // écoles, donc hors de la portée l'un de l'autre.
      //
      // Le site, lui, garde la main : un super-administrateur tient son rang
      // de SECRET_ADMIN_EMAILS, pas d'un formulaire.
      if (admin.niveau === 'ecole' && email === admin.auth.email.toLowerCase()) {
        return res.status(403).json({ error: { code: 'ERR_SELF_CERT_FORBIDDEN' } });
      }
      setAdultVerified(email, String(req.body.adultVerifiedBy ?? ''));
      touche = true;
    }
    if ('isTeacher' in (req.body ?? {})) {
      sets.push('is_teacher = ?');
      params.push(req.body.isTeacher ? 1 : 0);
    }
    if ('isPromptagogue' in (req.body ?? {})) {
      sets.push('is_promptagogue = ?');
      params.push(req.body.isPromptagogue ? 1 : 0);
    }
    if (!sets.length && !touche) return res.status(400).json({ error: { code: 'ERR_NOTHING_TO_UPDATE' } });
    if (sets.length) db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE email = ?`).run(...params, email);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: { code: ERR.METHOD } });
}
