// UC-25 — Tests unitaires : identifiant anonyme de navigateur (src/utils/clientId.ts).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installerNavigateur, retirerNavigateur, type Navigateur } from './navigateur';
import { getClientId } from '../../../src/utils/clientId';
import { buildProfile } from '../../../src/utils/profile';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let nav: Navigateur;
beforeEach(() => { nav = installerNavigateur(); });
afterEach(() => { retirerNavigateur(); });

describe('getClientId', () => {
  it('génère un uuid v4 au premier appel et le range dans educhat-client', () => {
    const id = getClientId();
    expect(id).toMatch(UUID_V4);
    expect(nav.stockage.getItem('educhat-client')).toBe(id);
  });

  it('est stable d’un appel à l’autre dans un même navigateur', () => {
    expect(getClientId()).toBe(getClientId());
  });

  it('deux navigateurs ont deux identifiants distincts', () => {
    const a = getClientId();
    installerNavigateur();
    expect(getClientId()).not.toBe(a);
  });

  it('vider le stockage produit un nouvel identifiant (contournement assumé)', () => {
    const a = getClientId();
    nav.stockage.clear();
    expect(getClientId()).not.toBe(a);
  });

  it('reprend un identifiant déjà présent sans le valider', () => {
    nav.stockage.setItem('educhat-client', 'valeur-quelconque');
    expect(getClientId()).toBe('valeur-quelconque');
  });

  it('côté serveur (pas de window) : chaîne vide', () => {
    vi.stubGlobal('window', undefined);
    expect(getClientId()).toBe('');
  });

  it('ne voyage pas dans le profil exporté', () => {
    const id = getClientId();
    expect(JSON.stringify(buildProfile())).not.toContain(id);
  });
});
