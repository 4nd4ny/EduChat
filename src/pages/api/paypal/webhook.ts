import { NextApiRequest, NextApiResponse } from 'next';
import { paypalActif, verifierSignature, traiterEvenement } from '../../../server/paypal';

// NOTIFICATIONS PAYPAL.
//
// CORPS BRUT OBLIGATOIRE : la vérification de signature exige que l'événement
// soit renvoyé à PayPal OCTET POUR OCTET. Le parseur de Next le reformaterait,
// et la vérification échouerait pour une virgule d'espacement — d'où
// bodyParser désactivé.
//
// Cette route n'est appelable par personne d'authentifié : c'est PayPal qui
// l'appelle. Sa seule défense est donc la SIGNATURE — et le fait que le
// montant, lui, n'est jamais lu ici mais redemandé à PayPal.
export const config = { api: { bodyParser: false } };

function lireBrut(req: NextApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', morceau => {
      data += morceau;
      // Une notification PayPal pèse quelques kilo-octets. Au-delà, on coupe :
      // un point d'entrée non authentifié ne se laisse pas gaver.
      if (data.length > 256 * 1024) reject(new Error('corps trop volumineux'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end();
  }
  // Paiement non configuré : on ne traite RIEN. C'est le cas de figure d'une
  // notification forgée envoyée « au cas où ».
  if (!paypalActif()) return res.status(503).end();

  let brut: string;
  try {
    brut = await lireBrut(req);
  } catch {
    return res.status(413).end();
  }

  if (!(await verifierSignature(req.headers as any, brut))) {
    console.error('PayPal — signature refusée, notification ignorée.');
    // 400 et non 200 : PayPal réessaiera, et l'échec reste visible côté PayPal.
    return res.status(400).end();
  }

  let evenement: any;
  try { evenement = JSON.parse(brut); } catch { return res.status(400).end(); }

  try {
    const verdict = await traiterEvenement(evenement);
    // 200 dans tous les cas où l'événement a été COMPRIS : un doublon ou un
    // type ignoré ne doit pas déclencher les réessais de PayPal.
    console.log('PayPal —', evenement?.event_type, ':', verdict.raison);
    return res.status(200).json({ ok: true });
  } catch (erreur) {
    console.error('PayPal — traitement impossible :', erreur);
    // 500 : PayPal réessaiera, et l'idempotence protège contre le double effet.
    return res.status(500).end();
  }
}
