// UC-14 — Tests unitaires : adresse réelle du client et contrôle anti-usurpation
// (src/server/access.ts, getClientIp / isKnownIp).
//
// ProxyToken, TrustedProxyIps et AllowedIps sont figés au chargement de
// src/utils/env.ts : chaque configuration pose son environnement, recharge les
// modules (poserEnv) puis importe access.ts dynamiquement.
import { describe, it, expect, afterEach } from 'vitest';
import { poserEnv } from '../../helpers/env';

/** Requête minimale telle que la voit getClientIp. */
function requete(headers: Record<string, string> = {}, socket = '::ffff:10.0.0.5') {
  return { headers, socket: { remoteAddress: socket } } as any;
}

async function chargerAcces(vars: Record<string, string | undefined>) {
  poserEnv(vars);
  return import('../../../src/server/access');
}

afterEach(() => {
  poserEnv({ SECRET_PROXY_TOKEN: undefined, TRUSTED_PROXY_IPS: undefined, SECRET_ALLOWED_IPS: undefined });
});

describe('getClientIp — sans proxy de confiance configuré (mode historique)', () => {
  it('honore X-Real-IP quand c’est une adresse valide', async () => {
    const { getClientIp } = await chargerAcces({});
    expect(getClientIp(requete({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
    expect(getClientIp(requete({ 'x-real-ip': '2001:db8::1' }))).toBe('2001:db8::1');
  });

  it('retombe sur l’adresse socket (préfixe ::ffff: retiré) si X-Real-IP manque ou est invalide', async () => {
    const { getClientIp } = await chargerAcces({});
    expect(getClientIp(requete())).toBe('10.0.0.5');
    expect(getClientIp(requete({ 'x-real-ip': 'pas-une-ip' }))).toBe('10.0.0.5');
  });

  it('n’utilise jamais X-Forwarded-For', async () => {
    const { getClientIp } = await chargerAcces({});
    expect(getClientIp(requete({ 'x-forwarded-for': '198.51.100.7' }))).toBe('10.0.0.5');
  });

  it('rend « unknown » quand même le socket n’a pas d’adresse exploitable', async () => {
    const { getClientIp } = await chargerAcces({});
    expect(getClientIp({ headers: {}, socket: {} } as any)).toBe('unknown');
    expect(getClientIp({ headers: {} } as any)).toBe('unknown');
  });
});

describe('getClientIp — secret partagé SECRET_PROXY_TOKEN', () => {
  it('honore X-Real-IP seulement si X-Proxy-Token porte le bon secret', async () => {
    const { getClientIp } = await chargerAcces({ SECRET_PROXY_TOKEN: 'secret-du-proxy' });
    expect(getClientIp(requete({ 'x-real-ip': '198.51.100.7', 'x-proxy-token': 'secret-du-proxy' })))
      .toBe('198.51.100.7');
  });

  it('ramène une requête forgée (sans jeton ou mauvais jeton) à son adresse socket', async () => {
    const { getClientIp } = await chargerAcces({ SECRET_PROXY_TOKEN: 'secret-du-proxy' });
    expect(getClientIp(requete({ 'x-real-ip': '198.51.100.7' }))).toBe('10.0.0.5');
    expect(getClientIp(requete({ 'x-real-ip': '198.51.100.7', 'x-proxy-token': 'devine' }))).toBe('10.0.0.5');
  });

  it('le jeton l’emporte sur TRUSTED_PROXY_IPS quand les deux sont posés', async () => {
    const { getClientIp } = await chargerAcces({ SECRET_PROXY_TOKEN: 'secret-du-proxy', TRUSTED_PROXY_IPS: '10.0.0.5' });
    // Le socket est dans la liste blanche, mais le jeton manque : refusé.
    expect(getClientIp(requete({ 'x-real-ip': '198.51.100.7' }))).toBe('10.0.0.5');
  });
});

describe('getClientIp — liste blanche TRUSTED_PROXY_IPS', () => {
  it('honore X-Real-IP si le pair TCP est un proxy listé (préfixe ::ffff: toléré)', async () => {
    const { getClientIp } = await chargerAcces({ TRUSTED_PROXY_IPS: '10.0.0.5, 10.0.0.6' });
    expect(getClientIp(requete({ 'x-real-ip': '198.51.100.7' }, '::ffff:10.0.0.6'))).toBe('198.51.100.7');
  });

  it('ignore X-Real-IP venant d’un voisin non listé', async () => {
    const { getClientIp } = await chargerAcces({ TRUSTED_PROXY_IPS: '10.0.0.5' });
    expect(getClientIp(requete({ 'x-real-ip': '198.51.100.7' }, '172.17.0.9'))).toBe('172.17.0.9');
  });
});

describe('isKnownIp — adresses d’amorçage SECRET_ALLOWED_IPS', () => {
  it('reconnaît les adresses listées, espaces tolérés, entrées invalides écartées', async () => {
    const { isKnownIp } = await chargerAcces({ SECRET_ALLOWED_IPS: ' 192.0.2.1 ,pas-une-ip, 192.0.2.2' });
    expect(isKnownIp('192.0.2.1')).toBe(true);
    expect(isKnownIp('192.0.2.2')).toBe(true);
    expect(isKnownIp('pas-une-ip')).toBe(false);
    expect(isKnownIp('192.0.2.3')).toBe(false);
  });

  it('ne reconnaît rien quand la variable est absente', async () => {
    const { isKnownIp } = await chargerAcces({});
    expect(isKnownIp('192.0.2.1')).toBe(false);
  });
});
