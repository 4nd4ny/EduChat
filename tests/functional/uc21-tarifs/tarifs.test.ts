// UC-21 — Tests fonctionnels : « Régler les tarifs de la clé interne ».
// Enchaîne la vraie route GET/POST /api/admin/tarifs (vue du site, vue d'une
// école, réglage du prix unique, relance de la sonde) ; seuls le catalogue
// OpenRouter et le taux de change sont doublés (fetch global).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerEtablissement, creerCompte } from '../../helpers/db';
import { doublerSources, CATALOGUE } from '../../unit/uc21-tarifs/catalogue';

vi.mock('../../../src/server/mail', () => ({
  notifyAdmin: vi.fn(),
  sendVerificationCode: vi.fn(async () => {}),
  sendEmailChangeCode: vi.fn(async () => {}),
  sendEmailChangeWarning: vi.fn(),
}));

import route from '../../../src/pages/api/admin/tarifs';
import { tarifDuModele } from '../../../src/server/porteMonnaie';
import { PROVIDER_IDS } from '../../../src/shared/providers';

let n = 0;
const ipNeuve = () => `192.0.2.${++n}`;

let ecoleA: number, ecoleB: number;
let jetonSuper: string, jetonDirA: string, jetonProfA: string, jetonDirB: string;

beforeEach(async () => {
  await viderBase();
  ecoleA = await creerEtablissement({ name: 'Collège A', activeProvider: 'anthropic' });
  ecoleB = await creerEtablissement({ name: 'Collège B', activeProvider: 'mistral' });
  jetonSuper = await creerCompte('super@educh.at');
  jetonDirA = await creerCompte('dir@a.ch', { etablissementId: ecoleA, schoolAdmin: true });
  jetonProfA = await creerCompte('prof@a.ch', { etablissementId: ecoleA, teacher: true });
  jetonDirB = await creerCompte('dir@b.ch', { etablissementId: ecoleB, schoolAdmin: true });
});
afterEach(() => { vi.unstubAllGlobals(); });

const lire = (token?: string, query: Record<string, string> = {}, headers: Record<string, string> = {}) =>
  appeler(route, { method: 'GET', token, query, headers, ip: ipNeuve() });
const ecrire = (token: string | undefined, body: unknown) =>
  appeler(route, { method: 'POST', token, body, ip: ipNeuve() });
const vueEcole = (token: string, headers: Record<string, string> = {}) => lire(token, { portee: 'ecole' }, headers);

describe('Scénario nominal : le site sonde, lit et règle les tarifs', () => {
  it('avant toute sonde : onze fournisseurs sans proposition, neuf barreaux sans tarif', async () => {
    const r = await lire(jetonSuper);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ devise: 'CHF', participationPct: 10, ratioEntree: 0.75, appliques: [], replis: [] });
    expect(r.json.manquants).toHaveLength(9);
    expect(r.json.tarifs.map((t: any) => t.provider)).toEqual(PROVIDER_IDS);
    const gemini = r.json.tarifs.find((t: any) => t.provider === 'gemini');
    expect(gemini).toEqual({ provider: 'gemini', prixMtok: 0, proposition: null, verifier: null });
    expect(r.json.tarifs.find((t: any) => t.provider === 'anthropic').verifier)
      .toBe('https://openrouter.ai/models?order=most-popular&q=anthropic');
  });

  it('relance de la sonde → propositions converties, prix appliqués, plus aucun manque', async () => {
    const espion = doublerSources({ taux: 0.8 });
    const s = await ecrire(jetonSuper, { action: 'sonder' });
    expect(s.status).toBe(200);
    expect(s.json.ok).toBe(true);
    expect(s.json.propositions).toHaveLength(3);
    expect(espion).toHaveBeenCalledTimes(2);

    const r = await lire(jetonSuper);
    expect(r.json.manquants).toEqual([]);
    expect(r.json.appliques).toHaveLength(9);
    const a = r.json.tarifs.find((t: any) => t.provider === 'anthropic');
    expect(a.proposition).toMatchObject({
      modele: 'anthropic/claude-opus-5', entreeMtok: 4, sortieMtok: 20, melangeMtok: 8, devise: 'CHF', rangRetenu: 3,
    });
    expect(a.proposition.barreaux.map((b: any) => b.melangeMtok)).toEqual([1.6, 3.2, 8]);
    expect(a.prixMtok).toBe(0);                                  // la sonde n'applique pas le prix unique
    // Le modèle réellement appelé est désormais facturé à son prix relevé.
    expect(tarifDuModele('anthropic', 'claude-sonnet-5')).toMatchObject({ entree: 1.6, sortie: 8, repli: '' });
  });

  it('le site règle le prix unique d’un fournisseur ; il sert de dernier recours', async () => {
    const r = await ecrire(jetonSuper, { provider: 'openai', prixMtok: '2.5' });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true });
    const lu = await lire(jetonSuper);
    expect(lu.json.tarifs.find((t: any) => t.provider === 'openai').prixMtok).toBe(2.5);
    expect(tarifDuModele('openai', 'gpt-5.5')).toMatchObject({ entree: 2.5, sortie: 2.5 });
    expect(tarifDuModele('openai', 'gpt-5.5').repli).toContain('prix unique du fournisseur');
  });

  it('un prix unique peut être réglé pour un fournisseur hors école (prix zéro accepté)', async () => {
    expect((await ecrire(jetonSuper, { provider: 'gemini', prixMtok: 0 })).status).toBe(200);
    const row = (await base()).prepare('SELECT prix_mtok FROM tarifs WHERE provider = ?').get('gemini') as any;
    expect(row.prix_mtok).toBe(0);
  });

  it('la vue du site dit les replis déjà facturés dans les 30 derniers jours', async () => {
    (await base()).prepare(`INSERT INTO usage_log (ts, ip, provider, model, tokens, etablissement_id, montant, tarif_at, tarif_repli)
      VALUES (?, '10.0.0.1', 'anthropic', 'claude-x', 100, ?, 0.3, ?, 'Aucun tarif relevé')`).run(Date.now(), ecoleA, Date.now());
    const r = await lire(jetonSuper);
    expect(r.json.replis).toEqual([expect.objectContaining({ provider: 'anthropic', modele: 'claude-x', appels: 1, montant: 0.3 })]);
  });
});

