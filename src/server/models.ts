// Catalogue des modèles proposés, par fournisseur.
//
// Le champ « Modèle » du chat reste librement éditable — c'est ce qui permet
// d'utiliser un modèle sorti ce matin — mais il propose une LISTE, pour
// éviter la faute de frappe qui produit un 404 incompréhensible.
//
// RÈGLE ABSOLUE : ne proposer que des identifiants que le fournisseur
// accepterait VRAIMENT. Une liste qui a l'air officielle et qui échoue est
// PIRE qu'un champ vide, parce qu'on lui fait confiance. D'où une seule
// source de vérité : la liste NATIVE du fournisseur (/v1/models), interrogée
// avec la clé du serveur si elle existe, sinon avec celle du visiteur qui
// vient justement de la saisir.
//
// Les identifiants d'OpenRouter ne sont PAS ceux des éditeurs : OpenRouter
// écrit « anthropic/claude-haiku-4.5 » là où Anthropic attend
// « claude-haiku-4-5 », « qwen/qwen-2.5-72b-instruct » là où DashScope attend
// « qwen2.5-72b-instruct ». Son catalogue ne sert donc qu'à trois
// fournisseurs dont l'identifiant se déduit exactement du sien — et à
// lui-même, où le « éditeur/modèle » complet est la bonne écriture.
//
// Le résultat est mis en cache dans un simple fichier JSON du volume de
// données, rafraîchi au plus une fois par jour et JAMAIS de façon bloquante :
// une panne du catalogue laisse l'ancienne liste en place.

import fs from 'fs';
import path from 'path';
import { DataDir, DeveloperKeys } from '../utils/env';
import { PROVIDER_IDS, providerDefaults, type ProviderId } from '../shared/providers';

const CACHE_FILE = path.join(DataDir, 'models.json');
const TTL_MS = 24 * 60 * 60 * 1000;      // une fois par jour
const FETCH_TIMEOUT_MS = 12_000;
// Aucune troncature en pratique (le plus gros catalogue, OpenRouter, tient
// largement dessous) : une liste amputée alphabétiquement serait pire que pas
// de liste du tout.
const MAX_PER_PROVIDER = 500;

/** D'où vient la liste — utile pour savoir si une clé peut l'améliorer. */
type Source = 'native' | 'openrouter' | 'defaut';
type Entry = { at: number; source: Source; models: string[] };
type Cache = { entries: Partial<Record<ProviderId, Entry>> };

let memory: Cache | null = null;
/** Une seule interrogation en vol par fournisseur (démarrage à froid). */
const inflight = new Map<ProviderId, Promise<Entry>>();
/** Dernier essai natif infructueux, pour ne pas marteler l'éditeur. */
const echecs = new Map<ProviderId, number>();
const RETRY_MS = 60_000;

/**
 * Endpoint natif de listage. `key: false` = catalogue public.
 * Les cinq fournisseurs chinois parlent le dialecte OpenAI : leur base
 * expose donc /models comme les autres.
 */
