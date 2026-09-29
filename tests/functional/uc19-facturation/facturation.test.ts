// UC-19 — Tests fonctionnels : « Facturer la consommation d'une école ».
// Enchaîne les vraies routes GET /api/admin/billing et GET/POST
// /api/admin/factures ; la consommation est écrite dans le journal d'usage
// comme /api/completion l'écrirait.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerEtablissement, creerCompte } from '../../helpers/db';
import { journaliser, JUILLET } from '../../unit/uc19-facturation/journal';

vi.mock('../../../src/server/mail', () => ({
  notifyAdmin: vi.fn(),
  sendVerificationCode: vi.fn(async () => {}),
  sendEmailChangeCode: vi.fn(async () => {}),
  sendEmailChangeWarning: vi.fn(),
}));

import billing from '../../../src/pages/api/admin/billing';
import factures from '../../../src/pages/api/admin/factures';

let n = 0;
const ipNeuve = () => `198.51.100.${++n}`;

let ecoleA: number, ecoleB: number, respire: number;
let jetonSuper: string, jetonDirA: string, jetonProfA: string;

beforeEach(async () => {
  await viderBase();
  ecoleA = await creerEtablissement({ name: 'Collège A', ips: '10.0.0.1', billingEmail: 'compta@a.ch', contributionPct: 5 });
  ecoleB = await creerEtablissement({ name: 'Collège B', ips: '10.0.0.2' });
  respire = await creerEtablissement({ name: 'École Respire', respire: true, ips: '10.0.0.3' });
  jetonSuper = await creerCompte('super@educh.at');
  jetonDirA = await creerCompte('dir@a.ch', { etablissementId: ecoleA, schoolAdmin: true, teacher: true });
  jetonProfA = await creerCompte('prof@a.ch', { etablissementId: ecoleA, teacher: true });

  await journaliser({ ts: JUILLET, etablissementId: ecoleA, ip: '10.0.0.1', teacherEmail: 'prof@a.ch',
    model: 'claude-haiku', tokensIn: 1000, tokensOut: 3000, prixEntree: 1, prixSortie: 5, montant: 0.02 });
  await journaliser({ ts: JUILLET + 1, etablissementId: ecoleA, ip: '10.0.0.1', teacherEmail: 'prof@a.ch',
    model: 'claude-haiku', tokensIn: 1000, tokensOut: 3000, prixEntree: 1, prixSortie: 5, montant: 0.02 });
  await journaliser({ ts: JUILLET, etablissementId: ecoleB, ip: '10.0.0.2', provider: 'mistral', model: 'mistral-small',
    tokensIn: 100, tokensOut: 100, montant: 1.5 });
  await journaliser({ ts: JUILLET, etablissementId: respire, ip: '10.0.0.3', tokensIn: 10, tokensOut: 10, montant: 0 });
  await journaliser({ ts: JUILLET, etablissementId: null, ip: '', tokensIn: 5, tokensOut: 5 });          // démo publique
  await journaliser({ ts: JUILLET, etablissementId: null, ip: '192.0.2.9', tokensIn: 7, tokensOut: 0 }); // IP hors base
});

const lire = (token: string, query: Record<string, string> = {}) =>
  appeler(factures, { method: 'GET', token, query: { year: '2026', month: '7', ...query }, ip: ipNeuve() });
const agir = (token: string, body: Record<string, unknown>) =>
  appeler(factures, { method: 'POST', token, body, ip: ipNeuve() });

