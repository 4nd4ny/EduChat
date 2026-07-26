import { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin, requireSuperAdmin } from '../../../server/admin';
import { etatDesComptes, mouvements, bouger } from '../../../server/porteMonnaie';
import { ERR } from '../../../shared/providers';

// PORTE-MONNAIE DES ÉTABLISSEMENTS.
//
//   GET  — une école lit LE SIEN (solde, autonomie estimée, mouvements) ; le
//          site les lit tous, et voit d'un coup d'œil celles qui sont à sec.
//   POST — recharger ou ajuster : réservé au site. Une école qui pourrait se
//          créditer elle-même n'aurait plus de porte-monnaie du tout.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = requireAdmin(req);
  if (!admin) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
  const portee = admin.niveau === 'ecole' ? admin.etablissementId : null;

  if (req.method === 'GET') {
    const comptes = etatDesComptes(portee);
    return res.status(200).json({
      comptes,
      // L'historique n'a de sens que pour UNE école : celle qu'on regarde.
      mouvements: portee ? mouvements(portee) : [],
    });
  }

  if (req.method === 'POST') {
    const scope = requireSuperAdmin(req);
    if (!scope) return res.status(403).json({ error: { code: 'ERR_SUPER_ONLY' } });
    const etablissementId = Number(req.body?.etablissementId);
    const montant = Number(req.body?.montant);
    const genre = req.body?.genre === 'ajustement' ? 'ajustement' : 'recharge';
    if (!etablissementId) return res.status(400).json({ error: { code: 'ERR_SCHOOL_UNKNOWN' } });
    if (!Number.isFinite(montant) || montant === 0) {
      return res.status(400).json({ error: { code: 'ERR_AMOUNT_INVALID' } });
    }
    // Une recharge est toujours positive ; un ajustement peut corriger dans les
    // deux sens (une erreur de saisie, un geste commercial).
    const signe = genre === 'recharge' ? Math.abs(montant) : montant;
    const solde = bouger(etablissementId, genre, signe,
      String(req.body?.detail ?? '').slice(0, 200), scope.auth.email);
    return res.status(200).json({ ok: true, solde });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: { code: ERR.METHOD } });
}
