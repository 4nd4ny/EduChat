// UC-21 — Utilitaire propre à ce cas : un faux catalogue public d'OpenRouter
// et un faux taux de change (Frankfurter), servis par la doublure du fetch
// global. Aucun appel réseau réel.
import { doublerFetch } from '../../helpers/fetch';

/** Prix OpenRouter : dollars PAR JETON, en chaîne — 1 $/Mtok = '0.000001'. */
const parJeton = (mtok: number) => String(mtok / 1_000_000);

export const modele = (id: string, entree: number | null, sortie: number | null, created = 0) => ({
  id, created,
  pricing: entree === null ? {} : { prompt: parJeton(entree), completion: parJeton(sortie ?? 0) },
});

/** Un catalogue qui reproduit les pièges décrits dans sondeTarifs.ts. */
export const CATALOGUE = [
  // Anthropic : le nom daté de l'échelle retrouve la version précise, pas le pointeur flottant.
  modele('anthropic/claude-haiku-4.5', 1, 5, 100),
  modele('~anthropic/claude-haiku-latest', 9, 9, 999),
  modele('anthropic/claude-sonnet-5', 2, 10, 200),
  modele('anthropic/claude-opus-5', 5, 25, 300),
  // OpenAI : « gpt-5.5-pro », plus récent, ne doit pas capter « gpt-5.5 ».
  modele('openai/gpt-5.4-mini', 0.25, 2, 100),
  modele('openai/gpt-5.5', 5, 30, 200),
  modele('openai/gpt-5.5-pro', 30, 180, 201),
  // Mistral : variante datée la plus récente ; alias « medium » par préfixe.
  modele('mistralai/mistral-small-3.2', 0.15, 0.6, 100),
  modele('mistralai/mistral-medium-3', 0.4, 2, 100),
  modele('mistralai/mistral-medium-3-5', 1.5, 7.5, 300),
  modele('mistralai/mistral-large', 2, 6, 50),
  modele('mistralai/mistral-large-2512', 0.5, 1.5, 400),
  // Un homonyme chez un autre vendeur, qui ne doit jamais servir.
  modele('autre/claude-sonnet-5', 99, 99, 999),
];

export type OptionsDoublure = {
  catalogue?: unknown[];
  /** HTTP du catalogue (200 par défaut). */
  statutCatalogue?: number;
  /** Taux USD → devise ; null = Frankfurter injoignable. */
  taux?: number | null;
};

export function doublerSources(o: OptionsDoublure = {}) {
  return doublerFetch(url => {
    if (url.startsWith('https://openrouter.ai/api/v1/models')) {
      return { status: o.statutCatalogue ?? 200, json: { data: o.catalogue ?? CATALOGUE } };
    }
    if (url.startsWith('https://api.frankfurter.app/')) {
      const devise = new URL(url).searchParams.get('to') ?? '';
      if (o.taux === null) return { status: 503, json: {} };
      return { json: { amount: 1, base: 'USD', rates: { [devise.toUpperCase()]: o.taux ?? 0.8 } } };
    }
    return { status: 404, json: {} };
  });
}
