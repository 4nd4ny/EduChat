import type { NextApiRequest, NextApiResponse } from 'next';
import { getClientIp, isRateLimited, mayUseServerKeys } from '../../server/access';
import { controlerCleEcole, estRefus, jetonsVoix, journaliserCleEcole, type AccesCleEcole } from '../../server/cleEcole';
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
// école est contrôlée, journalisée et DÉCOMPTÉE comme un message du chat
// (src/server/cleEcole.ts).

const MAX_CHARS = 2000;   // au-delà, on ne lit pas : c'est un cours, pas un livre

// Voxtral impose de NOMMER une voix, et son catalogue est celui du compte.
// Au 25 juillet 2026 il ne contient que de l'anglais (en_us, en_gb) : faire
// lire du français par une voix anglaise serait pire que la synthèse du
// téléphone, qui a de vraies voix françaises. On interroge donc le catalogue
// et l'on ne répond QUE si une voix correspond à la langue demandée — sinon
// 415, et le navigateur prend le relais. Le jour où Mistral publiera des voix
// françaises, cela fonctionnera sans toucher au code.
let voixConnues: { at: number; items: { slug: string; languages: string[] }[] } | null = null;

async function voixPour(langue: string, apiKey: string): Promise<string | null> {
  if (!voixConnues || Date.now() - voixConnues.at > 24 * 60 * 60 * 1000) {
    try {
      const r = await fetch('https://api.mistral.ai/v1/audio/voices', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!r.ok) return null;
      const j = await r.json();
      voixConnues = {
        at: Date.now(),
        items: (j.items ?? []).map((v: any) => ({
          slug: String(v.slug ?? ''),
          languages: (v.languages ?? []).map((l: any) => String(l)),
        })).filter((v: any) => v.slug),
      };
    } catch {
      return null;
    }
  }
  const prefixe = langue.slice(0, 2).toLowerCase();
  const correspond = voixConnues.items.find(v => v.languages.some(l => l.toLowerCase().startsWith(prefixe)));
  return correspond?.slug ?? null;
}

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
  let cleEcole: AccesCleEcole | null = null;
  if (!apiKey && await mayUseServerKeys(clientIp)) {
    // Mêmes gardes que /api/completion sur la clé de l'école (séance, crédit,
    // quotas), AVANT d'interroger Mistral — le catalogue des voix compris : une
    // école à sec ne finance plus aucune lecture. Le navigateur, sur ce refus
    // comme sur tout autre, retombe sur sa propre synthèse, gratuite.
    const clientId = /^[a-f0-9-]{8,64}$/i.test(String(req.body?.clientId ?? '')) ? String(req.body.clientId) : '';
    const acces = controlerCleEcole(clientIp, 'mistral', clientId);
    if (estRefus(acces)) return res.status(acces.status).json({ error: { code: acces.code } });
    apiKey = String(DeveloperKeys.mistral || '').trim();
    if (apiKey) cleEcole = acces;
  }
  if (!apiKey) return res.status(403).json({ error: { code: ERR.VOICE_KEY } });

  const langue = String(req.body?.locale ?? 'fr').slice(0, 5);
  const voice = await voixPour(langue, apiKey);
  // Pas de voix dans cette langue : on le dit franchement, le navigateur lira.
  if (!voice) return res.status(415).json({ error: { code: 'ERR_TTS_NO_VOICE' } });

  try {
    const upstream = await fetch('https://api.mistral.ai/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'voxtral-mini-tts-latest', input: text, voice }),
    });
    if (!upstream.ok) {
      console.error('Synthèse vocale refusée :', upstream.status, (await upstream.text()).slice(0, 200));
      return res.status(502).json({ error: { code: 'ERR_TTS_FAILED' } });
    }
    // La réponse est du JSON { audio_data: <base64 MP3> }, pas un flux audio.
    const charge = await upstream.json();
    const base64 = String(charge?.audio_data ?? '');
    if (!base64) return res.status(502).json({ error: { code: 'ERR_TTS_FAILED' } });
    const audio = Buffer.from(base64, 'base64');

    // Lecture payée par l'école : même ligne de journal et même décompte que
    // le chat. Jetons rendus par Mistral s'il les rend, sinon estimés depuis le
    // texte lu (côté ENTRÉE : c'est le texte qu'on envoie).
    if (cleEcole) {
      journaliserCleEcole(clientIp, cleEcole, 'mistral', 'voxtral-mini-tts-latest',
        jetonsVoix(charge?.usage, text, 'entree'));
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(audio);
  } catch (error) {
    console.error('Synthèse vocale indisponible :', error);
    return res.status(502).json({ error: { code: 'ERR_TTS_FAILED' } });
  }
}
