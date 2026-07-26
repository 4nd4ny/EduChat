import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthLockExpiry, getClientIp, isAccessAllowed, isKnownIp, mayUseServerKeys } from '../../server/access';
import { getDb } from '../../server/db';
import { isWithinSchedule, parseHours, resolveEtablissementByIp } from '../../server/etablissements';
import { DeveloperKeys, MaxUnlockMinutes } from '../../utils/env';
import { ERR, SCHOOL_PROVIDER_IDS } from '../../shared/providers';
import { parseFournisseursSeance, seanceRestreinte } from '../../server/seance';

// État de la SESSION de classe, pour la console enseignante (/session).
//
// Répond à trois questions : « les élèves de cette salle peuvent-ils utiliser
// la clé de l'école en ce moment ? », « pourquoi (verrou ouvert ou plage
// horaire) ? », « quel tuteur est déployé ? ». Aucune donnée personnelle :
// l'IP renvoyée est celle de la salle, déjà connue de l'appelant.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  const ip = getClientIp(req);
  const etab = resolveEtablissementByIp(ip);
  const lockExpiry = await getAuthLockExpiry();
  const ownHours = etab ? parseHours(etab.hours) : [];
  // Fenêtre horaire applicable : celle de l'établissement s'il en a une,
  // sinon les horaires globaux du serveur.
  const withinSchedule = etab
    ? (ownHours.length > 0 ? isWithinSchedule(ownHours) : isAccessAllowed())
    : (isKnownIp(ip) && isAccessAllowed());

  const settings = etab
    ? getDb().prepare(`
        SELECT p.name AS promptName, s.web_search AS webSearch, s.providers AS providers,
               s.expires_at AS expiresAt
        FROM session_settings s
        LEFT JOIN prompts p ON p.id = s.default_prompt_id AND p.status = 'published'
        WHERE s.etablissement_id = ? AND s.expires_at > ?
      `).get(etab.id, Date.now()) as
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

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ip,
    etablissement: etab ? { name: etab.name, hasOwnHours: ownHours.length > 0 } : null,
    // « Ouvert » = les élèves de cette IP peuvent réellement consommer la clé.
    open: await mayUseServerKeys(ip),
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