describe('Scénario nominal : du relevé à la facture payée', () => {
  it('le site lit, émet, marque payée ; la facture payée ne bouge plus', async () => {
    const r = await lire(jetonSuper);
    expect(r.status).toBe(200);
    const fa = r.json.factures.find((f: any) => f.etablissementId === ecoleA);
    expect(fa).toMatchObject({ etablissement: 'Collège A', total: 0.04, consommation: 0.04, participation: 0,
      participationPct: 5, devise: 'CHF', billingEmail: 'compta@a.ch', emiseAt: null });
    expect(fa.lignes[0]).toMatchObject({ modele: 'claude-haiku', appels: 2, tokensIn: 2000, tokensOut: 6000,
      prixEntreeMtok: 1, prixSortieMtok: 5, montant: 0.04 });

    const e = await agir(jetonSuper, { action: 'emettre', etablissementId: ecoleA, year: 2026, month: 7 });
    expect(e.status).toBe(200);
    expect(e.json.facture.emiseAt).toBeGreaterThan(0);
    expect((await lire(jetonSuper)).json.impayees).toEqual([
      expect.objectContaining({ etablissementId: ecoleA, periode: '2026-07', total: 0.04 })]);

    const p = await agir(jetonSuper, { action: 'payee', etablissementId: ecoleA, periode: '2026-07' });
    expect(p.status).toBe(200);
    const apres = await lire(jetonSuper);
    expect(apres.json.impayees).toEqual([]);
    expect(apres.json.factures.find((f: any) => f.etablissementId === ecoleA).payeeAt).toBeGreaterThan(0);

    // Consommation tardive : la facture payée garde son montant, l'écart est signalé.
    await journaliser({ ts: JUILLET + 9, etablissementId: ecoleA, tokensIn: 1, montant: 1 });
    const re = await agir(jetonSuper, { action: 'emettre', etablissementId: ecoleA, year: 2026, month: 7 });
    expect(re.json.facture.tarifChange).toBe(true);
    expect(((await base()).prepare('SELECT total FROM factures WHERE etablissement_id = ?').get(ecoleA) as any).total).toBe(0.04);
  });

  it('marquer « impayée » rouvre la facture', async () => {
    await agir(jetonSuper, { action: 'emettre', etablissementId: ecoleB, year: 2026, month: 7 });
    await agir(jetonSuper, { action: 'payee', etablissementId: ecoleB, periode: '2026-07' });
    const r = await agir(jetonSuper, { action: 'impayee', etablissementId: ecoleB, periode: '2026-07' });
    expect(r.status).toBe(200);
    expect((await lire(jetonSuper)).json.impayees).toHaveLength(1);
  });
});

