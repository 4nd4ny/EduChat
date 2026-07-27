// Établissements — module partagé (résolution par IP, horaires, quotas).
//
// L'IP identifie l'établissement pour l'USAGE (accès élèves, facturation).
// La GESTION, elle, passe toujours par le compte enseignant rattaché (jeton +
// users.etablissement_id relu en base) : c'est le contrôle de cohérence qui
// empêche une IP usurpée ou un visiteur de modifier quoi que ce soit.

import { DateTime } from 'luxon';
import { getDb } from './db';
// Ce module ne sert QUE des routes d'API : importer le croisement des clés
// serveur (SECRET_*) ne peut donc rien exposer au navigateur.
import { fournisseursServis } from './fournisseurs';

export type EtabRow = {
  id: number; name: string; ips: string; respire: number;
  token_quota_monthly: number; quota_per_student_daily: number;
  hours: string; active_provider: string; billing_email: string; created_at: number;
  /**
   * Les élèves de l'école voient-ils AUSSI les tuteurs publics des AUTRES
   * écoles ? Défaut 0 (fermé). Sans effet sur le catalogue de la plateforme
   * (tuteurs sans rattachement), toujours visible — voir src/server/prompts.ts.
   */
  catalogue_ouvert: number;
};

export type HourSlot = { day: number; start: string; end: string }; // day 0 = dimanche

/** Un « HH:MM » horloge valide (00-23 : 00-59) — pas seulement deux chiffres. */
export function isValidClock(value: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return false;
  const h = Number(m[1]), min = Number(m[2]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59;
}

export function resolveEtablissementByIp(ip: string): EtabRow | null {
  if (!ip || ip === 'unknown') return null;
  const rows = getDb().prepare('SELECT * FROM etablissements').all() as EtabRow[];
  for (const row of rows) {
    if (row.ips.split(',').map(s => s.trim()).includes(ip)) return row;
  }
  return null;
}

export function getEtablissementById(id: number): EtabRow | null {
  return (getDb().prepare('SELECT * FROM etablissements WHERE id = ?').get(id) as EtabRow | undefined) ?? null;
}

export function parseHours(json: string): HourSlot[] {
  try {
    const parsed = JSON.parse(json || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(slot =>
      slot && Number.isInteger(slot.day) && slot.day >= 0 && slot.day <= 6
      && isValidClock(slot.start) && isValidClock(slot.end) && slot.start < slot.end);
  } catch {
    return [];
  }
}

/** L'instant courant tombe-t-il dans l'un des créneaux ? (fuseau SET_TIME_ZONE) */
export function isWithinSchedule(slots: HourSlot[]): boolean {
  if (!slots.length) return false;
  const timeZone = process.env.SET_TIME_ZONE || 'Europe/Zurich';
  const local = DateTime.now().setZone(timeZone);
  const day = local.weekday % 7; // luxon : 1 = lundi … 7 = dimanche → 0 = dimanche
  const minutes = local.hour * 60 + local.minute;
  return slots.some(slot => {
    if (slot.day !== day) return false;
    const [sh, sm] = slot.start.split(':').map(Number);
    const [eh, em] = slot.end.split(':').map(Number);
    return minutes >= sh * 60 + sm && minutes <= eh * 60 + em;
  });
}

/** Tokens consommés sur la clé interne par l'établissement depuis le début du mois (UTC). */
export function monthUsage(etablissementId: number): number {
  const now = new Date();
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  return (getDb().prepare(
    'SELECT COALESCE(SUM(tokens), 0) AS total FROM usage_log WHERE etablissement_id = ? AND ts >= ?')
    .get(etablissementId, monthStart) as { total: number }).total;
}

/** Tokens consommés aujourd'hui (UTC) par un navigateur anonyme de l'établissement. */
export function studentDayUsage(etablissementId: number, clientId: string): number {
  if (!clientId) return 0;
  const now = new Date();
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return (getDb().prepare(
    'SELECT COALESCE(SUM(tokens), 0) AS total FROM usage_log WHERE etablissement_id = ? AND client_id = ? AND ts >= ?')
    .get(etablissementId, clientId, dayStart) as { total: number }).total;
}

/** Consommation du mois par fournisseur — la transparence côté responsable. */
export function monthUsageByProvider(etablissementId: number): Array<{ provider: string; requests: number; tokens: number }> {
  const now = new Date();
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  return getDb().prepare(`
    SELECT provider, COUNT(*) AS requests, SUM(tokens) AS tokens
    FROM usage_log WHERE etablissement_id = ? AND ts >= ? AND used_server_key = 1
    GROUP BY provider ORDER BY tokens DESC
  `).all(etablissementId, monthStart) as Array<{ provider: string; requests: number; tokens: number }>;
}

export type LigneConsommation = {
  provider: string; requests: number; tokens: number;
  /** La clé de l'école peut-elle encore employer ce fournisseur aujourd'hui ? */
  servi: boolean;
};

/**
 * LE RELEVÉ TEL QUE LE LIT UN ENSEIGNANT-ADMINISTRATEUR.
 *
 * Ce que la liste ÉNUMÈRE : les fournisseurs que la clé de l'école peut
 * réellement servir (src/server/fournisseurs.ts), y compris à zéro jeton — un
 * zéro répond à la question « ai-je consommé du Claude ce mois-ci ? », alors
 * qu'une ligne absente laisse le doute. Elle n'énumère RIEN d'autre : une
 * ligne pour un fournisseur que l'école ne peut pas employer est du bruit.
 *
 * Ce que la liste NE JETTE JAMAIS : une consommation réelle. Un fournisseur
 * peut avoir été servi hier et ne plus l'être aujourd'hui (clé retirée du
 * serveur, fournisseur reclassé « adultes seulement » depuis l'AI Act) ; ses
 * jetons ont pourtant été décomptés du porte-monnaie. Il reste donc affiché,
 * marqué `servi: false` — le faire disparaître creuserait un écart inexpliqué
 * entre ce relevé et la facture, et c'est l'écart inexpliqué qui ruine la
 * confiance, jamais la ligne qu'on explique.
 */
export function consommationDuMois(etablissementId: number): LigneConsommation[] {
  const servis = fournisseursServis() as string[];
  const reel = monthUsageByProvider(etablissementId);

  const lignes: LigneConsommation[] = servis.map(provider => {
    const ligne = reel.find(r => r.provider === provider);
    return { provider, requests: ligne?.requests ?? 0, tokens: ligne?.tokens ?? 0, servi: true };
  });
  // Les fournisseurs consommés mais plus servis, à la suite et signalés.
  for (const ligne of reel) {
    if (!servis.includes(ligne.provider)) lignes.push({ ...ligne, servi: false });
  }
  // Le plus consommé d'abord, à l'intérieur de chacun des deux groupes : le
  // relevé se lit par le haut, et ce qui pèse doit y être.
  return lignes.sort((a, b) => Number(a.servi === false) - Number(b.servi === false) || b.tokens - a.tokens);
}
