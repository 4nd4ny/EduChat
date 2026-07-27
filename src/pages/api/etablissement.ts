import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../server/db';
import { requireAuth } from '../../server/token';
import { getClientIp, isRateLimited } from '../../server/access';
import { getEtablissementById, monthUsage, consommationDuMois, parseHours, isValidClock, HourSlot } from '../../server/etablissements';
import { choixEcole, ecoleActivePourCompte, estAdminDe, estEnseignantDe } from '../../server/appartenance';
import { ERR } from '../../shared/providers';

// Espace de l'ÉCOLE — lu par tout enseignant rattaché, réglé par les seuls
// administrateurs de cette école.
//
// Contrôle de cohérence : la gestion ne repose JAMAIS sur l'IP (usurpable côté
// usage, et le responsable travaille souvent depuis chez lui) — elle exige un
// jeton de compte dont l'appartenance est relue en base à chaque requête.
//
// DEPUIS LE MULTI-ÉCOLES, l'école n'est plus users.etablissement_id (une seule
// école par compte) mais l'ÉCOLE ACTIVE : celle que le navigateur ANNONCE dans
// x-educhat-ecole et que le serveur REVÉRIFIE lien par lien
// (ecoleActivePourCompte, src/server/appartenance.ts). Sans cela, un enseignant
// partagé entre deux collèges basculerait le sélecteur sur le second et lirait
// toujours la consommation du premier — l'écran mentirait sans rien signaler.
//
// L'administrateur de l'école peut modifier : les HORAIRES d'accès libre, le
// QUOTA QUOTIDIEN PAR ÉLÈVE, le PLAFOND MENSUEL et l'OUVERTURE DE L'ATELIER DE
// PROMPTAGOGUE sur l'accueil vu depuis son réseau. Il ne peut PAS modifier :
// les IP (l'identité même de l'établissement — le site uniquement), le statut
// RESPIRE ni l'email de facturation.

const MAX_SLOTS = 30;