describe('Scénarios alternatifs', () => {
  it('A1 — l’administrateur d’école ne lit QUE sa facture, sans impayées ni bilan', async () => {
    const r = await lire(jetonDirA);
    expect(r.status).toBe(200);
    expect(r.json.factures.map((f: any) => f.etablissementId)).toEqual([ecoleA]);
    expect(r.json.impayees).toBeUndefined();
    expect(r.json.participation).toBeUndefined();
  });

  it('A1 — même en annonçant une autre école dans l’en-tête, il reste chez lui', async () => {
    const r = await appeler(factures, { method: 'GET', token: jetonDirA, query: { year: '2026', month: '7' },
      headers: { 'x-educhat-ecole': String(ecoleB) }, ip: ipNeuve() });
    expect(r.json.factures.map((f: any) => f.etablissementId)).toEqual([ecoleA]);
  });

  it('A2 — le site voit toutes les écoles, les impayées et le bilan de la contribution', async () => {
    const r = await lire(jetonSuper);
    expect(r.json.factures.map((f: any) => f.etablissement)).toEqual(['Collège A', 'Collège B', 'École Respire']);
    expect(r.json.participation).toMatchObject({ devise: 'CHF', collectee: 0 });
    expect(r.json.impayees).toEqual([]);
  });

  it('A3 — école RESPIRE : consommation visible, total nul, émission refusée', async () => {
    const r = await lire(jetonSuper);
    const f = r.json.factures.find((x: any) => x.etablissementId === respire);
    expect(f.respire).toBe(true);
    expect(f.lignes).toHaveLength(1);
    expect(f.total).toBe(0);
    const e = await agir(jetonSuper, { action: 'emettre', etablissementId: respire, year: 2026, month: 7 });
    expect(e.status).toBe(409);
    expect(e.json.error.code).toBe('ERR_NOTHING_TO_INVOICE');
  });

  it('A4 — mentions administratives : l’école écrit les siennes, sans toucher au montant', async () => {
    const r = await agir(jetonDirA, { action: 'mentions', periode: '2026-07', adresse: 'Intendance, CP 12', reference: 'BC-2026-77' });
    expect(r.status).toBe(200);
    expect(r.json.mentions).toMatchObject({ adresse: 'Intendance, CP 12', reference: 'BC-2026-77', par: 'dir@a.ch', adresseParDefaut: false });
    // Un « total » glissé dans le corps n'est jamais lu.
    await agir(jetonDirA, { action: 'mentions', periode: '2026-07', note: 'Payable à 30 j', total: 0, montant: 0 });
    const f = (await lire(jetonDirA)).json.factures[0];
    expect(f.total).toBe(0.04);
    expect(f.mentions).toMatchObject({ adresse: 'Intendance, CP 12', reference: 'BC-2026-77', note: 'Payable à 30 j' });
  });

  it('A4 — le site écrit les mentions de n’importe quelle école ; une réémission les garde', async () => {
    const r = await agir(jetonSuper, { action: 'mentions', etablissementId: ecoleB, periode: '2026-07', reference: 'REF-B' });
    expect(r.status).toBe(200);
    await agir(jetonSuper, { action: 'emettre', etablissementId: ecoleB, year: 2026, month: 7 });
    const f = (await lire(jetonSuper)).json.factures.find((x: any) => x.etablissementId === ecoleB);
    expect(f.mentions.reference).toBe('REF-B');
  });

  it('A5 — relevé brut : un porte-monnaie PERSONNEL (payé) a sa ligne, distincte de la démo publique', async () => {
    // Anomalie corrigée (UC-19, n° 3) : ces appels, journalisés sans IP ni
    // établissement mais avec un montant prélevé, étaient libellés « démo ».
    await journaliser({ ts: JUILLET, etablissementId: null, ip: '', tokensIn: 30, tokensOut: 30, montant: 0.5 });
    const r = await appeler(billing, { method: 'GET', token: jetonSuper, query: { year: '2026', month: '7' }, ip: ipNeuve() });
    const perso = r.json.rows.find((x: any) => x.etablissement === '(porte-monnaie personnel — payé)');
    const demo = r.json.rows.find((x: any) => x.etablissement === '(démo publique — non facturable)');
    expect(perso).toMatchObject({ requests: 1, tokens: 60, ip: '' });
    expect(demo).toMatchObject({ requests: 1, tokens: 10 });
  });

  it('A5 — relevé brut GET /api/admin/billing : écoles, IP hors base, démo publique, enseignants', async () => {
    const r = await appeler(billing, { method: 'GET', token: jetonSuper, query: { year: '2026', month: '7' }, ip: ipNeuve() });
    expect(r.status).toBe(200);
    expect(r.json.portee).toBeNull();
    const noms = r.json.rows.map((x: any) => x.etablissement);
    expect(noms).toEqual(expect.arrayContaining(['Collège A', 'Collège B', 'École Respire',
      '(IP hors base)', '(démo publique — non facturable)']));
    expect(r.json.rows.find((x: any) => x.etablissement === 'Collège A')).toMatchObject({ requests: 2, tokens: 8000, ip: '10.0.0.1' });
    expect(r.json.rows.find((x: any) => x.etablissement === 'École Respire').respire).toBe(1);
    expect(r.json.teachers).toEqual([expect.objectContaining({ teacherEmail: 'prof@a.ch', requests: 2, tokens: 8000 })]);
  });

  it('A5 — l’administrateur d’école ne reçoit que les lignes de son école', async () => {
    const r = await appeler(billing, { method: 'GET', token: jetonDirA, query: { year: '2026', month: '7' }, ip: ipNeuve() });
    expect(r.json.portee).toBe(ecoleA);
    expect(r.json.rows.map((x: any) => x.etablissementId)).toEqual([ecoleA]);
  });

  it('A6 — export CSV par établissement, et par enseignant', async () => {
    const r = await appeler(billing, { method: 'GET', token: jetonSuper, query: { year: '2026', month: '7', format: 'csv' }, ip: ipNeuve() });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(r.headers['content-disposition']).toContain('educhat-facturation-2026-07.csv');
    const lignes = r.text.split('\n');
    expect(lignes[0]).toBe('periode;etablissement;gratuit_respire;ip;fournisseur;requetes;tokens');
    expect(lignes).toContain('2026-07;"Collège A";non;10.0.0.1;anthropic;2;8000');
    expect(lignes).toContain('2026-07;"École Respire";oui;10.0.0.3;anthropic;1;20');

    const t = await appeler(billing, { method: 'GET', token: jetonDirA,
      query: { year: '2026', month: '7', format: 'csv', by: 'teacher' }, ip: ipNeuve() });
    expect(t.headers['content-disposition']).toContain('educhat-facturation-enseignants-2026-07.csv');
    expect(t.text.split('\n')).toEqual([
      'periode;enseignant;etablissement;fournisseur;requetes;tokens',
      '2026-07;prof@a.ch;"Collège A";anthropic;2;8000',
    ]);
  });

  it('A7 — sans année ni mois, le mois courant (UTC) est pris', async () => {
    const r = await appeler(factures, { method: 'GET', token: jetonSuper, ip: ipNeuve() });
    const now = new Date();
    expect([r.json.year, r.json.month]).toEqual([now.getUTCFullYear(), now.getUTCMonth() + 1]);
    expect(r.json.factures.every((f: any) => f.total === 0)).toBe(true);
  });
});