describe('Scénario alternatif : une école lit les barreaux de SON fournisseur', () => {
  it('six chiffres et les noms : ni mélange, ni tarif retenu, ni autres fournisseurs', async () => {
    doublerSources({ taux: 0.8 });
    await ecrire(jetonSuper, { action: 'sonder' });
    const r = await vueEcole(jetonDirA);
    expect(r.status).toBe(200);
    expect(Object.keys(r.json).sort()).toEqual(['echelle', 'providerActif']);
    expect(r.json.providerActif).toBe('anthropic');
    expect(Object.keys(r.json.echelle).sort()).toEqual(['at', 'barreaux', 'devise', 'verifier']);
    expect(r.json.echelle.devise).toBe('CHF');
    expect(r.json.echelle.verifier).toBe('https://openrouter.ai/models?order=most-popular&q=anthropic');
    expect(r.json.echelle.barreaux[0]).toEqual({
      rang: 1, barreau: 'claude-haiku-4-5-20251001', modele: 'anthropic/claude-haiku-4.5',
      entreeMtok: 0.8, sortieMtok: 4, detail: '',
    });
    expect(JSON.stringify(r.json)).not.toContain('melange');
  });

  it('chaque école ne voit que son fournisseur actif', async () => {
    doublerSources();
    await ecrire(jetonSuper, { action: 'sonder' });
    const b = await vueEcole(jetonDirB);
    expect(b.json.providerActif).toBe('mistral');
    expect(b.json.echelle.barreaux.map((x: any) => x.modele)[2]).toBe('mistralai/mistral-large-2512');
  });

  it('taux de change injoignable : l’école lit des montants en USD, annoncés comme tels', async () => {
    doublerSources({ taux: null });
    await ecrire(jetonSuper, { action: 'sonder' });
    const r = await vueEcole(jetonDirA);
    expect(r.json.echelle.devise).toBe('USD');
    expect(r.json.echelle.barreaux[2]).toMatchObject({ entreeMtok: 5, sortieMtok: 25 });
  });

  it('aucun fournisseur réglé, fournisseur non sondé, sonde jamais passée → echelle null', async () => {
    const sans = await creerEtablissement({ name: 'Sans fournisseur' });
    const horsEcole = await creerEtablissement({ name: 'Gemini', activeProvider: 'gemini' });
    const t1 = await creerCompte('d1@x.ch', { etablissementId: sans, schoolAdmin: true });
    const t2 = await creerCompte('d2@x.ch', { etablissementId: horsEcole, schoolAdmin: true });
    expect((await vueEcole(t1)).json).toEqual({ providerActif: '', echelle: null });
    expect((await vueEcole(jetonDirA)).json).toEqual({ providerActif: 'anthropic', echelle: null }); // pas encore sondé
    doublerSources();
    await ecrire(jetonSuper, { action: 'sonder' });
    expect((await vueEcole(t2)).json).toEqual({ providerActif: 'gemini', echelle: null });
  });

  it('le super-administrateur lit la vue de l’école sélectionnée (en-tête x-educhat-ecole)', async () => {
    const db = await base();
    const now = Date.now();
    db.prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?, ?, 1, ?)').run('super@educh.at', ecoleA, now);
    db.prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?, ?, 1, ?)').run('super@educh.at', ecoleB, now + 1);
    doublerSources();
    await ecrire(jetonSuper, { action: 'sonder' });
    expect((await vueEcole(jetonSuper, { 'x-educhat-ecole': String(ecoleB) })).json.providerActif).toBe('mistral');
    expect((await vueEcole(jetonSuper, { 'x-educhat-ecole': String(ecoleA) })).json.providerActif).toBe('anthropic');
    // Sans le drapeau, le même compte reçoit la vue du site.
    expect((await lire(jetonSuper, {}, { 'x-educhat-ecole': String(ecoleA) })).json.tarifs).toHaveLength(PROVIDER_IDS.length);
  });

  it('un administrateur d’école ne peut pas désigner l’école d’autrui par l’en-tête', async () => {
    const r = await vueEcole(jetonDirA, { 'x-educhat-ecole': String(ecoleB) });
    expect(r.status).toBe(200);
    expect(r.json.providerActif).toBe('anthropic');
  });
});

