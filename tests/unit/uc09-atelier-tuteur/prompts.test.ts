// UC-09 — Tests unitaires : les briques de src/server/prompts.ts qu'emploie
// l'atelier du promptagogue — validation du nom, quotas, lecture par nom et
// par URL secrète, carte publique d'un tuteur.
import { describe, it, expect, beforeEach } from 'vitest';
import { viderBase, base, creerTuteur } from '../../helpers/db';
import {
  isValidPromptName, getByName, getByShareToken, toCard, MAX_PROMPT_BYTES, MAX_USER_BYTES,
} from '../../../src/server/prompts';
import type { PromptRow } from '../../../src/server/db';

beforeEach(async () => { await viderBase(); });

const JETON = 'a'.repeat(32);

describe('isValidPromptName', () => {
  it('accepte un nom propre : lettres accentuées, chiffres, espaces, tirets, apostrophes', () => {
    for (const nom of ['Socrate', 'Hypatie 2', "Jeanne d'Arc", 'Marie-Curie', 'Élise’s', 'Zoé', '42 Maths']) {
      expect(isValidPromptName(nom)).toBe(true);
    }
  });
  it('ignore les espaces de bordure pour mesurer le nom', () => {
    expect(isValidPromptName('  Socrate  ')).toBe(true);
  });
  it('refuse les noms trop courts ou trop longs (2 à 64 caractères)', () => {
    expect(isValidPromptName('A')).toBe(false);
    expect(isValidPromptName('Ab')).toBe(true);
    expect(isValidPromptName('a'.repeat(64))).toBe(true);
    expect(isValidPromptName('a'.repeat(65))).toBe(false);
  });
  it('réserve « essai » (adresse des URL secrètes), quelle que soit la casse', () => {
    expect(isValidPromptName('essai')).toBe(false);
    expect(isValidPromptName('ESSAI')).toBe(false);
    expect(isValidPromptName('essai 2')).toBe(true);
  });
  it('refuse la ponctuation, les barres obliques et un premier caractère non alphanumérique', () => {
    for (const nom of ['-Socrate', "'Socrate", 'So/crate', 'So?crate', 'So.crate', '<script>']) {
      expect(isValidPromptName(nom)).toBe(false);
    }
  });
  it('refuse ce qui n’est pas une chaîne', () => {
    expect(isValidPromptName(undefined)).toBe(false);
    expect(isValidPromptName(42)).toBe(false);
    expect(isValidPromptName(null)).toBe(false);
  });
});

describe('Quotas', () => {
  it('256 Ko par tuteur, 1 Mo par auteur', () => {
    expect(MAX_PROMPT_BYTES).toBe(256 * 1024);
    expect(MAX_USER_BYTES).toBe(1024 * 1024);
  });
});

describe('getByName', () => {
  it('trouve un tuteur quel que soit son statut, et respecte la casse', async () => {
    await creerTuteur({ name: 'Brouillon', status: 'draft' });
    expect(getByName('Brouillon')?.status).toBe('draft');
    expect(getByName('brouillon')).toBeUndefined();
    expect(getByName('Inconnu')).toBeUndefined();
  });
});

describe('getByShareToken', () => {
  it('trouve le tuteur par son URL secrète, quel que soit son statut', async () => {
    await creerTuteur({ name: 'Socrate', status: 'published', shareToken: JETON });
    expect(getByShareToken(JETON)?.name).toBe('Socrate');
  });
  it('refuse un jeton mal formé sans interroger la base', async () => {
    await creerTuteur({ name: 'Socrate', status: 'draft', shareToken: 'ABC' });
    expect(getByShareToken('ABC')).toBeUndefined();          // majuscules, trop court
    expect(getByShareToken('')).toBeUndefined();
    expect(getByShareToken('g'.repeat(32))).toBeUndefined(); // hors hexadécimal
    expect(getByShareToken("' OR 1=1 --")).toBeUndefined();
  });
  it('un tuteur archivé n’est plus joignable par son URL secrète', async () => {
    await creerTuteur({ name: 'Refusé', status: 'draft', shareToken: JETON, archived: true });
    expect(getByShareToken(JETON)).toBeUndefined();
  });
});

describe('toCard', () => {
  it('rend les champs publics, jamais le jeton secret ni le corps', async () => {
    const id = await creerTuteur({
      name: 'Socrate', authorEmail: 'auteur@ecole.ch', shareToken: JETON, webSearch: true,
      ratingSum: 14, ratingCount: 3, usage: 7,
    });
    const row = (await base()).prepare('SELECT * FROM prompts WHERE id = ?').get(id) as PromptRow;
    const carte = toCard(row);
    expect(carte).toMatchObject({
      name: 'Socrate', title: 'Socrate', authorName: 'auteur', version: 1,
      usageCount: 7, ratingCount: 3, ratingAvg: 4.7, webSearch: true, translated: false,
    });
    expect(JSON.stringify(carte)).not.toContain(JETON);
    expect(carte).not.toHaveProperty('body');
    expect(carte).not.toHaveProperty('share_token');
  });
  it('note moyenne nulle sans vote ; nom d’auteur rendu tel quel (vide pour un anonyme)', async () => {
    const id = await creerTuteur({ name: 'Anonyme' });
    const db = await base();
    db.prepare("UPDATE prompts SET author_name = '' WHERE id = ?").run(id);
    const carte = toCard(db.prepare('SELECT * FROM prompts WHERE id = ?').get(id) as PromptRow);
    expect(carte.ratingAvg).toBeNull();
    expect(carte.authorName).toBe('');
  });
});
