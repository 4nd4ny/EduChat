import type { NextApiRequest, NextApiResponse } from 'next';
import { getClientIp, isRateLimited } from '../../../server/access';
import { requireAuth } from '../../../server/token';
import { isVerifiedAccount } from '../../../server/accountData';
import { etatDuCompte, mouvements, commissionRecharge, titulaireCompte }
  from '../../../server/porteMonnaie';
import { paypalActif, creerRecharge, rembourser, FRAIS_PAYPAL_PCT } from '../../../server/paypal';
import { ERR } from '../../../shared/providers';

// LE PORTE-MONNAIE D'UNE PERSONNE — sa lecture, sa recharge, son remboursement.
//
//   GET  — solde, dépense récente, autonomie estimée, mouvements, et ce que
//          coûterait une recharge (la commission est annoncée AVANT le paiement,
//          jamais découverte après).
//   POST — { montant } ouvre une commande PayPal ; { action: 'rembourser' } rend
//          le crédit restant.
//
// LA ROUTE NE PARLE QUE DU PORTE-MONNAIE DE L'APPELANT. Aucun paramètre ne
// désigne un titulaire : l'adresse vient du jeton, relue en base. C'est la
// différence avec /api/admin/credits, où un super-administrateur agit sur le
// porte-monnaie d'autrui et doit donc le nommer — ici, nommer quelqu'un
// n'aurait aucun usage légitime, et le champ qui le permettrait serait la
// faille.
//
// COMPTE VÉRIFIÉ EXIGÉ, comme /api/me/data : un jeton vit quatre-vingt-dix
// jours et survit à un compte effacé. On ne crédite ni ne rembourse une ligne
// users qui n'existe plus.

/**
 * Bornes d'une recharge PERSONNELLE, et elles ne sont pas celles d'une école.
 * Le plancher tient à la commission minimale (0,50) : en dessous de cinq francs
 * on prélèverait plus d'un dixième, ce qui ne se défend pas. Le plafond est un
 * garde-fou contre la faute de frappe — un particulier qui veut mettre mille
 * francs de jetons recharge deux fois, et nous écrit.
 */
const MONTANT_MIN = 5;
const MONTANT_MAX = 1000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = requireAuth(req);
  if (!auth) return res.status(401).json({ error: { code: 'ERR_AUTH_REQUIRED' } });
  if (!isVerifiedAccount(auth.email)) return res.status(401).json({ error: { code: 'ERR_AUTH_REQUIRED' } });

  if (await isRateLimited(getClientIp(req), 20, 'mecredits')) {
    return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
  }

  // Données personnelles, et de surcroît financières : jamais de cache partagé.
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method === 'GET') {
    const etat = etatDuCompte(auth.email);
    // Ce qu'une recharge de référence laisserait réellement : le taux seul est
    // trompeur tant que le minimum absolu mord (0,50 sur 5 francs, c'est 10 %).
    const exemple = commissionRecharge(titulaireCompte(auth.email), MONTANT_MIN);
    return res.status(200).json({
      ...etat,
      paypalActif: paypalActif(),
      fraisPaypalPct: FRAIS_PAYPAL_PCT,
      montantMin: MONTANT_MIN, montantMax: MONTANT_MAX,
      commissionMin: exemple.commission,
      mouvements: mouvements(titulaireCompte(auth.email), 24),
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  // REMBOURSEMENT du crédit restant, moins les frais d'encaissement. L'argent
  // ne peut repartir que vers le compte PayPal qui l'a versé — c'est PayPal qui
  // le garantit, pas nous, et c'est ce qui rend l'opération sûre même si le
  // compte EduChat a été compromis.
  if (req.body?.action === 'rembourser') {
    if (!paypalActif()) return res.status(503).json({ error: { code: 'ERR_PAYPAL_OFF' } });
    try {
      return res.status(200).json({ ok: true, ...(await rembourser(titulaireCompte(auth.email), auth.email)) });
    } catch (erreur) {
      console.error('Remboursement personnel impossible :', erreur);
      return res.status(502).json({ error: { code: 'ERR_REFUND_FAILED' } });
    }
  }

  // Sans identifiants PayPal, la route ne fait RIEN et le dit — et l'interface
  // n'affiche aucun bouton. Un point de paiement à moitié fonctionnel est pire
  // qu'un point de paiement visiblement absent : à ce jour, PayPal est éteint.
  if (!paypalActif()) return res.status(503).json({ error: { code: 'ERR_PAYPAL_OFF' } });

  const montant = Number(req.body?.montant);
  if (!Number.isFinite(montant) || montant < MONTANT_MIN || montant > MONTANT_MAX) {
    return res.status(400).json({ error: { code: 'ERR_AMOUNT_INVALID' } });
  }

  try {
    // L'intention est écrite côté serveur avant le renvoi vers PayPal : au
    // retour, c'est elle — et non ce que le navigateur renverra — qui dira quel
    // porte-monnaie créditer.
    const { orderId, approbation } = await creerRecharge(
      titulaireCompte(auth.email), montant, auth.email);
    return res.status(200).json({ ok: true, orderId, approbation });
  } catch (erreur) {
    console.error('PayPal — recharge personnelle :', erreur);
    return res.status(502).json({ error: { code: 'ERR_PAYPAL_UPSTREAM' } });
  }
}
