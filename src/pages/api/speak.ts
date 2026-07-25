import type { NextApiRequest, NextApiResponse } from 'next';
import { getClientIp, isRateLimited, mayUseServerKeys } from '../../server/access';
import { getDb } from '../../server/db';
import { resolveEtablissementByIp } from '../../server/etablissements';
import { requireAuth } from '../../server/token';
import { readUserKey } from '../../server/userKeys';
import { DeveloperKeys } from '../../utils/env';
import { ERR } from '../../shared/providers';

// Lecture à voix haute par Voxtral (Mistral), quand une clé le permet.
//
// La synthèse du NAVIGATEUR reste le repli : elle est gratuite et ne fait
// sortir aucun texte de l'appareil. Voxtral donne une voix nettement plus
// naturelle, mais chaque lecture est un appel facturé — c'est pourquoi le
// client ne l'utilise que sur Mistral, et pourquoi une lecture payée par une
// école est journalisée comme le reste.

const MAX_CHARS = 2000;   // au-delà, on ne lit pas : c'est un cours, pas un livre

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  const clientIp = getClientIp(req);
  if (await isRateLimited(clientIp, 20, 'speak')) {
    return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
  }

  const text = String(req.body?.text ?? '').trim().slice(0, MAX_CHARS);
  if (!text) return res.status(400).json({ error: { code: ERR.EMPTY } });

  let apiKey = String(req.body?.apiKey ?? '').trim();
  if (!apiKey) {
    try {
      const account = requireAuth(req);
      if (account) apiKey = readUserKey(account.email, 'mistral') ?? '';
    } catch { apiKey = ''; }
  }
  let usedServerKey = false;
  if (!apiKey && await mayUseServerKeys(clientIp)) {
    apiKey = String(DeveloperKeys.mistral || '').trim();
    usedServerKey = !!apiKey;
  }
  if (!apiKey) return res.status(403).json({ error: { code: ERR.VOICE_KEY } });

  try {
    const upstream = await fetch('https://api.mistral.ai/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'voxtral-mini-tts-latest', input: text }),
    });
    if (!upstream.ok) {
      console.error('Synthèse vocale refusée :', upstream.status, (await upstream.text()).slice(0, 200));
      return res.status(502).json({ error: { code: 'ERR_TTS_FAILED' } });
    }
    const audio = Buffer.from(await upstream.arrayBuffer());

    if (usedServerKey) {
      try {
        const etab = resolveEtablissementByIp(clientIp);
        getDb().prepare(`
          INSERT INTO usage_log (ts, ip, etablissement_id, teacher_email, prompt_id, provider, model, tokens, used_server_key, client_id)
          VALUES (?, ?, ?, NULL, NULL, 'mistral', 'voxtral-mini-tts (lecture)', ?, 1, '')
        `).run(Date.now(), clientIp, etab?.id ?? null, Math.max(1, Math.round(text.length / 4)));
      } catch (error) {
        console.error('Lecture non journalisée :', error);
      }
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(audio);
  } catch (error) {
    console.error('Synthèse vocale indisponible :', error);
    return res.status(502).json({ error: { code: 'ERR_TTS_FAILED' } });
  }
}
