import type { NextApiRequest, NextApiResponse } from 'next';
import { getClientIp, isRateLimited } from '../../server/access';
import { requireAuth } from '../../server/token';
import { readUserKey } from '../../server/userKeys';
import { ERR, isProviderId, providerDefaults } from '../../shared/providers';

// Transcription vocale — STRICTEMENT en clé personnelle (BYOK).
//
// Le navigateur enregistre l'audio (MediaRecorder) et l'envoie ici en base64 ;
// on le relaie à l'API de transcription du fournisseur choisi avec la clé de
// l'utilisateur. Aucune clé serveur n'est jamais utilisée : le vocal est un
// confort premium, pas un poste de dépense de la plateforme. L'audio n'est ni
// stocké ni journalisé.
//
// Fournisseurs : OpenAI (gpt-4o-mini-transcribe, repli whisper-1) et Mistral
// (voxtral-mini-latest) — les seuls du catalogue avec une API de transcription.

export const config = {
  api: { bodyParser: { sizeLimit: '30mb' } },
};

const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // 15 Mo d'audio (avant base64)

const AUDIO_MIME = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg'];

async function transcribeUpstream(url: string, apiKey: string, model: string, blob: Blob, filename: string) {
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('model', model);
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message ?? data?.message ?? `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return String(data?.text ?? '');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  const clientIp = getClientIp(req);
  if (await isRateLimited(clientIp, 20, 'transcribe')) {
    return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
  }

  const body = req.body ?? {};
  const provider = body.provider;
  const mimeType = String(body.mimeType || '');
  const audio = String(body.audio || '');

  if (!isProviderId(provider)) return res.status(400).json({ error: { code: ERR.PROVIDER } });

  // Clé saisie dans la page, ou clé mémorisée du compte (même règle que la
  // complétion) : dans les deux cas c'est la clé personnelle de l'utilisateur.
  let apiKey = String(body.apiKey || '').trim();
  if (!apiKey) {
    const account = requireAuth(req);
    if (account) apiKey = readUserKey(account.email, provider) ?? '';
  }
  if (!apiKey) return res.status(403).json({ error: { code: ERR.VOICE_KEY } });
  if (!providerDefaults[provider].voice) return res.status(400).json({ error: { code: ERR.VOICE_UNSUPPORTED } });
  // Le type porte parfois un codec (« audio/webm;codecs=opus ») : on compare la base.
  const baseMime = mimeType.split(';')[0].trim();
  if (!AUDIO_MIME.includes(baseMime) || !audio || audio.length > MAX_AUDIO_BYTES * 4 / 3 + 4) {
    return res.status(400).json({ error: { code: ERR.VOICE_INVALID } });
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(audio, 'base64');
  } catch {
    return res.status(400).json({ error: { code: ERR.VOICE_INVALID } });
  }
  if (!buffer.length || buffer.length > MAX_AUDIO_BYTES) {
    return res.status(400).json({ error: { code: ERR.VOICE_INVALID } });
  }

  const extension = baseMime === 'audio/mp4' ? 'm4a'
    : baseMime === 'audio/mpeg' ? 'mp3'
    : baseMime === 'audio/wav' ? 'wav'
    : baseMime === 'audio/ogg' ? 'ogg' : 'webm';
  const blob = new Blob([new Uint8Array(buffer)], { type: baseMime });
  const filename = `audio.${extension}`;

  try {
    let text: string;
    if (provider === 'openai') {
      try {
        text = await transcribeUpstream('https://api.openai.com/v1/audio/transcriptions', apiKey, 'gpt-4o-mini-transcribe', blob, filename);
      } catch {
        // Modèle indisponible sur certains comptes : whisper-1 en repli.
        text = await transcribeUpstream('https://api.openai.com/v1/audio/transcriptions', apiKey, 'whisper-1', blob, filename);
      }
    } else {
      text = await transcribeUpstream('https://api.mistral.ai/v1/audio/transcriptions', apiKey, 'voxtral-mini-latest', blob, filename);
    }
    return res.status(200).json({ text });
  } catch (error: any) {
    console.error(`Erreur de transcription ${provider} :`, error?.message);
    return res.status(502).json({ error: { code: ERR.UPSTREAM } });
  }
}
