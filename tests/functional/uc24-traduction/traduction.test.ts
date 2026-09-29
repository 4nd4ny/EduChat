// UC-24 — Tests fonctionnels : « Traduire automatiquement un tuteur ».
// Enchaîne les vraies routes : validation (PATCH approve) qui planifie la
// traduction, fiche et catalogue qui la servent (GET /api/prompts/[name],
// GET /api/prompts ?locale=), édition qui la périme, liste d'administration
// qui l'expose, et retraduction (PATCH retranslate). Seul le fournisseur
// (fetch vers api.anthropic.com) est doublé.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => { process.env.SECRET_ANTHROPIC_API_KEY = 'cle-anthropic-de-test'; });

import { appeler } from '../../helpers/api';
import { viderBase, base, creerCompte, creerTuteur } from '../../helpers/db';
import { doublerFetch } from '../../helpers/fetch';
import { traductionReussie } from '../../unit/uc24-traduction/outils';

const notifications: string[] = [];
vi.mock('../../../src/server/mail', () => ({
  notifyAdmin: vi.fn((sujet: string) => { notifications.push(sujet); }),
  sendVerificationCode: vi.fn(async () => {}),
  sendEmailChangeCode: vi.fn(async () => {}),
  sendEmailChangeWarning: vi.fn(() => {}),
}));

import catalogue from '../../../src/pages/api/prompts/index';
import tuteur from '../../../src/pages/api/prompts/[name]/index';
import listeAdmin from '../../../src/pages/api/admin/prompts';

let n = 0;
const ipNeuve = () => `203.0.113.${++n}`;
const CORPS_2 = 'Tu es Socrate, version revue. Une seule question à la fois, jamais la réponse.';

beforeEach(async () => {
  await viderBase();
  notifications.length = 0;
});
afterEach(() => { vi.unstubAllGlobals(); });

async function agir(nom: string, body: Record<string, unknown>, token?: string) {
  return appeler(tuteur, { method: 'PATCH', query: { name: nom }, body, token, ip: ipNeuve() });
}

/** Attend que la traduction d'arrière-plan n'ait plus aucune langue « en attente ». */
async function attendreTraductions(nom: string) {
  const db = await base();
  for (let i = 0; i < 100; i++) {
    const r = db.prepare(`SELECT COUNT(*) AS total, SUM(t.state = 'pending') AS attente FROM prompt_translations t
      JOIN prompts p ON p.id = t.prompt_id WHERE p.name = ?`).get(nom) as { total: number; attente: number };
    if (r.total === 3 && !r.attente) return;
    await new Promise(res => setTimeout(res, 5));
  }
  throw new Error('traduction jamais terminée');
}

async function fiche(nom: string, locale?: string) {
  return appeler(tuteur, { query: { name: nom, ...(locale ? { locale } : {}) }, ip: ipNeuve() });
}

describe('Scénario nominal : un tuteur validé est traduit et servi dans la langue du lecteur', () => {
  it('approve planifie la traduction ; la fiche et le catalogue servent la version traduite', async () => {
    const sup = await creerCompte('super@educh.at');
    await creerTuteur({ name: 'Socrate', status: 'pending', description: 'Maïeutique' });
    const reseau = doublerFetch((_url, init) => traductionReussie(init));

    const r = await agir('Socrate', { action: 'approve' }, sup);
    expect(r.json).toEqual({ ok: true, status: 'published' }); // n'attend pas la traduction
    await attendreTraductions('Socrate');
    expect(reseau).toHaveBeenCalledTimes(3);

    const en = await fiche('Socrate', 'en');
    expect(en.json.prompt).toMatchObject({
      name: 'Socrate', title: '[en] Socrate', description: '[en] Maïeutique', translated: true,
    });
    expect(en.json.prompt.body.startsWith('[en] Tu es Socrate')).toBe(true);
    expect(en.json.prompt.translations.map((t: any) => [t.locale, t.state])).toEqual([['en', 'ok'], ['it', 'ok'], ['de', 'ok']]);

    // Sans locale (ou en français) : l'original.
    const fr = await fiche('Socrate');
    expect(fr.json.prompt).toMatchObject({ title: 'Socrate', translated: false });
    expect(fr.json.prompt.body.startsWith('Tu es Socrate')).toBe(true);

    // Le catalogue affiche le titre traduit et la recherche trouve la traduction.
    const de = await appeler(catalogue, { query: { locale: 'de', q: '[de] Maïeu' }, ip: ipNeuve() });
    expect(de.json.prompts).toHaveLength(1);
    expect(de.json.prompts[0]).toMatchObject({ name: 'Socrate', title: '[de] Socrate' });
  });
});

