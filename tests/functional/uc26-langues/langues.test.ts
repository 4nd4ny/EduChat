// UC-26 — Tests fonctionnels : « Utiliser le site dans sa langue ».
//
// Sans jsdom ni bibliothèque de rendu, le parcours est joué au niveau des
// fonctions : le sélecteur (src/i18n/LanguageSwitcher.tsx) est appelé comme une
// fonction qui rend son arbre d'éléments React ; on « clique » sur un bouton
// (appel de son onClick), le routeur doublé enregistre la navigation et change
// de locale comme le ferait Next ; useT relit alors les libellés. Le routage
// localisé lui-même (/en, /it, /de) appartient à Next et n'est pas rejoué :
// on vérifie seulement sa déclaration dans next.config.js.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const nextConfig = require('../../../next.config.js');

type Routeur = { locale: string; locales: string[]; asPath: string; push: ReturnType<typeof vi.fn> };
const routeur: Routeur = { locale: 'fr', locales: [], asPath: '/', push: vi.fn() };
vi.mock('next/router', () => ({ useRouter: () => routeur }));
vi.mock('react', async (original) => ({ ...(await original<any>()), useCallback: (fn: unknown) => fn }));

import LanguageSwitcher from '../../../src/i18n/LanguageSwitcher';
import { useT } from '../../../src/i18n/useT';
import { dictionaries, type TranslationKey } from '../../../src/i18n/dictionaries';

beforeEach(() => {
  routeur.locale = nextConfig.i18n.defaultLocale;
  routeur.locales = [...nextConfig.i18n.locales];
  routeur.asPath = '/chat/abc?x=1';
  // Next change la locale courante une fois la navigation faite.
  routeur.push = vi.fn(async (_url: string, _as: unknown, options: { locale: string }) => {
    routeur.locale = options.locale;
    return true;
  });
});

/** Les boutons rendus par le sélecteur (arbre React sans DOM). */
function boutons() {
  const arbre: any = LanguageSwitcher();
  return ([] as any[]).concat(arbre.props.children);
}

// Libellés de la barre latérale d'historique, visibles dès l'accueil.
const LIBELLES: TranslationKey[] = ['sidebar.new', 'sidebar.import', 'sidebar.exportAll', 'sidebar.clear', 'common.back'];

describe('Scénario nominal : bascule de langue', () => {
  it('le sélecteur propose chaque locale déclarée, la courante en évidence', () => {
    const b = boutons();
    expect(b.map(x => x.key)).toEqual(['fr', 'en', 'it', 'de']);
    expect(b.map(x => x.props['aria-label'])).toEqual(['Langue : fr', 'Langue : en', 'Langue : it', 'Langue : de']);
    expect(b[0].props.className).toContain('font-bold');
    expect(b[1].props.className).not.toContain('font-bold');
  });

  it('fr → en → it → de → fr : même page conservée, libellés traduits à chaque étape', () => {
    const vus: Record<string, string[]> = {};
    for (const cible of ['en', 'it', 'de', 'fr']) {
      boutons().find(x => x.key === cible).props.onClick();
      expect(routeur.push).toHaveBeenLastCalledWith('/chat/abc?x=1', undefined, { locale: cible });
      expect(routeur.locale).toBe(cible);
      const t = useT();
      vus[cible] = LIBELLES.map(k => t(k));
      expect(vus[cible]).toEqual(LIBELLES.map(k => (dictionaries as any)[cible][k]));
      // Le bouton de la nouvelle langue est désormais en évidence.
      expect(boutons().find(x => x.key === cible).props.className).toContain('font-bold');
    }
    expect(vus.en).toContain('New conversation');
    expect(vus.fr).toContain('Nouvelle discussion');
    // Quatre langues, quatre rendus différents du même libellé.
    expect(new Set(Object.values(vus).map(v => v[0])).size).toBe(4);
  });

  it('les variables sont remplacées dans chaque langue', () => {
    for (const locale of nextConfig.i18n.locales) {
      routeur.locale = locale;
      const texte = useT()('admin.impayees.heading', { n: 7 });
      expect(texte).toContain('7');
      expect(texte).not.toContain('{n}');
    }
  });
});

describe('Scénarios alternatifs', () => {
  it('A1 — routeur sans liste de locales : le sélecteur ne propose que le français', () => {
    (routeur as any).locales = undefined;
    expect(boutons().map(x => x.key)).toEqual(['fr']);
  });

  it('A2 — locale non gérée (ex. es) : tout le site retombe sur le français', () => {
    routeur.locale = 'es';
    const t = useT();
    expect(LIBELLES.map(k => t(k))).toEqual(LIBELLES.map(k => (dictionaries.fr as any)[k]));
  });
});

describe('Couverture complète de chaque locale déclarée', () => {
  for (const locale of ['fr', 'en', 'it', 'de']) {
    it(`${locale} : chaque clé rend un texte propre à la langue (jamais la clé brute)`, () => {
      routeur.locale = locale;
      const t = useT();
      const dict = (dictionaries as any)[locale];
      for (const cle of Object.keys(dictionaries.fr) as TranslationKey[]) {
        const texte = t(cle);
        expect(texte).toBe(dict[cle]);
        if (texte !== '') expect(texte).not.toBe(cle);
      }
    });
  }
});
