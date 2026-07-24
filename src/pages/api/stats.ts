import type { NextApiRequest, NextApiResponse } from 'next';
import { getClientIp } from '../../server/access';
import { getSiteStats, touchPresence } from '../../server/stats';
import { ERR } from '../../shared/providers';

// Compteurs publics de fréquentation, affichés en bas de l'accueil.
// Aucune donnée personnelle : des agrégats, calculés à partir de ce que la
// base contient déjà (comptes vérifiés, tuteurs publiés, journal de tokens)
// plus une présence anonyme et éphémère.
//
// Cet appel est AUSSI le battement de cœur de la présence : toute personne qui
// affiche l'accueil est comptée « en ligne », même si elle ne discute pas —
// c'est bien la fréquentation du site qui est demandée. L'identifiant transmis
// (cid) est l'uuid anonyme du navigateur ; il est haché avant stockage.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }
  try {
    const cid = /^[a-f0-9-]{8,64}$/i.test(String(req.query.cid ?? '')) ? String(req.query.cid) : '';
    touchPresence(cid, getClientIp(req));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(getSiteStats());
  } catch (error) {
    console.error('Statistiques indisponibles :', error);
    return res.status(500).json({ error: { code: 'ERR_STATS' } });
  }
}
