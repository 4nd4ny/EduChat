import { NextApiRequest, NextApiResponse } from 'next';
import { isIP } from 'net';
import { getDb } from '../../../server/db';
import { requireAuth } from '../../../server/token';
import { getClientIp, isRateLimited } from '../../../server/access';
import { definirAdminEcole } from '../../../server/appartenance';
import { notifyAdmin } from '../../../server/mail';
import { ERR } from '../../../shared/providers';

// INSCRIPTION EN LIBRE-SERVICE D'UN ÉTABLISSEMENT.
//
// Jusqu'ici, seul un super-administrateur pouvait créer une école
// (/api/admin/etablissements) : personne ne pouvait démarrer sans nous écrire,
// et le service ne pouvait pas se déployer. Cette route ouvre la porte — sans
// ouvrir le coffre.
//
// CE QUE L'INSCRIT PEUT ÉCRIRE : le nom de l'établissement, et son propre nom
// de responsable. RIEN D'AUTRE. Les colonnes respire, solde, contribution_pct
// et token_quota_monthly ne sont même pas NOMMÉES dans l'INSERT — elles gardent
// leur valeur par défaut. Ce n'est pas de la prudence de style : une école qui
// pourrait se déclarer RESPIRE aurait tout gratuit à vie, et une école qui
// pourrait poser son solde s'offrirait le crédit des autres. Ces deux réglages
// restent au site (isAdminEmail / requireSuperAdmin, voir src/server/admin.ts).
//
// L'IP DE RECONNAISSANCE N'EST PLUS SAISIE : ELLE EST CONSTATÉE.
//
// Le formulaire portait un champ libre, prérempli par /api/ip. Deux défauts,
// dont un grave. Le petit : personne ne sait ce qu'est une adresse IP, et le
// champ demandait justement de la corriger. Le grave : rien n'obligeait à y
// écrire la sienne — inscrire une école en revendiquant l'adresse du collège
// voisin suffisait à s'attribuer ses élèves, puisque c'est l'IP qui les
// reconnaît. On prend donc l'adresse que le serveur VOIT (getClientIp, celle
// du proxy, jamais un en-tête que le navigateur choisit) : le formulaire
// l'affiche pour information, il ne la transporte pas.
//
// SI CETTE ADRESSE APPARTIENT DÉJÀ À UNE ÉCOLE, l'inscription n'échoue pas —
// c'est le cas normal de « mon établissement n'est pas celui-ci », qu'on
// atteint depuis le réseau d'une autre école. L'école est alors créée SANS
// adresse de reconnaissance (colonne vide, exactement comme avant quand on
// laissait le champ libre en blanc) ; le formulaire l'annonce AVANT la
// validation, et l'administration posera l'adresse ensuite.
//
// L'EMAIL DE FACTURATION vient du JETON, jamais du corps de la requête :
// c'est l'adresse déjà vérifiée par code, donc la seule qu'on sache joignable.
// L'ADRESSE POSTALE n'est plus demandée ici : elle ne sert qu'au jour de la
// facture, et l'école la saisit alors dans les mentions de celle-ci
// (facture_mentions, src/administration/MentionsFacture.tsx). Une inscription
// se fait en deux champs ou ne se fait pas.

/** Longueurs bornées : la base n'a pas de contrainte, la route en tient lieu. */
const MAX_NOM = 120;
const MAX_NOM_PERSONNE = 120;