describe('Scénario alternatif : une modification périme les traductions', () => {
  it('nouvelle version → original servi partout, alerte à l’administration, « à vérifier » dans la liste', async () => {
    const sup = await creerCompte('super@educh.at');
    const auteur = await creerCompte('auteur@x.ch');
    await creerTuteur({ name: 'Socrate', status: 'pending', authorEmail: 'auteur@x.ch' });
    doublerFetch((_url, init) => traductionReussie(init));
    await agir('Socrate', { action: 'approve' }, sup);
    await attendreTraductions('Socrate');

    expect((await agir('Socrate', { action: 'edit', body: CORPS_2 }, auteur)).json.version).toBe(2);
    expect(notifications).toContain('Traductions à revérifier : Socrate');

    const en = await fiche('Socrate', 'en');
    expect(en.json.prompt.translated).toBe(false);
    expect(en.json.prompt.body).toBe(CORPS_2);
    expect(en.json.prompt.translations.every((t: any) => t.perimee)).toBe(true);

    const liste = await appeler(listeAdmin, { token: sup });
    expect(liste.json.prompts[0].translations).toMatchObject({ pretes: 0, aVerifier: true, total: 3 });
  });

  it('la retraduction par le super-administrateur rend les traductions fraîches', async () => {
    const sup = await creerCompte('super@educh.at');
    await creerTuteur({ name: 'Socrate', status: 'published' });
    (await base()).prepare("UPDATE prompts SET version = 2, body = ? WHERE name = 'Socrate'").run(CORPS_2);
    const reseau = doublerFetch((_url, init) => traductionReussie(init));

    const r = await agir('Socrate', { action: 'retranslate' }, sup);
    expect(r.status).toBe(200);
    expect(r.json.translations.map((t: any) => [t.locale, t.state, t.perimee, t.sourceVersion]))
      .toEqual([['en', 'ok', false, 2], ['it', 'ok', false, 2], ['de', 'ok', false, 2]]);
    expect(reseau).toHaveBeenCalledTimes(3);

    // Relancer sans forcer ne coûte rien ; forcer retraduit.
    await agir('Socrate', { action: 'retranslate' }, sup);
    expect(reseau).toHaveBeenCalledTimes(3);
    await agir('Socrate', { action: 'retranslate', force: true }, sup);
    expect(reseau).toHaveBeenCalledTimes(6);
    expect((await fiche('Socrate', 'it')).json.prompt.body.startsWith('[it] Tu es Socrate, version revue')).toBe(true);
  });

  it('republier un tuteur modifié pendant sa dépublication relance la traduction', async () => {
    const auteur = await creerCompte('auteur@x.ch');
    await creerTuteur({ name: 'Socrate', status: 'retired', authorEmail: 'auteur@x.ch' });
    const reseau = doublerFetch((_url, init) => traductionReussie(init));
    expect((await agir('Socrate', { action: 'republish' }, auteur)).status).toBe(200);
    await attendreTraductions('Socrate');
    expect(reseau).toHaveBeenCalledTimes(3);
  });
});

describe('Scénarios d’erreur', () => {
  it('un fournisseur en panne ne bloque pas la publication ; l’échec se lit dans l’administration', async () => {
    const sup = await creerCompte('super@educh.at');
    await creerTuteur({ name: 'Socrate', status: 'pending' });
    doublerFetch(() => ({ status: 529, json: { error: { message: 'Overloaded' } } }));
    expect((await agir('Socrate', { action: 'approve' }, sup)).json.status).toBe('published');
    await attendreTraductions('Socrate');

    const en = await fiche('Socrate', 'en');
    expect(en.status).toBe(200);
    expect(en.json.prompt.translated).toBe(false);
    const liste = await appeler(listeAdmin, { token: sup });
    expect(liste.json.prompts[0].translations).toMatchObject({ enEchec: true, pretes: 0 });
    expect(liste.json.prompts[0].translations.etats[0].detail).toBe('Overloaded');
  });

  it('seul le super-administrateur relance la traduction', async () => {
    const auteur = await creerCompte('auteur@x.ch');
    await creerTuteur({ name: 'Socrate', status: 'published', authorEmail: 'auteur@x.ch' });
    const reseau = doublerFetch((_url, init) => traductionReussie(init));
    for (const jeton of [auteur, undefined]) {
      const r = await agir('Socrate', { action: 'retranslate' }, jeton);
      expect(r.status).toBe(403);
      expect(r.json.error.code).toBe('ERR_FORBIDDEN');
    }
    expect(reseau).not.toHaveBeenCalled();
  });

  it('une langue inconnue retombe sur l’original', async () => {
    const id = await creerTuteur({ name: 'Socrate' });
    (await base()).prepare(`INSERT INTO prompt_translations (prompt_id, locale, name, description, body, auto, updated_at, source_version, state)
      VALUES (?, 'es', 'Sócrates', 'x', 'Eres Sócrates, haz preguntas y nunca des la respuesta.', 1, 0, 1, 'ok')`).run(id);
    const es = await fiche('Socrate', 'es');
    expect(es.json.prompt).toMatchObject({ title: 'Socrate', translated: false });
  });
});
