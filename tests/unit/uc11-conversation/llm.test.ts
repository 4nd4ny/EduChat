// UC-11 — Tests unitaires : dialectes des fournisseurs et lecture des flux
// (src/server/llm.ts). Aucun réseau : fetch est doublé.
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  buildProviderRequest, canStreamProvider, isOpenAiCompatible, streamProviderResponse,
  tokensDetail, tokensFromUsage, type ProviderCallOpts,
} from '../../../src/server/llm';
import { doublerFetch } from '../../helpers/fetch';
import {
  ENTETE_SSE, fluxAnthropic, fluxChatCompletions, fluxMistral, fluxOpenAi,
} from '../../functional/uc11-conversation/flux';
import type { ProviderId } from '../../../src/shared/providers';

afterEach(() => { vi.unstubAllGlobals(); });

const messages = [{ role: 'user', content: 'Pourquoi le ciel est-il bleu ?' }];
const system = 'Tu es un tuteur socratique.';

function opts(provider: ProviderId, extra: Partial<ProviderCallOpts> = {}): ProviderCallOpts {
  return {
    provider, model: 'modele-x', apiKey: 'cle-perso',
    messages, withSystem: [{ role: 'system', content: system }, ...messages], system,
    reasoning: 'medium', webSearch: false, freeMode: false, stream: false,
    ...extra,
  };
}

const corps = (p: ProviderId, extra: Partial<ProviderCallOpts> = {}) => {
  const { url, init } = buildProviderRequest(opts(p, extra));
  return { url, init, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> };
};

describe('isOpenAiCompatible / canStreamProvider', () => {
  it('reconnaît les cinq fournisseurs au dialecte chat/completions', () => {
    for (const p of ['deepseek', 'qwen', 'kimi', 'glm', 'minimax'] as ProviderId[]) expect(isOpenAiCompatible(p)).toBe(true);
    for (const p of ['mistral', 'anthropic', 'openai', 'openrouter', 'gemini', 'grok'] as ProviderId[]) {
      expect(isOpenAiCompatible(p)).toBe(false);
    }
  });

  it('seul Gemini ne sait pas streamer', () => {
    expect(canStreamProvider('gemini')).toBe(false);
    for (const p of ['mistral', 'anthropic', 'openai', 'openrouter', 'grok', 'deepseek'] as ProviderId[]) {
      expect(canStreamProvider(p)).toBe(true);
    }
  });
});

