import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../../server/db';
import { setAdultVerified } from '../../../server/adult';
import { requireAdmin } from '../../../server/admin';
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
    return res.status(200).json({
      users: db.prepare(`
        SELECT u.email, u.name, u.is_promptagogue AS isPromptagogue, u.is_teacher AS isTeacher,
               u.etablissement_id AS etablissementId, e.name AS etablissementName,
               u.sync_optin AS syncOptin, u.created_at AS createdAt, u.verified_at AS verifiedAt,
               u.adult_verified_at AS adultVerifiedAt, u.adult_verified_by AS adultVerifiedBy,
               (SELECT COUNT(*) FROM prompts p WHERE p.author_email = u.email) AS promptCount
        FROM users u LEFT JOIN etablissements e ON e.id = u.etablissement_id
        ORDER BY u.is_teacher DESC, u.email
      `).all(),
    });
  }

  if (req.method === 'POST') {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: { code: 'ERR_EMAIL_INVALID' } });
    const user = db.prepare('SELECT email FROM users WHERE email = ?').get(email);
    if (!user) return res.status(404).json({ error: { code: 'ERR_USER_UNKNOWN' } });

    // Mise à jour partielle : seuls les champs PRÉSENTS dans la requête bougent.
    const sets: string[] = [];
    const params: any[] = [];
    if ('etablissementId' in (req.body ?? {})) {
      sets.push('etablissement_id = ?');
      params.push(req.body.etablissementId ? Number(req.body.etablissementId) : null);
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
