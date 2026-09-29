// UC-04 — Tests unitaires : jetons de compte et liens de vérification
// (src/server/token.ts).
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  issueToken, verifyToken, signerLienVerification, lireLienVerification, requireAuth, isAdminEmail,
} from '../../../src/server/token';

afterEach(() => { vi.useRealTimers(); });

describe('issueToken / verifyToken', () => {
  it('émet un jeton vérifiable qui porte le nom et l’adresse en minuscules', () => {
    const jeton = issueToken('Ada', 'Ada.Lovelace@Ecole.CH');
    const charge = verifyToken(jeton);
    expect(charge).not.toBeNull();
    expect(charge!.name).toBe('Ada');
    expect(charge!.email).toBe('ada.lovelace@ecole.ch');
  });

  it('fixe une durée de vie d’environ 90 jours', () => {
    const avant = Date.now();
    const charge = verifyToken(issueToken('A', 'a@b.ch'))!;
    const jours = (charge.exp - avant) / 86_400_000;
    expect(jours).toBeGreaterThan(89.9);
    expect(jours).toBeLessThan(90.1);
  });

  it('refuse un jeton dont la charge a été modifiée', () => {
    const [charge, signature] = issueToken('A', 'a@b.ch').split('.');
    const forgee = Buffer.from(JSON.stringify({ name: 'A', email: 'super@educh.at', exp: Date.now() + 1e9 }))
      .toString('base64url');
    expect(verifyToken(`${forgee}.${signature}`)).toBeNull();
    expect(verifyToken(`${charge}.${signature}x`)).toBeNull();
  });

  it('refuse un jeton expiré', () => {
    vi.useFakeTimers();
    const jeton = issueToken('A', 'a@b.ch');
    vi.setSystemTime(Date.now() + 91 * 86_400_000);
    expect(verifyToken(jeton)).toBeNull();
  });

  it('refuse les formes dégénérées', () => {
    expect(verifyToken('')).toBeNull();
    expect(verifyToken('sanspoint')).toBeNull();
    expect(verifyToken('.signature')).toBeNull();
  });
});

describe('liens de vérification', () => {
  const charge = { e: 'eleve@ecole.ch', c: '123-456', x: Date.now() + 60_000, s: true, t: false };

  it('relit à l’identique un lien signé', () => {
    expect(lireLienVerification(signerLienVerification(charge))).toEqual(charge);
  });

  it('refuse un lien expiré ou altéré', () => {
    expect(lireLienVerification(signerLienVerification({ ...charge, x: Date.now() - 1 }))).toBeNull();
    const lien = signerLienVerification(charge);
    expect(lireLienVerification(lien.slice(0, -2) + 'AA')).toBeNull();
  });

  it('un lien n’est JAMAIS accepté comme jeton de compte, ni l’inverse (préfixe de contexte)', () => {
    // Même un lien dont la charge ressemble à un jeton ({email, exp}) ne passe pas.
    const imitation = signerLienVerification({ email: 'a@b.ch', exp: Date.now() + 1e9, e: 'a@b.ch', c: '111-111', x: Date.now() + 1e9 } as any);
    expect(verifyToken(imitation)).toBeNull();
    expect(lireLienVerification(issueToken('A', 'a@b.ch'))).toBeNull();
  });
});

describe('requireAuth', () => {
  it('lit le jeton de l’en-tête Authorization: Bearer', () => {
    const jeton = issueToken('A', 'a@b.ch');
    expect(requireAuth({ headers: { authorization: `Bearer ${jeton}` } } as any)?.email).toBe('a@b.ch');
  });
  it('renvoie null sans en-tête ou avec un autre schéma', () => {
    expect(requireAuth({ headers: {} } as any)).toBeNull();
    expect(requireAuth({ headers: { authorization: 'Basic abc' } } as any)).toBeNull();
  });
});

describe('isAdminEmail', () => {
  it('reconnaît les super-administrateurs de SECRET_ADMIN_EMAILS, sans tenir compte de la casse', () => {
    expect(isAdminEmail('SUPER@educh.at')).toBe(true);
    expect(isAdminEmail('prof@ecole.ch')).toBe(false);
  });
});