describe('buildProviderRequest — un dialecte par fournisseur', () => {
  it('OpenAI : API Responses, Bearer, effort de raisonnement, recherche web « preview »', () => {
    const { url, body, headers } = corps('openai', { webSearch: true, stream: true });
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(headers.Authorization).toBe('Bearer cle-perso');
    expect(body.input[0]).toEqual({ role: 'system', content: system });
    expect(body.reasoning).toEqual({ effort: 'medium' });
    expect(body.tools).toEqual([{ type: 'web_search_preview' }]);
    expect(body.stream).toBe(true);
  });

  it('Grok : même dialecte, autre URL et autre outil de recherche', () => {
    const { url, body } = corps('grok', { webSearch: true });
    expect(url).toBe('https://api.x.ai/v1/responses');
    expect(body.tools).toEqual([{ type: 'web_search' }]);
    expect(body.stream).toBeUndefined();
  });

  it('Anthropic : champ system dédié, x-api-key, budget de réflexion selon l’effort', () => {
    const bas = corps('anthropic', { reasoning: 'low' });
    expect(bas.url).toBe('https://api.anthropic.com/v1/messages');
    expect(bas.headers['x-api-key']).toBe('cle-perso');
    expect(bas.body.system).toBe(system);
    expect(bas.body.messages).toEqual(messages); // pas de message system dans la liste
    expect(bas.body.thinking).toEqual({ type: 'enabled', budget_tokens: 1024 });
    expect(bas.body.max_tokens).toBe(4096);
    const haut = corps('anthropic', { reasoning: 'high', webSearch: true });
    expect(haut.body.thinking.budget_tokens).toBe(8192);
    expect(haut.body.max_tokens).toBe(8192 + 2048);
    expect(haut.body.tools[0].type).toBe('web_search_20250305');
  });

  it('Anthropic sans prompt système : aucun champ system', () => {
    const { body } = corps('anthropic', { system: '', withSystem: messages });
    expect('system' in body).toBe(false);
  });

  it('Gemini : API interactions, jamais de stream même si demandé', () => {
    const { url, body, headers } = corps('gemini', { stream: true, webSearch: true });
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    expect(headers['x-goog-api-key']).toBe('cle-perso');
    expect(body.stream).toBeUndefined();
    expect(body.tools).toEqual([{ type: 'google_search' }]);
  });

  it('OpenRouter : raisonnement hors repli gratuit, plugin web, décompte demandé en flux', () => {
    const payant = corps('openrouter', { webSearch: true, stream: true });
    expect(payant.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(payant.headers['X-Title']).toBe('EduChat');
    expect(payant.body.reasoning).toEqual({ effort: 'medium' });
    expect(payant.body.plugins).toEqual([{ id: 'web' }]);
    expect(payant.body.usage).toEqual({ include: true });
    expect(payant.body.max_tokens).toBe(2048);
    const gratuit = corps('openrouter', { freeMode: true });
    expect(gratuit.body.reasoning).toBeUndefined();
    expect(gratuit.body.plugins).toBeUndefined();
  });

  it('fournisseurs compatibles OpenAI : corps minimal, sans raisonnement ni recherche web', () => {
    const { url, body } = corps('deepseek', { webSearch: true, stream: true, reasoning: 'high' });
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(Object.keys(body).sort()).toEqual(['max_tokens', 'messages', 'model', 'stream']);
    expect(corps('minimax').url).toBe('https://api.minimax.io/v1/text/chatcompletion_v2');
    expect(corps('qwen').url).toContain('dashscope-intl.aliyuncs.com');
    expect(corps('kimi').url).toContain('api.moonshot.ai');
    expect(corps('glm').url).toContain('open.bigmodel.cn');
  });

  it('Mistral : API conversations, température selon l’effort', () => {
    const bas = corps('mistral', { reasoning: 'low', webSearch: true, stream: true });
    expect(bas.url).toBe('https://api.mistral.ai/v1/conversations');
    expect(bas.body.inputs[0]).toEqual({ role: 'system', content: system });
    expect(bas.body.completion_args).toEqual({ temperature: 0.2 });
    expect(bas.body.tools).toEqual([{ type: 'web_search' }]);
    expect(bas.body.stream).toBe(true);
    expect(corps('mistral', { reasoning: 'high' }).body.completion_args.temperature).toBe(0.5);
  });
});

describe('buildProviderRequest — pièces jointes rattachées au DERNIER message utilisateur', () => {
  const image = { kind: 'image' as const, mediaType: 'image/png', name: 'schema.png', data: 'iVBORw0KGgo=' };
  const pdf = { kind: 'pdf' as const, mediaType: 'application/pdf', name: '', data: 'JVBERi0x' };
  const conversation = [
    { role: 'user', content: 'Première question' },
    { role: 'assistant', content: 'Réponse' },
    { role: 'user', content: 'Regarde ce document' },
  ];
  const avec = (p: ProviderId) => corps(p, {
    messages: conversation, withSystem: [{ role: 'system', content: system }, ...conversation],
    attachments: [image, pdf],
  }).body;

  it('Anthropic : blocs image/document en base64 puis le texte', () => {
    const dernier = avec('anthropic').messages[2];
    expect(dernier.content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: image.data } });
    expect(dernier.content[1].type).toBe('document');
    expect(dernier.content[2]).toEqual({ type: 'text', text: 'Regarde ce document' });
    expect(avec('anthropic').messages[0].content).toBe('Première question'); // les autres messages intacts
  });

  it('OpenAI : input_image / input_file en data-URL, nom par défaut du PDF', () => {
    const dernier = avec('openai').input[3];
    expect(dernier.content[0]).toEqual({ type: 'input_image', image_url: `data:image/png;base64,${image.data}` });
    expect(dernier.content[1]).toMatchObject({ type: 'input_file', filename: 'document.pdf' });
    expect(dernier.content[2]).toEqual({ type: 'input_text', text: 'Regarde ce document' });
  });

  it('OpenRouter : image_url / file', () => {
    const dernier = avec('openrouter').messages[3];
    expect(dernier.content[0].type).toBe('image_url');
    expect(dernier.content[1].type).toBe('file');
    expect(dernier.content[2]).toEqual({ type: 'text', text: 'Regarde ce document' });
  });

  it('Mistral et dialecte compatible : images seulement (le PDF est écarté)', () => {
    const mistral = avec('mistral').inputs[3];
    expect(mistral.content).toHaveLength(2);
    expect(mistral.content[0]).toEqual({ type: 'image_url', image_url: `data:image/png;base64,${image.data}` });
    const compatible = avec('qwen').messages[3];
    expect(compatible.content).toHaveLength(2);
    expect(compatible.content[0]).toEqual({ type: 'image_url', image_url: { url: `data:image/png;base64,${image.data}` } });
  });

  it('sans message utilisateur, rien n’est rattaché', () => {
    const seul = [{ role: 'assistant', content: 'Bonjour' }];
    const { body } = corps('anthropic', { messages: seul, withSystem: seul, attachments: [image] });
    expect(body.messages).toEqual(seul);
  });
});

