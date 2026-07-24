import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthLockExpiry, getClientIp, isAccessAllowed, isKnownIp, mayUseServerKeys } from '../../server/access';
import { getDb } from '../../server/db';
import { isWithinSchedule, parseHours, resolveEtablissementByIp } from '../../server/etablissements';
import { MaxUnlockMinutes } from '../../utils/env';
import { ERR } from '../../shared/providers';

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
        SELECT p.name AS promptName, s.web_search AS webSearch, s.expires_at AS expiresAt
        FROM session_settings s
        LEFT JOIN prompts p ON p.id = s.default_prompt_id AND p.status = 'published'
        WHERE s.etablissement_id = ? AND s.expires_at > ?
      `).get(etab.id, Date.now()) as
      { promptName: string | null; webSearch: number; expiresAt: number } | undefined
    : undefined;

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ip,
    etablissement: etab ? { name: etab.name, hasOwnHours: ownHours.length > 0 } : null,
    // « Ouvert » = les élèves de cette IP peuvent réellement consommer la clé.
    open: await mayUseServerKeys(ip),
    lockExpiresAt: lockExpiry || null,
    withinSchedule,
    maxUnlockMinutes: MaxUnlockMinutes,
    settings: settings
      ? { promptName: settings.promptName, webSearch: !!settings.webSearch, expiresAt: settings.expiresAt }
      : null,
  });
}
