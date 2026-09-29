// UC-24 — Tests unitaires : src/server/traduction.ts — lecture (traduction
// fraîche, états, résumé), et traduction effective d'un tuteur par l'API
// Anthropic, doublée (doublerFetch) : aucun appel réseau réel.
//
// La clé interne Anthropic est lue par src/utils/env.ts AU CHARGEMENT : on la
// pose donc dans vi.hoisted, qui s'exécute avant les imports de ce fichier
// (et après tests/setup.ts, qui efface les clés du poste).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => { process.env.SECRET_ANTHROPIC_API_KEY = 'cle-anthropic-de-test'; });

import { viderBase, base, creerTuteur } from '../../helpers/db';
import { doublerFetch } from '../../helpers/fetch';
import {
  isLocale, LOCALES, traductionFraiche, etatsPour, resumeTraductions, traduireTuteur, planifierTraduction,
  MODELE_TRADUCTION,
} from '../../../src/server/traduction';
import { toCard } from '../../../src/server/prompts';
import type { PromptRow } from '../../../src/server/db';
import { cibleDe, traductionReussie } from './outils';

beforeEach(async () => { await viderBase(); });
afterEach(() => { vi.unstubAllGlobals(); });

async function poserTraduction(promptId: number, locale: string, o: {
  state?: string; sourceVersion?: number; name?: string; description?: string; body?: string;
} = {}) {
  (await base()).prepare(`INSERT OR REPLACE INTO prompt_translations
      (prompt_id, locale, name, description, body, auto, updated_at, source_version, state, detail, model, tokens)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, '', 'm', 5)`)
    .run(promptId, locale, o.name ?? `Nom ${locale}`, o.description ?? `Desc ${locale}`,
      o.body ?? `Corps traduit en ${locale}, assez long pour passer.`, Date.now(), o.sourceVersion ?? 1, o.state ?? 'ok');
}

async function traductions(promptId: number) {
  return (await base()).prepare('SELECT * FROM prompt_translations WHERE prompt_id = ? ORDER BY locale').all(promptId) as any[];
}

async function monter(id: number, version: number) {
  (await base()).prepare('UPDATE prompts SET version = ? WHERE id = ?').run(version, id);
}

describe('isLocale', () => {
  it('ne connaît que les quatre langues du site', () => {
    expect(LOCALES).toEqual(['fr', 'en', 'it', 'de']);
    for (const l of LOCALES) expect(isLocale(l)).toBe(true);
    for (const l of ['es', 'FR', '', undefined, 3]) expect(isLocale(l)).toBe(false);
  });
});

describe('traductionFraiche', () => {
  it('sert une traduction « ok » issue de la version courante (ou ultérieure)', async () => {
    const id = await creerTuteur({ name: 'Socrate' });
    await poserTraduction(id, 'en', { sourceVersion: 1 });
    expect(traductionFraiche(id, 1, 'en')).toMatchObject({ name: 'Nom en', body: expect.stringContaining('en') });
    await poserTraduction(id, 'it', { sourceVersion: 3 });
    expect(traductionFraiche(id, 2, 'it')).toBeDefined();
  });
  it('ne sert jamais une traduction périmée, en attente, en échec, vide, ou une langue inconnue', async () => {
    const id = await creerTuteur({ name: 'Socrate' });
    await poserTraduction(id, 'en', { sourceVersion: 1 });
    await poserTraduction(id, 'it', { state: 'pending' });
    await poserTraduction(id, 'de', { state: 'failed' });
    expect(traductionFraiche(id, 2, 'en')).toBeUndefined(); // périmée
    expect(traductionFraiche(id, 1, 'it')).toBeUndefined();
    expect(traductionFraiche(id, 1, 'de')).toBeUndefined();
    expect(traductionFraiche(id, 1, 'es')).toBeUndefined();
    await poserTraduction(id, 'de', { body: '' });
    expect(traductionFraiche(id, 1, 'de')).toBeUndefined();
  });
  it('toCard affiche le titre traduit sans jamais changer le nom canonique', async () => {
    const id = await creerTuteur({ name: 'Socrate' });
    await poserTraduction(id, 'en', { name: 'Socrates', description: 'Maieutics' });
    const row = (await base()).prepare('SELECT * FROM prompts WHERE id = ?').get(id) as PromptRow;
    expect(toCard(row, 'en')).toMatchObject({ name: 'Socrate', title: 'Socrates', description: 'Maieutics', translated: true });
    expect(toCard(row, 'fr')).toMatchObject({ title: 'Socrate', translated: false });
  });
});

