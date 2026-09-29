// UC-25 — Tests unitaires : format de profil, export et fusion à l'import
// (src/utils/profile.ts).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installerNavigateur, retirerNavigateur, type Navigateur } from './navigateur';
import { buildProfile, isProfile, applyProfile, downloadProfile, PROFILE_FORMAT, type Profile } from '../../../src/utils/profile';

let nav: Navigateur;
beforeEach(() => { nav = installerNavigateur(); });
afterEach(() => { retirerNavigateur(); });

const conv = (name: string, texte = 'Bonjour') => ({
  name, createdAt: 1_700_000_000_000, lastMessage: 1_700_000_100_000,
  messages: [{ role: 'user', content: texte }],
});

const profil = (extra: Partial<Profile> = {}): Profile => ({
  educhatProfile: PROFILE_FORMAT, exportedAt: 1, conversations: {}, favorites: [], ratings: {}, totalTokens: 0, ...extra,
} as Profile);

describe('buildProfile', () => {
  it('rassemble conversations, favoris, notes et compteur de tokens, versionné', () => {
    nav.stockage.setItem('pg-history', JSON.stringify({ a: conv('A') }));
    nav.stockage.setItem('prompt-favorites', JSON.stringify(['socrate']));
    nav.stockage.setItem('prompt-ratings', JSON.stringify({ socrate: 5 }));
    nav.stockage.setItem('totalTokens', '1234');
    const p = buildProfile();
    expect(p.educhatProfile).toBe(1);
    expect(p.exportedAt).toBeGreaterThan(0);
    expect(p.conversations).toEqual({ a: conv('A') });
    expect(p.favorites).toEqual(['socrate']);
    expect(p.ratings).toEqual({ socrate: 5 });
    expect(p.totalTokens).toBe(1234);
  });

  it('n’exporte JAMAIS le jeton de compte, l’identifiant de navigateur ni l’école active', () => {
    nav.stockage.setItem('educhat-token', 'jeton.secret');
    nav.stockage.setItem('educhat-client', 'uuid-anonyme');
    nav.stockage.setItem('educhat-ecole', '3');
    const texte = JSON.stringify(buildProfile());
    expect(texte).not.toContain('jeton.secret');
    expect(texte).not.toContain('uuid-anonyme');
    expect(Object.keys(buildProfile()).sort()).toEqual(
      ['conversations', 'educhatProfile', 'exportedAt', 'favorites', 'ratings', 'totalTokens']);
  });

  it('navigateur vierge : profil vide mais valide', () => {
    expect(buildProfile()).toMatchObject({ conversations: {}, favorites: [], ratings: {}, totalTokens: 0 });
  });

  it('tolère des favoris, notes ou compteur corrompus (repli sur les valeurs vides)', () => {
    nav.stockage.setItem('prompt-favorites', '{pas du json');
    nav.stockage.setItem('prompt-ratings', 'nul');
    nav.stockage.setItem('totalTokens', 'beaucoup');
    expect(buildProfile()).toMatchObject({ favorites: [], ratings: {}, totalTokens: 0 });
  });

  it('comportement actuel : un historique corrompu fait échouer l’export (getHistory sans try/catch)', () => {
    nav.stockage.setItem('pg-history', '{corrompu');
    expect(() => buildProfile()).toThrow(SyntaxError);
  });
});

describe('isProfile', () => {
  it('reconnaît un profil par son champ numérique educhatProfile', () => {
    expect(isProfile(profil())).toBe(true);
    // Seul le type est contrôlé : une version future est acceptée telle quelle.
    expect(isProfile({ educhatProfile: 999 })).toBe(true);
  });
  it('écarte une conversation isolée et les valeurs dégénérées', () => {
    expect(isProfile(conv('seule'))).toBe(false);
    expect(isProfile({ educhatProfile: '1' })).toBe(false);
    expect(isProfile(null)).toBe(false);
    expect(isProfile(undefined)).toBe(false);
    expect(isProfile(42)).toBe(false);
    expect(isProfile('educhatProfile')).toBe(false);
    expect(isProfile([])).toBe(false);
  });
});

