// UC-18 — Tests fonctionnels : le super-administrateur gère les
// établissements par /api/admin/etablissements (GET/POST/DELETE). Ce qui y
// est écrit — IP, RESPIRE, quotas, fournisseur actif, facturation — reste la
// main du site ; une école n'y lit que sa ligne.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerCompte, creerEtablissement } from '../../helpers/db';

const notifications: Array<{ sujet: string; texte: string }> = [];
vi.mock('../../../src/server/mail', () => ({
  notifyAdmin: vi.fn((sujet: string, texte: string) => { notifications.push({ sujet, texte }); }),
  sendVerificationCode: vi.fn(async () => {}),
  sendEmailChangeCode: vi.fn(async () => {}),
  sendEmailChangeWarning: vi.fn(),
}));

import etablissements from '../../../src/pages/api/admin/etablissements';
import { resolveEtablissementByIp } from '../../../src/server/etablissements';

const ligne = async (id: number) => (await base()).prepare('SELECT * FROM etablissements WHERE id = ?').get(id) as any;

let sup: string;

beforeEach(async () => {
  await viderBase();
  notifications.length = 0;
  sup = await creerCompte('super@educh.at');
});

describe('Scénario nominal : créer puis régler un établissement', () => {
  it('crée l’école (201), normalise les IP, notifie l’administration', async () => {
    const r = await appeler(etablissements, {
      method: 'POST', token: sup,
      body: {
        name: '  Collège des Tilleuls  ', ips: ' 192.0.2.1 , ,192.0.2.2,', respire: true,
        tokenQuotaMonthly: 3000000, quotaPerStudentDaily: 20000, activeProvider: 'mistral',
        billingEmail: ' compta@tilleuls.ch ',
      },
    });
    expect(r.status).toBe(201);
    const e = await ligne(r.json.id);
    expect(e).toMatchObject({
      name: 'Collège des Tilleuls', ips: '192.0.2.1,192.0.2.2', respire: 1,
      token_quota_monthly: 3000000, quota_per_student_daily: 20000,
      active_provider: 'mistral', billing_email: 'compta@tilleuls.ch',
    });
    expect(resolveEtablissementByIp('192.0.2.2')?.id).toBe(r.json.id);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].sujet).toBe('Nouvel établissement : Collège des Tilleuls');
    expect(notifications[0].texte).toContain('RESPIRE : oui (gratuit)');
  });

  it('modifie une école existante (200) sans nouvelle notification', async () => {
    const id = await creerEtablissement({ name: 'Ancien nom' });
    const r = await appeler(etablissements, {
      method: 'POST', token: sup,
      body: { id, name: 'Nouveau nom', ips: '192.0.2.9', activeProvider: 'anthropic', tokenQuotaMonthly: 5 },
    });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, id });
    expect(await ligne(id)).toMatchObject({ name: 'Nouveau nom', ips: '192.0.2.9', active_provider: 'anthropic', token_quota_monthly: 5 });
    expect(notifications).toHaveLength(0);
  });

  it('GET rend toutes les écoles, triées par nom sans égard à la casse', async () => {
    await creerEtablissement({ name: 'lycée B' });
    await creerEtablissement({ name: 'Collège C' });
    await creerEtablissement({ name: 'Académie A' });
    const r = await appeler(etablissements, { token: sup });
    expect(r.status).toBe(200);
    expect(r.json.etablissements.map((e: any) => e.name)).toEqual(['Académie A', 'Collège C', 'lycée B']);
  });
});