describe('etatsPour / resumeTraductions', () => {
  it('liste les trois langues autres que celle du tuteur, « absent » par défaut', async () => {
    const id = await creerTuteur({ name: 'Socrates', language: 'en' });
    const etats = etatsPour({ id, version: 1, language: 'en' });
    expect(etats.map(e => e.locale)).toEqual(['fr', 'it', 'de']);
    expect(etats.every(e => e.state === 'absent' && !e.perimee)).toBe(true);
  });
  it('une langue source inconnue est traitée comme du français', async () => {
    const id = await creerTuteur({ name: 'Socrate' });
    expect(etatsPour({ id, version: 1, language: 'xx' }).map(e => e.locale)).toEqual(['en', 'it', 'de']);
  });
  it('périmée = « ok » d’une version antérieure ; un état inconnu se lit « failed »', async () => {
    const id = await creerTuteur({ name: 'Socrate' });
    await poserTraduction(id, 'en', { sourceVersion: 1 });
    await poserTraduction(id, 'it', { sourceVersion: 1, state: 'pending' });
    await poserTraduction(id, 'de', { sourceVersion: 1, state: 'bizarre' });
    const etats = etatsPour({ id, version: 2, language: 'fr' });
    expect(etats.map(e => [e.locale, e.state, e.perimee])).toEqual([
      ['en', 'ok', true], ['it', 'pending', false], ['de', 'failed', false],
    ]);
    expect(resumeTraductions({ id, version: 2, language: 'fr' })).toMatchObject({
      pretes: 0, total: 3, aVerifier: true, enEchec: true, enCours: true,
    });
    expect(resumeTraductions({ id, version: 1, language: 'fr' })).toMatchObject({ pretes: 1, aVerifier: false });
  });
});

describe('traduireTuteur — appel au modèle (réseau doublé)', () => {
  it('traduit dans les trois autres langues, sur la clé interne, avec Haiku à température 0', async () => {
    const id = await creerTuteur({ name: 'Socrate', description: 'Maïeutique' });
    const reseau = doublerFetch((_url, init) => traductionReussie(init));
    const etats = await traduireTuteur(id);

    expect(reseau).toHaveBeenCalledTimes(3);
    const [url, init] = reseau.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('cle-anthropic-de-test');
    const demande = JSON.parse(String(init.body));
    expect(demande).toMatchObject({ model: MODELE_TRADUCTION, temperature: 0 });
    expect(demande.system).toContain('TUTEURS SOCRATIQUES');
    expect(demande.messages[0].content).toContain('Langue source : français');
    expect(demande.messages[0].content).toContain('<<<3>>>\nTu es Socrate');
    expect(reseau.mock.calls.map(c => cibleDe(c[1] as RequestInit)).sort()).toEqual(['de', 'en', 'it']);

    expect(etats.map(e => [e.locale, e.state])).toEqual([['en', 'ok'], ['it', 'ok'], ['de', 'ok']]);
    const en = (await traductions(id)).find(t => t.locale === 'en');
    expect(en).toMatchObject({ name: '[en] Socrate', description: '[en] Maïeutique', source_version: 1, tokens: 150, state: 'ok', model: MODELE_TRADUCTION });
    expect(en.body.startsWith('[en] Tu es Socrate')).toBe(true);
  });

  it('journalise la dépense sans IP ni établissement (dépense de la plateforme)', async () => {
    const id = await creerTuteur({ name: 'Socrate' });
    doublerFetch((_url, init) => traductionReussie(init));
    await traduireTuteur(id);
    const log = (await base()).prepare('SELECT * FROM usage_log WHERE prompt_id = ?').all(id) as any[];
    expect(log).toHaveLength(3);
    for (const l of log) {
      expect(l).toMatchObject({ ip: '', etablissement_id: null, teacher_email: null, provider: 'anthropic', tokens: 150, used_server_key: 1, client_id: 'traduction' });
    }
  });

  it('est idempotent : ce qui est à jour n’est pas retraduit, sauf si l’on force', async () => {
    const id = await creerTuteur({ name: 'Socrate' });
    const reseau = doublerFetch((_url, init) => traductionReussie(init));
    await traduireTuteur(id);
    await traduireTuteur(id);
    expect(reseau).toHaveBeenCalledTimes(3);
    await traduireTuteur(id, true);
    expect(reseau).toHaveBeenCalledTimes(6);
  });

  it('une nouvelle version du tuteur relance la traduction des seules langues périmées', async () => {
    const id = await creerTuteur({ name: 'Socrate' });
    await poserTraduction(id, 'en', { sourceVersion: 2 });
    await poserTraduction(id, 'it', { sourceVersion: 1 });
    await monter(id, 2);
    const reseau = doublerFetch((_url, init) => traductionReussie(init));
    await traduireTuteur(id);
    expect(reseau.mock.calls.map(c => cibleDe(c[1] as RequestInit)).sort()).toEqual(['de', 'it']);
    expect((await traductions(id)).map(t => t.source_version)).toEqual([2, 2, 2]);
  });

  it('un tuteur anglais est traduit en français, italien et allemand', async () => {
    const id = await creerTuteur({ name: 'Socrates', language: 'en' });
    const reseau = doublerFetch((_url, init) => traductionReussie(init));
    await traduireTuteur(id);
    expect(reseau.mock.calls.map(c => cibleDe(c[1] as RequestInit)).sort()).toEqual(['de', 'fr', 'it']);
  });

  it('tuteur inconnu : rien à faire', async () => {
    const reseau = doublerFetch(() => ({ status: 500 }));
    expect(await traduireTuteur(999999)).toEqual([]);
    expect(reseau).not.toHaveBeenCalled();
  });
});

