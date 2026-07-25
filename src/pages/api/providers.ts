import type { NextApiRequest, NextApiResponse } from 'next';
import { DeveloperKeys } from '../../utils/env';
import { ERR, PROVIDER_IDS, providerDefaults } from '../../shared/providers';

// Quels fournisseurs le SERVEUR peut servir lui-même (clé interne d'école ou
// repli gratuit), et lesquels exigent la clé personnelle du visiteur.
//
// Ce n'est pas une information sensible : la liste des modèles la trahit déjà,
// et la taire ne protège personne — alors qu'un élève qui choisit un
// fournisseur inutilisable reçoit aujourd'hui une erreur sèche après coup.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }
  // Un fournisseur à drapeau rouge n'est JAMAIS servi par la clé interne
  // (travaux d'élèves hors UE) : il exige la clé de son utilisateur, quoi
  // qu'il arrive.
  const served = PROVIDER_IDS.filter(id =>
    !providerDefaults[id].wrng && !!String(DeveloperKeys[id] || '').trim());
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json({ served });
}
