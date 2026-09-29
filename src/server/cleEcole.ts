// LA CLÉ DE L'ÉCOLE, HORS DU CHAT : MÊMES GARDES, MÊME DÉCOMPTE.
//
// /api/completion n'est pas la seule route qui dépense la clé interne d'une
// école : la dictée (/api/transcribe) et la lecture à voix haute (/api/speak)
// le font aussi, sur le même réseau et pour la même classe. Elles le faisaient
// SANS AUCUN des contrôles du chat — ni crédit, ni quotas, ni fournisseurs de la
// séance — et journalisaient sans prix ni montant : une école à sec continuait
// de payer chez le fournisseur sans que son porte-monnaie bouge d'un centime.
//
// Ce module rassemble, pour ces routes « annexes », les deux moments où le chat
// touche à l'argent : le refus AVANT l'appel, et le décompte APRÈS. Il ne
// réinvente aucune règle — il appelle les mêmes fonctions que
// src/pages/api/completion.ts (aDuCredit, seanceAutoriseFournisseur,
// studentDayUsage, tarifDuModele, decompter), dans le même ordre, avec les
// mêmes codes d'erreur. Une règle écrite trois fois finit par diverger ; une
// règle appelée trois fois, non.

import { getDb } from './db';
import { resolveEtablissementByIp, studentDayUsage } from './etablissements';
import { seanceActive, seanceAutoriseFournisseur } from './seance';
import { aDuCredit, decompter, tarifDuModele, titulaireEcole } from './porteMonnaie';
import { tokensDetail } from './llm';
import { providerDefaults, type ProviderId } from '../shared/providers';

/** Ce qu'il faut garder du contrôle pour journaliser après l'appel. */
export type AccesCleEcole = {
  etablissementId: number | null;
  /** Enseignant qui a posé la séance en cours (attribution, comme le chat). */
  teacherEmail: string | null;
  /** Pot du quota quotidien par élève : clientId anonyme, sinon l'IP. */
  studentBucket: string;
};

export type RefusCleEcole = { status: number; code: string };

/**
 * Peut-on dépenser la clé interne de l'école pour ce fournisseur, maintenant ?
 *
 * À appeler UNIQUEMENT quand `mayUseServerKeys(ip)` a déjà répondu oui : c'est
 * lui qui dit « on est sur le réseau ouvert d'une école » ; ceci dit « et
 * l'école peut encore payer ». Même ordre que /api/completion, pour qu'un refus
 * dise sa vraie raison :
 *   1. fournisseur écarté ou à drapeau rouge → 403 (AI Act, jamais sur la clé
 *      d'une école) ;
 *   2. fournisseur non coché pour la séance → 403 ;
 *   3. porte-monnaie à sec (sauf RESPIRE) → 402, AVANT l'appel — sinon l'école
 *      paie l'appel qu'on s'apprête à lui refuser ;
 *   4. plafond mensuel, puis quota quotidien par élève → 429.
 *
 * Sans établissement résolu (adresse autorisée par la configuration seule), il
 * n'y a ni porte-monnaie ni quota à consulter : même comportement que le chat.
 */
export function controlerCleEcole(
  clientIp: string, provider: ProviderId, clientId = '',
): AccesCleEcole | RefusCleEcole {
  if (providerDefaults[provider].wrng || providerDefaults[provider].ecarte) {
    return { status: 403, code: 'ERR_PROVIDER_NOT_ALLOWED' };
  }
  const etab = resolveEtablissementByIp(clientIp);
  const etablissementId = etab?.id ?? null;
  const seance = seanceActive(etablissementId);
  if (!seanceAutoriseFournisseur(seance, provider)) {
    return { status: 403, code: 'ERR_PROVIDER_NOT_IN_SESSION' };
  }
  if (etablissementId && !aDuCredit(titulaireEcole(etablissementId))) {
    return { status: 402, code: 'ERR_SCHOOL_NO_CREDIT' };
  }
  const studentBucket = etab ? (clientId || `ip:${clientIp}`) : '';
  if (etab && etab.token_quota_monthly > 0) {
    const now = new Date();
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const used = (getDb().prepare(
      'SELECT COALESCE(SUM(tokens), 0) AS total FROM usage_log WHERE etablissement_id = ? AND ts >= ?')
      .get(etab.id, monthStart) as { total: number }).total;
    if (used >= etab.token_quota_monthly) return { status: 429, code: 'ERR_QUOTA_ETABLISSEMENT' };
  }
  if (etab && etab.quota_per_student_daily > 0
      && studentDayUsage(etab.id, studentBucket) >= etab.quota_per_student_daily) {
    return { status: 429, code: 'ERR_QUOTA_ELEVE' };
  }
  return { etablissementId, teacherEmail: seance?.setByEmail ?? null, studentBucket };
}

