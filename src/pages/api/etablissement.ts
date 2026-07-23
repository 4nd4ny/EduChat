import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../server/db';
import { requireAuth } from '../../server/token';
import { getClientIp, isRateLimited } from '../../server/access';
import { getEtablissementById, monthUsage, monthUsageByProvider, parseHours, HourSlot } from '../../server/etablissements';
import { ERR } from '../../shared/providers';

// Espace du RESPONSABLE d'établissement (un enseignant rattaché).
//
// Contrôle de cohérence : la gestion ne repose JAMAIS sur l'IP (usurpable côté
// usage, et le responsable travaille souvent depuis chez lui) — elle exige un
// jeton de compte dont le rattachement (users.etablissement_id, posé par
// l'admin) est relu en base à chaque requête.
//
// Le responsable peut modifier : les HORAIRES d'accès libre, le QUOTA QUOTIDIEN
// PAR ÉLÈVE et le PLAFOND MENSUEL de dépense. Il ne peut PAS modifier : les IP
// (l'identité même de l'établissement — admin uniquement), le statut RESPIRE ni
// l'email de facturation.

const MAX_SLOTS = 30;

function resolveResponsable(req: NextApiRequest): { email: string; etablissementId: number } | 'auth' | 'none' {
  const auth = requireAuth(req);
  if (!auth) return 'auth';
  const user = getDb().prepare('SELECT is_teacher, etablissement_id FROM users WHERE email = ?')
    .get(auth.email) as { is_teacher: number; etablissement_id: number | null } | undefined;
  if (!user?.is_teacher || !user.etablissement_id) return 'none';
  return { email: auth.email, etablissementId: user.etablissement_id };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const who = resolveResponsable(req);
  if (who === 'auth') return res.status(401).json({ error: { code: 'ERR_AUTH_REQUIRED' } });
  if (who === 'none') return res.status(403).json({ error: { code: 'ERR_NO_ETABLISSEMENT' } });

  const etab = getEtablissementById(who.etablissementId);
  if (!etab) return res.status(403).json({ error: { code: 'ERR_NO_ETABLISSEMENT' } });

  if (req.method === 'GET') {
    return res.status(200).json({
      etablissement: {
        name: etab.name,
        ips: etab.ips,
        respire: !!etab.respire,
        hours: parseHours(etab.hours),
        quotaPerStudentDaily: etab.quota_per_student_daily,
        tokenQuotaMonthly: etab.token_quota_monthly,
      },
      usage: {
        monthTokens: monthUsage(etab.id),
        byProvider: monthUsageByProvider(etab.id),
      },
    });
  }

  if (req.method !== 'PUT') {
    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  if (await isRateLimited(getClientIp(req), 10, 'etablissement')) {
    return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
  }

  // Validation stricte des créneaux : jour 0-6, HH:MM, début < fin.
  const rawHours = Array.isArray(req.body?.hours) ? req.body.hours.slice(0, MAX_SLOTS) : [];
  const hours: HourSlot[] = [];
  for (const slot of rawHours) {
    const day = Number(slot?.day);
    const start = String(slot?.start ?? '');
    const end = String(slot?.end ?? '');
    if (!Number.isInteger(day) || day < 0 || day > 6
      || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start >= end) {
      return res.status(400).json({ error: { code: 'ERR_HOURS_INVALID' } });
    }
    hours.push({ day, start, end });
  }

  const quotaPerStudentDaily = Math.max(0, Math.min(10_000_000, Number(req.body?.quotaPerStudentDaily) || 0));
  const tokenQuotaMonthly = Math.max(0, Math.min(10_000_000_000, Number(req.body?.tokenQuotaMonthly) || 0));

  getDb().prepare('UPDATE etablissements SET hours = ?, quota_per_student_daily = ?, token_quota_monthly = ? WHERE id = ?')
    .run(JSON.stringify(hours), quotaPerStudentDaily, tokenQuotaMonthly, etab.id);

  res.status(200).json({ ok: true });
}
