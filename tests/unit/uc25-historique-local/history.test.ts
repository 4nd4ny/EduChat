// UC-25 — Tests unitaires : historique des conversations dans le navigateur
// (src/context/History.tsx, clé localStorage pg-history).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installerNavigateur, retirerNavigateur, type Navigateur } from './navigateur';
import {
  storeConversation, getConversation, updateConversation, deleteConversationFromHistory, getHistory, clearHistory,
  type Conversation,
} from '../../../src/context/History';

let nav: Navigateur;
beforeEach(() => { nav = installerNavigateur(); });
afterEach(() => { retirerNavigateur(); });

const conv = (name: string): Conversation => ({
  name, createdAt: 1, lastMessage: 2, messages: [{ role: 'user', content: 'Bonjour' } as any],
  promptName: 'socrate', promptVersion: 3,
});

describe('historique local', () => {
  it('vide par défaut', () => {
    expect(getHistory()).toEqual({});
  });

  it('storeConversation range sous l’identifiant donné, ou en génère un (uuid)', () => {
    expect(storeConversation('a', conv('A'))).toBe('a');
    const id = storeConversation('', conv('B'));
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Object.keys(getHistory()).sort()).toEqual(['a', id].sort());
    expect(getConversation('a')).toEqual(conv('A'));
  });

  it('conserve le tuteur et sa version (promptName / promptVersion)', () => {
    storeConversation('a', conv('A'));
    expect(getConversation('a')).toMatchObject({ promptName: 'socrate', promptVersion: 3 });
  });

  it('updateConversation fusionne des champs partiels', () => {
    storeConversation('a', conv('A'));
    updateConversation('a', { name: 'Renommée', lastMessage: 99 });
    expect(getConversation('a')).toMatchObject({ name: 'Renommée', lastMessage: 99, createdAt: 1 });
  });

  it('deleteConversationFromHistory et clearHistory', () => {
    storeConversation('a', conv('A'));
    storeConversation('b', conv('B'));
    deleteConversationFromHistory('a');
    expect(Object.keys(getHistory())).toEqual(['b']);
    clearHistory();
    expect(nav.stockage.getItem('pg-history')).toBeNull();
    expect(getHistory()).toEqual({});
  });

  it('conversation inconnue : undefined', () => {
    expect(getConversation('absente')).toBeUndefined();
  });

  it('un pg-history corrompu (illisible ou non objet) se replie sur un historique vide', () => {
    nav.stockage.setItem('pg-history', '{corrompu');
    expect(getHistory()).toEqual({});
    for (const valeur of ['null', '42', '"texte"', '[1,2]']) {
      nav.stockage.setItem('pg-history', valeur);
      expect(getHistory()).toEqual({});
    }
  });
});