describe('applyProfile — fusion', () => {
  it('ajoute les conversations absentes et conserve celles du navigateur', () => {
    nav.stockage.setItem('pg-history', JSON.stringify({ local: conv('Locale') }));
    const r = applyProfile(profil({ conversations: { distante: conv('Distante') } as any }));
    expect(r).toEqual({ conversations: 1 });
    const h = JSON.parse(nav.stockage.getItem('pg-history')!);
    expect(Object.keys(h).sort()).toEqual(['distante', 'local']);
  });

  it('à identifiant égal, la conversation LOCALE l’emporte (jamais d’écrasement)', () => {
    nav.stockage.setItem('pg-history', JSON.stringify({ x: conv('Version locale') }));
    const r = applyProfile(profil({ conversations: { x: conv('Version du fichier') } as any }));
    expect(r.conversations).toBe(0);
    expect(JSON.parse(nav.stockage.getItem('pg-history')!).x.name).toBe('Version locale');
  });

  it('ignore les conversations sans tableau messages', () => {
    const r = applyProfile(profil({ conversations: {
      ok: conv('OK'), sansMessages: { name: 'x' }, messagesTexte: { messages: 'non' }, nulle: null,
    } as any }));
    expect(r.conversations).toBe(1);
    expect(Object.keys(JSON.parse(nav.stockage.getItem('pg-history')!))).toEqual(['ok']);
  });

  it('unit les favoris sans doublon', () => {
    nav.stockage.setItem('prompt-favorites', JSON.stringify(['a', 'b']));
    applyProfile(profil({ favorites: ['b', 'c'] }));
    expect(JSON.parse(nav.stockage.getItem('prompt-favorites')!)).toEqual(['a', 'b', 'c']);
  });

  it('les notes locales priment sur celles du fichier (anti-revote)', () => {
    nav.stockage.setItem('prompt-ratings', JSON.stringify({ a: 2 }));
    applyProfile(profil({ ratings: { a: 5, b: 4 } }));
    expect(JSON.parse(nav.stockage.getItem('prompt-ratings')!)).toEqual({ a: 2, b: 4 });
  });

  it('le compteur de tokens prend le maximum des deux', () => {
    nav.stockage.setItem('totalTokens', '500');
    applyProfile(profil({ totalTokens: 200 }));
    expect(nav.stockage.getItem('totalTokens')).toBe('500');
    applyProfile(profil({ totalTokens: 9000 }));
    expect(nav.stockage.getItem('totalTokens')).toBe('9000');
  });

  it('émet totalTokensUpdated pour rafraîchir le compteur affiché', () => {
    applyProfile(profil());
    expect(nav.evenements).toContain('totalTokensUpdated');
  });

  it('ne touche jamais au jeton de compte', () => {
    nav.stockage.setItem('educhat-token', 'mon.jeton');
    applyProfile({ ...profil(), 'educhat-token': 'jeton.pirate', token: 'jeton.pirate' } as any);
    expect(nav.stockage.getItem('educhat-token')).toBe('mon.jeton');
  });

  it('rejette un profil sans conversations, sans rien écrire', () => {
    const avant = nav.stockage.instantane();
    expect(() => applyProfile({ educhatProfile: 1 } as any)).toThrow('Profil invalide : aucune conversation.');
    expect(() => applyProfile(profil({ conversations: 'texte' as any }))).toThrow('Profil invalide');
    expect(() => applyProfile(profil({ conversations: null as any }))).toThrow('Profil invalide');
    expect(nav.stockage.instantane()).toEqual(avant);
  });

  it('champs annexes invalides : ignorés (favoris non tableau, notes non objet, tokens non numériques)', () => {
    applyProfile(profil({ favorites: 'socrate' as any, ratings: 'x' as any, totalTokens: 'beaucoup' as any }));
    expect(nav.stockage.getItem('prompt-favorites')).toBe('[]');
    expect(nav.stockage.getItem('prompt-ratings')).toBe('{}');
    expect(nav.stockage.getItem('totalTokens')).toBe('0');
  });
});

describe('applyProfile — entrées hostiles (comportement actuel)', () => {
  it('une clé __proto__ ne pollue pas les prototypes', () => {
    const hostile = JSON.parse(`{"educhatProfile":1,"conversations":{"__proto__":{"messages":[],"pollue":1}},
      "ratings":{"__proto__":{"pollue":1}},"favorites":[]}`);
    const r = applyProfile(hostile);
    // existing['__proto__'] vaut Object.prototype (vrai) : la conversation est écartée.
    expect(r.conversations).toBe(0);
    expect(({} as any).pollue).toBeUndefined();
    expect((Object.prototype as any).pollue).toBeUndefined();
  });

  it('ANOMALIE : les éléments de favoris ne sont pas contrôlés (non-chaînes conservées)', () => {
    applyProfile(profil({ favorites: [42, { x: 1 }, 'ok'] as any }));
    expect(JSON.parse(nav.stockage.getItem('prompt-favorites')!)).toEqual([42, { x: 1 }, 'ok']);
  });

  it('ANOMALIE : le contenu des messages d’une conversation de profil n’est pas validé', () => {
    applyProfile(profil({ conversations: { h: { messages: [{ role: 'system', content: { script: 1 } }] } } as any }));
    const h = JSON.parse(nav.stockage.getItem('pg-history')!);
    expect(h.h.messages[0].role).toBe('system');
  });

  it('ANOMALIE : un tableau de conversations est accepté (identifiants "0", "1"…)', () => {
    const r = applyProfile(profil({ conversations: [conv('A'), conv('B')] as any }));
    expect(r.conversations).toBe(2);
    expect(Object.keys(JSON.parse(nav.stockage.getItem('pg-history')!))).toEqual(['0', '1']);
  });

  it('ANOMALIE : totalTokens "Infinity" est rangé tel quel, puis relu comme 0', () => {
    applyProfile(profil({ totalTokens: 'Infinity' as any }));
    expect(nav.stockage.getItem('totalTokens')).toBe('Infinity');
    expect(buildProfile().totalTokens).toBe(0);
  });

  it('ANOMALIE : des favoris locaux corrompus interrompent la fusion APRÈS l’écriture de l’historique', () => {
    nav.stockage.setItem('prompt-favorites', '{corrompu');
    expect(() => applyProfile(profil({ conversations: { n: conv('Nouvelle') } as any }))).toThrow(SyntaxError);
    // Import partiel : l'historique est déjà fusionné, le reste non.
    expect(Object.keys(JSON.parse(nav.stockage.getItem('pg-history')!))).toEqual(['n']);
    expect(nav.stockage.getItem('totalTokens')).toBeNull();
  });
});

describe('downloadProfile', () => {
  it('télécharge un fichier JSON daté contenant le profil courant', async () => {
    nav.stockage.setItem('pg-history', JSON.stringify({ a: conv('A') }));
    nav.stockage.setItem('educhat-token', 'jeton.secret');
    downloadProfile();
    expect(nav.telechargements).toHaveLength(1);
    const [t] = nav.telechargements;
    expect(t.nom).toMatch(/^educhat-profil-\d{4}-\d{2}-\d{2}\.json$/);
    expect(t.type).toBe('application/json');
    const texte = await t.contenu;
    expect(isProfile(JSON.parse(texte))).toBe(true);
    expect(JSON.parse(texte).conversations.a.name).toBe('A');
    expect(texte).not.toContain('jeton.secret');
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