const NATIVE: Partial<Record<ProviderId, { url: string; auth: 'bearer' | 'x-api-key' | 'x-goog' | 'aucune' }>> = {
  openai: { url: 'https://api.openai.com/v1/models', auth: 'bearer' },
  anthropic: { url: 'https://api.anthropic.com/v1/models', auth: 'x-api-key' },
  mistral: { url: 'https://api.mistral.ai/v1/models', auth: 'bearer' },
  grok: { url: 'https://api.x.ai/v1/models', auth: 'bearer' },
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/models', auth: 'x-goog' },
  openrouter: { url: 'https://openrouter.ai/api/v1/models', auth: 'aucune' },
  deepseek: { url: 'https://api.deepseek.com/models', auth: 'bearer' },
  qwen: { url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models', auth: 'bearer' },
  kimi: { url: 'https://api.moonshot.ai/v1/models', auth: 'bearer' },
  glm: { url: 'https://open.bigmodel.cn/api/paas/v4/models', auth: 'bearer' },
  minimax: { url: 'https://api.minimax.io/v1/models', auth: 'bearer' },
};

/**
 * Fournisseurs dont l'identifiant natif est EXACTEMENT le suffixe de la
 * référence OpenRouter (« openai/gpt-5 » → « gpt-5 »). Vérifié un par un :
 * pour tous les autres, la transformation serait une devinette.
 */
// Un catalogue de fournisseur mélange conversation, images, audio, embeddings
// et traduction en direct. Le champ « Modèle » ne sert qu'à converser : le
// reste n'est pas une option, c'est du bruit qui noie les vrais choix —
// DashScope en renvoie 151, dont la moitié ne sait pas tenir un dialogue.
const PAS_CONVERSATIONNEL =
  /(image|video|audio|tts|asr|speech|embed|rerank|ocr|moderation|whisper|guard|realtime|livetranslate|banana|lyria|robotics|veo|imagen|codex|coder|fim)/i;

const FROM_OPENROUTER: Partial<Record<ProviderId, string>> = {
  openai: 'openai/',
  gemini: 'google/',
  grok: 'x-ai/',
};

/**
 * Modèles qui ne répondent pas à une conversation : plongements, audio,
 * image, modération, complétion brute. Les proposer, c'est offrir une
 * erreur 400 en libre-service.
 */
const NON_CONVERSATIONNEL = [
  'embed', 'whisper', 'tts', '-audio', 'audio-', 'realtime', 'transcribe', 'speech',
  'moderation', 'dall-e', 'imagen', 'veo-', 'sora', 'image', 'rerank', 'guard',
  'babbage', 'davinci', 'ocr', 'similarity', 'search-query', 'search-document',
];

function readCache(): Cache {
  if (memory) return memory;
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as Cache;
    memory = parsed && typeof parsed === 'object' && parsed.entries ? parsed : { entries: {} };
  } catch {
    memory = { entries: {} };
  }
  return memory;
}

