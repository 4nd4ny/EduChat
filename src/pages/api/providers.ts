import type { NextApiRequest, NextApiResponse } from 'next';
import { DeveloperKeys } from '../../utils/env';
import { getClientIp, mayUseServerKeys } from '../../server/access';
import { mayUseAdultProviders } from '../../server/adult';
import { requireAuth } from '../../server/token';
import { resolveEtablissementByIp } from '../../server/etablissements';
import { seanceActive, seanceAutoriseFournisseur } from '../../server/seance';
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
  // Dépend de l'IP de l'appelant (une salle de classe déverrouillée ou non, une
  // séance en cours ou non) : surtout pas de cache partagé.
  const ip = getClientIp(req);
  // SÉANCE EN COURS : l'enseignant a peut-être restreint les fournisseurs de sa
  // classe. Ceux qu'il a écartés sortent de « served » — l'élève les voit alors
  // marqués « clé personnelle », ce qui est exactement la vérité : la clé de
  // l'école ne les paiera pas tant que dure la séance. La règle elle-même vit
  // dans /api/completion ; ici on ne fait que cesser de promettre.
  const seance = seanceActive(resolveEtablissementByIp(ip)?.id ?? null);
  // NI DRAPEAU ROUGE, NI ÉCARTÉ AU TITRE DE L'AI ACT : ces deux familles ne
  // sont JAMAIS servies par une clé de la plateforme — la route de complétion
  // les refuse sur la clé interne d'un établissement (travaux d'élèves hors
  // UE, public mineur) et le repli gratuit impose de toute façon son propre
  // fournisseur. Les annoncer « servis » promettrait une gratuité qui n'existe
  // pas, et c'est précisément l'erreur sèche après coup que cette route existe
  // pour éviter. L'oubli n'était pas théorique : Gemini, qui ne porte pas de
  // drapeau rouge, s'affichait « servi » à un adulte certifié qui n'aurait
  // jamais pu l'obtenir sans sa propre clé.
  const served = PROVIDER_IDS.filter(id =>
    !providerDefaults[id].wrng && !providerDefaults[id].adultOnly
    && !!String(DeveloperKeys[id] || '').trim()
    && seanceAutoriseFournisseur(seance, id));
  const internalKey = await mayUseServerKeys(ip);
  // AI ACT : le réseau d'une école ferme ces fournisseurs à tout le monde, et
  // ailleurs il faut une majorité certifiée (src/server/adult.ts). LES DEUX
  // MOTIFS DE REFUS SORTENT D'ICI, séparément : l'interface n'explique pas de
  // la même façon une absence qu'aucun compte ne lève et une absence qui
  // attend une certification. Un seul booléen forcerait à deviner.
  const adulte = mayUseAdultProviders(ip, requireAuth(req)?.email ?? null);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({
    served, internalKey,
    adultAllowed: adulte.allowed,
    adultBlockedBySchool: adulte.reason === 'school-network',
  });
}
