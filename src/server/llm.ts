// Appels aux fournisseurs LLM — construction des requêtes et lecture des flux.
//
// Ce module centralise ce qui était éclaté dans api/completion.ts : pour chaque
// fournisseur, UNE fonction construit la requête HTTP (streamée ou non) et UNE
// autre sait lire son flux SSE. La route API garde toute la logique d'accès
// (clés, quotas, journal) ; ici on ne parle qu'aux API amont.
//
// Streaming : tous les fournisseurs sauf Gemini (l'API interactions utilisée ne
// documente pas de flux SSE stable — il retombe en réponse complète, que la
// route renvoie alors d'un bloc). Le repli gratuit reste volontairement en
// texte non streamé (exigence produit).

import type { Attachment, ProviderId, ReasoningLevel } from '../shared/providers';

export type WireMessage = { role: string; content: any };

export type ProviderCallOpts = {
  provider: ProviderId;
  model: string;
  apiKey: string;
  /** Messages user/assistant seuls (Anthropic porte le system à part). */
  messages: WireMessage[];
  /** Mêmes messages précédés du message system (APIs à liste unique). */
  withSystem: WireMessage[];
  system: string;
  reasoning: ReasoningLevel;
  webSearch: boolean;
  /** Repli gratuit : paramétrage minimal (pas de reasoning, petit max_tokens). */
  freeMode: boolean;
  stream: boolean;
  /** Pièces jointes (images/PDF) du DERNIER message utilisateur — BYOK uniquement. */
  attachments?: Attachment[];
};

/**
 * Rattache les pièces jointes au dernier message utilisateur, dans le dialecte
 * multimodal du fournisseur. Chaque API a sa forme :
 *  - Anthropic : blocs {type:image|document, source:{type:base64,...}} ;
 *  - OpenAI/Grok (Responses) : input_text / input_image / input_file (data-URL) ;
 *  - OpenRouter (chat completions) : text / image_url / file (data-URL) ;
 *  - Mistral (conversations) : text / image_url (images seulement).
 * La validation (clé perso, capacités, tailles) est faite AVANT, dans la route.
 */
function withAttachments(messages: WireMessage[], provider: ProviderId, attachments: Attachment[]): WireMessage[] {
  if (!attachments.length) return messages;
  const lastUser = messages.map(m => m.role).lastIndexOf('user');
  if (lastUser < 0) return messages;

  return messages.map((message, index) => {
    if (index !== lastUser) return message;
    const text = String(message.content ?? '');
    const dataUrl = (a: Attachment) => `data:${a.mediaType};base64,${a.data}`;

    if (provider === 'anthropic') {
      const blocks: any[] = attachments.map(a => a.kind === 'image'
        ? { type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.data } }
        : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data } });
      return { role: 'user', content: [...blocks, { type: 'text', text }] };
    }
    if (provider === 'openai' || provider === 'grok') {
      const parts: any[] = attachments.map(a => a.kind === 'image'
        ? { type: 'input_image', image_url: dataUrl(a) }
        : { type: 'input_file', filename: a.name || 'document.pdf', file_data: dataUrl(a) });
      return { role: 'user', content: [...parts, { type: 'input_text', text }] };
    }
    if (provider === 'openrouter') {
      const parts: any[] = attachments.map(a => a.kind === 'image'
        ? { type: 'image_url', image_url: { url: dataUrl(a) } }
        : { type: 'file', file: { filename: a.name || 'document.pdf', file_data: dataUrl(a) } });
      return { role: 'user', content: [...parts, { type: 'text', text }] };
    }
    if (provider === 'mistral') {
      const parts: any[] = attachments.filter(a => a.kind === 'image')
        .map(a => ({ type: 'image_url', image_url: dataUrl(a) }));
      return { role: 'user', content: [...parts, { type: 'text', text }] };
    }
    return message; // gemini : pièces jointes refusées en amont
  });
}

/** Le fournisseur sait-il streamer via ce module ? */
export function canStreamProvider(provider: ProviderId): boolean {
  return provider !== 'gemini';
}

