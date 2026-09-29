// UC-02 — Tests unitaires : ce qui borne la notation anonyme.
// La note est ouverte à tous, sans compte ; seuls l'adresse de l'appelant
// (src/server/access.ts, getClientIp) et le limiteur de débit par IP et par
// périmètre (isRateLimited, périmètre « rate ») la bornent.
import { describe, it, expect, afterEach } from 'vitest';
import { poserEnv } from '../../helpers/env';

function req(headers: Record<string, string> = {}, socket = '::ffff:10.0.0.9'): any {
  return { headers, socket: { remoteAddress: socket } };
}

afterEach(() => { poserEnv({ SECRET_PROXY_TOKEN: undefined, TRUSTED_PROXY_IPS: undefined }); });

describe('getClientIp', () => {
  it('sans proxy de confiance configuré : X-Real-IP est honoré (mode historique)', async () => {
    const { getClientIp } = await import('../../../src/server/access');
    expect(getClientIp(req({ 'x-real-ip': '203.0.113.5' }))).toBe('203.0.113.5');
  });
  it('un X-Real-IP mal formé retombe sur l’adresse socket (sans préfixe ::ffff:)', async () => {
    const { getClientIp } = await import('../../../src/server/access');
    expect(getClientIp(req({ 'x-real-ip': 'pas-une-ip' }))).toBe('10.0.0.9');
  });
  it('X-Forwarded-For n’est jamais lu', async () => {
    const { getClientIp } = await import('../../../src/server/access');
    expect(getClientIp(req({ 'x-forwarded-for': '203.0.113.6' }))).toBe('10.0.0.9');
  });
  it('socket illisible : « unknown »', async () => {
    const { getClientIp } = await import('../../../src/server/access');
    expect(getClientIp(req({}, ''))).toBe('unknown');
  });
  it('avec SECRET_PROXY_TOKEN : X-Real-IP n’est cru que si le proxy présente le secret', async () => {
    poserEnv({ SECRET_PROXY_TOKEN: 'secret-proxy' });
    const { getClientIp } = await import('../../../src/server/access');
    expect(getClientIp(req({ 'x-real-ip': '203.0.113.7' }))).toBe('10.0.0.9');
    expect(getClientIp(req({ 'x-real-ip': '203.0.113.7', 'x-proxy-token': 'secret-proxy' }))).toBe('203.0.113.7');
  });
});

describe('isRateLimited (périmètre « rate », 10 par minute)', () => {
  it('laisse passer 10 notes par minute puis refuse la 11e', async () => {
    const { isRateLimited } = await import('../../../src/server/access');
    for (let i = 0; i < 10; i++) expect(await isRateLimited('192.0.2.1', 10, 'rate')).toBe(false);
    expect(await isRateLimited('192.0.2.1', 10, 'rate')).toBe(true);
  });
  it('compte séparément chaque IP et chaque périmètre', async () => {
    const { isRateLimited } = await import('../../../src/server/access');
    for (let i = 0; i < 11; i++) await isRateLimited('192.0.2.2', 10, 'rate');
    expect(await isRateLimited('192.0.2.2', 10, 'rate')).toBe(true);
    expect(await isRateLimited('192.0.2.3', 10, 'rate')).toBe(false);
    expect(await isRateLimited('192.0.2.2', 5, 'comment')).toBe(false);
  });
});
