// RECHARGE PAR PAYPAL — écrit d'abord contre les arnaques, ensuite pour payer.
//
// Ce que finance ce code appartient à une personne, pas à une entreprise :
// une escroquerie réussie ne coûte pas une marge, elle ferme le service. Les
// cinq règles ci-dessous sont donc des règles de survie, pas des bonnes
// pratiques.
//
//   1. LE MONTANT NE VIENT JAMAIS DU WEBHOOK. On y lit un IDENTIFIANT, rien
//      d'autre, puis on redemande la capture à PayPal, authentifié, de serveur
//      à serveur. Une notification forgée qui annonce dix mille francs
//      n'annonce rien du tout : c'est la réponse de PayPal qui fait foi.
//   2. LA DEVISE DOIT CORRESPONDRE. Payer 50 USD ne crédite pas 50 CHF.
//   3. LES REMBOURSEMENTS DÉBITENT EN RETOUR. Recharger, consommer, puis
//      contester le paiement : c'est l'arnaque classique contre exactement ce
//      montage. Ne traiter que « paiement reçu » est la faute qui tue.
//   4. L'IDEMPOTENCE EST UNE CONTRAINTE DE BASE, pas un test. Deux webhooks
//      identiques sont normaux ; c'est UNIQUE qui doit refuser le doublon, pas
//      un « SELECT puis INSERT » que deux requêtes simultanées franchissent.
//   5. L'ÉCOLE CRÉDITÉE VIENT D'UNE INTENTION CRÉÉE PAR NOUS, retrouvée par
//      l'identifiant de commande — jamais d'un champ que le client nous
//      renvoie.
//
// Sans identifiants PayPal, TOUT EST ÉTEINT : les routes répondent 503 et
// l'interface ne propose rien. Un point de paiement à moitié fonctionnel est
// pire qu'un point de paiement visiblement absent.

import { getDb } from './db';
import { BillingCurrency } from '../utils/env';
import { bouger, commissionRecharge } from './porteMonnaie';

const ID = (process.env.SECRET_PAYPAL_CLIENT_ID || '').trim();
const SECRET = (process.env.SECRET_PAYPAL_SECRET || '').trim();
export const PAYPAL_WEBHOOK_ID = (process.env.SECRET_PAYPAL_WEBHOOK_ID || '').trim();
/** « live » bascule sur l'API de production ; tout le reste reste en bac à sable. */
const BASE = (process.env.SECRET_PAYPAL_ENV || '').trim() === 'live'
  ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

/** Le paiement est-il configuré ? Sinon, rien ne s'affiche et rien ne répond. */
export function paypalActif(): boolean {
  return !!ID && !!SECRET && !!PAYPAL_WEBHOOK_ID;
}

export function paypalEnvironnement(): 'live' | 'sandbox' {
  return BASE.includes('sandbox') ? 'sandbox' : 'live';
}

let jeton: { valeur: string; expire: number } | null = null;

async function accessToken(): Promise<string> {
  if (jeton && jeton.expire > Date.now() + 30_000) return jeton.valeur;
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${ID}:${SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`PayPal oauth HTTP ${r.status}`);
  const d = await r.json();
  jeton = { valeur: d.access_token, expire: Date.now() + (d.expires_in ?? 300) * 1000 };
  return jeton.valeur;
}

