// UC-13 — Tests unitaires : la source UNIQUE des fournisseurs
// (src/shared/providers.ts), partagée par le navigateur et le serveur.
import { describe, it, expect } from 'vitest';
import {
  PROVIDER_IDS, SCHOOL_PROVIDER_IDS, DUEL_PUBLIC_PROVIDER_IDS, providerDefaults,
  isProviderId, isReasoningLevel, providerAcceptsAttachment, ERR,
} from '../../../src/shared/providers';

describe('catalogue des fournisseurs', () => {
  it('onze fournisseurs, chacun avec un libellé et un modèle par défaut', () => {
    expect(PROVIDER_IDS).toHaveLength(11);
    for (const p of PROVIDER_IDS) {
      expect(providerDefaults[p].label).toBeTruthy();
      expect(providerDefaults[p].model).toBeTruthy();
    }
  });
  it('drapeaux : Gemini écarté sans drapeau rouge, OpenRouter drapeau rouge sans être écarté', () => {
    expect(providerDefaults.gemini).toMatchObject({ ecarte: true });
    expect(providerDefaults.gemini.wrng).toBeUndefined();
    expect(providerDefaults.openrouter).toMatchObject({ wrng: true });
    expect(providerDefaults.openrouter.ecarte).toBeUndefined();
    for (const p of ['deepseek', 'qwen', 'kimi', 'glm', 'minimax', 'grok'] as const) {
      expect(providerDefaults[p]).toMatchObject({ ecarte: true, wrng: true });
    }
  });
  it('seuls Mistral, Claude et ChatGPT portent la mention RGPD', () => {
    expect(PROVIDER_IDS.filter(p => providerDefaults[p].gdpr).sort()).toEqual(['anthropic', 'mistral', 'openai']);
  });
});

describe('SCHOOL_PROVIDER_IDS et DUEL_PUBLIC_PROVIDER_IDS', () => {
  it('ni écarté ni drapeau rouge : Mistral, Claude, ChatGPT', () => {
    expect([...SCHOOL_PROVIDER_IDS].sort()).toEqual(['anthropic', 'mistral', 'openai']);
    expect(DUEL_PUBLIC_PROVIDER_IDS).toEqual(SCHOOL_PROVIDER_IDS);
    for (const p of SCHOOL_PROVIDER_IDS) {
      expect(providerDefaults[p].ecarte).toBeFalsy();
      expect(providerDefaults[p].wrng).toBeFalsy();
    }
  });
});

describe('gardes de type', () => {
  it('isProviderId n’accepte que les identifiants connus', () => {
    expect(isProviderId('mistral')).toBe(true);
    for (const v of ['Mistral', 'skynet', '', null, 42, undefined]) expect(isProviderId(v)).toBe(false);
  });
  it('isReasoningLevel : low, medium, high', () => {
    for (const v of ['low', 'medium', 'high']) expect(isReasoningLevel(v)).toBe(true);
    for (const v of ['max', '', 1, null]) expect(isReasoningLevel(v)).toBe(false);
  });
});

describe('providerAcceptsAttachment', () => {
  it('suit les capacités déclarées de chaque fournisseur', () => {
    expect(providerAcceptsAttachment('anthropic', 'pdf')).toBe(true);
    expect(providerAcceptsAttachment('mistral', 'image')).toBe(true);
    expect(providerAcceptsAttachment('mistral', 'pdf')).toBe(false);
    expect(providerAcceptsAttachment('gemini', 'image')).toBe(false);
    expect(providerAcceptsAttachment('deepseek', 'image')).toBe(false);
  });
});

describe('codes d’erreur stables', () => {
  it('le fournisseur et le modèle ont leurs codes', () => {
    expect(ERR.PROVIDER).toBe('ERR_PROVIDER_UNSUPPORTED');
    expect(ERR.MODEL).toBe('ERR_MODEL_INVALID');
    expect(ERR.METHOD).toBe('ERR_METHOD_NOT_ALLOWED');
  });
});
