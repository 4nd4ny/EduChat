import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../server/db';
import { requireAuth } from '../../server/token';
import { getClientIp, isRateLimited } from '../../server/access';
import { ERR } from '../../shared/providers';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

const MAX_PROFILE_BYTES = 1024 * 1024; // 1 Mo — même ordre que le quota d'upload

/** Conversations que ce compte a effacées : elles ne doivent jamais revenir. */
function deletedIds(db: ReturnType<typeof getDb>, email: string): string[] {
  return (db.prepare('SELECT conversation_id FROM profile_deletions WHERE email = ?')
    .all(email) as { conversation_id: string }[]).map(r => r.conversation_id);
}

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
    // Les conversations effacées voyagent avec le profil : le navigateur qui
    // les possède encore doit les retirer de son côté, sinon elles ne sont
    // effacées que du serveur.
    const deletedConversations = deletedIds(db, auth.email);
    const row = db.prepare('SELECT data, updated_at AS updatedAt FROM profiles WHERE email = ?')
      .get(auth.email) as { data: string; updatedAt: number } | undefined;
    if (!row) return res.status(200).json({ profile: null, deletedConversations });
    try {
      return res.status(200).json({ profile: JSON.parse(row.data), updatedAt: row.updatedAt, deletedConversations });
    } catch {
      return res.status(200).json({ profile: null, deletedConversations });
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
    // La fusion ne retire jamais rien : c'est ici, et seulement ici, que
    // s'applique la volonté d'effacement. Un identifiant n'est jamais
    // recyclé, la pierre tombale est donc définitive — et ne se compare
    // surtout pas à une date, l'horloge d'un navigateur en avance
    // ressusciterait la conversation.
    const tombes = deletedIds(db, auth.email);
    if (tombes.length && profile.conversations && typeof profile.conversations === 'object') {
      for (const id of tombes) delete profile.conversations[id];
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
    // Droit à l'effacement, à la carte ou en bloc.
    const demandees = Array.isArray(req.body?.conversations) ? req.body.conversations : null;

    if (demandees && demandees.length) {
      const ids = demandees
        .map((id: unknown) => String(id ?? '').slice(0, 64))
        .filter(Boolean)
        .slice(0, 500);
      if (!ids.length) return res.status(400).json({ error: { code: 'ERR_PROFILE_INVALID' } });

      const row = db.prepare('SELECT data FROM profiles WHERE email = ?').get(auth.email) as
        { data: string } | undefined;
      const now = Date.now();
      const marquer = db.prepare(
        'INSERT OR REPLACE INTO profile_deletions (email, conversation_id, deleted_at) VALUES (?, ?, ?)');
      db.transaction(() => {
        for (const id of ids) marquer.run(auth.email, id, now);
        if (row) {
          try {
            const profile = JSON.parse(row.data);
            if (profile?.conversations && typeof profile.conversations === 'object') {
              for (const id of ids) delete profile.conversations[id];
            }
            db.prepare('UPDATE profiles SET data = ?, updated_at = ? WHERE email = ?')
              .run(JSON.stringify(profile), now, auth.email);
          } catch {
            /* profil illisible : la pierre tombale suffit, le PUT suivant filtrera */
          }
        }
      })();
      return res.status(200).json({ ok: true, deleted: ids.length });
    }

    // Effacement TOTAL.
    //
    // Deux précautions, toutes deux apprises d'un scénario à deux appareils :
    //  - retirer le consentement, sinon la sauvegarde automatique (toutes les
    //    15 s) recréerait le profil dans la minute ;
    //  - poser une pierre tombale sur CHAQUE conversation effacée, et surtout
    //    ne pas toucher à celles déjà posées. Le portable resté fermé garde sa
    //    copie : sans ces marqueurs, il la renverrait dès que la sauvegarde
    //    est réactivée — et la page a promis le contraire.
    const row = db.prepare('SELECT data FROM profiles WHERE email = ?').get(auth.email) as
      { data: string } | undefined;
    let ids: string[] = [];
    if (row) {
      try {
        const conversations = JSON.parse(row.data)?.conversations;
        if (conversations && typeof conversations === 'object') ids = Object.keys(conversations);
      } catch {
        /* profil illisible : rien à marquer, il n'y a plus rien à protéger */
      }
    }
    const now = Date.now();
    const marquer = db.prepare(
      'INSERT OR REPLACE INTO profile_deletions (email, conversation_id, deleted_at) VALUES (?, ?, ?)');
    db.transaction(() => {
      for (const id of ids) marquer.run(auth.email, String(id).slice(0, 64), now);
      db.prepare('DELETE FROM profiles WHERE email = ?').run(auth.email);
      db.prepare('UPDATE users SET sync_optin = 0 WHERE email = ?').run(auth.email);
    })();
    return res.status(200).json({ ok: true, syncDisabled: true });
  }

  res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
  return res.status(405).json({ error: { code: ERR.METHOD } });
}
