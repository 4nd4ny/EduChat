// Catalogue des modèles disponibles, par fournisseur.
//
// Le champ « Modèle » du chat reste librement éditable — c'est ce qui permet
// d'utiliser un modèle sorti ce matin — mais il propose désormais une LISTE,
// pour éviter la faute de frappe qui produit un 404 incompréhensible.
//
// Deux sources, par ordre de fiabilité :
//  1. l'API du fournisseur lui-même (/v1/models), quand le serveur dispose de
//     sa clé : ce sont les identifiants NATIFS, exacts par construction ;
//  2. à défaut, le catalogue PUBLIC d'OpenRouter (aucune clé requise), qui
//     recense les modèles de presque tous ces éditeurs sous la forme
//     « éditeur/modèle » — on retire le préfixe pour retrouver l'identifiant
//     natif. Approximation assumée : ces identifiants sont INDICATIFS, d'où
//     le maintien de la saisie libre.
//
// Le résultat est mis en cache dans un simple fichier JSON du volume de
// données, rafraîchi au plus une fois par jour et JAMAIS de façon bloquante :
// une panne du catalogue laisse l'ancienne liste en place.

import fs from 'fs';
import path from 'path';
import { DataDir } from '../utils/env';
import { DeveloperKeys } from '../utils/env';
import { PROVIDER_IDS, providerDefaults, type ProviderId } from '../shared/providers';

const CACHE_FILE = path.join(DataDir, 'models.json');
const TTL_MS = 24 * 60 * 60 * 1000;      // une fois par jour
const FETCH_TIMEOUT_MS = 12_000;
// Aucune troncature en pratique (le plus gros catalogue, OpenRouter, tient
// largement dessous) : une liste amputée alphabétiquement serait pire que pas
// de liste du tout.
const MAX_PER_PROVIDER = 500;

type Cache = { fetchedAt: number; providers: Partial<Record<ProviderId, string[]>> };

let memory: Cache | null = null;
let refreshing = false;

/** Préfixe d'éditeur OpenRouter → fournisseur EduChat. */
const VENDOR_TO_PROVIDER: Record<string, ProviderId> = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'gemini',
  'x-ai': 'grok',
  mistralai: 'mistral',
  deepseek: 'deepseek',
  qwen: 'qwen',
  moonshotai: 'kimi',
  'z-ai': 'glm',
  thudm: 'glm',
  minimax: 'minimax',
};

/** Endpoint natif de listage, pour les fournisseurs dont le serveur a la clé. */
const NATIVE_LIST: Partial<Record<ProviderId, { url: string; auth: 'bearer' | 'x-api-key' | 'x-goog' }>> = {
  openai: { url: 'https://api.openai.com/v1/models', auth: 'bearer' },
  anthropic: { url: 'https://api.anthropic.com/v1/models', auth: 'x-api-key' },
  mistral: { url: 'https://api.mistral.ai/v1/models', auth: 'bearer' },
  grok: { url: 'https://api.x.ai/v1/models', auth: 'bearer' },
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/models', auth: 'x-goog' },
};

function readCache(): Cache {
  if (memory) return memory;
  try {
    memory = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as Cache;
  } catch {
    memory = { fetchedAt: 0, providers: {} };
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

/** Reconstruit tout le catalogue. Ne lève jamais. */
async function refresh(): Promise<Cache> {
  const providers: Partial<Record<ProviderId, string[]>> = {};

  // 1. Catalogue public OpenRouter — la source qui couvre tout le monde.
  const openrouter = await fetchJson('https://openrouter.ai/api/v1/models', {});
  const openrouterIds = idsFrom(openrouter);
  if (openrouterIds.length) {
    providers.openrouter = openrouterIds;
    for (const id of openrouterIds) {
      const [vendor, ...rest] = id.split('/');
      const target = VENDOR_TO_PROVIDER[vendor];
      if (!target || !rest.length) continue;
      // « :free », « :nitro »… sont des variantes de routage propres à
      // OpenRouter : elles n'existent pas chez l'éditeur d'origine.
      const native = rest.join('/').split(':')[0];
      (providers[target] ??= []).push(native);
    }
  }

  // 2. Listes NATIVES quand le serveur a la clé : elles font autorité.
  await Promise.all(Object.entries(NATIVE_LIST).map(async ([id, source]) => {
    const provider = id as ProviderId;
    const key = String(DeveloperKeys[provider] || '').trim();
    if (!key) return;
    const headers: Record<string, string> = source.auth === 'bearer'
      ? { Authorization: `Bearer ${key}` }
      : source.auth === 'x-api-key'
        ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
        : { 'x-goog-api-key': key };
    const ids = idsFrom(await fetchJson(source.url, headers));
    if (ids.length) providers[provider] = ids;
  }));

  // 3. Le modèle par défaut est TOUJOURS proposé, même catalogue vide.
  for (const provider of PROVIDER_IDS) {
    const list = new Set([...(providers[provider] ?? []), providerDefaults[provider].model]);
    providers[provider] = Array.from(list)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, MAX_PER_PROVIDER);
  }

  const cache: Cache = { fetchedAt: Date.now(), providers };
  writeCache(cache);
  return cache;
}

/**
 * Liste pour un fournisseur. Ne bloque jamais plus que nécessaire : si le
 * cache est périmé, on renvoie l'ancien et on rafraîchit en arrière-plan ;
 * s'il est vide (premier appel), on attend le rafraîchissement.
 */
export async function getModels(provider: ProviderId): Promise<{ models: string[]; updatedAt: number }> {
  let cache = readCache();
  const stale = Date.now() - cache.fetchedAt > TTL_MS;

  if (!cache.fetchedAt) {
    cache = await refresh();
  } else if (stale && !refreshing) {
    refreshing = true;
    void refresh().finally(() => { refreshing = false; });
  }

  return {
    models: cache.providers[provider] ?? [providerDefaults[provider].model],
    updatedAt: cache.fetchedAt,
  };
}
