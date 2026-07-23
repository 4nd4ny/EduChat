import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../server/db';
import { getClientIp, getAuthLockExpiry, isRateLimited } from '../../server/access';
import { requireAuth } from '../../server/token';
import { MaxUnlockMinutes } from '../../utils/env';
import { ERR } from '../../shared/providers';

// Réglages de session posés par l'enseignant au déverrouillage (étape 14) :
// tuteur par défaut + recherche web on/off pour les élèves de SON établissement
// (résolu par IP). Les réglages expirent avec le verrou de la salle.
//
// « Déployer sur une classe » (pivot v3), concrètement : le prof choisit le
// tuteur, tous les élèves de l'IP le reçoivent pré-sélectionné.

function resolveEtablissementId(ip: string): number | null {
  const rows = getDb().prepare('SELECT id, ips FROM etablissements').all() as Array<{ id: number; ips: string }>;
  for (const row of rows) {
    if (row.ips.split(',').map(s => s.trim()).includes(ip)) return row.id;
  }
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ip = getClientIp(req);
  const etablissementId = resolveEtablissementId(ip);

  // ---- GET : les réglages ACTIFS de l'établissement de l'appelant -----------
  // Public (les élèves en héritent), sans aucune donnée personnelle.
  if (req.method === 'GET') {
    if (!etablissementId) return res.status(200).json({ settings: null });
    const row = getDb().prepare(`
      SELECT s.default_prompt_id AS promptId, s.web_search AS webSearch, s.expires_at AS expiresAt,
             p.name AS promptName
      FROM session_settings s
      LEFT JOIN prompts p ON p.id = s.default_prompt_id AND p.status = 'published'
      WHERE s.etablissement_id = ? AND s.expires_at > ?
    `).get(etablissementId, Date.now()) as
      { promptName: string | null; webSearch: number; expiresAt: number } | undefined;
    return res.status(200).json({
      settings: row ? { promptName: row.promptName, webSearch: !!row.webSearch, expiresAt: row.expiresAt } : null,
    });
  }

  if (req.method !== 'PUT') {
    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  if (await isRateLimited(ip, 10, 'session-settings')) {
    return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
  }

  // Écriture : dans la foulée d'un déverrouillage (le mot de passe de salle EST
  // la preuve enseignante — modèle de confiance de la classe), ou avec un
  // compte enseignant vérifié (rôle relu en base).
  const auth = requireAuth(req);
  const lockExpiry = await getAuthLockExpiry();
  let isTeacher = false;
  if (auth) {
    const user = getDb().prepare('SELECT is_teacher FROM users WHERE email = ?').get(auth.email) as
      { is_teacher: number } | undefined;
    isTeacher = !!user?.is_teacher;
  }
  if (!lockExpiry && !isTeacher) {
    return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
  }
  if (!etablissementId) {
    // Les réglages sont PAR établissement : une IP hors base n'en a pas.
    return res.status(400).json({ error: { code: 'ERR_NO_ETABLISSEMENT' } });
  }

  const promptName = String(req.body?.promptName ?? '').slice(0, 64);
  const webSearch = req.body?.webSearch ? 1 : 0;
  let promptId: number | null = null;
  if (promptName) {
    const prompt = getDb().prepare("SELECT id FROM prompts WHERE name = ? AND status = 'published'")
      .get(promptName) as { id: number } | undefined;
    if (!prompt) return res.status(404).json({ error: { code: 'ERR_PROMPT_UNKNOWN' } });
    promptId = prompt.id;
  }

  const expiresAt = lockExpiry || Date.now() + MaxUnlockMinutes * 60_000;
  getDb().prepare(`
    INSERT INTO session_settings (etablissement_id, default_prompt_id, web_search, set_by_email, expires_at)
    VALUES (@id, @promptId, @webSearch, @email, @expires)
    ON CONFLICT(etablissement_id) DO UPDATE SET
      default_prompt_id = @promptId, web_search = @webSearch, set_by_email = @email, expires_at = @expires
  `).run({ id: etablissementId, promptId, webSearch, email: auth?.email ?? null, expires: expiresAt });

  res.status(200).json({ ok: true, expiresAt });
}
