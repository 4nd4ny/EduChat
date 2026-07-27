import { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin, requireSuperAdmin } from '../../../server/admin';
import { facturesDuMois, emettre, marquerPayee, impayees, bilanParticipation,
  reglerMentions } from '../../../server/facturation';
import { getEtablissementById } from '../../../server/etablissements';
import { ERR } from '../../../shared/providers';

// FACTURES.
//
//   GET  — une école lit LA SIENNE, le site les lit toutes, plus la liste des
//          impayées et le bilan de la participation (ce qu'elle a rapporté
//          face à ce qu'elle a financé).
//   POST — émettre (figer le montant) ou marquer payée : réservé au site.
//          Une école qui pourrait déclarer sa propre facture payée ne serait
//          plus facturée du tout.
//          SEULE EXCEPTION, « mentions » : l'adresse de facturation, la
//          référence interne et la note libre du mois, que l'administrateur de
//          l'école écrit CHEZ LUI. Elles n'entrent dans aucun calcul — c'est ce
//          qui les distingue de tout le reste de cette route.
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
    const action = String(req.body?.action ?? '');

    // ── MENTIONS ADMINISTRATIVES — la seule écriture ouverte à l'école ──
    //
    // Elle passe AVANT la garde « site seulement » parce qu'elle n'est pas du
    // site : l'adresse à laquelle une facture doit parvenir, la référence sous
    // laquelle la dépense a été engagée, ce sont des faits que seule l'école
    // connaît. Elle ne touche AUCUN montant (reglerMentions n'écrit que trois
    // colonnes de texte, dans une table qui n'en contient pas d'autres), et
    // c'est ce qui rend l'ouverture sans danger.
    //
    // La portée reprend la règle de /api/admin/credits : le site partout, une
    // école chez elle et nulle part ailleurs. `portee` vient de requireAdmin,
    // donc de l'école ACTIVE revérifiée en base — jamais d'un identifiant
    // annoncé par le navigateur.
    if (action === 'mentions') {
      const portee = admin.niveau === 'ecole' ? admin.etablissementId : null;
      const cible = Number(req.body?.etablissementId) || portee || 0;
      const sienne = admin.niveau === 'super' || cible === portee;
      // TOUTE validation avant TOUTE écriture — un refus prononcé au milieu
      // laisserait des mentions à moitié posées sur un document qu'on imprime.
      if (!cible) return res.status(400).json({ error: { code: 'ERR_SCHOOL_UNKNOWN' } });
      if (!sienne) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
      // L'école doit EXISTER : une coquille dans l'identifiant écrirait sinon
      // des mentions orphelines, que plus aucun écran ne montrerait jamais —
      // et l'auteur les croirait enregistrées.
      if (!getEtablissementById(cible)) return res.status(404).json({ error: { code: 'ERR_SCHOOL_UNKNOWN' } });
      const periode = String(req.body?.periode ?? '');
      if (!/^\d{4}-\d{2}$/.test(periode)) return res.status(400).json({ error: { code: 'ERR_PERIOD_INVALID' } });
      // Champs nommés un par un : le corps de la requête n'est jamais recopié.
      // Un champ absent reste inchangé, un champ présent est borné côté serveur.
      const patch: { adresse?: string; reference?: string; note?: string } = {};
      if (req.body?.adresse !== undefined) patch.adresse = String(req.body.adresse);
      if (req.body?.reference !== undefined) patch.reference = String(req.body.reference);
      if (req.body?.note !== undefined) patch.note = String(req.body.note);
      return res.status(200).json({ ok: true, mentions: reglerMentions(cible, periode, patch, admin.auth.email) });
    }

    if (!requireSuperAdmin(req)) return res.status(403).json({ error: { code: 'ERR_SUPER_ONLY' } });
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
