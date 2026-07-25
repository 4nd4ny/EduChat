import type { NextApiRequest, NextApiResponse } from 'next';
import { getModels } from '../../server/models';
import { requireAuth } from '../../server/token';
import { readUserKey } from '../../server/userKeys';
import { ERR, isProviderId } from '../../shared/providers';

// Modèles proposés pour un fournisseur (catalogue rafraîchi une fois par
// jour côté serveur).
//
//  - GET  : liste publique — celle que le serveur peut établir seul.
//  - POST : même chose, mais en demandant sa liste au fournisseur AVEC la clé
//    du visiteur. C'est le seul moyen d'obtenir les identifiants exacts d'un
//    éditeur dont le serveur n'a pas de clé. Cette clé transite comme elle le
//    fait déjà pour chaque message (/api/completion) : elle sert à l'appel et
//    disparaît — jamais journalisée, jamais enregistrée ici, et seule la
//    liste de modèles obtenue (qui n'a rien de secret) est mise en cache.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  const provider = req.method === 'POST' ? (req.body?.provider ?? '') : req.query.provider;
  if (!isProviderId(provider)) return res.status(400).json({ error: { code: ERR.PROVIDER } });

  let key = '';
  if (req.method === 'POST') {
    key = String(req.body?.apiKey ?? '').trim().slice(0, 512);
    // Une clé mémorisée ne redescend jamais au navigateur : c'est le serveur
    // qui va la chercher pour le compte de son propriétaire. Le déchiffrement
    // peut échouer (jeton douteux, secret changé depuis) : ce n'est pas une
    // raison pour priver la page de sa liste.
    if (!key) {
      try {
        const account = requireAuth(req);
        if (account) key = readUserKey(account.email, provider) ?? '';
      } catch {
        key = '';
      }
    }
  }

  try {
    const { models, updatedAt } = await getModels(provider, key);
    // Le catalogue ne bouge qu'une fois par jour : le navigateur peut le
    // garder une heure. Jamais de cache partagé pour une réponse obtenue
    // avec la clé de quelqu'un.
    res.setHeader('Cache-Control', key ? 'private, no-store' : 'public, max-age=3600');
    return res.status(200).json({ models, updatedAt });
  } catch (error) {
    console.error('Catalogue de modèles indisponible :', error);
    return res.status(200).json({ models: [], updatedAt: 0 });
  }
}
