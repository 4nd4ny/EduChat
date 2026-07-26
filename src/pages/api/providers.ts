import type { NextApiRequest, NextApiResponse } from 'next';
import { DeveloperKeys } from '../../utils/env';
import { getClientIp, mayUseServerKeys } from '../../server/access';
import { mayUseAdultProviders } from '../../server/adult';
import { requireAuth } from '../../server/token';
import { ERR, PROVIDER_IDS, providerDefaults } from '../../shared/providers';

// Quels fournisseurs le SERVEUR peut servir lui-même (clé interne d'école ou
// repli gratuit), et lesquels exigent la clé personnelle du visiteur.
//
// Ce n'est pas une information sensible : la liste des modèles la trahit déjà,
// et la taire ne protège personne — alors qu'un élève qui choisit un
// fournisseur inutilisable reçoit aujourd'hui une erreur sèche après coup.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }
  // Un fournisseur à drapeau rouge n'est JAMAIS servi par la clé interne
  // (travaux d'élèves hors UE) : il exige la clé de son utilisateur, quoi
  // qu'il arrive.
  const served = PROVIDER_IDS.filter(id =>
    !providerDefaults[id].wrng && !!String(DeveloperKeys[id] || '').trim());
  // Dépend de l'IP de l'appelant (une salle de classe déverrouillée, ou non) :
  // surtout pas de cache partagé.
  const ip = getClientIp(req);
  const internalKey = await mayUseServerKeys(ip);
  // Les fournisseurs écartés au titre de l'AI Act ne sont proposés que hors
  // réseau scolaire ET à un compte dont la majorité a été vérifiée.
  const adulte = await mayUseAdultProviders(ip, requireAuth(req)?.email ?? null);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({
    served, internalKey,
    adultAllowed: adulte.allowed,
    adultBlockedBySchool: adulte.reason === 'school-network',
  });
}
