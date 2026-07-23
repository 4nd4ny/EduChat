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
      text = text.replace(`{${name}}`, String(value));
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