/** Construit URL + init fetch pour un appel de complétion, streamé ou non. */
export function buildProviderRequest(raw: ProviderCallOpts): { url: string; init: RequestInit } {
  const attachments = raw.attachments ?? [];
  const o: ProviderCallOpts = attachments.length
    ? {
      ...raw,
      messages: withAttachments(raw.messages, raw.provider, attachments),
      withSystem: withAttachments(raw.withSystem, raw.provider, attachments),
    }
    : raw;
  if (o.provider === 'openai' || o.provider === 'grok') {
    return {
      url: o.provider === 'openai' ? 'https://api.openai.com/v1/responses' : 'https://api.x.ai/v1/responses',
      init: {
        method: 'POST',
        headers: { Authorization: `Bearer ${o.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: o.model,
          input: o.withSystem,
          reasoning: { effort: o.reasoning },
          ...(o.webSearch ? { tools: [{ type: o.provider === 'openai' ? 'web_search_preview' : 'web_search' }] } : {}),
          ...(o.stream ? { stream: true } : {}),
        }),
      },
    };
  }
  if (o.provider === 'anthropic') {
    const budgets: Record<ReasoningLevel, number> = { low: 1024, medium: 4096, high: 8192 };
    return {
      url: 'https://api.anthropic.com/v1/messages',
      init: {
        method: 'POST',
        headers: {
          'x-api-key': o.apiKey, 'anthropic-version': '2023-06-01',
          'anthropic-beta': 'web-search-2025-03-05', 'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: o.model, messages: o.messages, max_tokens: Math.max(4096, budgets[o.reasoning] + 2048),
          ...(o.system ? { system: o.system } : {}),
          thinking: { type: 'enabled', budget_tokens: budgets[o.reasoning] },
          ...(o.webSearch ? { tools: [{ type: 'web_search_20250305', name: 'web_search' }] } : {}),
          ...(o.stream ? { stream: true } : {}),
        }),
      },
    };
  }
  if (o.provider === 'gemini') {
    return {
      url: 'https://generativelanguage.googleapis.com/v1beta/interactions',
      init: {
        method: 'POST',
        headers: { 'x-goog-api-key': o.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: o.model, input: o.withSystem,
          ...(o.webSearch ? { tools: [{ type: 'google_search' }] } : {}),
          reasoning: { effort: o.reasoning },
        }),
      },
    };
  }
  if (o.provider === 'openrouter') {
    return {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      init: {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${o.apiKey}`, 'Content-Type': 'application/json',
          'HTTP-Referer': 'https://educh.at', 'X-Title': 'EduChat', // attribution recommandée par OpenRouter
        },
        body: JSON.stringify({
          model: o.model, messages: o.withSystem, max_tokens: 2048,
          // Pas de « reasoning » sur le repli gratuit : le petit modèle gratuit
          // ne raisonne pas et le paramètre est inutile (voire mal supporté).
          ...(o.freeMode ? {} : { reasoning: { effort: o.reasoning } }),
          // Recherche web OpenRouter = plugin « web » (l'ancien pseudo-tool
          // « openrouter:web_search » était rejeté : « No endpoints found that
          // support tool use » sur tout modèle sans tools).
          ...(o.webSearch ? { plugins: [{ id: 'web' }] } : {}),
          // En flux, demander le décompte de tokens dans le dernier événement.
          ...(o.stream ? { stream: true, usage: { include: true } } : {}),
        }),
      },
    };
  }
  // mistral
  return {
    url: 'https://api.mistral.ai/v1/conversations',
    init: {
      method: 'POST',
      headers: { Authorization: `Bearer ${o.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: o.model, inputs: o.withSystem,
        ...(o.webSearch ? { tools: [{ type: 'web_search' }] } : {}),
        completion_args: { temperature: o.reasoning === 'low' ? 0.2 : 0.5 },
        ...(o.stream ? { stream: true } : {}),
      }),
    },
  };
}

/** Décompte de tokens tolérant aux vocabulaires des différents fournisseurs. */
export function tokensFromUsage(u: any): number {
  if (!u || typeof u !== 'object') return 0;
  return u.total_tokens ?? u.totalTokens
    ?? (u.input_tokens ?? u.prompt_tokens ?? 0) + (u.output_tokens ?? u.completion_tokens ?? 0);
}

/**
 * Appelle le fournisseur en STREAMING et relaie chaque fragment de texte via
 * onDelta. Résout avec le texte complet et le décompte de tokens (0 si le
 * fournisseur ne l'a pas fourni dans le flux). Lève si le flux échoue ou ne
 * produit AUCUN texte — l'appelant peut alors retenter en non-streamé.
 */
export async function streamProviderResponse(
  o: ProviderCallOpts,
  onDelta: (text: string) => void,
): Promise<{ text: string; tokens: number }> {
  const { url, init } = buildProviderRequest({ ...o, stream: true });
  const response = await fetch(url, init);
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    const detail = data?.error?.message ?? data?.message ?? `HTTP ${response.status}`;
    throw new Error(detail);
  }

  let text = '';
  let tokens = 0;
  let inputTokens = 0; // Anthropic sépare entrée (message_start) et sortie (message_delta)

  const push = (fragment: unknown) => {
    if (typeof fragment === 'string' && fragment) { text += fragment; onDelta(fragment); }
  };

  const handleEvent = (evt: any) => {
    if (!evt || typeof evt !== 'object') return;
    switch (o.provider) {
      case 'openai':
      case 'grok':
        if (evt.type === 'response.output_text.delta') push(evt.delta);
        else if (evt.type === 'response.completed') tokens = tokensFromUsage(evt.response?.usage);
        else if (evt.type === 'response.failed' || evt.type === 'error') {
          throw new Error(evt.response?.error?.message ?? evt.error?.message ?? 'response.failed');
        }
        break;
      case 'anthropic':
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') push(evt.delta.text);
        else if (evt.type === 'message_start') inputTokens = evt.message?.usage?.input_tokens ?? 0;
        else if (evt.type === 'message_delta') tokens = inputTokens + (evt.usage?.output_tokens ?? 0);
        else if (evt.type === 'error') throw new Error(evt.error?.message ?? 'stream error');
        break;
      case 'openrouter': {
        const delta = evt.choices?.[0]?.delta?.content;
        push(delta);
        if (evt.usage) tokens = tokensFromUsage(evt.usage);
        if (evt.error) throw new Error(evt.error?.message ?? 'stream error');
        break;
      }
      case 'mistral':
        if (evt.type === 'message.output.delta') {
          push(typeof evt.content === 'string' ? evt.content : evt.content?.text);
        } else if (evt.type === 'conversation.response.done') {
          tokens = tokensFromUsage(evt.usage);
        } else if (evt.type === 'conversation.response.error' || evt.type === 'error') {
          throw new Error(evt.message ?? evt.error?.message ?? 'stream error');
        }
        break;
      default:
        break; // gemini : jamais streamé ici (canStreamProvider)
    }
  };

  // Lecture SSE ligne à ligne : seules les lignes « data: ... » portent du JSON.
  const reader = (response.body as any).getReader
    ? (response.body as unknown as ReadableStream<Uint8Array>).getReader()
    : null;
  const decoder = new TextDecoder();
  let buffer = '';

  const processBuffer = (flush = false) => {
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).replace(/\r$/, '');
      buffer = buffer.slice(index + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try { handleEvent(JSON.parse(payload)); }
      catch (err) {
        if (err instanceof SyntaxError) continue; // fragment non-JSON : ignoré
        throw err;
      }
    }
    if (flush && buffer.startsWith('data:')) {
      const payload = buffer.slice(5).trim();
      buffer = '';
      if (payload && payload !== '[DONE]') {
        try { handleEvent(JSON.parse(payload)); } catch { /* fin de flux tronquée */ }
      }
    }
  };

  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      processBuffer();
    }
  } else {
    // Environnement sans ReadableStream (improbable sous Node 20) : tout lire.
    buffer += await response.text();
    processBuffer();
  }
  buffer += decoder.decode();
  processBuffer(true);

  if (!text) throw new Error('flux vide — aucun texte reçu du fournisseur');
  return { text, tokens };
}