describe('traduireTuteur — échecs', () => {
  it('erreur HTTP du fournisseur : état « failed » avec son message', async () => {
    const id = await creerTuteur({ name: 'Socrate' });
    doublerFetch(() => ({ status: 529, json: { error: { message: 'Overloaded' } } }));
    const etats = await traduireTuteur(id);
    expect(etats.every(e => e.state === 'failed' && e.detail === 'Overloaded')).toBe(true);
  });

  it('erreur HTTP sans corps lisible : « HTTP <code> »', async () => {
    const id = await creerTuteur({ name: 'Socrate' });
    doublerFetch(() => ({ status: 502, text: '<html>Bad gateway</html>', headers: { 'content-type': 'text/html' } }));
    expect((await traduireTuteur(id))[0].detail).toBe('HTTP 502');
  });

  it('réponse tronquée, illisible (sans marqueurs) ou corps trop court : « failed »', async () => {
    for (const [reponse, detail] of [
      [{ content: [{ type: 'text', text: 'x' }], stop_reason: 'max_tokens' }, 'tronquée'],
      [{ content: [{ type: 'text', text: 'Voici la traduction : bla bla' }] }, 'illisible'],
      [{ content: [{ type: 'text', text: '<<<1>>>\nN\n<<<2>>>\nD\n<<<3>>>\ncourt\n<<<0>>>' }] }, 'trop court'],
    ] as const) {
      await viderBase();
      const id = await creerTuteur({ name: 'Socrate' });
      doublerFetch(() => ({ json: reponse }));
      const etats = await traduireTuteur(id);
      expect(etats[0].state).toBe('failed');
      expect(etats[0].detail).toContain(detail);
    }
  });

  it('découpe sur n’importe quel marqueur, même « traduit » par le modèle', async () => {
    const id = await creerTuteur({ name: 'Socrate' });
    doublerFetch(() => ({
      json: { content: [{ type: 'text', text: '<<<NOME>>>\nSocrate\n<<<DESCRIZIONE>>>\nMaieutica\n<<<CORPO>>>\nSei Socrate: fai domande, non dare mai la risposta.\n<<<FINE>>>' }] },
    }));
    const etats = await traduireTuteur(id);
    expect(etats.every(e => e.state === 'ok')).toBe(true);
    expect((await traductions(id))[0].description).toBe('Maieutica');
  });

  it('un corps au-delà de 48 Ko n’est pas envoyé au modèle', async () => {
    const id = await creerTuteur({ name: 'Gros', body: 'x'.repeat(48 * 1024 + 1) });
    const reseau = doublerFetch(() => ({ status: 500 }));
    const etats = await traduireTuteur(id);
    expect(reseau).not.toHaveBeenCalled();
    expect(etats.every(e => e.state === 'failed' && e.detail.includes('48 Ko'))).toBe(true);
  });

  it('le message de dépassement compte en OCTETS, comme la limite', async () => {
    // Anomalie mineure corrigée (fiche UC-24) : 30 000 « é » = 29 Ko en
    // caractères mais 59 Ko en octets UTF-8.
    const id = await creerTuteur({ name: 'Accentué', body: 'é'.repeat(30_000) });
    doublerFetch(() => ({ status: 500 }));
    const etats = await traduireTuteur(id);
    expect(etats[0].detail).toMatch(/^Corps de 59 Ko/);
  });

  it('un échec conserve la traduction précédente (périmée, donc non servie)', async () => {
    const id = await creerTuteur({ name: 'Socrate' });
    await poserTraduction(id, 'en', { sourceVersion: 1, body: 'Ancienne traduction anglaise, conservée.' });
    await monter(id, 2);
    doublerFetch(() => ({ status: 500 }));
    await traduireTuteur(id);
    const en = (await traductions(id)).find(t => t.locale === 'en');
    expect(en).toMatchObject({ state: 'failed', source_version: 1, body: 'Ancienne traduction anglaise, conservée.' });
    expect(traductionFraiche(id, 2, 'en')).toBeUndefined();
  });

  // Anomalie corrigée (fiche UC-24) : une retraduction FORCÉE qui échouait
  // faisait passer à « failed » une traduction pourtant à jour.
  it('une retraduction forcée qui échoue laisse EN SERVICE la traduction à jour', async () => {
    const id = await creerTuteur({ name: 'Socrate' });
    await poserTraduction(id, 'en', { sourceVersion: 1, body: 'Traduction anglaise à jour, toujours servie.' });
    expect(traductionFraiche(id, 1, 'en')).toBeDefined();
    doublerFetch(() => ({ status: 500, json: { error: { message: 'Overloaded' } } }));
    const etats = await traduireTuteur(id, true);
    expect(traductionFraiche(id, 1, 'en')?.body).toBe('Traduction anglaise à jour, toujours servie.');
    const en = etats.find(e => e.locale === 'en')!;
    expect(en).toMatchObject({ state: 'ok', perimee: false, sourceVersion: 1 });
    // L'échec reste lisible pour l'administration.
    expect(en.detail).toContain('Overloaded');
    expect(en.detail).toContain('conservée');
    // Les langues sans traduction, elles, échouent normalement.
    expect(etats.find(e => e.locale === 'de')?.state).toBe('failed');
  });

  it('une retraduction forcée ne met pas « pending » une langue à jour pendant l’appel', async () => {
    const id = await creerTuteur({ name: 'Socrate' });
    await poserTraduction(id, 'en', { sourceVersion: 1 });
    let pendantAppel: unknown;
    doublerFetch(async (_url, init) => {
      pendantAppel ??= traductionFraiche(id, 1, 'en');
      return traductionReussie(init);
    });
    await traduireTuteur(id, true);
    expect(pendantAppel).toBeDefined();
    // Réussie, elle remplace l'ancienne et efface toute note d'échec.
    const en = (await traductions(id)).find(t => t.locale === 'en');
    expect(en).toMatchObject({ state: 'ok', detail: '' });
  });

  it('deux traductions simultanées du même tuteur n’appellent le modèle qu’une fois', async () => {
    const id = await creerTuteur({ name: 'Socrate' });
    let liberer!: () => void;
    const verrou = new Promise<void>(r => { liberer = r; });
    const reseau = doublerFetch(async (_url, init) => { await verrou; return traductionReussie(init); });
    const premiere = traduireTuteur(id);
    await new Promise(r => setTimeout(r, 5));
    const seconde = await traduireTuteur(id);
    // La seconde rend l'état courant sans attendre : la première langue est « pending ».
    expect(seconde.find(e => e.locale === 'en')?.state).toBe('pending');
    liberer();
    await premiere;
    expect(reseau).toHaveBeenCalledTimes(3);
  });

  it('planifierTraduction n’attend pas et absorbe toute erreur', async () => {
    const id = await creerTuteur({ name: 'Socrate' });
    doublerFetch(() => { throw new Error('réseau coupé'); });
    expect(planifierTraduction(id)).toBeUndefined();
    await new Promise(r => setTimeout(r, 20));
    expect((await traductions(id)).every(t => t.state === 'failed' && t.detail === 'réseau coupé')).toBe(true);
  });
});
