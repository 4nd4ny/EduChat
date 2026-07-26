import { NextApiRequest, NextApiResponse } from 'next';
import { isIP } from 'net';
import { getDb } from '../../../server/db';
import { requireAuth } from '../../../server/token';
import { getClientIp, isRateLimited } from '../../../server/access';
import { notifyAdmin } from '../../../server/mail';
import { ERR } from '../../../shared/providers';

// INSCRIPTION EN LIBRE-SERVICE D'UN ÉTABLISSEMENT.
//
// Jusqu'ici, seul un super-administrateur pouvait créer une école
// (/api/admin/etablissements) : personne ne pouvait démarrer sans nous écrire,
// et le service ne pouvait pas se déployer. Cette route ouvre la porte — sans
// ouvrir le coffre.
//
// CE QUE L'INSCRIT PEUT ÉCRIRE : le nom, les IP de reconnaissance, l'adresse
// postale de facturation. RIEN D'AUTRE. Les colonnes respire, solde,
// contribution_pct et token_quota_monthly ne sont même pas NOMMÉES dans
// l'INSERT — elles gardent leur valeur par défaut. Ce n'est pas de la
// prudence de style : une école qui pourrait se déclarer RESPIRE aurait tout
// gratuit à vie, et une école qui pourrait poser son solde s'offrirait le
// crédit des autres. Ces deux réglages restent au site
// (isAdminEmail / requireSuperAdmin, voir src/server/admin.ts).
//
// L'EMAIL DE FACTURATION vient du JETON, jamais du corps de la requête :
// c'est l'adresse déjà vérifiée par code, donc la seule qu'on sache joignable.
// Le champ « adresse de facturation » du formulaire est l'adresse POSTALE, et
// il va dans sa propre colonne (billing_address) : écrire une adresse postale
// dans billing_email casserait la relance de facture (src/server/facturation.ts)
// et l'état des porte-monnaie (src/server/porteMonnaie.ts), qui la lisent comme
// une adresse email.

/** Longueurs bornées : la base n'a pas de contrainte, la route en tient lieu. */
const MAX_NOM = 120;
const MAX_ADRESSE = 500;
const MAX_IPS = 20;

/**
 * L'ÉCRITURE D'UNE IP TELLE QUE LE SERVEUR LA VERRA.
 *
 * resolveEtablissementByIp (src/server/etablissements.ts) compare des CHAÎNES
 * exactes à ce que rend getClientIp (src/server/access.ts). Deux écritures
 * différentes de la MÊME adresse cassent donc deux choses à la fois : l'école
 * ne reconnaît aucun élève, et — plus grave — elle passe à côté du contrôle
 * d'unicité, deux écoles pouvant alors revendiquer la même adresse par le
 * simple choix de la graphie. On ramène la saisie à la forme du serveur.
 *
 *  · IPv4 mappée : getClientIp dépouille le préfixe « ::ffff: » ; on fait le
 *    même geste, sinon « ::ffff:203.0.113.7 » n'attraperait jamais le
 *    203.0.113.7 qui se présente ;
 *  · IPv6 : une même adresse s'écrit de mille façons (RFC 5952) et Node n'en
 *    présente qu'une, compressée et en minuscules. new URL la produit — c'est
 *    la seule normalisation IPv6 disponible sans dépendance.
 */
