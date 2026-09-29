// UC-26 — Tests unitaires : fonction de traduction et repli
// (src/i18n/useT.ts : translate, useT, currentLocale).
import { describe, it, expect, vi, afterEach } from 'vitest';

// useT est un hook : hors composant, useCallback est ramené à l'identité et
// useRouter rend une locale pilotée par le test.
const routeur = { locale: 'fr' as string | undefined };
vi.mock('next/router', () => ({ useRouter: () => routeur }));
vi.mock('react', async (original) => ({ ...(await original<any>()), useCallback: (fn: unknown) => fn }));

import { translate, useT, currentLocale } from '../../../src/i18n/useT';
import { fr, en, it as itDict, de } from '../../../src/i18n/dictionaries';

afterEach(() => { vi.unstubAllGlobals(); routeur.locale = 'fr'; });

describe('translate', () => {
  it('rend la valeur de la locale demandée', () => {
    expect(translate('fr', 'common.back')).toBe(fr['common.back']);
    expect(translate('en', 'common.back')).toBe('Back');
    expect(translate('it', 'common.back')).toBe(itDict['common.back']);
    expect(translate('de', 'common.back')).toBe(de['common.back']);
  });

  it('locale absente ou inconnue : repli sur le français', () => {
    expect(translate(undefined, 'common.back')).toBe('Retour');
    expect(translate('es', 'common.back')).toBe('Retour');
    expect(translate('', 'common.back')).toBe('Retour');
  });

  it('clé inconnue : la clé elle-même est rendue', () => {
    expect(translate('en', 'cle.inexistante' as any)).toBe('cle.inexistante');
  });

  it('clé absente d’une langue : repli sur le français', () => {
    // Simulation d'un oubli : on retire provisoirement la clé du dictionnaire anglais.
    const sauvegarde = (en as any)['common.back'];
    delete (en as any)['common.back'];
    try {
      expect(translate('en', 'common.back')).toBe('Retour');
    } finally {
      (en as any)['common.back'] = sauvegarde;
    }
  });

  it('une valeur VIDE se replie sur le français, puis sur la clé', () => {
    // Simulation d'une traduction laissée vide.
    const sauvegardeEn = (en as any)['common.back'];
    const sauvegardeFr = (fr as any)['common.back'];
    (en as any)['common.back'] = '';
    try {
      expect(translate('en', 'common.back')).toBe('Retour');
      (fr as any)['common.back'] = '';
      expect(translate('en', 'common.back')).toBe('common.back');
    } finally {
      (en as any)['common.back'] = sauvegardeEn;
      (fr as any)['common.back'] = sauvegardeFr;
    }
  });

  it('remplace les variables, TOUTES les occurrences', () => {
    expect(translate('fr', 'admin.impayees.heading', { n: 3 })).toBe('Factures impayées (3)');
    expect(translate('en', 'admin.impayees.heading', { n: 3 })).toBe('Unpaid invoices (3)');
    const texte = translate('fr', 'admin.participation.summary', { collectee: 1, devise: 'CHF', pct: 2, demo: 3, respire: 4 });
    expect(texte).not.toMatch(/\{\w+\}/);
    expect(texte.split('CHF').length - 1).toBe(3);
  });

  it('variable non fournie : le gabarit reste visible ; variable superflue : ignorée', () => {
    expect(translate('fr', 'admin.impayees.heading')).toBe('Factures impayées ({n})');
    expect(translate('fr', 'common.back', { n: 1 })).toBe('Retour');
  });

  it('la valeur de remplacement n’est pas réinterprétée comme gabarit', () => {
    expect(translate('fr', 'admin.impayees.heading', { n: '{n}' })).toBe('Factures impayées ({n})');
  });
});

describe('useT', () => {
  it('traduit selon router.locale', () => {
    routeur.locale = 'de';
    expect(useT()('common.back')).toBe(de['common.back']);
    routeur.locale = undefined;
    expect(useT()('common.back')).toBe('Retour');
  });
});

describe('currentLocale (hors composant)', () => {
  it('côté serveur : français', () => {
    expect(currentLocale()).toBe('fr');
  });
  it('lit __NEXT_DATA__.locale, sinon <html lang>, sinon français', () => {
    const document = { documentElement: { lang: 'it' } };
    vi.stubGlobal('document', document);
    vi.stubGlobal('window', { __NEXT_DATA__: { locale: 'en' } });
    expect(currentLocale()).toBe('en');
    vi.stubGlobal('window', {});
    expect(currentLocale()).toBe('it');
    document.documentElement.lang = '';
    expect(currentLocale()).toBe('fr');
  });
});