describe('Scénarios d’erreur et droits', () => {
  it('sans jeton ou sans rang d’administration : 403 ERR_FORBIDDEN', async () => {
    for (const token of [undefined, jetonProfA]) {
      const a = await appeler(factures, { method: 'GET', token, ip: ipNeuve() });
      const b = await appeler(billing, { method: 'GET', token, ip: ipNeuve() });
      for (const r of [a, b]) {
        expect(r.status).toBe(403);
        expect(r.json.error.code).toBe('ERR_FORBIDDEN');
      }
    }
  });

  it('une école ne peut ni émettre ni se déclarer payée : 403 ERR_SUPER_ONLY', async () => {
    for (const body of [
      { action: 'emettre', etablissementId: ecoleA, year: 2026, month: 7 },
      { action: 'payee', etablissementId: ecoleA, periode: '2026-07' },
    ]) {
      const r = await agir(jetonDirA, body);
      expect(r.status).toBe(403);
      expect(r.json.error.code).toBe('ERR_SUPER_ONLY');
    }
  });

  it('mentions : autre école 403, école inconnue 404, période invalide 400, aucune cible 400', async () => {
    const autre = await agir(jetonDirA, { action: 'mentions', etablissementId: ecoleB, periode: '2026-07', note: 'x' });
    expect([autre.status, autre.json.error.code]).toEqual([403, 'ERR_FORBIDDEN']);
    const inconnue = await agir(jetonSuper, { action: 'mentions', etablissementId: 9999, periode: '2026-07' });
    expect([inconnue.status, inconnue.json.error.code]).toEqual([404, 'ERR_SCHOOL_UNKNOWN']);
    const periode = await agir(jetonDirA, { action: 'mentions', periode: '07/2026' });
    expect([periode.status, periode.json.error.code]).toEqual([400, 'ERR_PERIOD_INVALID']);
    const sansCible = await agir(jetonSuper, { action: 'mentions', periode: '2026-07' });
    expect([sansCible.status, sansCible.json.error.code]).toEqual([400, 'ERR_SCHOOL_UNKNOWN']);
    expect((await base()).prepare('SELECT COUNT(*) AS n FROM facture_mentions').get()).toEqual({ n: 0 });
  });

  it('actions du site : école absente 400, période invalide 400, facture inconnue 404, action inconnue 400', async () => {
    const sansEcole = await agir(jetonSuper, { action: 'emettre' });
    expect([sansEcole.status, sansEcole.json.error.code]).toEqual([400, 'ERR_SCHOOL_UNKNOWN']);
    const periode = await agir(jetonSuper, { action: 'payee', etablissementId: ecoleA, periode: 'juillet' });
    expect([periode.status, periode.json.error.code]).toEqual([400, 'ERR_PERIOD_INVALID']);
    const inconnue = await agir(jetonSuper, { action: 'payee', etablissementId: ecoleA, periode: '2020-01' });
    expect([inconnue.status, inconnue.json.error.code]).toEqual([404, 'ERR_INVOICE_UNKNOWN']);
    const action = await agir(jetonSuper, { action: 'annuler', etablissementId: ecoleA });
    expect([action.status, action.json.error.code]).toEqual([400, 'ERR_ACTION_UNKNOWN']);
  });

  it('émettre pour une école inexistante répond 409 ERR_NOTHING_TO_INVOICE (comme RESPIRE)', async () => {
    const r = await agir(jetonSuper, { action: 'emettre', etablissementId: 9999, year: 2026, month: 7 });
    expect([r.status, r.json.error.code]).toEqual([409, 'ERR_NOTHING_TO_INVOICE']);
  });

  it('méthodes non autorisées : 405 (après la garde d’administration)', async () => {
    const f = await appeler(factures, { method: 'DELETE', token: jetonSuper, ip: ipNeuve() });
    expect(f.status).toBe(405);
    expect(f.headers.allow).toEqual(['GET', 'POST']);
    const b = await appeler(billing, { method: 'POST', token: jetonSuper, ip: ipNeuve() });
    expect(b.status).toBe(405);
    expect(b.headers.allow).toEqual(['GET']);
  });
});
