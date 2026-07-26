import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../../server/db';
import { requireSuperAdmin } from '../../../server/admin';
import { notifyAdmin } from '../../../server/mail';
import { ERR, SCHOOL_PROVIDER_IDS } from '../../../shared/providers';

// Gestion des établissements (« clients ») — réservée aux administrateurs.
// L'établissement porte : ses IP, son statut RESPIRE (gratuit), son quota
// mensuel de tokens sur la clé interne, son fournisseur actif, son contact
// de facturation.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireSuperAdmin(req)) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
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
    // Un fournisseur que la clé interne ne peut PAS payer (OpenRouter, ou tout
    // fournisseur réservé aux adultes) n'a pas de sens ici : le réglage
    // s'enregistrerait et la complétion le refuserait ensuite.
    const activeProvider = SCHOOL_PROVIDER_IDS.includes(req.body?.activeProvider) ? req.body.activeProvider : '';
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
    // Trace email de chaque nouvel établissement (hook prêt pour un futur
    // parcours d'inscription en libre-service).
    notifyAdmin(
      `Nouvel établissement : ${name}`,
      `L'établissement « ${name} » vient d'être créé.\nIPs : ${ips || '(aucune)'}\n` +
      `RESPIRE : ${respire ? 'oui (gratuit)' : 'non'} — Quota mensuel : ${quota || 'illimité'}\n` +
      `Email de facturation : ${billingEmail || '(non renseigné)'}`,
    );
    return res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  }

  if (req.method === 'DELETE') {
    // DÉSACTIVÉ (principe du 24 juillet : on ne supprime jamais rien) —
    // supprimer la ligne effacerait le nom, les IP et l'email de facturation
    // d'un client dont usage_log garde l'historique : la facture d'un mois
    // passé deviendrait inattribuable. Pour « fermer » un établissement :
    // vider ses IP et son quota (il ne matche plus rien), la ligne demeure.
    return res.status(403).json({ error: { code: 'ERR_DELETE_DISABLED' } });
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).json({ error: { code: ERR.METHOD } });
}
