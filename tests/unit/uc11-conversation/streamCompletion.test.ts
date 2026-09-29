// UC-11 — Tests unitaires : client de complétion (src/utils/streamCompletion.ts).
// Le même helper sert le chat et le duel : il masque la différence entre la
// réponse JSON complète et le flux NDJSON. fetch est doublé.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { requestCompletion, CompletionError } from '../../../src/utils/streamCompletion';
import { doublerFetch } from '../../helpers/fetch';

afterEach(() => { vi.unstubAllGlobals(); });

const NDJSON = { 'content-type': 'application/x-ndjson; charset=utf-8' };
const ndjson = (...evts: unknown[]) => evts.map(e => JSON.stringify(e)).join('\n') + '\n';
const corps = { provider: 'mistral', messages: [{ role: 'user', content: 'Bonjour' }] };

describe('requestCompletion — réponse JSON', () => {
  it('rend la réponse complète et transmet jeton, langue et demande de flux', async () => {
    const espion = doublerFetch(() => ({
      json: { reply: 'Salut', tokenUsage: 12, provider: 'openrouter', free: true, promptName: 'Socrate', promptVersion: 2 },
    }));
    const r = await requestCompletion(corps, {}, 'jeton-123');
    expect(r).toEqual({ reply: 'Salut', tokenUsage: 12, provider: 'openrouter', free: true, promptName: 'Socrate', promptVersion: 2 });
    const [url, init] = espion.mock.calls[0];
    expect(url).toBe('/api/completion');
    expect((init!.headers as any).Authorization).toBe('Bearer jeton-123');
    const envoye = JSON.parse(String(init!.body));
    expect(envoye.stream).toBe(false); // pas de onDelta → pas de flux
    expect(envoye.locale).toBe('fr');
  });

  it('sans jeton, aucun en-tête Authorization ; valeurs par défaut prudentes', async () => {
    const espion = doublerFetch(() => ({ json: {} }));
    const r = await requestCompletion(corps);
    expect((espion.mock.calls[0][1]!.headers as any).Authorization).toBeUndefined();
    expect(r).toEqual({ reply: '', tokenUsage: 0, provider: 'mistral', free: false });
  });

  it('une erreur HTTP devient une CompletionError portant le code du serveur', async () => {
    doublerFetch(() => ({ status: 402, json: { error: { code: 'ERR_SCHOOL_NO_CREDIT' } } }));
    const e = await requestCompletion(corps).catch(x => x);
    expect(e).toBeInstanceOf(CompletionError);
    expect(e.code).toBe('ERR_SCHOOL_NO_CREDIT');
    doublerFetch(() => ({ status: 500, text: 'pas du json' }));
    expect((await requestCompletion(corps).catch(x => x)).code).toBe('ERR_UPSTREAM');
  });
});

describe('requestCompletion — flux NDJSON', () => {
  it('assemble les fragments, appelle onStart et onDelta, rend le résultat du « done »', async () => {
    const espion = doublerFetch(() => ({
      headers: NDJSON,
      text: ndjson(
        { type: 'start', provider: 'anthropic', free: false, promptName: 'Socrate', promptVersion: 3 },
        { type: 'delta', text: 'Bon' },
        { type: 'delta', text: 'jour' },
        { type: 'done', tokenUsage: 40 },
      ),
    }));
    const debut = vi.fn();
    const cumuls: string[] = [];
    const r = await requestCompletion(corps, { onStart: debut, onDelta: t => cumuls.push(t) });
    expect(JSON.parse(String(espion.mock.calls[0][1]!.body)).stream).toBe(true);
    expect(debut).toHaveBeenCalledWith({ provider: 'anthropic', free: false, promptName: 'Socrate', promptVersion: 3 });
    expect(cumuls).toEqual(['Bon', 'Bonjour']);
    expect(r).toEqual({ reply: 'Bonjour', tokenUsage: 40, provider: 'anthropic', free: false, promptName: 'Socrate', promptVersion: 3 });
  });

  it('un événement « error » lève son code', async () => {
    doublerFetch(() => ({ headers: NDJSON, text: ndjson({ type: 'start', provider: 'mistral' }, { type: 'delta', text: 'a' }, { type: 'error', code: 'ERR_UPSTREAM' }) }));
    const e = await requestCompletion(corps, { onDelta: () => {} }).catch(x => x);
    expect(e.code).toBe('ERR_UPSTREAM');
  });

  it('lit un « done » final sans saut de ligne et ignore les lignes illisibles', async () => {
    doublerFetch(() => ({
      headers: NDJSON,
      text: 'pas du json\n' + JSON.stringify({ type: 'delta', text: 'x' }) + '\n' + JSON.stringify({ type: 'done', tokenUsage: 1 }),
    }));
    const r = await requestCompletion(corps, { onDelta: () => {} });
    expect(r.reply).toBe('x');
    expect(r.provider).toBe('mistral'); // aucun « start » : le fournisseur demandé
  });

  it('un flux interrompu sans « done » est une erreur amont', async () => {
    doublerFetch(() => ({ headers: NDJSON, text: ndjson({ type: 'delta', text: 'x' }) }));
    expect((await requestCompletion(corps, { onDelta: () => {} }).catch(x => x)).code).toBe('ERR_UPSTREAM');
  });
});
