import type { NextApiRequest, NextApiResponse } from 'next';
import { getClientIp, isRateLimited, mayUseServerKeys } from '../../server/access';
import { controlerCleEcole, estRefus, jetonsVoix, journaliserCleEcole, type AccesCleEcole } from '../../server/cleEcole';
import { DeveloperKeys } from '../../utils/env';
import { requireAuth } from '../../server/token';
import { readUserKey } from '../../server/userKeys';
import { ERR, isProviderId, providerDefaults } from '../../shared/providers';

// Transcription vocale — clé personnelle, ou clé de l'école sur son réseau.
//
// Le navigateur enregistre l'audio (MediaRecorder) et l'envoie ici en base64 ;
// on le relaie à l'API de transcription du fournisseur choisi. La clé est
// celle de l'utilisateur (saisie ou mémorisée) ; à défaut, sur le réseau
// ouvert d'une école, la clé INTERNE — et alors avec les mêmes contrôles et le
// même décompte que le chat (src/server/cleEcole.ts). L'audio n'est jamais
// stocké ; seule la consommation payée par une école est journalisée.
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
  // `usage` est rendu par les deux fournisseurs quand ils le peuvent : c'est
  // lui, et non une estimation, qui sert au décompte d'une école.
  return { text: String(data?.text ?? ''), usage: data?.usage, model };
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
  // Accès à la clé de l'école, si c'est elle qui paie : ce qu'il faut pour
  // journaliser et décompter après l'appel. null = clé personnelle.
  let cleEcole: AccesCleEcole | null = null;
  if (!apiKey) {
    const account = requireAuth(req);
    if (account) apiKey = readUserKey(account.email, provider) ?? '';
  }
  // La DICTÉE d'une classe est payée par la clé de l'école, comme le chat.
  // Sans cela, « l'élève parle à son téléphone » resterait réservé à qui
  // apporte sa propre clé — c'est-à-dire à personne, en classe.
  if (!apiKey && await mayUseServerKeys(clientIp)) {
    // MÊMES GARDES, DANS LE MÊME ORDRE, QUE /api/completion — et par les mêmes
    // fonctions (controlerCleEcole) : fournisseur écarté ou à drapeau rouge,
    // fournisseurs de la séance, porte-monnaie de l'école, plafond mensuel et
    // quota par élève. La dictée dépensait jusqu'ici la clé d'une école à sec
    // sans rien vérifier ni décompter : un micro n'est pas une porte dérobée
    // vers le budget d'un collège. Le refus tombe AVANT l'appel au
    // fournisseur, sinon l'école paierait l'appel qu'on lui refuse.
    const clientId = /^[a-f0-9-]{8,64}$/i.test(String(body.clientId ?? '')) ? String(body.clientId) : '';
    const acces = controlerCleEcole(clientIp, provider, clientId);
    if (estRefus(acces)) return res.status(acces.status).json({ error: { code: acces.code } });
    apiKey = String(DeveloperKeys[provider] || '').trim();
    if (apiKey) cleEcole = acces;
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
    let resultat: { text: string; usage: any; model: string };
    if (provider === 'openai') {
      try {
        resultat = await transcribeUpstream('https://api.openai.com/v1/audio/transcriptions', apiKey, 'gpt-4o-mini-transcribe', blob, filename);
      } catch {
        // Modèle indisponible sur certains comptes : whisper-1 en repli.
        resultat = await transcribeUpstream('https://api.openai.com/v1/audio/transcriptions', apiKey, 'whisper-1', blob, filename);
      }
    } else {
      resultat = await transcribeUpstream('https://api.mistral.ai/v1/audio/transcriptions', apiKey, 'voxtral-mini-latest', blob, filename);
    }
    const { text } = resultat;
    // Dictée payée par l'école : elle appartient à la facture au même titre
    // qu'un message, et se DÉCOMPTE comme lui — même ligne de journal (jetons
    // ventilés, prix figés, montant), même prélèvement, même transaction. Le
    // modèle inscrit est celui qui a réellement répondu (repli whisper-1
    // compris) : c'est lui qui porte le prix. Jetons rendus par le
    // fournisseur, sinon estimés depuis le texte obtenu (jetonsVoix).
    if (cleEcole) {
      journaliserCleEcole(clientIp, cleEcole, provider, resultat.model,
        jetonsVoix(resultat.usage, text, 'sortie'));
    }
    return res.status(200).json({ text });
  } catch (error: any) {
    console.error(`Erreur de transcription ${provider} :`, error?.message);
    return res.status(502).json({ error: { code: ERR.UPSTREAM } });
  }
}