describe('Règles de saisie', () => {
  it('un fournisseur qui ne peut pas être payé par la clé d’une école est ramené à vide', async () => {
    for (const provider of ['openrouter', 'grok', 'deepseek', 'inconnu']) {
      const r = await appeler(etablissements, { method: 'POST', token: sup, body: { name: `École ${provider}`, activeProvider: provider } });
      expect((await ligne(r.json.id)).active_provider).toBe('');
    }
  });
  it('quotas négatifs ou illisibles → 0 (illimité), nom tronqué à 120 caractères', async () => {
    const r = await appeler(etablissements, {
      method: 'POST', token: sup,
      body: { name: 'X'.repeat(200), tokenQuotaMonthly: -10, quotaPerStudentDaily: 'beaucoup' },
    });
    const e = await ligne(r.json.id);
    expect(e.name).toHaveLength(120);
    expect([e.token_quota_monthly, e.quota_per_student_daily]).toEqual([0, 0]);
  });
  it('corrigé : un champ absent n’est plus remis à zéro — le fournisseur actif survit à une modification du site', async () => {
    // L'écran src/administration/Etablissements.tsx n'envoyait jamais
    // activeProvider : chaque modification par le site effaçait le fournisseur
    // actif de l'école. Un champ absent ne s'écrit plus.
    const id = await creerEtablissement({ name: 'École', activeProvider: 'mistral', respire: true, ips: '192.0.2.5' });
    const r = await appeler(etablissements, { method: 'POST', token: sup, body: { id, name: 'École', ips: '192.0.2.5', respire: true } });
    expect(r.status).toBe(200);
    expect((await ligne(id)).active_provider).toBe('mistral');
  });
  it('non-régression : seuls les champs présents s’écrivent (quotas, facturation, IP gardés)', async () => {
    const id = await creerEtablissement({ name: 'École', activeProvider: 'mistral', ips: '192.0.2.5', billingEmail: 'c@e.ch' });
    (await base()).prepare('UPDATE etablissements SET token_quota_monthly = 7, quota_per_student_daily = 3 WHERE id = ?').run(id);
    await appeler(etablissements, { method: 'POST', token: sup, body: { id, name: 'Renommée' } });
    expect(await ligne(id)).toMatchObject({
      name: 'Renommée', ips: '192.0.2.5', active_provider: 'mistral', billing_email: 'c@e.ch',
      token_quota_monthly: 7, quota_per_student_daily: 3,
    });
    // Un champ PRÉSENT garde sa lecture : fournisseur hors périmètre → vide, quota vide → 0.
    await appeler(etablissements, { method: 'POST', token: sup, body: { id, name: 'Renommée', activeProvider: 'openrouter', tokenQuotaMonthly: '' } });
    expect(await ligne(id)).toMatchObject({ active_provider: '', token_quota_monthly: 0, quota_per_student_daily: 3 });
  });
  it('corrigé : une IP déjà revendiquée par une AUTRE école est refusée (409 ERR_IP_TAKEN), graphies comprises', async () => {
    const a = await creerEtablissement({ name: 'A', ips: '192.0.2.77,2001:db8::1' });
    for (const ips of ['192.0.2.77', '10.0.0.1, ::ffff:192.0.2.77', '2001:DB8:0:0::1']) {
      const r = await appeler(etablissements, { method: 'POST', token: sup, body: { name: 'B', ips } });
      expect(r.status).toBe(409);
      expect(r.json.error.code).toBe('ERR_IP_TAKEN');
    }
    expect(((await base()).prepare('SELECT COUNT(*) AS n FROM etablissements').get() as any).n).toBe(1);
    // Modifier une autre école pour lui donner l'adresse de A : refusé aussi, rien n'est écrit.
    const b = await creerEtablissement({ name: 'B', ips: '192.0.2.88' });
    const r = await appeler(etablissements, { method: 'POST', token: sup, body: { id: b, name: 'B', ips: '192.0.2.77' } });
    expect(r.status).toBe(409);
    expect((await ligne(b)).ips).toBe('192.0.2.88');
    expect(resolveEtablissementByIp('192.0.2.77')?.id).toBe(a);
  });
  it('non-régression : une école garde ses propres IP en se modifiant', async () => {
    const a = await creerEtablissement({ name: 'A', ips: '192.0.2.77' });
    const r = await appeler(etablissements, { method: 'POST', token: sup, body: { id: a, name: 'A bis', ips: '192.0.2.77, 192.0.2.78' } });
    expect(r.status).toBe(200);
    expect((await ligne(a)).ips).toBe('192.0.2.77,192.0.2.78');
  });
  it('une IP mal formée est refusée : 400 ERR_IP_INVALID, rien n’est écrit', async () => {
    const id = await creerEtablissement({ name: 'A', ips: '192.0.2.5' });
    for (const ips of ['192.0.2.300', 'collège', '192.0.2.0/24']) {
      const r = await appeler(etablissements, { method: 'POST', token: sup, body: { id, name: 'A', ips } });
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('ERR_IP_INVALID');
    }
    expect((await ligne(id)).ips).toBe('192.0.2.5');
  });
  it('corrigé : modifier un identifiant inexistant répond 404 ERR_ETAB_UNKNOWN', async () => {
    const r = await appeler(etablissements, { method: 'POST', token: sup, body: { id: 424242, name: 'Fantôme' } });
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe('ERR_ETAB_UNKNOWN');
    expect(await ligne(424242)).toBeUndefined();
    expect(((await base()).prepare('SELECT COUNT(*) AS n FROM etablissements').get() as any).n).toBe(0);
  });
});

