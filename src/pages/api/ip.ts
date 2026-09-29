import { NextApiRequest, NextApiResponse } from 'next';
import { getClientIp, ipDejaRevendiquee, isKnownIp } from '../../server/access';
import { getDb } from '../../server/db';

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
  //
  // LA MÊME RÈGLE QUE L'INSCRIPTION (ipDejaRevendiquee, forme canonique des deux
  // côtés), et non plus la comparaison exacte de resolveEtablissementByIp. La
  // question posée n'est pas « cette chaîne reconnaît-elle une école ? » mais
  // « l'inscription gardera-t-elle cette adresse ? » : une graphie différente
  // d'une adresse prise (« ::ffff:198.51.100.7 ») s'annonçait libre, puis
  // l'école naissait sans adresse, sans l'avertissement promis.
  const lignes = ip === 'unknown'
    ? []
    : getDb().prepare('SELECT ips FROM etablissements').all() as { ips: string }[];
  res.status(200).json({
    ip,
    isIpAllowed: isKnownIp(ip),
    revendiquee: ipDejaRevendiquee(ip, lignes.map(row => row.ips)),
  });
}
