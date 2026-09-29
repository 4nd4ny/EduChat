// UC-07 — Tests unitaires : accès à la table user_keys
// (src/server/userKeys.ts).
import { describe, it, expect, beforeEach } from 'vitest';
import { viderBase, base, creerCompte } from '../../helpers/db';
import {
  storeUserKey, forgetUserKey, listUserKeyProviders, listUserKeys, readUserKey, keysOptin, setKeysOptin,
} from '../../../src/server/userKeys';

beforeEach(async () => { await viderBase(); });

describe('storeUserKey / readUserKey', () => {
  it('stocke la clé chiffrée, la relit en clair pour le serveur, et remplace l’ancienne', async () => {
    await creerCompte('a@ecole.ch');
    storeUserKey('a@ecole.ch', 'openai', 'sk-premiere');
    const ligne = (await base()).prepare('SELECT key_enc FROM user_keys WHERE email=? AND provider=?').get('a@ecole.ch', 'openai') as any;
    expect(ligne.key_enc).not.toContain('sk-premiere');
    expect(readUserKey('a@ecole.ch', 'openai')).toBe('sk-premiere');
    storeUserKey('a@ecole.ch', 'openai', 'sk-seconde');
    expect(readUserKey('a@ecole.ch', 'openai')).toBe('sk-seconde');
    expect((await base()).prepare('SELECT COUNT(*) AS n FROM user_keys').get()).toEqual({ n: 1 });
  });

  it('rend null sans clé, ou pour la clé d’un autre compte', () => {
    storeUserKey('a@ecole.ch', 'mistral', 'cle-a');
    expect(readUserKey('a@ecole.ch', 'openai')).toBeNull();
    expect(readUserKey('b@ecole.ch', 'mistral')).toBeNull();
  });
});

describe('forgetUserKey', () => {
  it('oublie une clé, ou toutes, sans toucher aux autres comptes', () => {
    storeUserKey('a@ecole.ch', 'openai', '1');
    storeUserKey('a@ecole.ch', 'mistral', '2');
    storeUserKey('b@ecole.ch', 'openai', '3');
    forgetUserKey('a@ecole.ch', 'openai');
    expect(listUserKeyProviders('a@ecole.ch')).toEqual(['mistral']);
    forgetUserKey('a@ecole.ch');
    expect(listUserKeyProviders('a@ecole.ch')).toEqual([]);
    expect(listUserKeyProviders('b@ecole.ch')).toEqual(['openai']);
  });
});

describe('listUserKeyProviders / listUserKeys', () => {
  it('une clé indéchiffrable est tue pour le chat mais inventoriée pour « Mes données »', async () => {
    storeUserKey('a@ecole.ch', 'openai', 'lisible');
    const db = await base();
    db.prepare("INSERT INTO user_keys (email, provider, key_enc, updated_at) VALUES (?, 'mistral', 'illisible', 5)").run('a@ecole.ch');
    db.prepare("INSERT INTO user_keys (email, provider, key_enc, updated_at) VALUES (?, 'inconnu', 'x', 5)").run('a@ecole.ch');
    expect(listUserKeyProviders('a@ecole.ch')).toEqual(['openai']);
    expect(listUserKeys('a@ecole.ch')).toEqual([
      { provider: 'mistral', updatedAt: 5, readable: false },
      { provider: 'openai', updatedAt: expect.any(Number), readable: true },
    ]);
    expect(JSON.stringify(listUserKeys('a@ecole.ch'))).not.toContain('lisible"');
  });
});

describe('keysOptin / setKeysOptin', () => {
  it('le consentement se donne et se retire ; le retrait efface toutes les clés', async () => {
    await creerCompte('a@ecole.ch');
    expect(keysOptin('a@ecole.ch')).toBe(false);
    setKeysOptin('a@ecole.ch', true);
    expect(keysOptin('a@ecole.ch')).toBe(true);
    storeUserKey('a@ecole.ch', 'openai', 'k1');
    storeUserKey('a@ecole.ch', 'anthropic', 'k2');
    setKeysOptin('a@ecole.ch', false);
    expect(keysOptin('a@ecole.ch')).toBe(false);
    expect(listUserKeys('a@ecole.ch')).toEqual([]);
  });

  it('un compte inconnu n’a jamais consenti', () => {
    expect(keysOptin('personne@ecole.ch')).toBe(false);
  });
});
