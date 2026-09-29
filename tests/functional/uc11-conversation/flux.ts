// UC-11 — Fabrique de flux SSE au format de chaque fournisseur, pour la
// doublure de fetch (tests/helpers/fetch.ts). Utilitaire PROPRE à ce cas
// d'utilisation : il n'est pas partagé avec les autres dossiers de tests.
import type { Reponse } from '../../helpers/fetch';

const sse = (evenements: unknown[], fin = '') =>
  evenements.map(e => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('') + fin;

export const ENTETE_SSE = { 'content-type': 'text/event-stream' };

/** Flux Mistral (API conversations). */
export function fluxMistral(fragments: string[], usage = { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 }): Reponse {
  return {
    headers: ENTETE_SSE,
    text: sse([
      ...fragments.map(content => ({ type: 'message.output.delta', content })),
      { type: 'conversation.response.done', usage },
    ]),
  };
}

/** Flux Anthropic (Messages API) : entrée dans message_start, sortie dans message_delta. */
export function fluxAnthropic(fragments: string[], entree = 30, sortie = 10): Reponse {
  return {
    headers: ENTETE_SSE,
    text: sse([
      { type: 'message_start', message: { usage: { input_tokens: entree } } },
      { type: 'content_block_start', index: 0 },
      ...fragments.map(text => ({ type: 'content_block_delta', delta: { type: 'text_delta', text } })),
      { type: 'message_delta', usage: { output_tokens: sortie } },
      { type: 'message_stop' },
    ]),
  };
}

/** Flux OpenAI / Grok (Responses API). */
export function fluxOpenAi(fragments: string[], usage = { input_tokens: 5, output_tokens: 7, total_tokens: 12 }): Reponse {
  return {
    headers: ENTETE_SSE,
    text: sse([
      ...fragments.map(delta => ({ type: 'response.output_text.delta', delta })),
      { type: 'response.completed', response: { usage } },
    ]),
  };
}

/** Flux « chat/completions » (OpenRouter et fournisseurs compatibles OpenAI). */
export function fluxChatCompletions(fragments: string[], usage = { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 }): Reponse {
  return {
    headers: ENTETE_SSE,
    text: sse([
      ...fragments.map(content => ({ choices: [{ delta: { content } }] })),
      { choices: [{ delta: {} }], usage },
      '[DONE]',
    ]),
  };
}

/** Réponse complète (non streamée) au dialecte « chat/completions ». */
export function reponseChat(texte: string, usage = { prompt_tokens: 9, completion_tokens: 6, total_tokens: 15 }): Reponse {
  return { json: { choices: [{ message: { content: texte } }], usage } };
}

/** Réponse complète Mistral (API conversations). */
export function reponseMistral(texte: string, usage = { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 }): Reponse {
  return { json: { outputs: [{ content: texte }], usage } };
}

/** Relit le corps JSON envoyé au fournisseur par un appel de la doublure. */
export function corpsEnvoye(espion: { mock: { calls: any[][] } }, index = -1): any {
  const appels = espion.mock.calls;
  const appel = appels[index < 0 ? appels.length + index : index];
  return JSON.parse(String(appel[1]?.body ?? '{}'));
}

/** En-têtes envoyés au fournisseur par un appel de la doublure. */
export function entetesEnvoyes(espion: { mock: { calls: any[][] } }, index = -1): Record<string, string> {
  const appels = espion.mock.calls;
  const appel = appels[index < 0 ? appels.length + index : index];
  return (appel[1]?.headers ?? {}) as Record<string, string>;
}
