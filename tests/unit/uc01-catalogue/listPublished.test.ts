// UC-01 — Tests unitaires : la liste et la fiche du catalogue
// (src/server/prompts.ts : listPublished, toCard, getPublishedByName,
// nomsDeLEcole) et le choix de la traduction servie
// (src/server/traduction.ts : traductionFraiche).
import { describe, it, expect, beforeEach } from 'vitest';
import { viderBase, creerTuteur, creerEtablissement, base } from '../../helpers/db';
import {
  listPublished, toCard, getPublishedByName, nomsDeLEcole, getByName,
} from '../../../src/server/prompts';
import { traductionFraiche } from '../../../src/server/traduction';

const DEHORS = { etablissementId: null, publicsExternes: true };
const JOUR = 86_400_000;

beforeEach(async () => { await viderBase(); });

const noms = (sort: string, q = '', portee = DEHORS, locale?: string) =>
  listPublished(sort, q, locale, portee).map(c => c.name);

async function traduire(id: number, locale: string, o: { name: string; description: string; body?: string; sourceVersion?: number; state?: string }) {
  (await base()).prepare(`INSERT INTO prompt_translations (prompt_id, locale, name, description, body, auto, updated_at, source_version, state)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`)
    .run(id, locale, o.name, o.description, o.body ?? 'Corps traduit, assez long pour compter.', Date.now(),
      o.sourceVersion ?? 1, o.state ?? 'ok');
}

describe('listPublished — tris exécutés en base', () => {
  beforeEach(async () => {
    const vieux = Date.now() - 400 * JOUR;
    await creerTuteur({ name: 'Alpha', usage: 100, createdAt: vieux });
    await creerTuteur({ name: 'beta', usage: 0, createdAt: Date.now() });
    await creerTuteur({ name: 'Gamma', usage: 3, ratingSum: 5, ratingCount: 1, createdAt: vieux - JOUR });
    await creerTuteur({ name: 'Delta', usage: 10, ratingSum: 12, ratingCount: 4, createdAt: vieux + JOUR });
  });

  it('« score » (défaut) mêle usage, note et fraîcheur', () => {
    // Alpha ≈ 100 ; beta ≈ 50 (neuf) ; Delta ≈ 10 + 15 ; Gamma ≈ 3 + 25.
    expect(noms('score')).toEqual(['Alpha', 'beta', 'Gamma', 'Delta']);
  });
  it('un tri inconnu retombe sur « score »', () => {
    expect(noms('n-importe-quoi')).toEqual(noms('score'));
  });
  it('« uses » : par usage décroissant', () => {
    expect(noms('uses')).toEqual(['Alpha', 'Delta', 'Gamma', 'beta']);
  });
  it('« rating » : par moyenne, les non notés en dernier', () => {
    const ordre = noms('rating');
    expect(ordre.slice(0, 2)).toEqual(['Gamma', 'Delta']);
    // Les deux non notés ferment la marche (ordre entre eux non spécifié).
    expect(ordre.slice(2).sort()).toEqual(['Alpha', 'beta']);
  });
  it('« recent » : par date de création décroissante', () => {
    expect(noms('recent')).toEqual(['beta', 'Delta', 'Alpha', 'Gamma']);
  });
  it('« name » : alphabétique, insensible à la casse', () => {
    expect(noms('name')).toEqual(['Alpha', 'beta', 'Delta', 'Gamma']);
  });
  it('« tokens » : par jetons consommés', async () => {
    (await base()).prepare("UPDATE prompts SET tokens_total = 999 WHERE name = 'Gamma'").run();
    expect(noms('tokens')[0]).toBe('Gamma');
  });
  it('« updated » : par dernière modification', async () => {
    (await base()).prepare("UPDATE prompts SET updated_at = ? WHERE name = 'Delta'").run(Date.now() + 1000);
    expect(noms('updated')[0]).toBe('Delta');
  });
});

describe('listPublished — recherche', () => {
  it('cherche dans le nom et la description', async () => {
    await creerTuteur({ name: 'Pythagore', description: 'Géométrie du triangle' });
    await creerTuteur({ name: 'Molière', description: 'Théâtre classique' });
    expect(noms('name', 'pyth')).toEqual(['Pythagore']);
    expect(noms('name', 'théâtre')).toEqual(['Molière']);
    expect(noms('name', 'introuvable')).toEqual([]);
    expect(noms('name', '')).toEqual(['Molière', 'Pythagore']);
  });
  it('cherche aussi dans la traduction fraîche de la locale demandée', async () => {
    const id = await creerTuteur({ name: 'Questionneur', description: 'Pose des questions' });
    await traduire(id, 'de', { name: 'Fragensteller', description: 'Stellt Fragen' });
    expect(noms('name', 'Fragen', DEHORS, 'de')).toEqual(['Questionneur']);
    expect(noms('name', 'Fragen', DEHORS, 'it')).toEqual([]);
  });
});

