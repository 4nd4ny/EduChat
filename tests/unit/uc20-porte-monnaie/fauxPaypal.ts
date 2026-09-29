// UC-20 — Utilitaire propre à ce cas : une doublure de l'API PayPal (bac à
// sable) posée sur le fetch global. Aucun appel réseau réel.
//
// Elle répond aux cinq points d'entrée qu'emploie src/server/paypal.ts :
// jeton OAuth, création de commande, vérification de signature, lecture d'une
// capture, remboursement d'une capture, lecture d'un remboursement.
import { doublerFetch } from '../../helpers/fetch';

export type FauxPaypal = {
  espion: ReturnType<typeof doublerFetch>;
  /** Captures connues de « PayPal » : id → montant, devise, statut. */
  captures: Map<string, { value: string; currency_code: string; status: string }>;
  /** Verdict de la prochaine vérification de signature. */
  signature: 'SUCCESS' | 'FAILURE' | 'HTTP500';
  /** Captures dont le remboursement échoue (HTTP 422). */
  refusRemboursement: Set<string>;
  /** Commandes créées : corps envoyé à PayPal. */
  commandes: any[];
  /** Corps bruts envoyés à la vérification de signature. */
  verifications: string[];
  /** Remboursements demandés : capture → montant. */
  remboursements: Array<{ capture: string; value: string; currency_code: string }>;
  /** Faire échouer la création de commande. */
  panneCommande: boolean;
  /** Remboursements connus de « PayPal » : id → montant, devise, statut, custom_id. */
  remboursementsConnus: Map<string, { value: string; currency_code: string; status: string; custom_id?: string }>;
};

export function installerFauxPaypal(): FauxPaypal {
  let n = 0;
  const f: FauxPaypal = {
    espion: undefined as any,
    captures: new Map(), signature: 'SUCCESS', refusRemboursement: new Set(),
    commandes: [], verifications: [], remboursements: [], panneCommande: false,
    remboursementsConnus: new Map(),
  };
  f.espion = doublerFetch((url, init) => {
    const u = new URL(url);
    const corps = typeof init?.body === 'string' ? init.body : '';
    if (!u.hostname.includes('paypal.com')) return { status: 599, json: { error: 'hors PayPal' } };
    if (u.pathname === '/v1/oauth2/token') return { json: { access_token: 'jeton-bac-a-sable', expires_in: 3600 } };
    if (u.pathname === '/v2/checkout/orders' && init?.method === 'POST') {
      if (f.panneCommande) return { status: 500, json: { name: 'INTERNAL_SERVER_ERROR' } };
      f.commandes.push(JSON.parse(corps));
      const id = `ORDER-${++n}`;
      return { status: 201, json: { id, links: [{ rel: 'self', href: `x/${id}` }, { rel: 'approve', href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` }] } };
    }
    if (u.pathname === '/v1/notifications/verify-webhook-signature') {
      f.verifications.push(corps);
      if (f.signature === 'HTTP500') return { status: 500, json: {} };
      return { json: { verification_status: f.signature } };
    }
    const rembourse = u.pathname.match(/^\/v2\/payments\/captures\/([^/]+)\/refund$/);
    if (rembourse) {
      const id = decodeURIComponent(rembourse[1]);
      if (f.refusRemboursement.has(id)) return { status: 422, json: { name: 'UNPROCESSABLE_ENTITY' } };
      const { amount, custom_id } = JSON.parse(corps);
      f.remboursements.push({ capture: id, ...amount });
      // Premier remboursement d'une capture : REFUND-<capture> (ce que
      // evenementRemboursement annonce) ; les suivants sont numérotés.
      let refund = `REFUND-${id}`;
      for (let k = 2; f.remboursementsConnus.has(refund); k++) refund = `REFUND-${id}-${k}`;
      f.remboursementsConnus.set(refund, { ...amount, status: 'COMPLETED', custom_id });
      return { status: 201, json: { id: refund, status: 'COMPLETED' } };
    }
    const lectureRemboursement = u.pathname.match(/^\/v2\/payments\/refunds\/([^/]+)$/);
    if (lectureRemboursement) {
      const id = decodeURIComponent(lectureRemboursement[1]);
      const r = f.remboursementsConnus.get(id);
      if (!r) return { status: 404, json: { name: 'RESOURCE_NOT_FOUND' } };
      return { json: { id, status: r.status, amount: { value: r.value, currency_code: r.currency_code },
        ...(r.custom_id ? { custom_id: r.custom_id } : {}) } };
    }
    const capture = u.pathname.match(/^\/v2\/payments\/captures\/([^/]+)$/);
    if (capture) {
      const c = f.captures.get(decodeURIComponent(capture[1]));
      if (!c) return { status: 404, json: { name: 'RESOURCE_NOT_FOUND' } };
      return { json: { id: capture[1], status: c.status, amount: { value: c.value, currency_code: c.currency_code } } };
    }
    return { status: 404, json: {} };
  });
  return f;
}

/** L'environnement qui ALLUME PayPal (identifiants de bac à sable fictifs). */
export const ENV_PAYPAL = {
  SECRET_PAYPAL_CLIENT_ID: 'client-bac-a-sable',
  SECRET_PAYPAL_SECRET: 'secret-bac-a-sable',
  SECRET_PAYPAL_WEBHOOK_ID: 'WH-TEST',
  SECRET_PAYPAL_ENV: undefined,
};

/** Une notification « paiement reçu » telle que PayPal l'envoie. */
export function evenementCapture(captureId: string, orderId: string, montantAnnonce = '99999.00') {
  return {
    id: `WH-${captureId}`, event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: captureId, status: 'COMPLETED',
      // Montant FORGÉ à dessein : il ne doit jamais être lu.
      amount: { value: montantAnnonce, currency_code: 'CHF' },
      supplementary_data: { related_ids: { order_id: orderId } },
    },
  };
}

/**
 * Un remboursement fait HORS de la plateforme (tableau de bord PayPal) : connu
 * de « PayPal », sans le repère custom_id que pose `rembourser`.
 */
export function rembourserDepuisPaypal(f: FauxPaypal, captureId: string, value: string, refundId = `REFUND-${captureId}`) {
  f.remboursementsConnus.set(refundId, { value, currency_code: 'CHF', status: 'COMPLETED' });
  return refundId;
}

/** Une notification de remboursement : la ressource est le remboursement, la capture est dans le lien « up ». */
export function evenementRemboursement(captureId: string, type = 'PAYMENT.CAPTURE.REFUNDED', refundId = `REFUND-${captureId}`) {
  return {
    id: `WH-R-${refundId}`, event_type: type,
    resource: {
      id: refundId,
      links: [{ rel: 'up', href: `https://api.sandbox.paypal.com/v2/payments/captures/${captureId}` }],
    },
  };
}