function canonique(brut: string): string {
  const sansPrefixe = brut.replace(/^::ffff:/i, '');
  if (isIP(sansPrefixe) === 4) return sansPrefixe;
  if (isIP(brut) === 6) {
    try { return new URL(`http://[${brut}]`).hostname.slice(1, -1); }
    catch { return brut.toLowerCase(); }
  }
  return brut;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  // JETON OBLIGATOIRE. Une école créée par un anonyme n'aurait ni responsable
  // ni adresse joignable : le rattachement du demandeur, plus bas, est la
  // raison d'être de cette garde autant que la protection contre le vandalisme.
  const auth = requireAuth(req);
  if (!auth) return res.status(401).json({ error: { code: 'ERR_AUTH_REQUIRED' } });

  // Débit serré : on n'inscrit pas trois écoles par minute depuis un réseau.
  if (await isRateLimited(getClientIp(req), 3, 'inscription')) {
    return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
  }

  const name = String(req.body?.name ?? '').trim().slice(0, MAX_NOM);
  if (!name) return res.status(400).json({ error: { code: 'ERR_NAME_INVALID' } });

  const billingAddress = String(req.body?.billingAddress ?? '').trim().slice(0, MAX_ADRESSE);

  // IP : on valide chacune avec isIP, et on REFUSE tout le reste — y compris
  // les notations CIDR. resolveEtablissementByIp (src/server/etablissements.ts)
  // compare des chaînes exactes : un « 203.0.113.0/24 » accepté ici
  // s'enregistrerait sans jamais reconnaître le moindre élève. Mieux vaut un
  // refus immédiat qu'une école qui ne comprend pas pourquoi rien ne marche.
  const demandees = String(req.body?.ips ?? '')
    .split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
  if (demandees.length > MAX_IPS) return res.status(400).json({ error: { code: 'ERR_IP_INVALID' } });
  const ips: string[] = [];
  for (const ip of demandees) {
    if (!isIP(ip)) return res.status(400).json({ error: { code: 'ERR_IP_INVALID' } });
    // Canonique AVANT le dédoublonnage : deux graphies de la même adresse
    // dans le même formulaire sont un doublon, pas deux IP.
    const propre = canonique(ip);
    if (!ips.includes(propre)) ips.push(propre);   // doublons silencieusement fusionnés
  }

  const db = getDb();

  // TOUT DANS UNE SEULE TRANSACTION : vérifier puis insérer en deux temps
  // laisserait une fenêtre où deux requêtes simultanées passent le contrôle
  // toutes les deux — un compte avec deux écoles, ou deux écoles sur la même
  // IP. better-sqlite3 est synchrone : la transaction est ici réellement atomique.
  type Refus = 'attached' | 'ip';
  let issue: { ok: true; id: number } | { ok: false; raison: Refus };
  try {
    issue = db.transaction((): { ok: true; id: number } | { ok: false; raison: Refus } => {
      const moi = db.prepare('SELECT etablissement_id FROM users WHERE email = ?')
        .get(auth.email) as { etablissement_id: number | null } | undefined;
      // Compte déjà rattaché : il demande peut-être l'écran responsable sans
      // être enseignant (resolveResponsable le renvoie aussi vers l'inscription).
      // Une seconde école ne serait pas une erreur d'affichage, ce serait une
      // école fantôme sans personne pour la tenir.
      if (moi?.etablissement_id) return { ok: false, raison: 'attached' };

      // Deux écoles ne peuvent pas revendiquer la même IP : la résolution par
      // IP prendrait la première venue, et l'autre paierait pour sa voisine.
      // On reproduit EXACTEMENT la sémantique de resolveEtablissementByIp.
      // LES DEUX CÔTÉS sont ramenés à la forme canonique : comparer une saisie
      // normalisée à des lignes qui ne le sont pas laisserait passer l'adresse
      // qu'une école antérieure a écrite en toutes lettres.
      if (ips.length) {
        const prises = new Set<string>();
        for (const row of db.prepare('SELECT ips FROM etablissements').all() as { ips: string }[]) {
          for (const brut of row.ips.split(',')) {
            const valeur = brut.trim();
            if (valeur) prises.add(canonique(valeur));
          }
        }
        if (ips.some(ip => prises.has(ip))) return { ok: false, raison: 'ip' };
      }

      // Colonnes nommées une à une : voir l'en-tête. Tout ce qui n'est pas là
      // (respire, solde, quotas, contribution) reste au défaut de la base.
      const info = db.prepare(`
        INSERT INTO etablissements (name, ips, billing_email, billing_address, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(name, ips.join(','), auth.email, billingAddress, Date.now());
      const id = Number(info.lastInsertRowid);

      // Le demandeur devient ENSEIGNANT et ADMINISTRATEUR DE CETTE ÉCOLE — et
      // de celle-là seule (src/server/admin.ts : la portée « ecole » se relit
      // en base à chaque requête, le jeton ne porte aucun rôle ; inutile donc
      // d'en réémettre un, celui du navigateur ouvre déjà la nouvelle porte).
      const maj = db.prepare(
        'UPDATE users SET is_teacher = 1, is_school_admin = 1, etablissement_id = ? WHERE email = ?')
        .run(id, auth.email);
      // Zéro ligne touchée = jeton valide sans compte en base (compte effacé
      // entre-temps). On LÈVE, ce qui annule l'INSERT : une école sans
      // responsable n'aurait aucun moyen d'en retrouver un.
      if (maj.changes !== 1) throw new Error('inscription : aucun compte à rattacher');

      return { ok: true, id };
    })();
  } catch (error) {
    console.error("Inscription d'établissement refusée :", (error as Error)?.message);
    return res.status(500).json({ error: { code: 'ERR_SIGNUP_FAILED' } });
  }

  if (!issue.ok) {
    return res.status(409).json({
      error: { code: issue.raison === 'attached' ? 'ERR_ALREADY_ATTACHED' : 'ERR_IP_TAKEN' },
    });
  }

  // Notification HORS transaction : un envoi d'email n'a rien à faire dans une
  // écriture atomique, et notifyAdmin est de toute façon fire-and-forget.
  notifyAdmin(
    `Inscription d'établissement : ${name}`,
    `« ${name} » vient de s'inscrire en libre-service (aucune validation préalable).\n`
    + `Responsable : ${auth.name || '(sans nom)'} <${auth.email}> — désormais enseignant et administrateur de cette école.\n`
    + `IP de reconnaissance : ${ips.join(', ') || '(aucune)'}\n`
    + `Adresse de facturation : ${billingAddress || '(non renseignée)'}\n`
    + `Porte-monnaie à zéro, statut RESPIRE non accordé : à examiner dans /admin.`,
  );

  res.status(201).json({ ok: true, id: issue.id });
}