function resolveResponsable(req: NextApiRequest):
  { email: string; etablissementId: number; isAdmin: boolean } | 'auth' | 'none' {
  const auth = requireAuth(req);
  if (!auth) return 'auth';
  // L'ÉCOLE D'ABORD, LE RANG ENSUITE — même ordre que requireAdmin : c'est
  // parce que l'école est résolue et son lien revérifié avant de regarder le
  // rang qu'un identifiant annoncé par le navigateur ne peut jamais désigner
  // l'école d'autrui.
  const etablissementId = ecoleActivePourCompte(auth.email, choixEcole(req));
  if (etablissementId === null) return 'none';

  // NI « users.is_teacher », NI « estMembre » — ET C'EST TOUTE LA GARDE.
  //
  // is_teacher se DÉCLARE : c'est la case « je suis enseignant » de /verifier,
  // recopiée telle quelle par src/pages/api/verify/confirm.ts. Le lien
  // d'appartenance, lui, se gagne tout seul en vérifiant son adresse depuis
  // une IP d'établissement (même fichier, lierCompte) — élèves compris.
  // « Case cochée + connecté au wifi du collège » aurait donc suffi à lire, en
  // GET, les adresses réseau de l'école, ses quotas et sa consommation du
  // mois : trois renseignements d'administration donnés pour une case à
  // cocher. C'est exactement l'attaque que décrit estEnseignantDe
  // (src/server/appartenance.ts), et l'on emploie ici la même parade.
  //
  // DEUX TITRES, ET DEUX SEULEMENT :
  //   · ADMINISTRER cette école — le rang vit sur le LIEN, il se donne ;
  //   · en être l'enseignant AU SENS OÙ L'ÉCOLE EN RÉPOND (estEnseignantDe :
  //     enseignant déclaré ET école principale, c'est-à-dire un rattachement
  //     posé par une administration, jamais par une adresse IP).
  // Le premier est indispensable au second : un administrateur d'un collège
  // qui n'est pas son école principale échouerait au test d'enseignant, et se
  // verrait fermer l'écran qu'il administre.
  const isAdmin = estAdminDe(auth.email, etablissementId);
  if (!isAdmin && !estEnseignantDe(auth.email, etablissementId)) return 'none';
  return { email: auth.email, etablissementId, isAdmin };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const who = resolveResponsable(req);
  if (who === 'auth') return res.status(401).json({ error: { code: 'ERR_AUTH_REQUIRED' } });
  if (who === 'none') return res.status(403).json({ error: { code: 'ERR_NO_ETABLISSEMENT' } });

  const etab = getEtablissementById(who.etablissementId);
  if (!etab) return res.status(403).json({ error: { code: 'ERR_NO_ETABLISSEMENT' } });

  if (req.method === 'GET') {
    return res.status(200).json({
      // LE RANG EST TRANCHÉ EN BASE, jamais déduit par l'écran : il sert à
      // MONTRER la limite (les réglages s'affichent inertes pour un enseignant
      // ordinaire), et le PUT ci-dessous la fait respecter pour de bon.
      isAdmin: who.isAdmin,
      etablissement: {
        name: etab.name,
        ips: etab.ips,
        respire: !!etab.respire,
        hours: parseHours(etab.hours),
        quotaPerStudentDaily: etab.quota_per_student_daily,
        tokenQuotaMonthly: etab.token_quota_monthly,
        // L'atelier de promptagogue est-il proposé sur l'accueil, depuis le
        // réseau de l'école ? Réglage de l'école sur elle-même, au même titre
        // que ses horaires — d'où sa présence ici plutôt que dans /admin.
        atelierPromptagogue: !!etab.atelier_promptagogue,
      },
      usage: {
        // TOTAL DU MOIS tel que le compte le PLAFOND MENSUEL (voir
        // /api/completion) : un plafond ne se lit pas sur un autre chiffre que
        // celui qui le déclenche. Il inclut donc la dictée et la lecture à voix
        // haute (/api/transcribe, /api/speak), que le détail par fournisseur
        // rassemble sous leur fournisseur.
        monthTokens: monthUsage(etab.id),
        // LE DÉTAIL ÉNUMÈRE les fournisseurs que la clé de l'école peut
        // réellement employer (zéro compris — un zéro répond à une question,
        // une ligne absente n'y répond pas), et rien d'autre : une ligne pour
        // un fournisseur inutilisable ici est du bruit, et le bruit fait
        // douter du reste. S'y ajoutent, marqués, ceux qui ont été consommés
        // et ne sont plus servis : ces jetons-là ont été décomptés, les
        // escamoter creuserait un écart avec la facture.
        //
        // LA SOMME DES LIGNES ÉGALE LE TOTAL, et ce n'est pas un hasard :
        // usage_log ne reçoit QUE des appels payés par une clé serveur (vérifié
        // sur les cinq points d'écriture — completion, transcribe, speak,
        // traduction), donc une conversation en clé personnelle n'entre ni dans
        // l'un ni dans l'autre. Si un jour on journalisait la clé personnelle,
        // il faudrait le dire ICI plutôt que de laisser deux chiffres diverger.
        byProvider: consommationDuMois(etab.id),
      },
    });
  }

  if (req.method !== 'PUT') {
    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  // LA SÉCURITÉ VIT SUR LE SERVEUR. L'écran grise déjà ses réglages pour un
  // enseignant qui n'administre pas son école — mais une règle appliquée dans
  // le seul navigateur n'est pas une règle : le rang est revérifié ici, sur
  // l'école ACTIVE, avant toute écriture.
  if (!who.isAdmin) return res.status(403).json({ error: { code: 'ERR_NOT_SCHOOL_ADMIN' } });

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
      || !isValidClock(start) || !isValidClock(end) || start >= end) {
      return res.status(400).json({ error: { code: 'ERR_HOURS_INVALID' } });
    }
    hours.push({ day, start, end });
  }

  const quotaPerStudentDaily = Math.max(0, Math.min(10_000_000, Number(req.body?.quotaPerStudentDaily) || 0));
  const tokenQuotaMonthly = Math.max(0, Math.min(10_000_000_000, Number(req.body?.tokenQuotaMonthly) || 0));
  // L'ATELIER NE SE MODIFIE QUE SI LE CORPS EN PARLE — la PRÉSENCE du champ
  // décide, pas sa valeur. Un booléen absent lu comme « false » ferait
  // refermer, sans erreur ni trace, un réglage qu'un administrateur a
  // délibérément ouvert : il suffirait d'un appelant qui n'enregistre que les
  // horaires. Aujourd'hui l'écran envoie toujours les trois réglages ensemble ;
  // cette écriture conditionnelle est ce qui fait qu'un futur appelant partiel
  // ne cassera rien en silence.
  const db = getDb();
  db.prepare('UPDATE etablissements SET hours = ?, quota_per_student_daily = ?, token_quota_monthly = ? WHERE id = ?')
    .run(JSON.stringify(hours), quotaPerStudentDaily, tokenQuotaMonthly, etab.id);
  if (req.body !== null && typeof req.body === 'object' && 'atelierPromptagogue' in req.body) {
    db.prepare('UPDATE etablissements SET atelier_promptagogue = ? WHERE id = ?')
      .run(req.body.atelierPromptagogue ? 1 : 0, etab.id);
  }

  res.status(200).json({ ok: true });
}
