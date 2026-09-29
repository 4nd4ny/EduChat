// UC-04 — Tests unitaires : rattachement d'un compte à une école par l'IP
// (src/server/appartenance.ts, lierCompte) et résolution IP → établissement
// (src/server/etablissements.ts, resolveEtablissementByIp).
import { describe, it, expect, beforeEach } from 'vitest';
import { viderBase, creerEtablissement, base } from '../../helpers/db';
import { lierCompte } from '../../../src/server/appartenance';
import { resolveEtablissementByIp } from '../../../src/server/etablissements';

beforeEach(async () => { await viderBase(); });

describe('resolveEtablissementByIp', () => {
  it('trouve l’école dont la liste d’IP contient l’adresse', async () => {
    const id = await creerEtablissement({ name: 'Collège A', ips: '1.1.1.1, 2.2.2.2' });
    expect(resolveEtablissementByIp('2.2.2.2')?.id).toBe(id);
  });
  it('renvoie null pour une adresse inconnue, vide ou « unknown »', async () => {
    await creerEtablissement({ ips: '1.1.1.1' });
    expect(resolveEtablissementByIp('9.9.9.9')).toBeNull();
    expect(resolveEtablissementByIp('')).toBeNull();
    expect(resolveEtablissementByIp('unknown')).toBeNull();
  });
});

describe('lierCompte', () => {
  it('crée le lien sans droit d’administration et dit qu’il est nouveau', async () => {
    const id = await creerEtablissement();
    expect(lierCompte('Prof@Ecole.ch', id)).toBe(true);
    const lien = (await base()).prepare('SELECT * FROM user_etablissements WHERE email = ?').get('prof@ecole.ch') as any;
    expect(lien.is_admin).toBe(0);
  });
  it('est idempotent et n’écrase jamais un lien existant (ni son rang)', async () => {
    const id = await creerEtablissement();
    const db = await base();
    db.prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,1,0)')
      .run('admin@ecole.ch', id);
    expect(lierCompte('admin@ecole.ch', id)).toBe(false);
    expect((db.prepare('SELECT is_admin FROM user_etablissements WHERE email=?').get('admin@ecole.ch') as any).is_admin).toBe(1);
  });
});