describe('tokensDetail / tokensFromUsage', () => {
  it('lit les trois vocabulaires d’entrée/sortie', () => {
    expect(tokensDetail({ input_tokens: 3, output_tokens: 4 })).toEqual({ entree: 3, sortie: 4 });
    expect(tokensDetail({ prompt_tokens: 5, completion_tokens: 6 })).toEqual({ entree: 5, sortie: 6 });
    expect(tokensDetail({ inputTokens: 7, outputTokens: 8 })).toEqual({ entree: 7, sortie: 8 });
  });

  it('rend zéro pour une valeur absente ou non objet', () => {
    expect(tokensDetail(undefined)).toEqual({ entree: 0, sortie: 0 });
    expect(tokensDetail('12')).toEqual({ entree: 0, sortie: 0 });
    expect(tokensDetail({})).toEqual({ entree: 0, sortie: 0 });
  });

  it('préfère le total fourni, sinon additionne entrée et sortie', () => {
    expect(tokensFromUsage({ total_tokens: 99, input_tokens: 1 })).toBe(99);
    expect(tokensFromUsage({ totalTokens: 42 })).toBe(42);
    expect(tokensFromUsage({ prompt_tokens: 2, completion_tokens: 3 })).toBe(5);
    expect(tokensFromUsage({ input_tokens: 4, output_tokens: 1 })).toBe(5);
    expect(tokensFromUsage(null)).toBe(0);
  });
});

