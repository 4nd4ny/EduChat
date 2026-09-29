// UC-23 — Tests unitaires : règles sollicitées par la dictée et la lecture à
// voix haute — capacités vocales des fournisseurs (src/shared/providers.ts),
// clés mémorisées (src/server/userKeys.ts) et droit de dépenser la clé d'une
// école depuis une IP (src/server/access.ts, mayUseServerKeys).
import { describe, it, expect, beforeEach } from 'vitest';
import { ERR, PROVIDER_IDS, providerDefaults } from '../../../src/shared/providers';
import { storeUserKey, readUserKey, forgetUserKey, listUserKeyProviders } from '../../../src/server/userKeys';
import { mayUseServerKeys, setAuthLock, clearAuthLock, porteeEtablissement } from '../../../src/server/access';
import { viderBase, base, creerCompte, creerEtablissement } from '../../helpers/db';

beforeEach(async () => { await viderBase(); });

describe('capacités vocales des fournisseurs', () => {
  it('seuls OpenAI et Mistral ont une transcription câblée', () => {
    expect(PROVIDER_IDS.filter(p => providerDefaults[p].voice).sort()).toEqual(['mistral', 'openai']);
  });

  it('les deux fournisseurs vocaux sont admissibles sur la clé d’une école', () => {
    for (const p of ['mistral', 'openai'] as const) {
      expect(providerDefaults[p].wrng).toBeFalsy();
      expect(providerDefaults[p].ecarte).toBeFalsy();
    }
  });

  it('codes d’erreur stables de la voix', () => {
    expect(ERR.VOICE_KEY).toBe('ERR_VOICE_KEY');
    expect(ERR.VOICE_UNSUPPORTED).toBe('ERR_VOICE_UNSUPPORTED');
    expect(ERR.VOICE_INVALID).toBe('ERR_VOICE_INVALID');
  });
});

describe('clé personnelle mémorisée (utilisée par /api/transcribe et /api/speak)', () => {
  it('se relit en clair côté serveur, est chiffrée en base, et s’oublie', async () => {
    await creerCompte('eleve@maison.ch');
    storeUserKey('eleve@maison.ch', 'mistral', 'cle-mistral-perso');
    const brut = (await base()).prepare('SELECT key_enc FROM user_keys WHERE email = ?').get('eleve@maison.ch') as any;
    expect(brut.key_enc).not.toContain('cle-mistral-perso');
    expect(readUserKey('eleve@maison.ch', 'mistral')).toBe('cle-mistral-perso');
    expect(readUserKey('eleve@maison.ch', 'openai')).toBeNull();
    expect(listUserKeyProviders('eleve@maison.ch')).toEqual(['mistral']);
    forgetUserKey('eleve@maison.ch', 'mistral');
    expect(readUserKey('eleve@maison.ch', 'mistral')).toBeNull();
  });

  it('une clé altérée en base est illisible (null), jamais une chaîne corrompue', async () => {
    await creerCompte('b@maison.ch');
    storeUserKey('b@maison.ch', 'openai', 'sk-perso');
    (await base()).prepare("UPDATE user_keys SET key_enc = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'").run();
    expect(readUserKey('b@maison.ch', 'openai')).toBeNull();
  });
});

describe('mayUseServerKeys — la clé d’une école se dépense sur son réseau', () => {
  it('faux hors de toute école, même si une salle est ouverte ailleurs', async () => {
    const id = await creerEtablissement({ ips: '192.0.2.10' });
    await setAuthLock(porteeEtablissement(id), 30);
    expect(await mayUseServerKeys('198.51.100.7')).toBe(false);
    expect(await mayUseServerKeys('192.0.2.10')).toBe(true);
  });

  it('école sans verrou ni horaire : faux ; salle refermée : faux', async () => {
    const id = await creerEtablissement({ ips: '192.0.2.11' });
    expect(await mayUseServerKeys('192.0.2.11')).toBe(false);
    await setAuthLock(porteeEtablissement(id), 30);
    await clearAuthLock(porteeEtablissement(id));
    expect(await mayUseServerKeys('192.0.2.11')).toBe(false);
  });

  it('horaires propres de l’école couvrant toute la semaine : vrai', async () => {
    const toute = JSON.stringify([0, 1, 2, 3, 4, 5, 6].map(day => ({ day, start: '00:00', end: '23:59' })));
    await creerEtablissement({ ips: '192.0.2.12', hours: toute });
    expect(await mayUseServerKeys('192.0.2.12')).toBe(true);
  });
});
