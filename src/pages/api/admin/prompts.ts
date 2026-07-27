import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../../server/db';
import { requireGestionTuteurs } from '../../../server/admin';
import { ERR } from '../../../shared/providers';
import { resumeTraductions } from '../../../server/traduction';

// Vue d'administration des prompts, TOUS statuts confondus (la modération
// elle-même passe par PATCH/DELETE /api/prompts/[name], qui portent les
// règles de droits). Inclut le corps pour examen avant approbation.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // requireGestionTuteurs, et non requireAdmin : un ENSEIGNANT non-administrateur
  // relit et valide les tuteurs de son école (décision du client). Sa portée est
  // plus étroite que celle de l'administrateur — voir le filtre ci-dessous.
  const scope = requireGestionTuteurs(req);
  if (!scope) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }
  // PORTÉE. Cette vue rend le CORPS de chaque tuteur : la servir entière à un
  // administrateur d'école lui ouvrirait le texte des tuteurs de toutes les
  // autres, ce que la propriété d'un tuteur par son école interdit.
  //
  //   ecole (administrateur) — les siens, PLUS ceux de la plateforme
  //     (rattachement NULL), publics de toute façon et qu'elle peut modérer ;
  //   enseignant — les siens, ET RIEN D'AUTRE. Le NULL disparaît : un tuteur
  //     de la plateforme ne relève d'aucune école, et l'enseignant n'a aucun
  //     titre à en relire le texte ni à en modérer les commentaires.
  //
  // Le paramètre @etab et le filtre qui le nomme se posent D'UN SEUL GESTE :
  // better-sqlite3 refuse aussi bien une liaison sans paramètre correspondant
  // qu'un paramètre manquant, et les deux erreurs sont des 500 à l'exécution.
  const filtreEcole = scope.niveau === 'super' ? ''
    : scope.niveau === 'ecole' ? 'AND (etablissement_id = @etab OR etablissement_id IS NULL)'
      : 'AND etablissement_id = @etab';
  const args = scope.niveau === 'super' ? [] : [{ etab: scope.etablissementId }];
  // Les prompts ARCHIVÉS sont définitivement masqués de cette vue (nettoyage
  // d'interface) — ils restent en base avec leurs compteurs, rien n'est supprimé.
  //
  // Ce commentaire vit AU-DESSUS du gabarit : deux lignes de « // » tombées
  // à l'intérieur des accents graves sont parties dans le SQL, et
  // db.prepare() jetait « near "/" : syntax error » — toute l'administration
  // des tuteurs répondait 500, la nouvelle liste par école comprise.
  const prompts = getDb().prepare(`
    SELECT id, name, author_email AS authorEmail, author_name AS authorName, language,
           description, body, version, status, web_search AS webSearch,
           created_at AS createdAt, updated_at AS updatedAt,
           usage_count AS usageCount, tokens_total AS tokensTotal, size_bytes AS sizeBytes,
           etablissement_id AS etablissementId, publie
    FROM prompts
    WHERE archived = 0 ${filtreEcole}
    ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'draft' THEN 1 WHEN 'published' THEN 2 ELSE 3 END,
             updated_at DESC
  `).all(...args) as
    (Record<string, unknown> & { id: number; version: number; language: string })[];

  // L'état des traductions voyage avec la ligne : c'est là que l'administration
  // voit qu'une modification a périmé les trois autres langues, et décide.
  res.status(200).json({
    prompts: prompts.map(row => ({ ...row, translations: resumeTraductions(row) })),
  });
}
