// UC-11 — Tests unitaires : règles pures sollicitées par la conversation —
// échelle de modèles (src/shared/ladder.ts, src/server/ladder.ts), séance de
// classe (src/server/seance.ts), capacités des fournisseurs
// (src/shared/providers.ts).
import { describe, it, expect, beforeEach } from 'vitest';
import { RUNG_REASONING, SUGGESTED_LADDER, hasHigherRung, isRung, modelForRung } from '../../../src/shared/ladder';
import { getLadder, setLadder } from '../../../src/server/ladder';
import {
  SEANCE_SANS_FOURNISSEUR, parseFournisseursSeance, seanceActive, seanceAutoriseFournisseur, seanceRestreinte,
} from '../../../src/server/seance';
import {
  DUEL_PUBLIC_PROVIDER_IDS, SCHOOL_PROVIDER_IDS, isProviderId, isReasoningLevel, providerAcceptsAttachment,
} from '../../../src/shared/providers';
import { viderBase, base, creerEtablissement } from '../../helpers/db';

beforeEach(async () => { await viderBase(); });

describe('échelle de modèles', () => {
  it('isRung n’accepte que 1, 2, 3', () => {
    expect([1, 2, 3].every(isRung)).toBe(true);
    for (const v of [0, 4, '1', 1.5, null, undefined]) expect(isRung(v)).toBe(false);
  });

  it('l’effort suit le barreau', () => {
    expect(RUNG_REASONING).toEqual({ 1: 'low', 2: 'medium', 3: 'high' });
  });

  it('modelForRung ramène le barreau dans les bornes de l’échelle', () => {
    const echelle = ['petit', 'moyen'];
    expect(modelForRung(echelle, 1, 'mistral')).toBe('petit');
    expect(modelForRung(echelle, 2, 'mistral')).toBe('moyen');
    expect(modelForRung(echelle, 3, 'mistral')).toBe('moyen'); // pas de troisième barreau inventé
    expect(modelForRung(echelle, 0, 'mistral')).toBe('petit');
    expect(modelForRung(echelle, -5, 'mistral')).toBe('petit');
    expect(modelForRung(echelle, NaN, 'mistral')).toBe('petit');
  });

  it('une échelle vide retombe sur le modèle par défaut du fournisseur', () => {
    expect(modelForRung([], 2, 'mistral')).toBe('mistral-medium-latest');
  });

  it('hasHigherRung', () => {
    expect(hasHigherRung(['a', 'b', 'c'], 2)).toBe(true);
    expect(hasHigherRung(['a', 'b', 'c'], 3)).toBe(false);
    expect(hasHigherRung([], 1)).toBe(false);
  });

  it('getLadder : proposition du code, puis choix de l’administration, un trou arrêtant l’échelle', () => {
    expect(getLadder('mistral')).toEqual(SUGGESTED_LADDER.mistral);
    setLadder('mistral', ['m-1', '', 'm-3']);
    expect(getLadder('mistral')).toEqual(['m-1']);
    setLadder('mistral', ['', '', '']);
    expect(getLadder('mistral')).toEqual(SUGGESTED_LADDER.mistral);
  });
});

describe('séance de classe', () => {
  it('parseFournisseursSeance ne garde que les fournisseurs admissibles en classe, sans doublon', () => {
    expect(parseFournisseursSeance('mistral, anthropic,mistral')).toEqual(['mistral', 'anthropic']);
    expect(parseFournisseursSeance('grok,gemini,openrouter,inconnu')).toEqual([]);
    expect(parseFournisseursSeance(null)).toEqual([]);
    expect(parseFournisseursSeance(SEANCE_SANS_FOURNISSEUR)).toEqual([]);
  });

  it('seanceRestreinte se lit sur la colonne brute : le jeton « aucun » restreint tout', () => {
    expect(seanceRestreinte('')).toBe(false);
    expect(seanceRestreinte('  ')).toBe(false);
    expect(seanceRestreinte(SEANCE_SANS_FOURNISSEUR)).toBe(true);
    expect(seanceRestreinte('grok')).toBe(true);
  });

  it('seanceAutoriseFournisseur : absence de séance ou de liste = tout ; liste vide = rien', () => {
    expect(seanceAutoriseFournisseur(null, 'grok')).toBe(true);
    const libre = { webSearch: true, setByEmail: null, expiresAt: 0, fournisseurs: [], restreint: false };
    expect(seanceAutoriseFournisseur(libre, 'mistral')).toBe(true);
    const fermee = { ...libre, restreint: true };
    expect(seanceAutoriseFournisseur(fermee, 'mistral')).toBe(false);
    const mistralSeul = { ...libre, restreint: true, fournisseurs: ['mistral' as const] };
    expect(seanceAutoriseFournisseur(mistralSeul, 'mistral')).toBe(true);
    expect(seanceAutoriseFournisseur(mistralSeul, 'anthropic')).toBe(false);
  });

  it('seanceActive lit la séance non expirée de l’établissement', async () => {
    const etab = await creerEtablissement();
    expect(seanceActive(null)).toBeNull();
    expect(seanceActive(etab)).toBeNull();
    const db = await base();
    db.prepare('INSERT INTO session_settings (etablissement_id, web_search, set_by_email, expires_at, providers) VALUES (?, 0, ?, ?, ?)')
      .run(etab, 'prof@ecole.ch', Date.now() + 60_000, 'mistral');
    expect(seanceActive(etab)).toMatchObject({
      webSearch: false, setByEmail: 'prof@ecole.ch', fournisseurs: ['mistral'], restreint: true,
    });
    db.prepare('UPDATE session_settings SET expires_at = ?').run(Date.now() - 1);
    expect(seanceActive(etab)).toBeNull();
  });
});

describe('capacités des fournisseurs', () => {
  it('isProviderId / isReasoningLevel', () => {
    expect(isProviderId('mistral')).toBe(true);
    expect(isProviderId('MISTRAL')).toBe(false);
    expect(isProviderId(undefined)).toBe(false);
    expect(isReasoningLevel('high')).toBe(true);
    expect(isReasoningLevel('max')).toBe(false);
  });

  it('pièces jointes : images et PDF selon le fournisseur', () => {
    expect(providerAcceptsAttachment('anthropic', 'pdf')).toBe(true);
    expect(providerAcceptsAttachment('mistral', 'image')).toBe(true);
    expect(providerAcceptsAttachment('mistral', 'pdf')).toBe(false);
    expect(providerAcceptsAttachment('gemini', 'image')).toBe(false);
    expect(providerAcceptsAttachment('deepseek', 'image')).toBe(false);
  });

  it('la liste scolaire exclut écartés et drapeaux rouges', () => {
    expect([...SCHOOL_PROVIDER_IDS].sort()).toEqual(['anthropic', 'mistral', 'openai']);
    expect(DUEL_PUBLIC_PROVIDER_IDS).toEqual(SCHOOL_PROVIDER_IDS);
  });
});