describe('Scénarios d’erreur et droits', () => {
  it('sans jeton, ou enseignant non administrateur : 403 ERR_FORBIDDEN (les deux vues)', async () => {
    for (const r of [await lire(undefined), await vueEcole(jetonProfA), await lire(jetonProfA)]) {
      expect(r.status).toBe(403);
      expect(r.json.error.code).toBe('ERR_FORBIDDEN');
    }
  });

  it('une école qui demande la vue du site : 403 ERR_SUPER_ONLY', async () => {
    const r = await lire(jetonDirA);
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ERR_SUPER_ONLY');
  });

  it('un super sans aucune école qui demande la vue d’école : 403 ERR_NO_ETABLISSEMENT', async () => {
    const r = await vueEcole(jetonSuper);
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ERR_NO_ETABLISSEMENT');
  });

  it('une école ne règle aucun tarif et ne relance pas la sonde : 403 ERR_SUPER_ONLY, aucun appel sortant', async () => {
    const espion = doublerSources();
    for (const body of [{ provider: 'anthropic', prixMtok: 1 }, { action: 'sonder' }]) {
      const r = await ecrire(jetonDirA, body);
      expect(r.status).toBe(403);
      expect(r.json.error.code).toBe('ERR_SUPER_ONLY');
    }
    expect((await ecrire(undefined, { action: 'sonder' })).status).toBe(403);
    expect(espion).not.toHaveBeenCalled();
    expect((await base()).prepare('SELECT COUNT(*) AS n FROM tarifs').get()).toEqual({ n: 0 });
  });

  it('fournisseur inconnu : 400 ERR_PROVIDER_UNKNOWN', async () => {
    for (const body of [{ provider: 'inconnu', prixMtok: 1 }, { prixMtok: 1 }, undefined]) {
      const r = await ecrire(jetonSuper, body);
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('ERR_PROVIDER_UNKNOWN');
    }
  });

  it('prix négatif, non numérique, infini ou absent : 400 ERR_PRICE_INVALID', async () => {
    for (const prixMtok of [-1, 'abc', 'Infinity', undefined]) {
      const r = await ecrire(jetonSuper, { provider: 'anthropic', prixMtok });
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('ERR_PRICE_INVALID');
    }
  });

  it('ANOMALIE — un prix vide ou null est accepté comme 0 (Number("") = Number(null) = 0)', async () => {
    await ecrire(jetonSuper, { provider: 'anthropic', prixMtok: 5 });
    for (const prixMtok of ['', null]) {
      const r = await ecrire(jetonSuper, { provider: 'anthropic', prixMtok });
      expect(r.status).toBe(200);
    }
    expect(((await base()).prepare('SELECT prix_mtok FROM tarifs WHERE provider = ?').get('anthropic') as any).prix_mtok).toBe(0);
  });

  it('catalogue OpenRouter en panne : la sonde répond 200, dit la panne, garde les prix appliqués', async () => {
    doublerSources();
    await ecrire(jetonSuper, { action: 'sonder' });
    vi.unstubAllGlobals();
    doublerSources({ statutCatalogue: 502, catalogue: CATALOGUE });
    const s = await ecrire(jetonSuper, { action: 'sonder' });
    expect(s.status).toBe(200);
    expect(s.json.propositions[0].detail).toBe('Catalogue OpenRouter injoignable : HTTP 502');
    const r = await lire(jetonSuper);
    expect(r.json.appliques).toHaveLength(9);
    expect(r.json.manquants).toEqual([]);
  });

  it('méthode non autorisée : 405 et en-tête Allow', async () => {
    for (const method of ['PUT', 'DELETE', 'PATCH']) {
      const r = await appeler(route, { method, token: jetonSuper, ip: ipNeuve() });
      expect(r.status).toBe(405);
      expect(r.json.error.code).toBe('ERR_METHOD_NOT_ALLOWED');
      expect(r.headers.allow).toEqual(['GET', 'POST']);
    }
  });
});