export const estRefus = (a: AccesCleEcole | RefusCleEcole): a is RefusCleEcole => 'status' in a;

/**
 * Journalise un appel payé par la clé de l'école ET le décompte de son
 * porte-monnaie, dans une seule transaction — exactement la ligne qu'écrit
 * /api/completion : jetons ventilés, deux prix figés, `tarif_at`, `tarif_repli`
 * et le `montant` réellement prélevé (0 pour une école RESPIRE, que decompter
 * exonère). Rend ce montant.
 *
 * `modele` est le modèle RÉELLEMENT appelé : c'est lui que l'éditeur facture,
 * donc lui qui fixe le prix (tarifDuModele, avec sa chaîne de repli) et lui que
 * la facture nomme.
 *
 * Ne lève pas : l'audio est déjà produit, on ne le retire pas à l'élève. Mais
 * un décompte perdu est de l'argent, et il se dit comme tel dans le journal.
 */
export function journaliserCleEcole(
  clientIp: string, acces: AccesCleEcole, provider: ProviderId, modele: string,
  detail: { entree: number; sortie: number },
): number {
  const tokens = detail.entree + detail.sortie;
  try {
    const db = getDb();
    return db.transaction(() => {
      const tarif = tarifDuModele(provider, modele);
      const ligne = db.prepare(`
        INSERT INTO usage_log (ts, ip, etablissement_id, teacher_email, prompt_id, provider, model, tokens, tokens_in, tokens_out, used_server_key, client_id, prix_entree_mtok, prix_sortie_mtok, tarif_repli, tarif_at)
        VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
      `).run(Date.now(), clientIp, acces.etablissementId, acces.teacherEmail, provider, modele,
             tokens, detail.entree, detail.sortie, acces.studentBucket,
             tarif.entree, tarif.sortie, tarif.repli.slice(0, 200), tarif.at);
      if (!acces.etablissementId) return 0;
      const cout = decompter(titulaireEcole(acces.etablissementId), tarif, detail.entree, detail.sortie);
      db.prepare('UPDATE usage_log SET montant = ? WHERE id = ?').run(cout, ligne.lastInsertRowid);
      return cout;
    })();
  } catch (error) {
    console.error(
      `CONSOMMATION NON DÉCOMPTÉE — établissement ${acces.etablissementId ?? '(hors base)'}`
      + ` · ${provider} · ${modele} · ${detail.entree}+${detail.sortie} jetons :`, error);
    return 0;
  }
}

/**
 * Les jetons d'un appel vocal : ceux que rend le fournisseur quand il les rend
 * (`usage`, vocabulaire OpenAI ou Mistral), sinon une ESTIMATION à partir du
 * texte — un jeton pour quatre caractères, au moins un. L'estimation va du côté
 * où le texte se trouve : en SORTIE pour une dictée (le texte est produit), en
 * ENTRÉE pour une lecture (le texte est lu).
 */
export function jetonsVoix(
  usage: any, texte: string, cote: 'entree' | 'sortie',
): { entree: number; sortie: number } {
  const { entree, sortie } = tokensDetail(usage);
  if (Number(entree) + Number(sortie) > 0) return { entree: Number(entree) || 0, sortie: Number(sortie) || 0 };
  const estime = Math.max(1, Math.round(texte.length / 4));
  return cote === 'sortie' ? { entree: 0, sortie: estime } : { entree: estime, sortie: 0 };
}
