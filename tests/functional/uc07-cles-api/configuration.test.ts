// UC-07 — Tests fonctionnels : comportement de /api/keys selon la
// configuration du serveur (SECRET_TOKEN_KEY absente, puis changée). Les
// modules sont rechargés après chaque changement d'environnement.
import { describe, it, expect, afterAll } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, creerCompte } from '../../helpers/db';
import { poserEnv } from '../../helpers/env';

const CLE_DE_TEST = process.env.SECRET_TOKEN_KEY;
afterAll(() => { poserEnv({ SECRET_TOKEN_KEY: CLE_DE_TEST }); });

let n = 0;
const ipNeuve = () => `192.0.2.${200 + ++n}`;

async function route() {
  return (await import('../../../src/pages/api/keys')).default;
}

describe('Sans clé de serveur configurée (repli de développement)', () => {
  it('refuse de mémoriser (503) mais laisse toujours retirer le consentement et effacer', async () => {
    poserEnv({ SECRET_TOKEN_KEY: undefined });
    await viderBase();
    const cles = await route();
    const jeton = await creerCompte('dev@ecole.ch');
    const lu = await appeler(cles, { token: jeton, ip: ipNeuve() });
    expect(lu.json.available).toBe(false);

    const memo = await appeler(cles, { method: 'PUT', token: jeton, ip: ipNeuve(), body: { optin: true, provider: 'openai', apiKey: 'k' } });
    expect(memo.status).toBe(503);
    expect(memo.json.error.code).toBe('ERR_KEYS_UNAVAILABLE');
    const consent = await appeler(cles, { method: 'PUT', token: jeton, ip: ipNeuve(), body: { optin: true } });
    expect(consent.status).toBe(503);

    const retrait = await appeler(cles, { method: 'PUT', token: jeton, ip: ipNeuve(), body: { optin: false } });
    expect(retrait.status).toBe(200);
    expect((await appeler(cles, { method: 'DELETE', token: jeton, ip: ipNeuve() })).status).toBe(200);
  });
});

describe('Après un changement de SECRET_TOKEN_KEY', () => {
  it('la clé indéchiffrable n’est plus annoncée au chat, reste inventoriée et reste effaçable', async () => {
    poserEnv({ SECRET_TOKEN_KEY: 'premiere-cle-serveur-0123456789' });
    await viderBase();
    let cles = await route();
    let jeton = await creerCompte('a@ecole.ch');
    await appeler(cles, { method: 'PUT', token: jeton, ip: ipNeuve(), body: { optin: true, provider: 'openai', apiKey: 'sk-a' } });

    poserEnv({ SECRET_TOKEN_KEY: 'seconde-cle-serveur-9876543210' });
    cles = await route();
    const { issueToken } = await import('../../../src/server/token');
    jeton = issueToken('a', 'a@ecole.ch');
    const lu = await appeler(cles, { token: jeton, ip: ipNeuve() });
    expect(lu.json).toEqual({ optin: true, providers: [], available: true });

    const { listUserKeys } = await import('../../../src/server/userKeys');
    expect(listUserKeys('a@ecole.ch')).toEqual([{ provider: 'openai', updatedAt: expect.any(Number), readable: false }]);

    await appeler(cles, { method: 'DELETE', token: jeton, query: { provider: 'openai' }, ip: ipNeuve() });
    expect(listUserKeys('a@ecole.ch')).toEqual([]);
  });
});