async function appel(chemin: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(`${BASE}${chemin}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(25_000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`PayPal ${chemin} HTTP ${r.status} ${JSON.stringify(d).slice(0, 200)}`);
  return d;
}

// ------------------------------------------------------- créer une intention

/**
 * Crée une commande PayPal ET l'intention qui lui correspond chez nous.
 *
 * L'intention est écrite AVANT de renvoyer quoi que ce soit au navigateur :
 * c'est elle qui dira, au retour, quelle école créditer. Le client ne nous
 * réapprendra rien à ce moment-là.
 */
export async function creerRecharge(etablissementId: number, montant: number, par: string):
  Promise<{ orderId: string; approbation: string }> {
  const somme = Math.floor(montant * 100) / 100;
  if (!(somme > 0) || somme > 100_000) throw new Error('Montant hors limites.');

  const order = await appel('/v2/checkout/orders', {
    method: 'POST',
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: BillingCurrency, value: somme.toFixed(2) },
        description: `EduChat — recharge du porte-monnaie`,
        // Repère de confort pour la lecture des relevés PayPal. JAMAIS la
        // source de vérité : c'est notre table d'intentions qui décide.
        custom_id: `etab:${etablissementId}`,
      }],
    }),
  });

  getDb().prepare(`
    INSERT INTO recharges (order_id, etablissement_id, montant, devise, etat, cree_at, par)
    VALUES (?, ?, ?, ?, 'attente', ?, ?)
  `).run(order.id, etablissementId, somme, BillingCurrency, Date.now(), par);

  const lien = (order.links ?? []).find((l: any) => l.rel === 'approve' || l.rel === 'payer-action');
  return { orderId: order.id, approbation: lien?.href ?? '' };
}

// ------------------------------------------------- vérifier une notification

/**
 * Signature de la notification, vérifiée par PayPal lui-même.
 *
 * Le corps doit lui être RENVOYÉ TEL QUEL, octet pour octet — d'où la lecture
 * brute côté route. Reparser puis re-sérialiser suffit à faire échouer la
 * vérification, et pour de bonnes raisons.
 */
export async function verifierSignature(entetes: Record<string, string | string[] | undefined>, brut: string):
  Promise<boolean> {
  const h = (nom: string) => String(entetes[nom] ?? '');
  try {
    const d = await appel('/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      body: `{"transmission_id":${JSON.stringify(h('paypal-transmission-id'))},`
        + `"transmission_time":${JSON.stringify(h('paypal-transmission-time'))},`
        + `"cert_url":${JSON.stringify(h('paypal-cert-url'))},`
        + `"auth_algo":${JSON.stringify(h('paypal-auth-algo'))},`
        + `"transmission_sig":${JSON.stringify(h('paypal-transmission-sig'))},`
        + `"webhook_id":${JSON.stringify(PAYPAL_WEBHOOK_ID)},`
        + `"webhook_event":${brut}}`,
    });
    return d?.verification_status === 'SUCCESS';
  } catch (erreur) {
    console.error('PayPal — vérification de signature impossible :', erreur);
    return false;
  }
}

/** La capture, redemandée à PayPal. C'est ELLE qui dit le montant. */
async function relireCapture(captureId: string): Promise<{ montant: number; devise: string; statut: string }> {
  const d = await appel(`/v2/payments/captures/${encodeURIComponent(captureId)}`);
  return {
    montant: parseFloat(d?.amount?.value ?? '0'),
    devise: String(d?.amount?.currency_code ?? ''),
    statut: String(d?.status ?? ''),
  };
}

// ------------------------------------------------------------ créditer

export type Verdict = { creditee: boolean; raison: string; montant?: number };

/**
 * Traite une notification déjà vérifiée. Ne fait JAMAIS confiance à son corps
 * pour un montant : il n'y lit que des identifiants.
 */
export async function traiterEvenement(evenement: any): Promise<Verdict> {
  const type = String(evenement?.event_type ?? '');
  const ressource = evenement?.resource ?? {};
  const captureId = String(ressource?.id ?? '');
  if (!captureId) return { creditee: false, raison: 'Notification sans identifiant.' };

  const db = getDb();

  // --- Paiement reçu -------------------------------------------------------
  if (type === 'PAYMENT.CAPTURE.COMPLETED') {
    // Quelle école ? L'intention que NOUS avons créée, retrouvée par la
    // commande dont cette capture dépend.
    const orderId = String(ressource?.supplementary_data?.related_ids?.order_id ?? '');
    const intention = db.prepare(
      'SELECT etablissement_id, montant, etat FROM recharges WHERE order_id = ?')
      .get(orderId) as { etablissement_id: number; montant: number; etat: string } | undefined;
    if (!intention) return { creditee: false, raison: `Aucune intention pour la commande ${orderId}.` };

    // Le montant vient de PayPal, pas de la notification.
    const capture = await relireCapture(captureId);
    if (capture.statut !== 'COMPLETED') {
      return { creditee: false, raison: `Capture non aboutie (${capture.statut}).` };
    }
    if (capture.devise.toUpperCase() !== BillingCurrency.toUpperCase()) {
      return { creditee: false, raison: `Devise ${capture.devise} ≠ ${BillingCurrency} : rien n'est crédité.` };
    }

    // UNE SEULE ÉCRITURE, et c'est la contrainte UNIQUE sur paypal_id qui
    // refuse le doublon. Deux notifications simultanées — cas normal, pas
    // exceptionnel — n'en font passer qu'une.
    let solde: number;
    try {
      solde = bouger(intention.etablissement_id, 'recharge', capture.montant,
        `PayPal ${captureId}`, 'paypal', captureId);
      // La contribution se prélève sur le versement, au taux choisi par
      // l'école — jamais sur les jetons, qui passent à prix coûtant.
      const { commission, pct } = commissionRecharge(intention.etablissement_id, capture.montant);
      solde = bouger(intention.etablissement_id, 'ajustement', -commission,
        `Contribution aux frais (${pct} %) — ${captureId}`, 'paypal');
    } catch {
      return { creditee: false, raison: 'Déjà créditée (idempotence).' };
    }
    db.prepare("UPDATE recharges SET etat = 'creditee', capture_id = ?, credite_at = ? WHERE order_id = ?")
      .run(captureId, Date.now(), orderId);
    return { creditee: true, raison: `Solde ${solde.toFixed(2)} ${BillingCurrency}.`, montant: capture.montant };
  }

  // --- Remboursement, annulation, litige -----------------------------------
  // C'est l'arnaque classique : recharger, consommer, puis contester. Le solde
  // repart en arrière et peut passer sous zéro — l'école se bloque, ce qui est
  // exactement le comportement voulu.
  if (type === 'PAYMENT.CAPTURE.REFUNDED' || type === 'PAYMENT.CAPTURE.REVERSED'
    || type === 'PAYMENT.CAPTURE.DENIED' || type === 'PAYMENT.CAPTURE.DECLINED'
    || type === 'CUSTOMER.DISPUTE.CREATED') {
    // Pour un remboursement, la ressource porte l'id du REMBOURSEMENT ; la
    // capture d'origine se retrouve dans ses liens.
    const origine = String(
      ressource?.links?.find?.((l: any) => l.rel === 'up')?.href?.split('/').pop()
      ?? ressource?.disputed_transactions?.[0]?.seller_transaction_id
      ?? captureId);
    const recharge = db.prepare(
      'SELECT etablissement_id, montant FROM recharges WHERE capture_id = ?')
      .get(origine) as { etablissement_id: number; montant: number } | undefined;
    if (!recharge) return { creditee: false, raison: `Aucune recharge connue pour ${origine}.` };
    let solde: number;
    try {
      solde = bouger(recharge.etablissement_id, 'ajustement', -recharge.montant,
        `PayPal ${type} ${origine}`, 'paypal', `annul:${origine}`);
    } catch {
      return { creditee: false, raison: 'Reprise déjà enregistrée.' };
    }
    db.prepare("UPDATE recharges SET etat = 'reprise' WHERE capture_id = ?").run(origine);
    return { creditee: false, raison: `Repris. Solde ${solde.toFixed(2)} ${BillingCurrency}.` };
  }

  return { creditee: false, raison: `Événement ignoré (${type}).` };
}

