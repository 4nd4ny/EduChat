import { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '../../../server/admin';
import { paypalActif, paypalEnvironnement, creerRecharge } from '../../../server/paypal';
import { titulaireEcole } from '../../../server/porteMonnaie';
import { BillingCurrency } from '../../../utils/env';
import { ERR } from '../../../shared/providers';

// OUVRE UNE RECHARGE D'ÉCOLE. L'administrateur d'une école la déclenche pour
// SON établissement ; le site peut la déclencher pour n'importe lequel.
// La recharge d'un porte-monnaie PERSONNEL a sa propre route (/api/me/credits)
// parce qu'elle a sa propre garde : un compte vérifié, et non un administrateur.
//
// L'intention est écrite côté serveur avant le renvoi vers PayPal : au retour,
// c'est elle qui dira quelle école créditer. Rien de ce que le navigateur
// renverra ensuite ne sera cru sur ce point.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = requireAdmin(req);
  if (!admin) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });

  if (req.method === 'GET') {
    // L'interface demande d'abord si le paiement existe. Non configuré, elle
    // n'affiche pas de bouton — plutôt que d'en afficher un qui échoue.
    return res.status(200).json({
      actif: paypalActif(),
      environnement: paypalActif() ? paypalEnvironnement() : null,
      devise: BillingCurrency,
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }
  // Sans identifiants, la route ne fait RIEN et le dit. Un point de paiement à
  // moitié fonctionnel est pire qu'un point de paiement visiblement absent.
  if (!paypalActif()) return res.status(503).json({ error: { code: 'ERR_PAYPAL_OFF' } });

  const demande = Number(req.body?.etablissementId);
  // Une école ne recharge QUE la sienne. Sans ce test, un administrateur
  // d'école ouvrirait une commande au nom d'une autre.
  const etablissementId = admin.niveau === 'super' ? demande : admin.etablissementId;
  if (!etablissementId || (admin.niveau === 'ecole' && demande && demande !== etablissementId)) {
    return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
  }
  const montant = Number(req.body?.montant);
  if (!Number.isFinite(montant) || montant < 10 || montant > 100_000) {
    return res.status(400).json({ error: { code: 'ERR_AMOUNT_INVALID' } });
  }

  try {
    const { orderId, approbation } = await creerRecharge(
      titulaireEcole(etablissementId), montant, admin.auth.email);
    return res.status(200).json({ ok: true, orderId, approbation });
  } catch (erreur) {
    console.error('PayPal — création de recharge :', erreur);
    return res.status(502).json({ error: { code: 'ERR_PAYPAL_UPSTREAM' } });
  }
}
