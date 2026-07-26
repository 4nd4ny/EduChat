import { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin, requireSuperAdmin } from '../../../server/admin';
import { tarifs, reglerTarif } from '../../../server/facturation';
import { propositions, sonderTarifs, RATIO_ENTREE } from '../../../server/sondeTarifs';
import { BillingCurrency, BillingSurchargePct } from '../../../utils/env';
import { PROVIDER_IDS } from '../../../shared/providers';
import { ERR } from '../../../shared/providers';

// TARIF DE LA CLÉ INTERNE, par fournisseur, pour un million de jetons.
//
// LECTURE ouverte aux deux niveaux : une école doit pouvoir vérifier le prix
// auquel on la facture. ÉCRITURE réservée au site : le tarif vaut pour toutes
// les écoles, une seule d'entre elles ne peut pas le fixer.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    if (!requireAdmin(req)) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
    const courants = tarifs();
    const propose = propositions();
    return res.status(200).json({
      devise: BillingCurrency,
      participationPct: BillingSurchargePct,
      ratioEntree: RATIO_ENTREE,
      tarifs: PROVIDER_IDS.map(provider => ({
        provider,
        prixMtok: courants[provider] ?? 0,
        proposition: propose[provider] ?? null,
      })),
    });
  }

  if (req.method === 'POST') {
    if (!requireSuperAdmin(req)) return res.status(403).json({ error: { code: 'ERR_SUPER_ONLY' } });
    // Relancer la sonde à la main : elle tourne normalement quand la liste des
    // modèles change, mais on veut pouvoir la déclencher sans attendre.
    if (req.body?.action === 'sonder') {
      return res.status(200).json({ ok: true, propositions: await sonderTarifs() });
    }
    const provider = String(req.body?.provider ?? '');
    const prix = Number(req.body?.prixMtok);
    if (!(PROVIDER_IDS as readonly string[]).includes(provider)) {
      return res.status(400).json({ error: { code: 'ERR_PROVIDER_UNKNOWN' } });
    }
    if (!Number.isFinite(prix) || prix < 0) return res.status(400).json({ error: { code: 'ERR_PRICE_INVALID' } });
    reglerTarif(provider, prix);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: { code: ERR.METHOD } });
}