// ------------------------------------------------------------ rembourser

/** Frais PayPal, non récupérables : ils ont été prélevés à l'encaissement. */
export const FRAIS_PAYPAL_PCT = 3.5;

/**
 * Rembourse le crédit restant d'une école, moins les frais PayPal.
 *
 * DEUX PROPRIÉTÉS DE SÛRETÉ, et elles ne sont pas décoratives. D'abord un
 * remboursement PayPal repart TOUJOURS vers le payeur d'origine : même un
 * compte d'école compromis ne peut pas détourner l'argent ailleurs. Ensuite le
 * porte-monnaie est vidé AVANT le premier appel à PayPal — si le
 * remboursement échoue à mi-parcours, l'école a perdu du crédit qu'on lui doit
 * encore, ce qui se répare ; l'ordre inverse aurait laissé un solde
 * consommable après un virement déjà parti, ce qui ne se répare pas.
 *
 * Les 3.5 % restent acquis : ce sont les frais que PayPal a prélevés à
 * l'encaissement et qu'il ne rend pas.
 */
export async function rembourser(etablissementId: number, par: string):
  Promise<{ rembourse: number; devise: string; detail: string }> {
  const db = getDb();
  const solde = (db.prepare('SELECT solde FROM etablissements WHERE id = ?')
    .get(etablissementId) as { solde: number } | undefined)?.solde ?? 0;
  if (solde <= 0) throw new Error('Aucun crédit à rembourser.');

  const aRendre = Math.floor(solde * (1 - FRAIS_PAYPAL_PCT / 100) * 100) / 100;
  if (aRendre <= 0) throw new Error('Montant trop faible après frais.');

  // Le solde part d'abord. Voir plus haut : c'est le sens qui se répare.
  bouger(etablissementId, 'ajustement', -solde,
    `Remboursement demandé — ${aRendre.toFixed(2)} rendus, ${(solde - aRendre).toFixed(2)} de frais PayPal`, par);

  // On rembourse capture par capture, de la plus récente à la plus ancienne :
  // PayPal ne sait rembourser qu'une capture, pas « un solde ».
  const captures = db.prepare(`
    SELECT capture_id AS id, montant FROM recharges
    WHERE etablissement_id = ? AND etat = 'creditee' AND capture_id IS NOT NULL
    ORDER BY credite_at DESC
  `).all(etablissementId) as { id: string; montant: number }[];

  let reste = aRendre;
  const faits: string[] = [];
  for (const c of captures) {
    if (reste <= 0) break;
    const part = Math.min(reste, c.montant);
    try {
      await appel(`/v2/payments/captures/${encodeURIComponent(c.id)}/refund`, {
        method: 'POST',
        body: JSON.stringify({ amount: { value: part.toFixed(2), currency_code: BillingCurrency } }),
      });
      reste = Math.round((reste - part) * 100) / 100;
      faits.push(`${c.id}:${part.toFixed(2)}`);
    } catch (erreur) {
      console.error('PayPal — remboursement partiel impossible :', c.id, erreur);
    }
  }

  // Ce qui n'a pas pu être rendu revient au porte-monnaie : on ne garde pas
  // l'argent d'une école au motif que PayPal a refusé.
  if (reste > 0) {
    bouger(etablissementId, 'ajustement', reste,
      `Remboursement partiel : ${reste.toFixed(2)} n'ont pas pu être rendus par PayPal`, par);
  }
  return {
    rembourse: Math.round((aRendre - reste) * 100) / 100,
    devise: BillingCurrency,
    detail: faits.join(' · ') || 'aucune capture remboursable',
  };
}
