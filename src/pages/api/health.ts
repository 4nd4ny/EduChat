import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../server/db';

// Contrôle de santé : vérifie que la base répond. Utilisé par la supervision
// et comme test de fumée après chaque déploiement.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const db = getDb();
    // Même décompte que le bandeau public (src/server/stats.ts) : un tuteur
    // archivé n'est plus proposé, il ne compte donc pas parmi les publiés —
    // sans quoi la supervision et l'accueil affichent deux chiffres différents.
    const prompts = (db.prepare("SELECT COUNT(*) AS n FROM prompts WHERE status = 'published' AND archived = 0").get() as { n: number }).n;
    res.status(200).json({ ok: true, publishedPrompts: prompts });
  } catch (error) {
    console.error('Healthcheck en échec :', error);
    res.status(500).json({ ok: false });
  }
}