function writeCache(cache: Cache) {
  memory = cache;
  try {
    // Écriture atomique : un lecteur ne doit jamais tomber sur un fichier
    // à moitié écrit.
    const temporary = `${CACHE_FILE}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(cache), 'utf8');
    fs.renameSync(temporary, CACHE_FILE);
  } catch (error) {
    console.error('Catalogue de modèles non enregistré :', error);
  }
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<any | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/** Identifiants extraits d'une réponse, quel que soit le dialecte. */
function idsFrom(data: any): string[] {
  if (Array.isArray(data?.data)) {
    return data.data.map((m: any) => String(m?.id ?? '')).filter(Boolean);
  }
  // Gemini : { models: [{ name: "models/gemini-..." }] }
  if (Array.isArray(data?.models)) {
    return data.models.map((m: any) => String(m?.name ?? '').replace(/^models\//, '')).filter(Boolean);
  }
  return [];
}

/** Catalogue public d'OpenRouter, mémorisé le temps d'un rafraîchissement. */
let openrouterIds: { at: number; ids: string[] } | null = null;
async function openrouterCatalogue(): Promise<string[]> {
  if (openrouterIds && Date.now() - openrouterIds.at < TTL_MS) return openrouterIds.ids;
  const ids = idsFrom(await fetchJson('https://openrouter.ai/api/v1/models', {}));
  if (ids.length) openrouterIds = { at: Date.now(), ids };
  return ids;
}

function headersFor(auth: string, key: string): Record<string, string> {
  if (auth === 'x-api-key') return { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  if (auth === 'x-goog') return { 'x-goog-api-key': key };
  if (auth === 'bearer') return { Authorization: `Bearer ${key}` };
  return {};
}

/** Nettoie, garantit le modèle par défaut, trie et borne. */
function finalise(provider: ProviderId, models: string[]): string[] {
  const retenus = models.filter(id => {
    const bas = id.toLowerCase();
    return !NON_CONVERSATIONNEL.some(mot => bas.includes(mot));
  });
  // Le modèle par défaut est TOUJOURS proposé, même catalogue vide : c'est
  // celui que le champ contient à l'ouverture.
  const uniques = new Set([...retenus, providerDefaults[provider].model]);
  return Array.from(uniques)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, MAX_PER_PROVIDER);
}

/** Reconstruit la liste d'UN fournisseur. Ne lève jamais. */
async function build(provider: ProviderId, key: string): Promise<Entry> {
  const native = NATIVE[provider];
  if (native && (key || native.auth === 'aucune')) {
    const ids = idsFrom(await fetchJson(native.url, headersFor(native.auth, key)))
      .filter(id => !PAS_CONVERSATIONNEL.test(id));
    if (ids.length) return { at: Date.now(), source: 'native', models: finalise(provider, ids) };
  }

  const prefixe = FROM_OPENROUTER[provider];
  if (prefixe) {
    const ids = (await openrouterCatalogue())
      .filter(id => id.startsWith(prefixe))
      // « :free », « :nitro »… sont des variantes de routage propres à
      // OpenRouter : elles n'existent pas chez l'éditeur d'origine.
      .map(id => id.slice(prefixe.length).split(':')[0]);
    if (ids.length) return { at: Date.now(), source: 'openrouter', models: finalise(provider, ids) };
  }

  // Sans clé et sans source fiable, une seule certitude : le défaut.
  return { at: Date.now(), source: 'defaut', models: finalise(provider, []) };
}

function refresh(provider: ProviderId, key: string): Promise<Entry> {
  const encours = inflight.get(provider);
  if (encours) return encours;
  const promesse = build(provider, key)
    .then(entry => {
      const cache = readCache();
      cache.entries[provider] = entry;
      writeCache(cache);
      return entry;
    })
    .catch(() => ({ at: Date.now(), source: 'defaut' as Source, models: finalise(provider, []) }))
    .finally(() => { inflight.delete(provider); });
  inflight.set(provider, promesse);
  return promesse;
}

/**
 * Liste pour un fournisseur. `key` est la clé du visiteur, quand il en a
 * saisi (ou mémorisé) une : elle ne sert qu'à demander au fournisseur sa
 * propre liste, n'est jamais journalisée ni conservée.
 *
 * Ne bloque jamais plus que nécessaire : si le cache est périmé, on renvoie
 * l'ancien et on rafraîchit en arrière-plan ; s'il est vide, on attend.
 */
export async function getModels(provider: ProviderId, key = ''): Promise<{ models: string[]; updatedAt: number; source: Source }> {
  const cle = (key || String(DeveloperKeys[provider] || '')).trim();
  const cache = readCache();
  const entry = cache.entries[provider];
  const perime = !entry || Date.now() - entry.at > TTL_MS;

  // Une clé vient d'apparaître alors que la liste en cache n'était qu'un
  // repli : on peut faire mieux TOUT DE SUITE, sans attendre l'échéance du
  // jour. Mais une clé fautive ne doit pas relancer un appel à chaque
  // frappe — d'où la minute de purgatoire.
  const echoueRecemment = Date.now() - (echecs.get(provider) ?? 0) < RETRY_MS;
  const ameliorable = !!cle && !!NATIVE[provider] && entry?.source !== 'native' && !echoueRecemment;

  if (!entry || ameliorable) {
    const frais = await refresh(provider, cle);
    if (cle && frais.source !== 'native') echecs.set(provider, Date.now());
    return { models: frais.models, updatedAt: frais.at, source: frais.source };
  }
  if (perime) void refresh(provider, cle);

  return { models: entry.models, updatedAt: entry.at, source: entry.source };
}

/** Fournisseurs connus — utilisé par le rafraîchissement de fond éventuel. */
export const CATALOGUE_PROVIDERS = PROVIDER_IDS;

/** État du cache, pour l'administration : d'où vient chaque liste, et quand. */
export function catalogueStatus(): Array<{ provider: ProviderId; source: Source | 'jamais'; count: number; at: number }> {
  const cache = readCache();
  return PROVIDER_IDS.map(provider => {
    const entry = cache.entries[provider];
    return {
      provider,
      source: entry?.source ?? 'jamais',
      count: entry?.models.length ?? 0,
      at: entry?.at ?? 0,
    };
  });
}

/**
 * Reconstruction IMMÉDIATE de tout le catalogue, sans attendre l'échéance du
 * jour. C'est ce que déclenche le bouton de l'administration : après avoir
 * posé une clé qui manquait, on veut voir la vraie liste tout de suite plutôt
 * que le lendemain.
 */
export async function refreshAllModels(): Promise<Array<{ provider: ProviderId; source: Source; count: number }>> {
  openrouterIds = null;   // le catalogue public aussi doit être relu
  echecs.clear();
  return Promise.all(PROVIDER_IDS.map(async provider => {
    const entry = await refresh(provider, String(DeveloperKeys[provider] || '').trim());
    return { provider, source: entry.source, count: entry.models.length };
  }));
}