describe('listPublished — visibilité', () => {
  it('ne sert que les tuteurs publiés et non archivés', async () => {
    await creerTuteur({ name: 'Publie' });
    for (const status of ['draft', 'pending', 'retired'] as const) await creerTuteur({ name: `T ${status}`, status });
    await creerTuteur({ name: 'Archive', archived: true });
    expect(noms('name')).toEqual(['Publie']);
  });
  it('filtre selon la portée : plateforme, mon école, partagés du dehors', async () => {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    await creerTuteur({ name: 'Plateforme' });
    await creerTuteur({ name: 'Reserve A', etablissementId: a });
    await creerTuteur({ name: 'Reserve B', etablissementId: b });
    await creerTuteur({ name: 'Partage B', etablissementId: b, publie: true });

    expect(noms('name')).toEqual(['Partage B', 'Plateforme']);
    expect(noms('name', '', { etablissementId: a, publicsExternes: false })).toEqual(['Plateforme', 'Reserve A']);
    expect(noms('name', '', { etablissementId: a, publicsExternes: true })).toEqual(['Partage B', 'Plateforme', 'Reserve A']);
  });
});

describe('toCard', () => {
  it('expose les champs publics, arrondit la moyenne, jamais le share_token', async () => {
    const id = await creerTuteur({ name: 'Carte', ratingSum: 11, ratingCount: 3, usage: 7, webSearch: true, shareToken: 'a'.repeat(32) });
    const carte = toCard(getByName('Carte')!);
    expect(carte).toMatchObject({
      name: 'Carte', title: 'Carte', authorName: 'EduChat', language: 'fr', version: 1,
      usageCount: 7, ratingAvg: 3.7, ratingCount: 3, webSearch: true, translated: false,
    });
    expect(Object.keys(carte)).not.toContain('shareToken');
    expect(JSON.stringify(carte)).not.toContain('a'.repeat(32));
    expect(id).toBeGreaterThan(0);
  });
  it('moyenne nulle tant que personne n’a noté', async () => {
    await creerTuteur({ name: 'Neuf' });
    expect(toCard(getByName('Neuf')!).ratingAvg).toBeNull();
  });
  it('titre et description traduits, nom canonique conservé', async () => {
    const id = await creerTuteur({ name: 'Socrate' });
    await traduire(id, 'en', { name: 'Socrates', description: 'Asks questions' });
    const carte = toCard(getByName('Socrate')!, 'en');
    expect(carte).toMatchObject({ name: 'Socrate', title: 'Socrates', description: 'Asks questions', translated: true });
  });
});

describe('traductionFraiche', () => {
  it('ne sert ni une traduction périmée, ni en échec, ni une locale inconnue', async () => {
    const id = await creerTuteur({ name: 'Versionne' });
    (await base()).prepare('UPDATE prompts SET version = 2 WHERE id = ?').run(id);
    await traduire(id, 'en', { name: 'Old', description: 'old', sourceVersion: 1 });
    await traduire(id, 'it', { name: 'Nuovo', description: 'nuovo', sourceVersion: 2, state: 'failed' });
    await traduire(id, 'de', { name: 'Neu', description: 'neu', sourceVersion: 2 });
    expect(traductionFraiche(id, 2, 'en')).toBeUndefined();
    expect(traductionFraiche(id, 2, 'it')).toBeUndefined();
    expect(traductionFraiche(id, 2, 'xx')).toBeUndefined();
    expect(traductionFraiche(id, 2, 'de')?.name).toBe('Neu');
  });
});

describe('getPublishedByName et nomsDeLEcole', () => {
  it('la fiche obéit à la même portée que la liste', async () => {
    const a = await creerEtablissement();
    await creerTuteur({ name: 'Reserve', etablissementId: a });
    expect(getPublishedByName('Reserve', DEHORS)).toBeUndefined();
    expect(getPublishedByName('Reserve', { etablissementId: a, publicsExternes: false })?.name).toBe('Reserve');
    expect(getPublishedByName('Inconnu', DEHORS)).toBeUndefined();
  });
  it('nomsDeLEcole ne rend que les tuteurs visibles qui appartiennent à l’école', async () => {
    const a = await creerEtablissement();
    await creerTuteur({ name: 'Maison', etablissementId: a });
    await creerTuteur({ name: 'Maison retiree', etablissementId: a, status: 'retired' });
    await creerTuteur({ name: 'Plateforme' });
    expect(nomsDeLEcole(a)).toEqual(['Maison']);
  });
});
