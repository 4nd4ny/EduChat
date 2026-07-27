// Hook de traduction maison (~20 lignes, décision v2 : pas de bibliothèque).
// Branché sur router.locale, fourni par le routage i18n natif de Next.

import { useRouter } from 'next/router';
import { useCallback } from 'react';
import { dictionaries, fr, type Locale, type TranslationKey } from './dictionaries';

export function translate(locale: string | undefined, key: TranslationKey, vars?: Record<string, string | number>): string {
  const dict = dictionaries[(locale as Locale) || 'fr'] ?? fr;
  let text: string = dict[key] ?? fr[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      // TOUTES les occurrences, pas la première. String.replace avec un motif
      // CHAÎNE n'en remplace qu'une : « … 0.00 CHF … 0.00 {devise} … 0.00
      // {devise} » s'affichait tel quel dans l'administration, et le défaut
      // était invisible partout où un gabarit n'apparaissait qu'une fois.
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

export function useT() {
  const { locale } = useRouter();
  return useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );
}

/**
 * La locale courante, lisible HORS composant React.
 *
 * Les routes d'API de Next ne reçoivent pas la locale du routage i18n : il
 * faut la leur envoyer. Or les appels partent parfois d'un module utilitaire
 * (streamCompletion) où aucun hook n'est disponible. Next l'expose dans le
 * document ; côté serveur, on retombe sur le français.
 */
export function currentLocale(): string {
  if (typeof window === 'undefined') return 'fr';
  return (window as any).__NEXT_DATA__?.locale || document.documentElement.lang || 'fr';
}
