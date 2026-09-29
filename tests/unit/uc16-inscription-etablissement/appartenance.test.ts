// UC-16 — Tests unitaires : le rang d'administrateur posé à l'inscription
// (src/server/appartenance.ts : definirAdminEcole, listerEcoles, estAdminDe,
// estMembre) et la reconnaissance d'une école par son adresse
// (src/server/etablissements.ts : resolveEtablissementByIp, comparaison exacte).
import { describe, it, expect, beforeEach } from 'vitest';
import { viderBase, base, creerEtablissement, creerCompte } from '../../helpers/db';
import {
  definirAdminEcole, estAdminDe, estMembre, listerEcoles, delierCompte,
} from '../../../src/server/appartenance';
import { resolveEtablissementByIp, getEtablissementById } from '../../../src/server/etablissements';

beforeEach(async () => { await viderBase(); });

const miroir = async (email: string) =>
  ((await base()).prepare('SELECT is_school_admin FROM users WHERE email = ?').get(email) as any).is_school_admin;

describe('definirAdminEcole', () => {
  it('crée le lien manquant avec le rang, et met à jour le miroir users.is_school_admin', async () => {
    const id = await creerEtablissement({ name: 'Collège A' });
    await creerCompte('resp@ecole.ch');
    definirAdminEcole('Resp@Ecole.ch', id, true);
    expect(estMembre('resp@ecole.ch', id)).toBe(true);
    expect(estAdminDe('resp@ecole.ch', id)).toBe(true);
    expect(await miroir('resp@ecole.ch')).toBe(1);
  });

  it('promeut un lien existant sans le dupliquer', async () => {
    const id = await creerEtablissement();
    await creerCompte('prof@ecole.ch', { etablissementId: id });
    definirAdminEcole('prof@ecole.ch', id, true);
    const n = (await base()).prepare('SELECT COUNT(*) AS n FROM user_etablissements WHERE email = ?').get('prof@ecole.ch') as any;
    expect(n.n).toBe(1);
    expect(estAdminDe('prof@ecole.ch', id)).toBe(true);
  });

  it('le rang vaut pour CETTE école seulement', async () => {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    await creerCompte('resp@ecole.ch', { etablissementId: b });
    definirAdminEcole('resp@ecole.ch', a, true);
    expect(estAdminDe('resp@ecole.ch', a)).toBe(true);
    expect(estAdminDe('resp@ecole.ch', b)).toBe(false);
  });

  it('retirer le rang laisse le lien ; le miroir retombe à 0 quand plus aucune école n’est administrée', async () => {
    const id = await creerEtablissement();
    await creerCompte('resp@ecole.ch');
    definirAdminEcole('resp@ecole.ch', id, true);
    definirAdminEcole('resp@ecole.ch', id, false);
    expect(estMembre('resp@ecole.ch', id)).toBe(true);
    expect(estAdminDe('resp@ecole.ch', id)).toBe(false);
    expect(await miroir('resp@ecole.ch')).toBe(0);
  });

  it('délier retire le lien et le rang', async () => {
    const id = await creerEtablissement();
    await creerCompte('resp@ecole.ch');
    definirAdminEcole('resp@ecole.ch', id, true);
    delierCompte('resp@ecole.ch', id);
    expect(estMembre('resp@ecole.ch', id)).toBe(false);
    expect(await miroir('resp@ecole.ch')).toBe(0);
  });
});

describe('listerEcoles', () => {
  it('liste l’école principale en tête, avec le rang propre à chaque lien', async () => {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    await creerCompte('resp@ecole.ch');
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,0,1)')
      .run('resp@ecole.ch', a);
    definirAdminEcole('resp@ecole.ch', b, true);
    (await base()).prepare('UPDATE users SET etablissement_id = ? WHERE email = ?').run(b, 'resp@ecole.ch');
    expect(listerEcoles('resp@ecole.ch')).toEqual([
      { etablissementId: b, name: 'B', isAdmin: true, principale: true },
      { etablissementId: a, name: 'A', isAdmin: false, principale: false },
    ]);
  });
});

describe('resolveEtablissementByIp — comparaison de chaînes exacte', () => {
  it('reconnaît l’adresse telle qu’enregistrée', async () => {
    const id = await creerEtablissement({ ips: '::ffff:198.51.100.9' });
    expect(resolveEtablissementByIp('::ffff:198.51.100.9')?.id).toBe(id);
  });
  it('ne rapproche pas deux graphies d’une même machine', async () => {
    await creerEtablissement({ ips: '198.51.100.10, 2001:db8::1' });
    expect(resolveEtablissementByIp('::ffff:198.51.100.10')).toBeNull();
    expect(resolveEtablissementByIp('2001:0db8:0:0:0:0:0:1')).toBeNull();
  });
});

describe('getEtablissementById', () => {
  it('rend la ligne, ou null', async () => {
    const id = await creerEtablissement({ name: 'Collège A' });
    expect(getEtablissementById(id)?.name).toBe('Collège A');
    expect(getEtablissementById(id + 999)).toBeNull();
  });
});
