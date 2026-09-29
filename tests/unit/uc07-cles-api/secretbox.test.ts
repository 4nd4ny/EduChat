// UC-07 — Tests unitaires : chiffrement des clés mémorisées
// (src/server/secretbox.ts : seal, open, canSealSecrets). AES-256-GCM, clé
// dérivée de SECRET_TOKEN_KEY.
import { describe, it, expect, afterAll } from 'vitest';
import { poserEnv } from '../../helpers/env';
import { seal, open, canSealSecrets } from '../../../src/server/secretbox';

const CLE_DE_TEST = process.env.SECRET_TOKEN_KEY;
afterAll(() => { poserEnv({ SECRET_TOKEN_KEY: CLE_DE_TEST }); });

describe('seal / open', () => {
  it('rend à l’identique ce qui a été scellé, accents et emoji compris', () => {
    for (const clair of ['sk-proj-abc123', 'clé à accents é', '🔑'.repeat(10), 'x'.repeat(512)]) {
      expect(open(seal(clair))).toBe(clair);
    }
  });

  it('ne laisse jamais paraître le clair, et tire un IV neuf à chaque fois', () => {
    const a = seal('sk-secret');
    const b = seal('sk-secret');
    expect(a).not.toBe(b);
    expect(a).not.toContain('sk-secret');
    expect(Buffer.from(a, 'base64').toString('utf8')).not.toContain('sk-secret');
    // iv (12) | tag (16) | chiffré (9 octets pour 9 caractères ASCII)
    expect(Buffer.from(a, 'base64')).toHaveLength(12 + 16 + 9);
  });

  it('rend null pour un contenu altéré (authentification GCM)', () => {
    const brut = Buffer.from(seal('sk-secret'), 'base64');
    brut[brut.length - 1] ^= 0x01;
    expect(open(brut.toString('base64'))).toBeNull();
    const tag = Buffer.from(seal('sk-secret'), 'base64');
    tag[14] ^= 0xff;
    expect(open(tag.toString('base64'))).toBeNull();
  });

  it('rend null pour une forme dégénérée', () => {
    expect(open('')).toBeNull();
    expect(open('court')).toBeNull();
    expect(open(Buffer.alloc(28).toString('base64'))).toBeNull(); // iv + tag, aucun chiffré
  });
});

describe('changement de SECRET_TOKEN_KEY', () => {
  it('une valeur scellée sous l’ancienne clé devient indéchiffrable', async () => {
    const scelle = seal('sk-ancien');
    poserEnv({ SECRET_TOKEN_KEY: 'une-toute-autre-cle-de-serveur-9876' });
    const neuf = await import('../../../src/server/secretbox');
    expect(neuf.open(scelle)).toBeNull();
    expect(neuf.open(neuf.seal('sk-neuf'))).toBe('sk-neuf');
  });
});

describe('canSealSecrets', () => {
  it('vrai avec une clé de serveur configurée d’au moins 16 caractères', () => {
    expect(canSealSecrets()).toBe(true);
  });

  it('faux avec la clé de repli de développement', async () => {
    poserEnv({ SECRET_TOKEN_KEY: undefined });
    expect((await import('../../../src/server/secretbox')).canSealSecrets()).toBe(false);
  });

  it('faux avec une clé trop courte', async () => {
    poserEnv({ SECRET_TOKEN_KEY: 'court' });
    expect((await import('../../../src/server/secretbox')).canSealSecrets()).toBe(false);
  });
});
