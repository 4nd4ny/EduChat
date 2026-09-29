import { NextApiRequest, NextApiResponse } from 'next';
import { isIP } from 'net';
import { getDb } from '../../../server/db';
import { ipCanonique } from '../../../server/access';
import { requireAdmin } from '../../../server/admin';
import { notifyAdmin } from '../../../server/mail';
import { ERR, SCHOOL_PROVIDER_IDS } from '../../../shared/providers';

// Gestion des établissements (« clients »).
// L'établissement porte : ses IP, son statut RESPIRE (gratuit), son fournisseur
// actif, son contact de facturation — tout cela reste la main du SITE, et de
// lui seul.
//
// LES DEUX QUOTAS SONT PARTAGÉS, pas réservés. Le plafond mensuel de tokens
// (token_quota_monthly) et le quota quotidien par élève
// (quota_per_student_daily) s'écrivent ICI par le super-administrateur, mais
// AUSSI par l'administrateur de l'école via PUT /api/etablissement (page
// /etablissement, bornés là-bas à 10 milliards et 10 millions). Même colonne,
// deux portes : le dernier qui enregistre l'emporte, sans verrou ni arbitrage.
// Ce qui est réservé au site, c'est l'ÉCRITURE PAR CETTE ROUTE : une école n'y
// touche aux quotas ni par le grand formulaire ni par l'action « catalogue ».
//
// UNE SEULE EXCEPTION sur cette route, et elle est étroite : l'ouverture du catalogue
// (catalogue_ouvert) appartient à l'école, puisqu'il s'agit de ce que SES
// élèves voient. Elle passe donc par une action à part (« catalogue »),
// qui n'écrit que cette colonne et que sur la ligne de l'administrateur qui
// la demande. Ouvrir la grande écriture aux écoles reviendrait à leur laisser
// cocher RESPIRE et se donner la gratuité — la portée n'est pas un détail
// d'affichage, elle décide de ce qui est écrit.