/**
 * LA FORME CANONIQUE D'UNE ADRESSE — POUR DÉDOUBLONNER, ET POUR RIEN D'AUTRE.
 *
 * Elle ne sert PLUS à décider ce qu'on enregistre (voir « ON STOCKE CE QUE
 * RESOLVE COMPARERA » plus bas) : elle sert uniquement à répondre à la
 * question « deux écoles désignent-elles la même machine ? », que la seule
 * comparaison de chaînes ne sait pas trancher.
 *
 *  · IPv4 mappée : « ::ffff:203.0.113.7 » et « 203.0.113.7 » sont la même
 *    adresse, et getClientIp lui-même dépouille le préfixe sur le chemin du
 *    socket — deux graphies pour un seul réseau ;
 *  · IPv6 : une même adresse s'écrit de mille façons (RFC 5952) et Node n'en
 *    présente qu'une, compressée et en minuscules. new URL la produit — c'est
 *    la seule normalisation IPv6 disponible sans dépendance.
 *
 * Sans ce repli, deux écoles revendiqueraient la même machine par le simple
 * choix de la graphie, et la seconde volerait les élèves de la première.
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
  const ipAppelante = getClientIp(req);
  if (await isRateLimited(ipAppelante, 3, 'inscription')) {
    return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
  }

  const name = String(req.body?.name ?? '').trim().slice(0, MAX_NOM);
  if (!name) return res.status(400).json({ error: { code: 'ERR_NAME_INVALID' } });

  // LE NOM DU RESPONSABLE. Côté école c'est « la personne responsable » ; côté
  // base c'est le compte qui s'inscrit, promu enseignant-administrateur plus
  // bas. On l'exige : une école dont on ne peut nommer le responsable n'a pas
  // d'interlocuteur, et c'est ce nom qui figurera dans l'avis d'inscription.
  const adminName = String(req.body?.adminName ?? '').trim().slice(0, MAX_NOM_PERSONNE);
  if (!adminName) return res.status(400).json({ error: { code: 'ERR_ADMIN_NAME_INVALID' } });

  // L'ADRESSE DE RECONNAISSANCE EST CELLE D'OÙ L'ON ÉCRIT — voir l'en-tête.
  // « unknown » (getClientIp n'a rien su lire) n'est pas une adresse : l'école
  // naît alors sans reconnaissance, comme lorsque l'adresse est déjà prise.
  //
  // ON STOCKE CE QUE RESOLVE COMPARERA, TELLE QUELLE — SURTOUT PAS SA FORME
  // CANONIQUE. resolveEtablissementByIp (src/server/etablissements.ts) compare
  // des CHAÎNES exactes à ce que rend getClientIp, et getClientIp ne normalise
  // rien sur le chemin du proxy : il rend l'en-tête X-Real-IP tel qu'il l'a lu.
  // Enregistrer « 203.0.113.7 » pendant que le proxy annonce
  // « ::ffff:203.0.113.7 » créait donc une école que sa propre adresse ne
  // reconnaissait jamais — et c'est exactement la promesse que le formulaire
  // fait à l'écran : « c'est CETTE adresse qui reconnaîtra vos élèves ».
  // Affichée, enregistrée, comparée : une seule et même chaîne.
  //
  // La forme canonique garde un emploi, et un seul : le dédoublonnage entre
  // écoles, plus bas — comparer sans elle laisserait deux graphies revendiquer
  // la même machine.
  const ipConstatee = isIP(ipAppelante) ? ipAppelante : '';

  const db = getDb();

  // TOUT DANS UNE SEULE TRANSACTION : vérifier puis insérer en deux temps
  // laisserait une fenêtre où deux requêtes simultanées passent le contrôle
  // toutes les deux — un compte avec deux écoles, ou deux écoles sur la même
  // IP. better-sqlite3 est synchrone : la transaction est ici réellement atomique.
  type Refus = 'attached';
  let issue: { ok: true; id: number; ipRetenue: string } | { ok: false; raison: Refus };
  try {
    issue = db.transaction((): { ok: true; id: number; ipRetenue: string } | { ok: false; raison: Refus } => {
      const moi = db.prepare('SELECT etablissement_id FROM users WHERE email = ?')
        .get(auth.email) as { etablissement_id: number | null } | undefined;
      // Compte déjà rattaché : il demande peut-être l'écran responsable sans
      // être enseignant (resolveResponsable le renvoie aussi vers l'inscription).
      // Une seconde école ne serait pas une erreur d'affichage, ce serait une
      // école fantôme sans personne pour la tenir.
      if (moi?.etablissement_id) return { ok: false, raison: 'attached' };

      // Deux écoles ne peuvent pas revendiquer la même IP : la résolution par
      // IP prendrait la première venue, et l'autre paierait pour sa voisine.
      //
      // ON STOCKE BRUT, ON DÉDOUBLONNE CANONIQUE — et les deux gestes ne se
      // contredisent pas, ils répondent à deux questions différentes.
      // « Qu'est-ce que resolveEtablissementByIp comparera ? » commande ce
      // qu'on ÉCRIT (la chaîne du proxy, telle quelle). « Cette machine est-elle
      // déjà revendiquée ? » commande la COMPARAISON, et celle-là doit franchir
      // les graphies : sans canonique des DEUX côtés, « ::ffff:203.0.113.7 »
      // s'inscrirait à côté du « 203.0.113.7 » d'une école antérieure, et la
      // seconde emporterait les élèves de la première.
      //
      // Le dédoublonnage est donc plus STRICT que la reconnaissance : il refuse
      // des adresses que resolve n'aurait de toute façon pas fait correspondre.
      // C'est le bon sens du refus — on perd une reconnaissance, jamais une
      // école entière au profit d'une autre.
      //
      // L'ADRESSE PRISE NE FAIT PLUS ÉCHOUER L'INSCRIPTION — elle est
      // simplement ABANDONNÉE. Elle n'est plus une saisie qu'on pourrait
      // corriger, mais un constat : refuser reviendrait à interdire d'inscrire
      // son école depuis le réseau d'une autre, c'est-à-dire précisément le
      // parcours « mon établissement n'est pas celui-ci ». Le formulaire
      // l'annonce avant la validation ; l'écran final le redit.
      let ipRetenue = ipConstatee;
      if (ipRetenue) {
        const prises = new Set<string>();
        for (const row of db.prepare('SELECT ips FROM etablissements').all() as { ips: string }[]) {
          for (const brut of row.ips.split(',')) {
            const valeur = brut.trim();
            if (valeur) prises.add(canonique(valeur));
          }
        }
        if (prises.has(canonique(ipRetenue))) ipRetenue = '';
      }

      // Colonnes nommées une à une : voir l'en-tête. Tout ce qui n'est pas là
      // (respire, solde, quotas, contribution, adresse postale) reste au défaut
      // de la base.
      const info = db.prepare(`
        INSERT INTO etablissements (name, ips, billing_email, created_at)
        VALUES (?, ?, ?, ?)
      `).run(name, ipRetenue, auth.email, Date.now());
      const id = Number(info.lastInsertRowid);

      // Le demandeur devient ENSEIGNANT et ADMINISTRATEUR DE CETTE ÉCOLE — et
      // de celle-là seule (src/server/admin.ts : la portée « ecole » se relit
      // en base à chaque requête, le jeton ne porte aucun rôle ; inutile donc
      // d'en réémettre un, celui du navigateur ouvre déjà la nouvelle porte).
      //
      // LE NOM DU RESPONSABLE N'EST ÉCRIT QUE S'IL MANQUE, et le CASE le dit
      // dans la même écriture. Deux raisons de ne pas en faire un second
      // UPDATE : un compte déjà nommé le laisserait à zéro ligne touchée, ce
      // que la sentinelle ci-dessous prendrait pour un compte effacé et
      // annulerait toute l'inscription ; et un nom déjà choisi dans /compte
      // n'a pas à être écrasé par une saisie de formulaire. C'est users.name
      // qui fait foi, pas auth.name : le jeton peut dater d'avant le
      // changement de nom.
      const maj = db.prepare(`
        UPDATE users
        SET is_teacher = 1, etablissement_id = ?,
            name = CASE WHEN TRIM(name) = '' THEN ? ELSE name END
        WHERE email = ?`)
        .run(id, adminName, auth.email);
      // Zéro ligne touchée = jeton valide sans compte en base (compte effacé
      // entre-temps). On LÈVE, ce qui annule l'INSERT : une école sans
      // responsable n'aurait aucun moyen d'en retrouver un.
      if (maj.changes !== 1) throw new Error('inscription : aucun compte à rattacher');
      // Le rang d'administrateur s'écrit DANS LA LIAISON (multi-écoles) : il
      // vaut pour CETTE école et pour elle seule. definirAdminEcole crée le
      // lien manquant et tient à jour le miroir users.is_school_admin — c'est
      // pourquoi l'UPDATE ci-dessus ne le pose plus lui-même. L'appel est
      // imbriqué dans la transaction en cours (better-sqlite3 la traduit en
      // SAVEPOINT) : un échec ici annule bien l'école créée.
      definirAdminEcole(auth.email, id, true);

      return { ok: true, id, ipRetenue };
    })();
  } catch (error) {
    console.error("Inscription d'établissement refusée :", (error as Error)?.message);
    return res.status(500).json({ error: { code: 'ERR_SIGNUP_FAILED' } });
  }

  // Un seul refus subsiste : le compte déjà rattaché. L'adresse déjà prise ne
  // refuse plus rien, elle est abandonnée (voir la transaction).
  if (!issue.ok) return res.status(409).json({ error: { code: 'ERR_ALREADY_ATTACHED' } });

  // Notification HORS transaction : un envoi d'email n'a rien à faire dans une
  // écriture atomique, et notifyAdmin est de toute façon fire-and-forget.
  notifyAdmin(
    `Inscription d'établissement : ${name}`,
    `« ${name} » vient de s'inscrire en libre-service (aucune validation préalable).\n`
    + `Responsable : ${adminName} <${auth.email}> — désormais enseignant et administrateur de cette école.\n`
    + `IP de reconnaissance : ${issue.ipRetenue || '(aucune — adresse absente ou déjà revendiquée)'}\n`
    + `Porte-monnaie à zéro, statut RESPIRE non accordé : à examiner dans /admin.`,
  );

  // « ipRetenue » redit à l'écran ce qui a réellement été enregistré : le
  // formulaire a pu annoncer une adresse que la transaction a écartée entre
  // l'affichage et l'envoi (une autre école venant de la revendiquer).
  res.status(201).json({ ok: true, id: issue.id, ipRetenue: issue.ipRetenue });
}