describe('Scénarios alternatifs', () => {
  it('le super règle le catalogue d’une école désignée par son id', async () => {
    const id = await creerEtablissement();
    const r = await appeler(etablissements, { method: 'POST', token: sup, body: { action: 'catalogue', id, catalogueOuvert: true } });
    expect(r.json).toEqual({ ok: true, id });
    expect((await ligne(id)).catalogue_ouvert).toBe(1);
  });
  it('le super rattaché à une école garde la vue du site', async () => {
    const a = await creerEtablissement({ name: 'A' });
    await creerEtablissement({ name: 'B' });
    const t = await creerCompte('super@educh.at', { etablissementId: a });
    const r = await appeler(etablissements, { token: t, headers: { 'x-educhat-ecole': String(a) } });
    expect(r.json.etablissements).toHaveLength(2);
  });
});

describe('Scénarios d’erreur', () => {
  it('nom vide : 400 ERR_NAME_INVALID', async () => {
    const r = await appeler(etablissements, { method: 'POST', token: sup, body: { name: '   ' } });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('ERR_NAME_INVALID');
  });
  it('catalogue par le super sur un id inexistant : 404 ERR_ETAB_UNKNOWN', async () => {
    const r = await appeler(etablissements, { method: 'POST', token: sup, body: { action: 'catalogue', id: 424242, catalogueOuvert: true } });
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe('ERR_ETAB_UNKNOWN');
  });
  it('catalogue par le super sans id : 400 ERR_ETAB_UNKNOWN', async () => {
    const r = await appeler(etablissements, { method: 'POST', token: sup, body: { action: 'catalogue', catalogueOuvert: true } });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('ERR_ETAB_UNKNOWN');
  });
  it('DELETE : 403 ERR_DELETE_DISABLED, la ligne demeure', async () => {
    const id = await creerEtablissement();
    const r = await appeler(etablissements, { method: 'DELETE', token: sup, query: { id: String(id) }, body: { id } });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ERR_DELETE_DISABLED');
    expect(await ligne(id)).toBeDefined();
  });
  it('autre méthode : 405 avec Allow', async () => {
    const r = await appeler(etablissements, { method: 'PUT', token: sup });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toEqual(['GET', 'POST', 'DELETE']);
  });
});

describe('Droits', () => {
  it('sans jeton, promptagogue ou enseignant : 403 ERR_FORBIDDEN', async () => {
    const a = await creerEtablissement();
    const prof = await creerCompte('prof@a.ch', { teacher: true, etablissementId: a });
    for (const token of [undefined, prof, await creerCompte('p@x.ch')]) {
      const r = await appeler(etablissements, { token });
      expect(r.status).toBe(403);
      expect(r.json.error.code).toBe('ERR_FORBIDDEN');
    }
  });
  it('l’administrateur d’école lit SA ligne et rien d’autre, ne crée ni ne supprime', async () => {
    const a = await creerEtablissement({ name: 'A', billingEmail: 'a@a.ch' });
    await creerEtablissement({ name: 'B', billingEmail: 'secret@b.ch' });
    const dir = await creerCompte('dir@a.ch', { etablissementId: a, schoolAdmin: true });
    const lu = await appeler(etablissements, { token: dir });
    expect(lu.json.etablissements.map((e: any) => e.name)).toEqual(['A']);
    const cree = await appeler(etablissements, { method: 'POST', token: dir, body: { name: 'Mon école bis' } });
    expect(cree.status).toBe(403);
    const modif = await appeler(etablissements, { method: 'POST', token: dir, body: { id: a, name: 'A', respire: true } });
    expect(modif.status).toBe(403);
    expect((await ligne(a)).respire).toBe(0);
    const suppr = await appeler(etablissements, { method: 'DELETE', token: dir });
    expect(suppr.json.error.code).toBe('ERR_FORBIDDEN');
    expect(((await base()).prepare('SELECT COUNT(*) AS n FROM etablissements').get() as any).n).toBe(2);
  });
});
