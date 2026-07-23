import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../../server/db';
import { requireAdmin } from '../../../server/admin';
import { ERR, PROVIDER_IDS } from '../../../shared/providers';

// Gestion des établissements (« clients ») — réservée aux administrateurs.
// L'établissement porte : ses IP, son statut RESPIRE (gratuit), son quota
// mensuel de tokens sur la clé interne, son fournisseur actif, son contact
// de facturation.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req)) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
  const db = getDb();

  if (req.method === 'GET') {
    return res.status(200).json({
      etablissements: db.prepare('SELECT * FROM etablissements ORDER BY name COLLATE NOCASE').all(),
    });
  }

  if (req.method === 'POST') {
    const id = Number(req.body?.id) || 0;
    const name = String(req.body?.name ?? '').trim().slice(0, 120);
    const ips = String(req.body?.ips ?? '').split(',').map(s => s.trim()).filter(Boolean).join(',');
    const respire = req.body?.respire ? 1 : 0;
    const quota = Math.max(0, Number(req.body?.tokenQuotaMonthly) || 0);
    const perStudent = Math.max(0, Number(req.body?.quotaPerStudentDaily) || 0);
    const activeProvider = PROVIDER_IDS.includes(req.body?.activeProvider) ? req.body.activeProvider : '';
    const billingEmail = String(req.body?.billingEmail ?? '').trim().slice(0, 255);
    if (!name) return res.status(400).json({ error: { code: 'ERR_NAME_INVALID' } });

    if (id) {
      db.prepare('UPDATE etablissements SET name=?, ips=?, respire=?, token_quota_monthly=?, quota_per_student_daily=?, active_provider=?, billing_email=? WHERE id=?')
        .run(name, ips, respire, quota, perStudent, activeProvider, billingEmail, id);
      return res.status(200).json({ ok: true, id });
    }
    const info = db.prepare(`
      INSERT INTO etablissements (name, ips, respire, token_quota_monthly, quota_per_student_daily, active_provider, billing_email, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, ips, respire, quota, perStudent, activeProvider, billingEmail, Date.now());
    return res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  }

  if (req.method === 'DELETE') {
    const id = Number(req.query.id) || 0;
    if (!id) return res.status(400).json({ error: { code: 'ERR_ID_INVALID' } });
    // Le journal de consommation est conservé (données de facturation) :
    // seules les lignes futures perdent leur rattachement.
    db.prepare('DELETE FROM etablissements WHERE id = ?').run(id);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).json({ error: { code: ERR.METHOD } });
}
