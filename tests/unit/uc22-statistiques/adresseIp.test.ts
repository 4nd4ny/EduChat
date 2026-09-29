// UC-22 — Tests unitaires : l'adresse que voit le serveur (src/server/access.ts,
// getClientIp et isKnownIp), celle que /api/ip renvoie et que /api/stats hache
// quand le navigateur ne fournit pas d'identifiant.
import { describe, it, expect, afterEach } from 'vitest';
import { poserEnv } from '../../helpers/env';

const ENV = ['SECRET_PROXY_TOKEN', 'TRUSTED_PROXY_IPS', 'SECRET_ALLOWED_IPS'];
afterEach(() => { poserEnv(Object.fromEntries(ENV.map(k => [k, undefined]))); });

async function charger(env: Record<string, string> = {}) {
  poserEnv(env);
  return import('../../../src/server/access');
}
const requete = (headers: Record<string, string>, socket = '::ffff:10.0.0.5') =>
  ({ headers, socket: { remoteAddress: socket } }) as any;

describe('getClientIp', () => {
  it('sans proxy de confiance configuré : X-Real-IP honoré (mode historique)', async () => {
    const m = await charger();
    expect(m.getClientIp(requete({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
  });
  it('X-Real-IP invalide ou absent : adresse de la socket, préfixe IPv4-mappé retiré', async () => {
    const m = await charger();
    expect(m.getClientIp(requete({ 'x-real-ip': 'pas-une-ip' }))).toBe('10.0.0.5');
    expect(m.getClientIp(requete({}))).toBe('10.0.0.5');
  });
  it('X-Forwarded-For n’est jamais lu', async () => {
    const m = await charger();
    expect(m.getClientIp(requete({ 'x-forwarded-for': '203.0.113.9' }))).toBe('10.0.0.5');
  });
  it('socket illisible : « unknown »', async () => {
    const m = await charger();
    expect(m.getClientIp(requete({}, ''))).toBe('unknown');
  });
  it('avec SECRET_PROXY_TOKEN : X-Real-IP seulement si le proxy présente le secret', async () => {
    const m = await charger({ SECRET_PROXY_TOKEN: 'secret-du-proxy' });
    expect(m.getClientIp(requete({ 'x-real-ip': '198.51.100.4' }))).toBe('10.0.0.5');
    expect(m.getClientIp(requete({ 'x-real-ip': '198.51.100.4', 'x-proxy-token': 'faux' }))).toBe('10.0.0.5');
    expect(m.getClientIp(requete({ 'x-real-ip': '198.51.100.4', 'x-proxy-token': 'secret-du-proxy' }))).toBe('198.51.100.4');
  });
  it('avec TRUSTED_PROXY_IPS : X-Real-IP seulement depuis un proxy listé', async () => {
    const m = await charger({ TRUSTED_PROXY_IPS: '10.0.0.1' });
    expect(m.getClientIp(requete({ 'x-real-ip': '198.51.100.4' }, '10.0.0.5'))).toBe('10.0.0.5');
    expect(m.getClientIp(requete({ 'x-real-ip': '198.51.100.4' }, '::ffff:10.0.0.1'))).toBe('198.51.100.4');
  });
});

describe('isKnownIp', () => {
  it('ne reconnaît que les IP valides de SECRET_ALLOWED_IPS', async () => {
    const m = await charger({ SECRET_ALLOWED_IPS: ' 192.0.2.1 , pas-une-ip, 192.0.2.2' });
    expect(m.isKnownIp('192.0.2.1')).toBe(true);
    expect(m.isKnownIp('192.0.2.2')).toBe(true);
    expect(m.isKnownIp('pas-une-ip')).toBe(false);
    expect(m.isKnownIp('192.0.2.3')).toBe(false);
  });
  it('liste vide par défaut', async () => {
    expect((await charger()).isKnownIp('192.0.2.1')).toBe(false);
  });
});
