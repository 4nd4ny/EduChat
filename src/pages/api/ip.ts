import { NextApiRequest, NextApiResponse } from 'next';
import { getClientIp, isKnownIp } from '../../server/access';
import { resolveEtablissementByIp } from '../../server/etablissements';

// L'IP renvoyée est celle du contrôle de cohérence (X-Real-IP posé par le
// proxy, jamais X-Forwarded-For fourni par le client) : ce que voit cette
// route est exactement ce que voient l'accès établissement et la facturation.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const ip = getClientIp(req);
  // « revendiquee » : cette adresse appartient-elle DÉJÀ à un établissement
  // enregistré ? Le formulaire d'inscription en a besoin pour prévenir, avant
  // la validation, que l'école sera créée sans adresse de reconnaissance
  // (l'unicité des IP entre écoles interdit de la reprendre).
  //
  // UN BOOLÉEN, PAS LE NOM DE L'ÉCOLE : ce que la page a le droit de nommer,
  // elle le tient déjà de /api/etablissement/accueil, qui répond à une autre
  // question. Ici, un oui ou un non suffit et ne dit rien de plus.
  res.status(200).json({
    ip,
    isIpAllowed: isKnownIp(ip),
    revendiquee: !!resolveEtablissementByIp(ip),
  });
}
