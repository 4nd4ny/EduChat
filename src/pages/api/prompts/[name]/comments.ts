import { NextApiRequest, NextApiResponse } from 'next';
import { CommentRow, getDb } from '../../../../server/db';
import { getByName, estVisible, porteeAppelant } from '../../../../server/prompts';
import { requireAuth, isAdminEmail } from '../../../../server/token';
import { requireGestionTuteurs, tuteurDeLEcole } from '../../../../server/admin';
import { getClientIp, isRateLimited } from '../../../../server/access';
import { notifyAdmin } from '../../../../server/mail';
import { ERR } from '../../../../shared/providers';

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };

const MAX_COMMENT_CHARS = 2000;

// Commentaires ANONYMES sur la fiche d'un tuteur.
//
//  - N'importe qui peut en déposer un (aucun compte, aucune identité stockée,
//    pas même l'IP) : il naît « pending », invisible du public.
//  - Le PROMPTAGOGUE auteur du tuteur les voit et les modère (approuver /
//    masquer) ; l'ADMINISTRATION voit et modère tout — c'est elle qui couvre
//    les tuteurs proposés anonymement (sans auteur).
//  - L'ÉCOLE PROPRIÉTAIRE du tuteur modère aussi les siens, par ses enseignants
//    comme par son administration (décision du client). C'est ce qui donne un
//    modérateur AUTRE que le site aux propositions anonymes déposées depuis le
//    réseau d'un établissement — désormais rattachées à cette école-là (voir
//    src/pages/api/prompts/index.ts). Jamais les tuteurs de la PLATEFORME :
//    ceux-là ne relèvent d'aucune école.
//  - Un commentaire n'est JAMAIS supprimé : « hidden » le masque, c'est tout.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const name = String(req.query.name ?? '');
  const row = getByName(name);
  if (!row) return res.status(404).json({ error: { code: 'ERR_PROMPT_UNKNOWN' } });

  const db = getDb();
  const auth = requireAuth(req);
  const isAdmin = !!auth && isAdminEmail(auth.email);
  const isAuthor = !!auth && !!row.author_email && auth.email === row.author_email;
  // L'école du tuteur, résolue comme partout ailleurs : école ACTIVE du
  // signataire revérifiée en base, puis rang (administrateur ou enseignant) sur
  // CETTE école, puis propriété du tuteur — le NULL de la plateforme ne
  // correspondant à aucune école (tuteurDeLEcole).
  const gestion = requireGestionTuteurs(req);
  const moderator = isAdmin || isAuthor || (!!gestion && tuteurDeLEcole(gestion, row.etablissement_id));

  // Pour le PUBLIC, seuls existent les tuteurs qu'il a le droit de VOIR :
  // ni brouillon, ni dépublié, ni archivé — et pas davantage le tuteur réservé
  // à une autre école, sans quoi cette route dirait par un 200 ce que la fiche
  // cache par un 404. Les modérateurs gardent l'accès quel que soit l'état.
  if (!moderator && !estVisible(row, porteeAppelant(req, getClientIp(req)))) {
    return res.status(404).json({ error: { code: 'ERR_PROMPT_UNKNOWN' } });
  }

  // ---- GET : approuvés pour tous ; tout (avec statuts) pour les modérateurs.
  if (req.method === 'GET') {
    const rows = (moderator
      ? db.prepare('SELECT * FROM comments WHERE prompt_id = ? ORDER BY created_at DESC').all(row.id)
      : db.prepare("SELECT * FROM comments WHERE prompt_id = ? AND status = 'approved' ORDER BY created_at DESC").all(row.id)
    ) as CommentRow[];
    return res.status(200).json({
      moderator,
      comments: rows.map(c => ({
        id: c.id, body: c.body, createdAt: c.created_at,
        ...(moderator ? { status: c.status } : {}),
      })),
    });
  }

  // ---- POST : dépôt anonyme (rate-limité par IP, IP jamais stockée).
  if (req.method === 'POST') {
    const ip = getClientIp(req);
    if (await isRateLimited(ip, 5, 'comment')) {
      return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
    }
    if (row.status !== 'published' || row.archived) return res.status(409).json({ error: { code: 'ERR_STATUS' } });
    const body = String(req.body?.body ?? '').trim();
    if (body.length < 3 || body.length > MAX_COMMENT_CHARS) {
      return res.status(400).json({ error: { code: 'ERR_COMMENT_INVALID' } });
    }
    const info = db.prepare('INSERT INTO comments (prompt_id, body, status, created_at) VALUES (?, ?, ?, ?)')
      .run(row.id, body, 'pending', Date.now());
    // Notification ANTI-RAFALE : au plus un email par fiche et par heure
    // (déduplication admin_alerts) — une salve de commentaires ne peut pas
    // inonder la boîte de l'administration ; le détail attend dans /admin.
    const hourKey = `comment:${row.id}:${new Date().toISOString().slice(0, 13)}`;
    const first = db.prepare('INSERT OR IGNORE INTO admin_alerts (key, ts) VALUES (?, ?)')
      .run(hourKey, Date.now());
    if (first.changes > 0) {
      notifyAdmin(
        `Nouveau commentaire sur « ${row.name} »`,
        `Un commentaire anonyme attend la modération sur la fiche « ${row.name} »` +
        `${row.author_email ? ` (auteur : ${row.author_name} <${row.author_email}>)` : ' (tuteur ANONYME — modération par vos soins)'}.\n\n` +
        `« ${body.slice(0, 500)}${body.length > 500 ? '…' : ''} »\n\n` +
        `(Au plus un email par fiche et par heure — les suivants attendent dans /admin.)`,
      );
    }
    return res.status(201).json({ ok: true, id: Number(info.lastInsertRowid), status: 'pending' });
  }

  // ---- PATCH : modération (auteur du tuteur ou admin) — approuver / masquer.
  if (req.method === 'PATCH') {
    if (!moderator) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
    const id = Number(req.body?.id) || 0;
    const action = String(req.body?.action ?? '');
    if (action !== 'approve' && action !== 'hide') {
      return res.status(400).json({ error: { code: 'ERR_ACTION_UNKNOWN' } });
    }
    const status = action === 'approve' ? 'approved' : 'hidden';
    const info = db.prepare('UPDATE comments SET status = ?, moderated_at = ?, moderated_by = ? WHERE id = ? AND prompt_id = ?')
      .run(status, Date.now(), auth!.email, id, row.id);
    if (info.changes === 0) return res.status(404).json({ error: { code: 'ERR_COMMENT_UNKNOWN' } });
    return res.status(200).json({ ok: true, status });
  }

  res.setHeader('Allow', ['GET', 'POST', 'PATCH']);
  return res.status(405).json({ error: { code: ERR.METHOD } });
}
