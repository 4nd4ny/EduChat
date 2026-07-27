import { NextApiRequest, NextApiResponse } from 'next';
import { getClientIp } from '../../../server/access';
import { getEtablissementById, resolveEtablissementByIp } from '../../../server/etablissements';
import { listPublished, nomsDeLEcole, porteeAppelant } from '../../../server/prompts';
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
//   · l'école n'est pas ANNONCÉE, elle est RÉSOLUE — par getClientIp pour qui
//     n'a pas de compte (la même adresse que voient l'accès élèves et la
//     facturation : X-Real-IP posé par le proxy, jamais un en-tête que le
//     navigateur choisit), et par l'appartenance relue en base pour un
//     enseignant identifié (porteeAppelant, src/server/prompts.ts). Sans ce
//     second chemin, l'enseignant qui ouvre la page de son établissement
//     depuis chez lui tombait sur le formulaire d'inscription d'une école
//     inconnue — la sienne avait disparu avec le réseau ;
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

  // ── « bref » : LA LIGNE DE PROFILS DE L'ACCUEIL, ET ELLE SEULE ──
  //
  // Elle ne pose pas la même question que le reste de cette route, et c'est
  // pourquoi elle ne passe pas par porteeAppelant. Le corps de la page demande
  // « DE QUELLE ÉCOLE CETTE PERSONNE RELÈVE-T-ELLE ? » — d'où le repli sur
  // l'appartenance du compte, qui rend sa page à l'enseignant travaillant de
  // chez lui. La ligne de profils, elle, demande « OÙ EST CE NAVIGATEUR ? » :
  // ce qu'elle montre ou masque dépend de la salle de classe, pas du titre de
  // qui regarde. Un promptagogue qui enseigne aussi quelque part perdrait sinon
  // son atelier chez lui, où rien ne justifie de le lui retirer.
  //
  // Le navigateur ne devine rien : la réponse sort de resolveEtablissementByIp,
  // sur l'adresse posée par le proxy — la même qui reconnaît les élèves et qui
  // facture.
  if (req.query.bref) {
    const surIp = resolveEtablissementByIp(getClientIp(req));
    return res.status(200).json({
      ecole: surIp ? { name: surIp.name } : null,
      atelierPromptagogue: !!surIp?.atelier_promptagogue,
      tuteurs: [],
    });
  }

  const portee = porteeAppelant(req, getClientIp(req));
  const etab = portee.etablissementId !== null ? getEtablissementById(portee.etablissementId) : null;
  // Hors établissement (et cas impossible d'une école effacée entre les deux
  // requêtes) : pas d'école, pas de liste. La page bascule alors sur
  // l'inscription — c'est ce « null » qui la déclenche.
  if (!etab) {
    return res.status(200).json({ ecole: null, atelierPromptagogue: false, tuteurs: [] });
  }

  const ecole = { name: etab.name };

  // La locale vient du client (router.locale) : une route d'API ne la reçoit
  // pas du routage i18n de Next, exactement comme dans /api/prompts.
  const locale = String(req.query.locale ?? '').slice(0, 5);
  // LES TUTEURS DE L'ÉCOLE, ET EUX SEULS (décision du client).
  //
  // La page servait auparavant « ceux de l'école d'abord, puis ceux de la
  // plateforme » : le catalogue commun s'y trouvait donc affiché DEUX FOIS sur
  // le site, une fois ici et une fois sur l'accueil, et l'école y perdait la
  // seule chose que sa page pouvait dire en propre — ce que SES enseignants
  // ont écrit. On filtre donc sur le rattachement.
  //
  // LE FILTRE NE DONNE RIEN DE NEUF : il RETRANCHE d'une liste déjà passée par
  // CLAUSE_VISIBLE (listPublished). Un tuteur réservé de l'école n'entre pas
  // ici par ce chemin ; nomsDeLEcole ne sert qu'à écarter ce qui n'est pas
  // d'elle, jamais à faire entrer ce que la portée avait exclu.
  const maison = new Set(nomsDeLEcole(etab.id));
  const tuteurs = listPublished('score', '', locale, portee)
    .filter(carte => maison.has(carte.name));

  // PAS d'« atelierPromptagogue » ici : il n'appartient qu'à la réponse
  // « bref », et les deux moitiés de cette route ne résolvent PAS la même
  // école — celle-ci peut suivre l'appartenance du compte, « bref » suit
  // l'adresse IP. Renvoyer le drapeau des deux côtés inviterait à croire qu'ils
  // parlent du même établissement, ce qui est faux pour l'enseignant qui
  // travaille depuis chez lui.
  res.status(200).json({ ecole, tuteurs });
}
