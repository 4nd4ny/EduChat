// UC-26 — Tests unitaires : cohérence des dictionnaires fr/en/it/de
// (src/i18n/dictionaries.ts).
//
// Le type Record<TranslationKey, string> fait déjà vérifier par « tsc » que
// chaque langue possède toutes les clés ; ces tests le reconfirment À
// L'EXÉCUTION (vitest ne vérifie pas les types) et contrôlent ce que le type
// ne voit pas : valeurs vides et gabarits {variable} divergents.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { dictionaries, fr, en, it as itDict, de } from '../../../src/i18n/dictionaries';

const require = createRequire(import.meta.url);
const nextConfig = require('../../../next.config.js');

const LANGUES = ['fr', 'en', 'it', 'de'] as const;
const clesFr = Object.keys(fr).sort();

/** Écarts CONNUS et figés : toute nouvelle clé vide fera échouer le test. */
const CLES_VIDES_CONNUES = ['admin.tarif.helpSchool'];

/** Ensemble trié des gabarits {nom} d'un texte. */
const gabarits = (texte: string) => Array.from(new Set(texte.match(/\{[a-zA-Z0-9_]+\}/g) ?? [])).sort();

describe('langues déclarées', () => {
  it('next.config.js déclare fr, en, it, de avec le français par défaut', () => {
    expect(nextConfig.i18n.locales).toEqual(['fr', 'en', 'it', 'de']);
    expect(nextConfig.i18n.defaultLocale).toBe('fr');
  });

  it('un dictionnaire par locale déclarée, et aucun autre', () => {
    expect(Object.keys(dictionaries).sort()).toEqual([...nextConfig.i18n.locales].sort());
    expect(dictionaries.en).toBe(en);
    expect(dictionaries.it).toBe(itDict);
    expect(dictionaries.de).toBe(de);
  });
});

describe('mêmes clés partout', () => {
  it('le français de référence compte plus de mille clés, toutes de la forme « espace.clé »', () => {
    expect(clesFr.length).toBeGreaterThan(1000);
    for (const cle of clesFr) expect(cle).toMatch(/^[a-zA-Z0-9]+(\.[a-zA-Z0-9_-]+)+$/);
  });

  for (const langue of ['en', 'it', 'de'] as const) {
    it(`${langue} : aucune clé manquante ni superflue par rapport au français`, () => {
      const cles = Object.keys(dictionaries[langue]);
      const manquantes = clesFr.filter(k => !cles.includes(k));
      const superflues = cles.filter(k => !(k in fr));
      expect({ manquantes, superflues }).toEqual({ manquantes: [], superflues: [] });
    });
  }
});

describe('valeurs', () => {
  for (const langue of LANGUES) {
    it(`${langue} : que des chaînes ; seules les clés vides connues le sont`, () => {
      const dict = dictionaries[langue] as Record<string, unknown>;
      for (const cle of clesFr) expect(typeof dict[cle], cle).toBe('string');
      const vides = clesFr.filter(k => !(dict[k] as string).trim());
      // ANOMALIE documentée : admin.tarif.helpSchool est vide dans les quatre
      // langues (et n'est employée nulle part dans src/).
      expect(vides).toEqual(CLES_VIDES_CONNUES);
    });
  }

  it('les traductions ne sont pas des copies du français (moins de 5 % de valeurs identiques)', () => {
    for (const langue of ['en', 'it', 'de'] as const) {
      const identiques = clesFr.filter(k => (dictionaries[langue] as any)[k] === (fr as any)[k] && (fr as any)[k] !== '');
      expect(identiques.length / clesFr.length, langue).toBeLessThan(0.05);
    }
  });
});

describe('gabarits {variable}', () => {
  const avecGabarits = clesFr.filter(k => gabarits((fr as any)[k]).length > 0);

  it('le code en utilise (plusieurs dizaines de clés)', () => {
    expect(avecGabarits.length).toBeGreaterThan(50);
  });

  for (const langue of ['en', 'it', 'de'] as const) {
    it(`${langue} : mêmes gabarits que le français, clé par clé`, () => {
      const ecarts = clesFr
        .filter(k => gabarits((fr as any)[k]).join() !== gabarits((dictionaries[langue] as any)[k]).join())
        .map(k => ({ cle: k, fr: gabarits((fr as any)[k]), [langue]: gabarits((dictionaries[langue] as any)[k]) }));
      expect(ecarts).toEqual([]);
    });
  }

  it('aucune accolade orpheline ou mal formée ({ n }, {{n}}, {n)', () => {
    for (const langue of LANGUES) {
      for (const [cle, valeur] of Object.entries(dictionaries[langue])) {
        expect(valeur.replace(/\{[a-zA-Z0-9_]+\}/g, ''), `${langue}:${cle}`).not.toMatch(/[{}]/);
      }
    }
  });
});
