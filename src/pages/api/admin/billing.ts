import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../../server/db';
import { requireAdmin, monthStartUtc } from '../../../server/admin';
import { ERR } from '../../../shared/providers';

// Facturation mensuelle de la clé interne, par établissement et par IP.
// GET /api/admin/billing?year=2026&month=7[&format=csv]
//
// La facture est exprimée en TOKENS par fournisseur (le tarif par token
// appartient au gestionnaire) ; les établissements RESPIRE apparaissent avec
// la mention « gratuit ». Les IP inconnues de la base sont facturables aussi :
// chaque ligne du journal porte l'IP d'origine.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req)) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  const now = new Date();
  const year = Number(req.query.year) || now.getUTCFullYear();
  const month = Number(req.query.month) || now.getUTCMonth() + 1;
  const start = monthStartUtc(year, month);
  const end = monthStartUtc(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1);

  const rows = getDb().prepare(`
    SELECT
      -- Le repli gratuit public est journalisé sur la « clé serveur » lui
      -- aussi, mais sans IP ni établissement : c'est la démo du site, payée
      -- par le gestionnaire. La confondre avec une école inconnue gonflerait
      -- la facture d'un client qui n'existe pas.
      CASE WHEN u.etablissement_id IS NULL AND u.ip = ''
           THEN '(démo publique — non facturable)'
           ELSE COALESCE(e.name, '(IP hors base)') END AS etablissement,
      COALESCE(e.respire, 0)                  AS respire,
      u.etablissement_id                      AS etablissementId,
      u.ip                                    AS ip,
      u.provider                              AS provider,
      COUNT(*)                                AS requests,
      SUM(u.tokens)                           AS tokens
    FROM usage_log u
    LEFT JOIN etablissements e ON e.id = u.etablissement_id
    WHERE u.ts >= ? AND u.ts < ? AND u.used_server_key = 1
    GROUP BY u.etablissement_id, u.ip, u.provider
    ORDER BY etablissement, u.ip, u.provider
  `).all(start, end) as Array<{
    etablissement: string; respire: number; etablissementId: number | null;
    ip: string; provider: string; requests: number; tokens: number;
  }>;

  // Bilan par ENSEIGNANT (attribution via les réglages de session, étape 14).
  const teachers = getDb().prepare(`
    SELECT u.teacher_email AS teacherEmail,
           COALESCE(e.name, '(IP hors base)') AS etablissement,
           u.provider AS provider, COUNT(*) AS requests, SUM(u.tokens) AS tokens
    FROM usage_log u
    LEFT JOIN etablissements e ON e.id = u.etablissement_id
    WHERE u.ts >= ? AND u.ts < ? AND u.used_server_key = 1 AND u.teacher_email IS NOT NULL
    GROUP BY u.teacher_email, u.etablissement_id, u.provider
    ORDER BY u.teacher_email, u.provider
  `).all(start, end) as Array<{ teacherEmail: string; etablissement: string; provider: string; requests: number; tokens: number }>;

  if (req.query.format === 'csv' && req.query.by === 'teacher') {
    const header = 'periode;enseignant;etablissement;fournisseur;requetes;tokens';
    const lines = teachers.map(r =>
      `${year}-${String(month).padStart(2, '0')};${r.teacherEmail};"${r.etablissement.replace(/"/g, '""')}";${r.provider};${r.requests};${r.tokens}`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="educhat-facturation-enseignants-${year}-${String(month).padStart(2, '0')}.csv"`);
    return res.status(200).send([header, ...lines].join('\n'));
  }

  if (req.query.format === 'csv') {
    const header = 'periode;etablissement;gratuit_respire;ip;fournisseur;requetes;tokens';
    const lines = rows.map(r =>
      `${year}-${String(month).padStart(2, '0')};"${r.etablissement.replace(/"/g, '""')}";${r.respire ? 'oui' : 'non'};${r.ip};${r.provider};${r.requests};${r.tokens}`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="educhat-facturation-${year}-${String(month).padStart(2, '0')}.csv"`);
    return res.status(200).send([header, ...lines].join('\n'));
  }

  res.status(200).json({ year, month, rows, teachers });
}
