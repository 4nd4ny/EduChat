import { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin, requireSuperAdmin } from '../../../server/admin';
import { facturesDuMois, emettre, marquerPayee, impayees, bilanParticipation } from '../../../server/facturation';
import { ERR } from '../../../shared/providers';

// FACTURES.
//
//   GET  — une école lit LA SIENNE, le site les lit toutes, plus la liste des
//          impayées et le bilan de la participation (ce qu'elle a rapporté
//          face à ce qu'elle a financé).
//   POST — émettre (figer le montant) ou marquer payée : réservé au site.
//          Une école qui pourrait déclarer sa propre facture payée ne serait
//          plus facturée du tout.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = requireAdmin(req);
  if (!admin) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });

  if (req.method === 'GET') {
    const now = new Date();
    const year = Number(req.query.year) || now.getUTCFullYear();
    const month = Number(req.query.month) || now.getUTCMonth() + 1;
    const portee = admin.niveau === 'ecole' ? admin.etablissementId : null;
    return res.status(200).json({
      year, month,
      factures: facturesDuMois(year, month, portee),
      // Le site seul voit les impayées de tout le monde et le bilan de la
      // participation : ce sont des chiffres de plateforme, pas d'école.
      ...(admin.niveau === 'super'
        ? { impayees: impayees(), participation: bilanParticipation(year, month) }
        : {}),
    });
  }

  if (req.method === 'POST') {
    if (!requireSuperAdmin(req)) return res.status(403).json({ error: { code: 'ERR_SUPER_ONLY' } });
    const action = String(req.body?.action ?? '');
    const etablissementId = Number(req.body?.etablissementId);
    if (!etablissementId) return res.status(400).json({ error: { code: 'ERR_SCHOOL_UNKNOWN' } });

    if (action === 'emettre') {
      const now = new Date();
      const year = Number(req.body?.year) || now.getUTCFullYear();
      const month = Number(req.body?.month) || now.getUTCMonth() + 1;
      const facture = emettre(etablissementId, year, month);
      // null = école RESPIRE : elle ne paie rien, participation comprise.
      if (!facture) return res.status(409).json({ error: { code: 'ERR_NOTHING_TO_INVOICE' } });
      return res.status(200).json({ ok: true, facture });
    }

    if (action === 'payee' || action === 'impayee') {
      const periode = String(req.body?.periode ?? '');
      if (!/^\d{4}-\d{2}$/.test(periode)) return res.status(400).json({ error: { code: 'ERR_PERIOD_INVALID' } });
      if (!marquerPayee(etablissementId, periode, action === 'payee')) {
        return res.status(404).json({ error: { code: 'ERR_INVOICE_UNKNOWN' } });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: { code: 'ERR_ACTION_UNKNOWN' } });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: { code: ERR.METHOD } });
}
