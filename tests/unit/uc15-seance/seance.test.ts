// UC-15 — Tests unitaires : lecture de la séance de classe
// (src/server/seance.ts : parseFournisseursSeance, seanceRestreinte,
// seanceActive, seanceAutoriseFournisseur, SEANCE_SANS_FOURNISSEUR).
import { describe, it, expect, beforeEach } from 'vitest';
import { viderBase, base, creerEtablissement } from '../../helpers/db';
import {
  parseFournisseursSeance, seanceRestreinte, seanceActive, seanceAutoriseFournisseur, SEANCE_SANS_FOURNISSEUR,
} from '../../../src/server/seance';
import { SCHOOL_PROVIDER_IDS } from '../../../src/shared/providers';

async function poserSeance(etabId: number, o: { providers?: string; webSearch?: number; email?: string | null; expires?: number } = {}) {
  (await base()).prepare(`INSERT OR REPLACE INTO session_settings
      (etablissement_id, default_prompt_id, web_search, providers, set_by_email, expires_at)
      VALUES (?, NULL, ?, ?, ?, ?)`)
    .run(etabId, o.webSearch ?? 1, o.providers ?? '', o.email ?? null, o.expires ?? Date.now() + 60_000);
}

beforeEach(async () => { await viderBase(); });

describe('SCHOOL_PROVIDER_IDS (contexte)', () => {
  it('ne contient que les fournisseurs admissibles sur une clé d’école', () => {
    expect(SCHOOL_PROVIDER_IDS).toEqual(['mistral', 'anthropic', 'openai']);
  });
});

describe('parseFournisseursSeance', () => {
  it('décode la liste, espaces tolérés, doublons retirés', () => {
    expect(parseFournisseursSeance(' mistral ,openai,mistral')).toEqual(['mistral', 'openai']);
  });
  it('refiltre par la liste scolaire : écartés, drapeaux rouges et inconnus disparaissent', () => {
    expect(parseFournisseursSeance('grok,openrouter,gemini,deepseek,inconnu,anthropic')).toEqual(['anthropic']);
  });
  it('le jeton « aucun », la chaîne vide, null et undefined donnent une liste vide', () => {
    expect(SEANCE_SANS_FOURNISSEUR).toBe('aucun');
    for (const v of ['aucun', '', null, undefined]) expect(parseFournisseursSeance(v)).toEqual([]);
  });
});

describe('seanceRestreinte', () => {
  it('vraie dès que la colonne brute n’est pas vide — même si rien n’y survit', () => {
    expect(seanceRestreinte('mistral')).toBe(true);
    expect(seanceRestreinte('aucun')).toBe(true);
    expect(seanceRestreinte('grok')).toBe(true);
  });
  it('fausse pour une colonne vide (aucune restriction)', () => {
    for (const v of ['', '   ', null, undefined]) expect(seanceRestreinte(v)).toBe(false);
  });
});

describe('seanceActive', () => {
  it('rend la séance en cours de l’école', async () => {
    const id = await creerEtablissement();
    const expires = Date.now() + 60_000;
    await poserSeance(id, { providers: 'mistral', webSearch: 0, email: 'prof@ecole.ch', expires });
    expect(seanceActive(id)).toEqual({
      webSearch: false, setByEmail: 'prof@ecole.ch', expiresAt: expires, fournisseurs: ['mistral'], restreint: true,
    });
  });
  it('rend null pour une séance expirée, absente, ou sans école', async () => {
    const id = await creerEtablissement();
    await poserSeance(id, { expires: Date.now() - 1 });
    expect(seanceActive(id)).toBeNull();
    expect(seanceActive(id + 1000)).toBeNull();
    expect(seanceActive(null)).toBeNull();
  });
  it('jeton « aucun » : restreinte et vide', async () => {
    const id = await creerEtablissement();
    await poserSeance(id, { providers: SEANCE_SANS_FOURNISSEUR });
    const s = seanceActive(id)!;
    expect(s.restreint).toBe(true);
    expect(s.fournisseurs).toEqual([]);
  });
});

describe('seanceAutoriseFournisseur', () => {
  const seance = (restreint: boolean, fournisseurs: any[]) =>
    ({ webSearch: true, setByEmail: null, expiresAt: 0, restreint, fournisseurs });

  it('pas de séance ou séance sans restriction : tout passe', () => {
    expect(seanceAutoriseFournisseur(null, 'openai')).toBe(true);
    expect(seanceAutoriseFournisseur(seance(false, []), 'anthropic')).toBe(true);
  });
  it('liste posée : seul ce qu’elle nomme passe', () => {
    expect(seanceAutoriseFournisseur(seance(true, ['mistral']), 'mistral')).toBe(true);
    expect(seanceAutoriseFournisseur(seance(true, ['mistral']), 'openai')).toBe(false);
  });
  it('liste posée mais vide : plus rien ne passe', () => {
    expect(seanceAutoriseFournisseur(seance(true, []), 'mistral')).toBe(false);
  });
});
