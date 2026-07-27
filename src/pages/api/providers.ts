import type { NextApiRequest, NextApiResponse } from 'next';
import { DeveloperKeys } from '../../utils/env';
import { getClientIp, mayUseServerKeys } from '../../server/access';
import { aUnMoyenPropre, perimetreFournisseurs } from '../../server/accesFournisseurs';
import { requireAuth } from '../../server/token';
import { resolveEtablissementByIp } from '../../server/etablissements';
import { seanceActive, seanceAutoriseFournisseur } from '../../server/seance';
import { ERR, PROVIDER_IDS, providerDefaults } from '../../shared/providers';

// CE QUE CE VISITEUR-CI PEUT CHOISIR, ET CE QUE LE SERVEUR PAIE POUR LUI.
//
// Deux questions distinctes, deux champs :
//   `visibles` — le PÉRIMÈTRE (src/server/accesFournisseurs.ts) : d'où l'on
//     appelle, qui l'on est, et si l'on paie soi-même. C'est la même fonction
//     que celle qu'applique /api/completion : la liste ne peut donc plus
//     promettre ce que la complétion refuse.
//   `served` — QUI PAIE : les fournisseurs qu'une clé de la plateforme peut
//     servir ici et maintenant. Les autres exigent une clé personnelle.
//
// Ce n'est pas une information sensible : la liste des modèles la trahit déjà,
// et la taire ne protège personne — alors qu'un élève qui choisit un
// fournisseur inutilisable reçoit sinon une erreur sèche après coup.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }
  // Dépend de l'IP de l'appelant (une salle de classe déverrouillée ou non, une
  // séance en cours ou non) ET du compte : surtout pas de cache partagé.
  const ip = getClientIp(req);
  const email = requireAuth(req)?.email ?? null;
  // SÉANCE EN COURS : l'enseignant a peut-être restreint les fournisseurs de sa
  // classe. Ceux qu'il a écartés sortent de « served » — l'élève les voit alors
  // marqués « clé personnelle », ce qui est exactement la vérité : la clé de
  // l'école ne les paiera pas tant que dure la séance. La règle elle-même vit
  // dans /api/completion ; ici on ne fait que cesser de promettre.
  const seance = seanceActive(resolveEtablissementByIp(ip)?.id ?? null);
  // NI DRAPEAU ROUGE, NI ÉCARTÉ D'UN PUBLIC SCOLAIRE : ces deux familles ne
  // sont JAMAIS servies par une clé de la plateforme — la route de complétion
  // les refuse sur la clé interne d'un établissement (travaux d'élèves hors
  // UE, public mineur) et le repli gratuit impose de toute façon son propre
  // fournisseur. Les annoncer « servis » promettrait une gratuité qui n'existe
  // pas, et c'est précisément l'erreur sèche après coup que cette route existe
  // pour éviter. L'oubli n'était pas théorique : Gemini, qui ne porte pas de
  // drapeau rouge, s'est affiché « servi » à qui n'aurait jamais pu l'obtenir
  // sans sa propre clé.
  const served = PROVIDER_IDS.filter(id =>
    !providerDefaults[id].wrng && !providerDefaults[id].ecarte
    && !!String(DeveloperKeys[id] || '').trim()
    && seanceAutoriseFournisseur(seance, id));
  const internalKey = await mayUseServerKeys(ip);
  // LE PÉRIMÈTRE. `moyenPropre` se lit EN BASE et jamais dans la requête : sur
  // le réseau d'une école, seul un moyen de paiement associé AVANT de venir
  // lève les règles de l'établissement — une clé collée dans un champ ne le
  // ferait pas, sans quoi il suffirait d'un copier-coller pour rouvrir en
  // classe ce que l'école a écarté.
  const perimetre = perimetreFournisseurs({ ip, email, moyenPropre: aUnMoyenPropre(email) });
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({
    served, internalKey,
    // LE MOTIF REMONTE, et pas seulement la liste. « Sur ce réseau » ne se dit
    // pas comme « il vous faut un compte » : la première absence ne se lève
    // par aucun réglage de l'intéressé, la seconde se lève en s'identifiant.
    // Un seul booléen forcerait l'interface à deviner laquelle des deux.
    visibles: perimetre.fournisseurs,
    motif: perimetre.motif,
    campus: perimetre.campus,
    compte: perimetre.compte,
  });
}
