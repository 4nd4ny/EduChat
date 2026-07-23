import { NextApiRequest, NextApiResponse } from 'next';
import { getByShareToken, toCard } from '../../../server/prompts';
import { ERR } from '../../../shared/providers';

// Lecture d'un prompt « en construction » via son URL secrète.
// Volontairement NON verrouillé (décision client) : quiconque connaît le lien
// peut voir et tester le brouillon — c'est le mécanisme d'invitation des
// testeurs. Le jeton (128 bits aléatoires) est la seule protection.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }
  const row = getByShareToken(String(req.query.token ?? ''));
  if (!row) return res.status(404).json({ error: { code: 'ERR_PROMPT_UNKNOWN' } });
  res.status(200).json({
    prompt: { ...toCard(row), body: row.body, status: row.status },
    shareToken: row.share_token,
  });
}