describe('streamProviderResponse — lecture des flux SSE', () => {
  async function lire(provider: ProviderId, reponse: Parameters<typeof doublerFetch>[0]) {
    const espion = doublerFetch(reponse);
    const fragments: string[] = [];
    const r = await streamProviderResponse(opts(provider), f => fragments.push(f));
    return { ...r, fragments, espion };
  }

  it('Mistral : fragments relayés, décompte en fin de conversation', async () => {
    const r = await lire('mistral', () => fluxMistral(['Bon', 'jour']));
    expect(r.fragments).toEqual(['Bon', 'jour']);
    expect(r.text).toBe('Bonjour');
    expect(r.tokens).toBe(20);
    expect(r.detail).toEqual({ entree: 12, sortie: 8 });
    // La requête part bien en mode flux.
    expect(JSON.parse(String(r.espion.mock.calls[0][1]?.body)).stream).toBe(true);
  });

  it('Mistral : contenu en objet { text }', async () => {
    const r = await lire('mistral', () => ({
      headers: ENTETE_SSE,
      text: `data: ${JSON.stringify({ type: 'message.output.delta', content: { text: 'Salut' } })}\n\n`,
    }));
    expect(r.text).toBe('Salut');
    expect(r.tokens).toBe(0);
  });

  it('Anthropic : entrée (message_start) + sortie (message_delta)', async () => {
    const r = await lire('anthropic', () => fluxAnthropic(['Qu’en ', 'penses-tu ?'], 30, 10));
    expect(r.text).toBe('Qu’en penses-tu ?');
    expect(r.tokens).toBe(40);
    expect(r.detail).toEqual({ entree: 30, sortie: 10 });
  });

  it('OpenAI : output_text.delta puis response.completed', async () => {
    const r = await lire('openai', () => fluxOpenAi(['A', 'B']));
    expect(r.text).toBe('AB');
    expect(r.tokens).toBe(12);
    expect(r.detail).toEqual({ entree: 5, sortie: 7 });
  });

  it('OpenRouter et compatibles : choices[0].delta.content, [DONE] ignoré', async () => {
    const r = await lire('openrouter', () => fluxChatCompletions(['x', 'y', 'z']));
    expect(r.text).toBe('xyz');
    expect(r.tokens).toBe(7);
    const k = await lire('kimi', () => fluxChatCompletions(['k']));
    expect(k.text).toBe('k');
  });

  it('tolère les fins de ligne CRLF, les lignes non « data: » et les fragments non JSON', async () => {
    const r = await lire('openrouter', () => ({
      headers: ENTETE_SSE,
      text: ': commentaire\r\nevent: x\r\ndata: {pas du json\r\n'
        + `data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })}\r\n\r\n`,
    }));
    expect(r.text).toBe('ok');
  });

  it('lit un dernier événement sans saut de ligne final', async () => {
    const r = await lire('openrouter', () => ({
      headers: ENTETE_SSE,
      text: `data: ${JSON.stringify({ choices: [{ delta: { content: 'a' } }] })}\n`
        + `data: ${JSON.stringify({ choices: [{ delta: { content: '' } }], usage: { total_tokens: 3 } })}`,
    }));
    expect(r.text).toBe('a');
    expect(r.tokens).toBe(3);
  });

  it('lève sur une réponse HTTP en erreur, avec le message du fournisseur', async () => {
    doublerFetch(() => ({ status: 401, json: { error: { message: 'clé invalide' } } }));
    await expect(streamProviderResponse(opts('mistral'), () => {})).rejects.toThrow('clé invalide');
    doublerFetch(() => ({ status: 500, text: 'panne' }));
    await expect(streamProviderResponse(opts('mistral'), () => {})).rejects.toThrow('HTTP 500');
  });

  it('lève sur un événement d’erreur dans le flux', async () => {
    doublerFetch(() => ({
      headers: ENTETE_SSE,
      text: `data: ${JSON.stringify({ type: 'error', error: { message: 'surcharge' } })}\n\n`,
    }));
    await expect(streamProviderResponse(opts('anthropic'), () => {})).rejects.toThrow('surcharge');
    doublerFetch(() => ({
      headers: ENTETE_SSE,
      text: `data: ${JSON.stringify({ type: 'response.failed', response: { error: { message: 'refus' } } })}\n\n`,
    }));
    await expect(streamProviderResponse(opts('openai'), () => {})).rejects.toThrow('refus');
    doublerFetch(() => ({
      headers: ENTETE_SSE,
      text: `data: ${JSON.stringify({ type: 'conversation.response.error', message: 'quota' })}\n\n`,
    }));
    await expect(streamProviderResponse(opts('mistral'), () => {})).rejects.toThrow('quota');
    doublerFetch(() => ({ headers: ENTETE_SSE, text: `data: ${JSON.stringify({ error: { message: 'amont' } })}\n\n` }));
    await expect(streamProviderResponse(opts('glm'), () => {})).rejects.toThrow('amont');
  });

  it('lève sur un flux vide (aucun texte), pour permettre la seconde chance non streamée', async () => {
    doublerFetch(() => ({ headers: ENTETE_SSE, text: 'data: [DONE]\n\n' }));
    await expect(streamProviderResponse(opts('openrouter'), () => {})).rejects.toThrow(/flux vide/);
  });
});
