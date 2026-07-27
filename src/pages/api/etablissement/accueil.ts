import { NextApiRequest, NextApiResponse } from 'next';
import { getClientIp } from '../../../server/access';
import { getEtablissementById } from '../../../server/etablissements';
import { listPublished, nomsDeLEcole, porteeDepuisIp } from '../../../server/prompts';
import { ERR } from '../../../shared/providers';

// L'ACCUEIL PUBLIC D'UNE ÉCOLE — la seule route d'établissement SANS jeton.
//
// /etablissement était un écran verrouillé : quiconque n'était pas responsable
// y trouvait une porte close, y compris l'élève assis dans la salle de classe
// de l'école qui paie. C'est pourtant SA page : depuis le réseau de son
// établissement, elle doit lui montrer ce qu'il peut faire, pas ce qu'il ne
// peut pas. Cette route sert donc ce que voit un visiteur reconnu par son IP.
//
// POURQUOI L'ABSENCE DE JETON N'OUVRE RIEN :
//   · l'école n'est pas ANNONCÉE, elle est RÉSOLUE par getClientIp — la même
//     adresse que voient l'accès élèves et la facturation (X-Real-IP posé par
//     le proxy, jamais un en-tête que le navigateur choisit) ;
//   · la liste passe par listPublished, donc par CLAUSE_VISIBLE : rien ne sort
//     d'ici qu'un élève de cette école ne verrait déjà sur le catalogue ;
//   · le seul renseignement supplémentaire est le NOM de l'école — celui de
//     l'établissement d'où l'on écrit, que ses propres murs affichent déjà.
// Aucun réglage, aucun chiffre de consommation, aucune adresse de facturation :
// tout cela reste derrière /api/etablissement et son jeton.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  // La réponse DÉPEND DE L'IP appelante : un cache partagé (proxy, CDN) servirait
  // le nom d'une école à l'école voisine. On l'interdit explicitement plutôt que
  // de compter sur les défauts d'un intermédiaire qu'on ne configure pas.
  res.setHeader('Cache-Control', 'private, no-store');

  const portee = porteeDepuisIp(getClientIp(req));
  const etab = portee.etablissementId !== null ? getEtablissementById(portee.etablissementId) : null;
  // Hors établissement (et cas impossible d'une école effacée entre les deux
  // requêtes) : pas d'école, pas de liste. La page bascule alors sur
  // l'inscription — c'est ce « null » qui la déclenche.
  if (!etab) return res.status(200).json({ ecole: null, tuteurs: [] });

  const ecole = { name: etab.name };

  // « bref » : l'accueil du site n'a besoin QUE de savoir s'il parle à une
  // école (pour lui donner sa tuile en premier). Lui envoyer tout le catalogue
  // une seconde fois — il le charge déjà par /api/prompts — serait du gaspillage
  // sur chaque visite anonyme.
  if (req.query.bref) return res.status(200).json({ ecole, tuteurs: [] });

  // La locale vient du client (router.locale) : une route d'API ne la reçoit
  // pas du routage i18n de Next, exactement comme dans /api/prompts.
  const locale = String(req.query.locale ?? '').slice(0, 5);
  // Les tuteurs DE L'ÉCOLE remontent en tête, marqués : sur la page de son
  // établissement, on cherche d'abord ce que ses collègues y ont posé. Le reste
  // (catalogue de la plateforme, publics des autres si l'école a ouvert son
  // catalogue) suit dans l'ordre habituel — une école qui vient de s'inscrire
  // n'a donc jamais une page vide.
  const maison = new Set(nomsDeLEcole(etab.id));
  const tuteurs = listPublished('score', '', locale, portee)
    .map(carte => ({ ...carte, maison: maison.has(carte.name) }))
    .sort((a, b) => Number(b.maison) - Number(a.maison));

  res.status(200).json({ ecole, tuteurs });
}
