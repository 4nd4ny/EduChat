// UC-24 — Outils propres aux tests de traduction : une fausse API Anthropic
// Messages qui « traduit » en préfixant chaque champ par la langue cible.
import type { Reponse } from '../../helpers/fetch';

export const CIBLES: Record<string, string> = {
  'anglais (britannique)': 'en', italien: 'it', 'allemand (usage suisse : « ss », jamais « ß »)': 'de', français: 'fr',
};

/** Lit la langue cible dans la demande envoyée au modèle. */
export function cibleDe(init?: RequestInit): string {
  const corps = JSON.parse(String(init?.body ?? '{}'));
  const texte: string = corps.messages?.[0]?.content ?? '';
  const nom = /Langue cible : (.*?)\.\n/.exec(texte)?.[1] ?? '';
  return CIBLES[nom] ?? '??';
}

/** Réponse Anthropic réussie : chaque champ est préfixé par [xx]. */
export function traductionReussie(init?: RequestInit, tokens = { in: 100, out: 50 }): Reponse {
  const corps = JSON.parse(String(init?.body ?? '{}'));
  const texte: string = corps.messages[0].content;
  const [, nom, description, prompt] = texte.split(/<<<\d>>>\n?/);
  const l = cibleDe(init);
  return {
    json: {
      content: [{
        type: 'text',
        text: `<<<1>>>\n[${l}] ${nom.trim()}\n<<<2>>>\n[${l}] ${description.trim()}\n<<<3>>>\n[${l}] ${prompt.trim()}\n<<<0>>>`,
      }],
      usage: { input_tokens: tokens.in, output_tokens: tokens.out },
      stop_reason: 'end_turn',
    },
  };
}
