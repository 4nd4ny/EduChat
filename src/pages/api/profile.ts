import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../server/db';
import { requireAuth } from '../../server/token';
import { getClientIp, isRateLimited } from '../../server/access';
import { ERR } from '../../shared/providers';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

const MAX_PROFILE_BYTES = 1024 * 1024; // 1 Mo — même ordre que le quota d'upload

// Synchronisation serveur du profil (étape 15) — STRICTEMENT opt-in :
// réservée aux comptes vérifiés ayant coché l'option à la vérification.
// La charge utile est le format d'export de l'étape 11 (conversations,
// favoris, notes) ; le jeton de compte n'en fait jamais partie.
// Fusion « le plus récent gagne » assurée côté client ; ici, simple stockage.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = requireAuth(req);
  if (!auth) return res.status(401).json({ error: { code: 'ERR_AUTH_REQUIRED' } });

  const ip = getClientIp(req);
  if (await isRateLimited(ip, 10, 'profile')) {
    return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
  }

  const db = getDb();

  if (req.method === 'GET') {
    const row = db.prepare('SELECT data, updated_at AS updatedAt FROM profiles WHERE email = ?')
      .get(auth.email) as { data: string; updatedAt: number } | undefined;
    if (!row) return res.status(200).json({ profile: null });
    try {
      return res.status(200).json({ profile: JSON.parse(row.data), updatedAt: row.updatedAt });
    } catch {
      return res.status(200).json({ profile: null });
    }
  }

  if (req.method === 'PUT') {
    const user = db.prepare('SELECT sync_optin FROM users WHERE email = ?').get(auth.email) as
      { sync_optin: number } | undefined;
    if (!user?.sync_optin) return res.status(403).json({ error: { code: 'ERR_SYNC_OPTOUT' } });

    const profile = req.body?.profile;
    if (!profile || typeof profile !== 'object' || typeof profile.educhatProfile !== 'number') {
      return res.status(400).json({ error: { code: 'ERR_PROFILE_INVALID' } });
    }
    // FUSION, jamais écrasement : un navigateur qui ne connaît que deux
    // conversations ne doit pas effacer les quarante autres du compte. On
    // réunit les conversations des deux côtés (la version la plus récente
    // gagne) ; l'effacement volontaire passe par DELETE.
    const existing = db.prepare('SELECT data FROM profiles WHERE email = ?').get(auth.email) as
      { data: string } | undefined;
    if (existing) {
      try {
        const previous = JSON.parse(existing.data);
        const merged: Record<string, any> = { ...(previous.conversations ?? {}) };
        for (const [id, conversation] of Object.entries(profile.conversations ?? {})) {
          const before = merged[id];
          const lastOf = (c: any) => Number(c?.lastMessage ?? c?.createdAt ?? 0);
          if (!before || lastOf(conversation) >= lastOf(before)) merged[id] = conversation;
        }
        profile.conversations = merged;
        profile.favorites = Array.from(new Set([...(previous.favorites ?? []), ...(profile.favorites ?? [])]));
        profile.ratings = { ...(previous.ratings ?? {}), ...(profile.ratings ?? {}) };
      } catch {
        /* profil serveur illisible : on repart du profil reçu */
      }
    }
    const serialized = JSON.stringify(profile);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_PROFILE_BYTES) {
      return res.status(413).json({ error: { code: 'ERR_PROFILE_TOO_LARGE' } });
    }
    const now = Date.now();
    db.prepare(`
      INSERT INTO profiles (email, data, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `).run(auth.email, serialized, now);
    return res.status(200).json({ ok: true, updatedAt: now });
  }

  if (req.method === 'DELETE') {
    // Droit à l'effacement : suppression immédiate et définitive.
    db.prepare('DELETE FROM profiles WHERE email = ?').run(auth.email);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
  return res.status(405).json({ error: { code: ERR.METHOD } });
}