// Deux écoles désignent-elles la même machine ? On STOCKE la chaîne saisie
// (c'est elle que resolveEtablissementByIp compare) et on ne COMPARE que la
// forme canonique — la même règle, importée, que l'inscription en libre-service
// et /api/ip : deux portes qui écrivent des IP d'école ne doivent pas en juger
// différemment.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const scope = requireAdmin(req);
  if (!scope) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
  const db = getDb();

  if (req.method === 'GET') {
    // Une école ne lit QUE sa ligne : la liste des clients du site (leurs IP,
    // leur email de facturation) n'a pas à circuler d'une école à l'autre.
    if (scope.niveau === 'ecole') {
      return res.status(200).json({
        etablissements: db.prepare('SELECT * FROM etablissements WHERE id = ?')
          .all(scope.etablissementId),
      });
    }
    return res.status(200).json({
      etablissements: db.prepare('SELECT * FROM etablissements ORDER BY name COLLATE NOCASE').all(),
    });
  }

  // ---- action « catalogue » : le SEUL réglage qu'une école règle elle-même.
  // L'identifiant vient de la PORTÉE, jamais du corps de la requête : c'est ce
  // qui empêche l'administrateur d'une école d'ouvrir le catalogue d'une autre.
  if (req.method === 'POST' && req.body?.action === 'catalogue') {
    const cible = scope.niveau === 'super' ? Number(req.body?.id) || 0 : scope.etablissementId;
    if (!cible) return res.status(400).json({ error: { code: 'ERR_ETAB_UNKNOWN' } });
    // Un identifiant qui ne désigne aucune école répondait « ok » sans rien
    // écrire : le super croyait avoir ouvert un catalogue qui n'existe pas.
    if (!db.prepare('SELECT 1 FROM etablissements WHERE id = ?').get(cible)) {
      return res.status(404).json({ error: { code: 'ERR_ETAB_UNKNOWN' } });
    }
    db.prepare('UPDATE etablissements SET catalogue_ouvert = ? WHERE id = ?')
      .run(req.body?.catalogueOuvert ? 1 : 0, cible);
    return res.status(200).json({ ok: true, id: cible });
  }

  // Tout le reste de CETTE ROUTE — créer, renommer, régler les IP, les quotas,
  // RESPIRE, la facturation — n'est ouvert qu'au super-administrateur. (Les
  // quotas ne lui sont pas réservés pour autant : l'école règle les siens par
  // PUT /api/etablissement — voir l'en-tête.)
  if (scope.niveau !== 'super') return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });

  if (req.method === 'POST') {
    const id = Number(req.body?.id) || 0;
    const name = String(req.body?.name ?? '').trim().slice(0, 120);
    const listeIps = String(req.body?.ips ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const ips = listeIps.join(',');
    const respire = req.body?.respire ? 1 : 0;
    const quota = Math.max(0, Number(req.body?.tokenQuotaMonthly) || 0);
    const perStudent = Math.max(0, Number(req.body?.quotaPerStudentDaily) || 0);
    // Un fournisseur que la clé interne ne peut PAS payer — un intermédiaire à
    // drapeau rouge (OpenRouter), ou un fournisseur ÉCARTÉ d'un public scolaire
    // au titre de l'AI Act — n'a pas de sens ici : le réglage s'enregistrerait
    // et la complétion le refuserait ensuite. SCHOOL_PROVIDER_IDS retire déjà
    // les deux familles ; ce commentaire disait « réservé aux adultes », d'un
    // temps où une majorité certifiée les rouvrait — cette notion n'existe plus.
    const activeProvider = SCHOOL_PROVIDER_IDS.includes(req.body?.activeProvider) ? req.body.activeProvider : '';
    const billingEmail = String(req.body?.billingEmail ?? '').trim().slice(0, 255);
    if (!name) return res.status(400).json({ error: { code: 'ERR_NAME_INVALID' } });

    // Modifier une école qui n'existe pas répondait « ok » sans rien écrire.
    if (id && !db.prepare('SELECT 1 FROM etablissements WHERE id = ?').get(id)) {
      return res.status(404).json({ error: { code: 'ERR_ETAB_UNKNOWN' } });
    }

    // LES IP SONT CE QUI RECONNAÎT LES ÉLÈVES — elles se valident comme telles.
    // Une chaîne qui n'est pas une adresse ne reconnaîtra jamais personne, et
    // deux écoles sur la même adresse se disputent ses élèves : la résolution
    // par IP prend la première venue, l'autre paie pour sa voisine. Même règle
    // que l'inscription en libre-service, sauf qu'ici l'adresse est SAISIE —
    // on la refuse donc au lieu de l'abandonner, pour que le site corrige.
    // Une adresse déjà portée par l'école modifiée elle-même n'est pas un conflit.
    if (listeIps.some(ip => !isIP(ip))) return res.status(400).json({ error: { code: 'ERR_IP_INVALID' } });
    if (listeIps.length) {
      const prises = new Set<string>();
      for (const row of db.prepare('SELECT ips FROM etablissements WHERE id != ?').all(id) as { ips: string }[]) {
        for (const brut of row.ips.split(',')) {
          const valeur = brut.trim();
          if (valeur) prises.add(ipCanonique(valeur));
        }
      }
      if (listeIps.some(ip => prises.has(ipCanonique(ip)))) {
        return res.status(409).json({ error: { code: 'ERR_IP_TAKEN' } });
      }
    }

    if (id) {
      // UN CHAMP ABSENT NE S'ÉCRIT PAS. L'enregistrement était un formulaire
      // complet : l'écran du site n'envoyant pas activeProvider, chaque
      // modification depuis /admin effaçait le fournisseur actif de l'école.
      // La PRÉSENCE du champ décide, pas sa valeur — un champ présent garde sa
      // lecture d'avant (activeProvider hors périmètre → '', quota illisible → 0).
      // Le nom, lui, reste exigé.
      const corps = req.body as Record<string, unknown>;
      const colonnes: Array<[string, string, unknown]> = [
        ['ips', 'ips', ips],
        ['respire', 'respire', respire],
        ['tokenQuotaMonthly', 'token_quota_monthly', quota],
        ['quotaPerStudentDaily', 'quota_per_student_daily', perStudent],
        ['activeProvider', 'active_provider', activeProvider],
        ['billingEmail', 'billing_email', billingEmail],
      ];
      const ecrites = colonnes.filter(([champ]) => champ in corps);
      db.prepare(`UPDATE etablissements SET name = ?${ecrites.map(([, col]) => `, ${col} = ?`).join('')} WHERE id = ?`)
        .run(name, ...ecrites.map(([, , v]) => v), id);
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
