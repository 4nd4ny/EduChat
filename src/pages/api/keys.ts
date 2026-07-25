import type { NextApiRequest, NextApiResponse } from 'next';
import { getClientIp, isRateLimited } from '../../server/access';
import { requireAuth } from '../../server/token';
import { canSealSecrets } from '../../server/secretbox';
import { forgetUserKey, keysOptin, listUserKeyProviders, setKeysOptin, storeUserKey } from '../../server/userKeys';
import { ERR, isProviderId } from '../../shared/providers';

// Clés API mémorisées, à la demande du titulaire du compte.
//
//  GET    → { optin, providers: [...] }  (jamais les clés elles-mêmes)
//  PUT    → { optin?, provider?, apiKey? } : consentement et/ou mémorisation
//  DELETE → ?provider=x (une) ou rien (toutes)
//
// Aucune clé ne redescend vers le navigateur : le client sait seulement
// pour quels fournisseurs une clé est enregistrée.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = requireAuth(req);
  if (!auth) return res.status(401).json({ error: { code: 'ERR_AUTH_REQUIRED' } });

  const ip = getClientIp(req);
  if (await isRateLimited(ip, 20, 'keys')) {
    return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      optin: keysOptin(auth.email),
      providers: listUserKeyProviders(auth.email),
      available: canSealSecrets(),
    });
  }

  if (req.method === 'PUT') {
    const wantsOptin = typeof req.body?.optin === 'boolean' ? req.body.optin : undefined;
    const provider = req.body?.provider;
    const apiKey = String(req.body?.apiKey ?? '').trim();
    const wantsStore = provider !== undefined || !!apiKey;

    // TOUT valider avant d'écrire quoi que ce soit : une requête refusée ne
    // doit pas laisser un consentement enregistré derrière elle.
    // Le RETRAIT du consentement, lui, reste toujours possible — même sans
    // clé de chiffrement configurée : il faut pouvoir effacer.
    if ((wantsOptin === true || wantsStore) && !canSealSecrets()) {
      return res.status(503).json({ error: { code: 'ERR_KEYS_UNAVAILABLE' } });
    }
    if (wantsStore) {
      if (!isProviderId(provider)) return res.status(400).json({ error: { code: ERR.PROVIDER } });
      if (!apiKey || apiKey.length > 512) return res.status(400).json({ error: { code: 'ERR_KEY_INVALID' } });
      // Le consentement doit être acquis — soit déjà donné, soit dans CETTE requête.
      if (wantsOptin !== true && !keysOptin(auth.email)) {
        return res.status(403).json({ error: { code: 'ERR_KEYS_OPTOUT' } });
      }
    }

    if (wantsOptin !== undefined) setKeysOptin(auth.email, wantsOptin);
    if (wantsStore) storeUserKey(auth.email, provider, apiKey);
    return res.status(200).json({
      ok: true, optin: keysOptin(auth.email), providers: listUserKeyProviders(auth.email),
    });
  }

  if (req.method === 'DELETE') {
    const provider = req.query.provider;
    if (provider !== undefined && !isProviderId(provider)) {
      return res.status(400).json({ error: { code: ERR.PROVIDER } });
    }
    forgetUserKey(auth.email, isProviderId(provider) ? provider : undefined);
    return res.status(200).json({ ok: true, providers: listUserKeyProviders(auth.email) });
  }

  res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
  return res.status(405).json({ error: { code: ERR.METHOD } });
}
