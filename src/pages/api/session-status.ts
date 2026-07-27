import type { NextApiRequest, NextApiResponse } from 'next';
import {
  getAuthLockExpiry, getClientIp, isAccessAllowed, isKnownIp, mayUseServerKeys, salleDepuisIp,
} from '../../server/access';
import { getDb } from '../../server/db';
import { getEtablissementById, isWithinSchedule, parseHours } from '../../server/etablissements';
import { ecoleEnseignante } from '../../server/appartenance';
import { DeveloperKeys, MaxUnlockMinutes } from '../../utils/env';
import { ERR, SCHOOL_PROVIDER_IDS } from '../../shared/providers';
import { parseFournisseursSeance, seanceRestreinte } from '../../server/seance';

// État de la SESSION de classe, pour la console enseignante (/enseignant).
//
// Répond à trois questions : « les élèves de cette salle peuvent-ils utiliser
// la clé de l'école en ce moment ? », « pourquoi (verrou ouvert ou plage
// horaire) ? », « quel tuteur est déployé ? ». Aucune donnée personnelle :
// l'IP renvoyée est celle de la salle, déjà connue de l'appelant.
//
// ─── DEUX ÉCOLES DANS UNE RÉPONSE, ET ON NE LES FOND PAS ─────────────────────
//
// Un enseignant prépare sa leçon chez lui : son école ne doit pas disparaître
// de l'écran sous prétexte que son salon n'est pas le collège. Mais la salle où
// il se trouve, elle, ne devient pas le collège pour autant. La réponse porte
// donc DEUX choses distinctes, et l'écran les montre distinctes :
//
//   `etablissement` — LA SALLE, reconnue par l'IP. C'est elle que décrivent
//     `ip`, `open`, `withinSchedule` et `lockExpiresAt` : autant de faits sur
//     le LIEU d'où part la requête, et la clé interne ne se dépense nulle part
//     ailleurs (voir mayUseServerKeys, src/server/access.ts). Depuis la maison,
//     `etablissement` vaut null et `open` vaut faux — ce qui est la vérité.
//
//   `ecole` — L'ÉCOLE DONT ON S'OCCUPE : l'école active du compte s'il y a un
//     titre d'enseignement (ecoleEnseignante, src/server/appartenance.ts), à
//     défaut celle de la salle. C'est elle que décrivent `settings` et
//     `schoolProviders`, et c'est elle que visera le déploiement d'un tuteur —
//     /api/session-settings applique déjà exactement la même règle, de sorte
//     que ce qui s'affiche et ce qui s'écrira désignent le même établissement.
//
// LES CONFONDRE MENTIRAIT DANS LES DEUX SENS : annoncer « ouvert » pour une
// école dont on n'est pas sur le réseau, ou effacer l'école d'un enseignant qui
// travaille de chez lui. `surPlace` dit lequel des deux cas on est.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  const ip = getClientIp(req);
  // LA SALLE, résolue UNE fois — et la même résolution que celle qui commande
  // la dépense (salleDepuisIp, src/server/access.ts). L'école en base est
  // `portee.etablissement` ; une adresse d'amorçage SECRET_ALLOWED_IPS a bien
  // une salle mais aucune ligne en base, exactement comme avant.
  const portee = await salleDepuisIp(ip);
  const etab = portee?.etablissement ?? null;
  // L'échéance de CETTE salle, jamais celle d'une autre école : c'est un fait
  // sur le lieu d'où part la requête (voir l'en-tête), et c'est aussi lui qui
  // fait apparaître le bouton « Refermer maintenant » quand il y a quelque
  // chose à refermer ici.
  const lockExpiry = await getAuthLockExpiry(portee?.cle ?? null);
  const ownHours = etab ? parseHours(etab.hours) : [];
  // Fenêtre horaire applicable : celle de l'établissement s'il en a une,
  // sinon les horaires globaux du serveur.
  const withinSchedule = etab
    ? (ownHours.length > 0 ? isWithinSchedule(ownHours) : isAccessAllowed())
    : (isKnownIp(ip) && isAccessAllowed());

  // L'ÉCOLE DE TRAVAIL. Le titre d'enseignement prime sur l'IP ; sans titre —
  // visiteur anonyme, élève, compte simplement rattaché par une IP —, on
  // retombe sur la salle, c'est-à-dire sur le comportement d'avant.
  const ecoleId = ecoleEnseignante(req) ?? etab?.id ?? null;
  const ecole = ecoleId !== null
    ? (ecoleId === etab?.id ? etab : getEtablissementById(ecoleId))
    : null;

  const settings = ecole
    ? getDb().prepare(`
        SELECT p.name AS promptName, s.web_search AS webSearch, s.providers AS providers,
               s.expires_at AS expiresAt
        FROM session_settings s
        LEFT JOIN prompts p ON p.id = s.default_prompt_id AND p.status = 'published'
        WHERE s.etablissement_id = ? AND s.expires_at > ?
      `).get(ecole.id, Date.now()) as
      { promptName: string | null; webSearch: number; providers: string; expiresAt: number } | undefined
    : undefined;

  // UNIVERS des cases à cocher de la console : ce que la clé interne peut
  // réellement servir à une école — la liste scolaire (AI Act, drapeau rouge)
  // restreinte aux fournisseurs dont la plateforme détient une clé. Il vient
  // d'ICI et non de /api/providers, qui est désormais filtré PAR la séance :
  // s'en servir rendrait toute restriction irréversible (une fois Mistral seul
  // coché, la case des autres aurait disparu).
  const schoolProviders = SCHOOL_PROVIDER_IDS.filter(
    id => !!String(DeveloperKeys[id] || '').trim());

  // La réponse dépend désormais AUSSI du jeton et de l'école active annoncée :
  // « private », donc, et jamais un cache partagé qui servirait l'école d'un
  // enseignant à la salle de classe suivante.
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({
    ip,
    etablissement: etab ? { name: etab.name, hasOwnHours: ownHours.length > 0 } : null,
    // L'ÉCOLE DE TRAVAIL (voir l'en-tête) : celle dont parlent `settings` et
    // `schoolProviders`, et que visera le déploiement.
    ecole: ecole ? { id: ecole.id, name: ecole.name } : null,
    // Est-on physiquement sur le réseau de cette école-là ? C'est ce booléen
    // qui permet à l'écran de dire « vous préparez X depuis l'extérieur »
    // plutôt que de laisser croire que l'état de la salle est celui de X.
    surPlace: !!ecole && ecole.id === etab?.id,
    // « Ouvert » = les élèves de cette IP peuvent réellement consommer la clé.
    // C'EST UN FAIT SUR LA SALLE, jamais sur l'école active : hors du réseau,
    // il vaut faux même pour un enseignant dont l'école est grande ouverte.
    open: await mayUseServerKeys(ip),
    // Y A-T-IL UNE SALLE À OUVRIR D'ICI ? Depuis que le verrou porte une école,
    // le mot de passe ne suffit plus : il faut aussi que l'adresse appelante
    // désigne un réseau scolaire. L'écran doit pouvoir le dire AVANT que
    // l'enseignant tape son mot de passe, plutôt que de le laisser conclure
    // qu'il l'a mal retenu.
    // Ce n'est PAS `etablissement !== null` : une adresse d'amorçage
    // (SECRET_ALLOWED_IPS, déploiement mono-établissement sans ligne en base)
    // ouvre bel et bien une salle, sans avoir de nom à afficher.
    salleOuvrable: !!portee,
    lockExpiresAt: lockExpiry || null,
    withinSchedule,
    maxUnlockMinutes: MaxUnlockMinutes,
    schoolProviders,
    settings: settings
      ? {
          promptName: settings.promptName, webSearch: !!settings.webSearch,
          // La LISTE et le DRAPEAU, jamais l'un sans l'autre : sans restriction
          // la console coche tout ; avec une restriction elle coche exactement
          // ce qui est là, fût-ce rien — une liste vide restreinte veut dire
          // « aucun fournisseur sur la clé de l'école », et la console doit
          // pouvoir le dire au lieu d'afficher « tous ».
          providers: parseFournisseursSeance(settings.providers),
          providersRestricted: seanceRestreinte(settings.providers),
          expiresAt: settings.expiresAt,
        }
      : null,
  });
}
