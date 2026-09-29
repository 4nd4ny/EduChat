// UC-05 — Tests unitaires : résolution des écoles d'un compte, telle que
// GET /api/me la rend (src/server/appartenance.ts) et garde « compte vérifié »
// qui ouvre le changement d'adresse (src/server/accountData.ts).
import { describe, it, expect, beforeEach } from 'vitest';
import { viderBase, base, creerCompte, creerEtablissement } from '../../helpers/db';
import { choixEcole, ecoleActivePourCompte, listerEcoles, ecolePrincipale } from '../../../src/server/appartenance';
import { isVerifiedAccount } from '../../../src/server/accountData';

beforeEach(async () => { await viderBase(); });

async function lier(email: string, id: number, admin = 0, createdAt = Date.now()) {
  (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?, ?, ?, ?)')
    .run(email, id, admin, createdAt);
}

describe('choixEcole', () => {
  it('lit l’en-tête x-educhat-ecole, puis le champ ecoleActiveId du corps', () => {
    expect(choixEcole({ headers: { 'x-educhat-ecole': '7' } } as any)).toBe(7);
    expect(choixEcole({ headers: {}, body: { ecoleActiveId: 3 } } as any)).toBe(3);
    expect(choixEcole({ headers: { 'x-educhat-ecole': '7' }, body: { ecoleActiveId: 3 } } as any)).toBe(7);
  });
  it('ne lit que le premier en-tête répété', () => {
    expect(choixEcole({ headers: { 'x-educhat-ecole': ['4', '9'] } } as any)).toBe(4);
  });
  it('rejette ce qui n’est pas un entier strictement positif', () => {
    for (const v of ['0', '-2', '1.5', 'abc', '']) {
      expect(choixEcole({ headers: { 'x-educhat-ecole': v } } as any)).toBeNull();
    }
    expect(choixEcole({ headers: {}, body: 'texte brut' } as any)).toBeNull();
    expect(choixEcole({ headers: {} } as any)).toBeNull();
  });
});

describe('ecoleActivePourCompte', () => {
  it('retient le choix annoncé s’il est lié, sinon l’école principale, sinon le plus ancien lien', async () => {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    const c = await creerEtablissement({ name: 'C' });
    await creerCompte('x@ecole.ch', { etablissementId: a });
    await lier('x@ecole.ch', b);
    expect(ecoleActivePourCompte('x@ecole.ch', b)).toBe(b);
    expect(ecoleActivePourCompte('x@ecole.ch', c)).toBe(a);   // non lié → principale
    expect(ecoleActivePourCompte('X@Ecole.CH', null)).toBe(a); // casse ignorée

    await creerCompte('y@ecole.ch');                          // sans école principale
    await lier('y@ecole.ch', c, 0, 2000);
    await lier('y@ecole.ch', b, 0, 1000);
    expect(ecoleActivePourCompte('y@ecole.ch', null)).toBe(b); // le plus ancien
  });

  it('rend null pour un compte sans aucune école', async () => {
    await creerCompte('z@ecole.ch');
    expect(ecoleActivePourCompte('z@ecole.ch', 5)).toBeNull();
  });
});

describe('listerEcoles / ecolePrincipale', () => {
  it('met l’école principale en tête et porte le rang d’admin école par école', async () => {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    await creerCompte('p@ecole.ch', { etablissementId: b });
    await lier('p@ecole.ch', a, 1, 1);
    expect(ecolePrincipale('p@ecole.ch')).toBe(b);
    expect(listerEcoles('p@ecole.ch')).toEqual([
      { etablissementId: b, name: 'B', isAdmin: false, principale: true },
      { etablissementId: a, name: 'A', isAdmin: true, principale: false },
    ]);
  });

  it('ignore un lien vers un établissement effacé', async () => {
    await creerCompte('q@ecole.ch');
    await lier('q@ecole.ch', 999);
    expect(listerEcoles('q@ecole.ch')).toEqual([]);
  });
});

describe('isVerifiedAccount', () => {
  it('vrai pour un compte vérifié, faux sinon', async () => {
    await creerCompte('v@ecole.ch');
    (await base()).prepare('INSERT INTO users (email, name, verified_at) VALUES (?, ?, NULL)').run('nv@ecole.ch', 'nv');
    expect(isVerifiedAccount('v@ecole.ch')).toBe(true);
    expect(isVerifiedAccount('nv@ecole.ch')).toBe(false);
    expect(isVerifiedAccount('absent@ecole.ch')).toBe(false);
  });
});
