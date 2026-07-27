import { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin, requireSuperAdmin } from '../../../server/admin';
import { etatDesComptes, mouvements, bouger, reglerContribution, commissionRecharge,
  titulaireEcole, CONTRIBUTION_MIN, CONTRIBUTION_MAX, detailCommission }
  from '../../../server/porteMonnaie';
import { BillingCurrency } from '../../../utils/env';
import { paypalActif, rembourser, FRAIS_PAYPAL_PCT } from '../../../server/paypal';
import { ERR } from '../../../shared/providers';

// PORTE-MONNAIE DES ÉTABLISSEMENTS.
//
//   GET  — une école lit LE SIEN (solde, autonomie estimée, mouvements) ; le
//          site les lit tous, et voit d'un coup d'œil celles qui sont à sec.
//   POST — recharger ou ajuster : réservé au site. Une école qui pourrait se
//          créditer elle-même n'aurait plus de porte-monnaie du tout.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = requireAdmin(req);
  if (!admin) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
  const portee = admin.niveau === 'ecole' ? admin.etablissementId : null;

  if (req.method === 'GET') {
    const comptes = etatDesComptes(portee);
    return res.status(200).json({
      comptes,
      contributionMin: CONTRIBUTION_MIN, contributionMax: CONTRIBUTION_MAX,
      fraisPaypalPct: FRAIS_PAYPAL_PCT,
      paypalActif: paypalActif(),
      // L'historique n'a de sens que pour UNE école : celle qu'on regarde.
      mouvements: portee ? mouvements(titulaireEcole(portee)) : [],
    });
  }

  if (req.method === 'POST') {
    const cible = Number(req.body?.etablissementId) || portee || 0;
    // Une école règle SON taux et demande SON remboursement. Les deux touchent
    // à son propre argent, jamais à celui d'une autre — le site, lui, peut
    // agir partout.
    const sienne = admin.niveau === 'super' || cible === portee;

    // TAUX DE CONTRIBUTION, borné entre 3.5 et 10 %. C'est l'école qui choisit
    // ce qu'elle donne : à 3.5 % elle ne couvre que les frais PayPal, et la
    // plateforme paie le serveur de sa poche. L'interface le dit en clair.
    if (req.body?.action === 'contribution') {
      if (!cible || !sienne) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
      const pct = Number(req.body?.pct);
      if (!Number.isFinite(pct)) return res.status(400).json({ error: { code: 'ERR_AMOUNT_INVALID' } });
      return res.status(200).json({ ok: true, pct: reglerContribution(cible, pct) });
    }

    // REMBOURSEMENT du crédit restant, moins les frais PayPal non récupérables.
    // L'argent ne peut repartir que vers le payeur d'origine : c'est PayPal qui
    // le garantit, pas nous.
    if (req.body?.action === 'rembourser') {
      if (!cible || !sienne) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
      if (!paypalActif()) return res.status(503).json({ error: { code: 'ERR_PAYPAL_OFF' } });
      try {
        return res.status(200).json({ ok: true, ...(await rembourser(titulaireEcole(cible), admin.auth.email)) });
      } catch (erreur) {
        console.error('Remboursement impossible :', erreur);
        return res.status(502).json({ error: { code: 'ERR_REFUND_FAILED' } });
      }
    }

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
    if (genre === 'ajustement') {
      const solde = bouger(titulaireEcole(etablissementId), 'ajustement', montant,
        String(req.body?.detail ?? '').slice(0, 200), scope.auth.email);
      return res.status(200).json({ ok: true, solde });
    }
    // RECHARGE : la contribution se prélève ICI, une fois, et non sur chaque
    // jeton. Deux mouvements distincts pour qu'on lise ce qui est entré et ce
    // qui a été retenu — un solde net sans sa ligne de commission serait un
    // chiffre qu'on ne peut pas recalculer.
    const retenue = commissionRecharge(titulaireEcole(etablissementId), Math.abs(montant));
    const { commission, credite, pct } = retenue;
    bouger(titulaireEcole(etablissementId), 'recharge', Math.abs(montant),
      String(req.body?.detail ?? '').slice(0, 200) || 'versement', scope.auth.email);
    // Le libellé nomme ce qui a joué : sur un versement de 10 francs à 3,5 %,
    // c'est le forfait (0.50, soit 5 %) et non le taux. Écrire le taux ici
    // laisserait au registre de l'école un chiffre que son solde dément.
    const solde = bouger(titulaireEcole(etablissementId), 'ajustement', -commission,
      detailCommission(retenue, BillingCurrency), scope.auth.email);
    return res.status(200).json({ ok: true, solde, commission, credite, pct });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: { code: ERR.METHOD } });
}
