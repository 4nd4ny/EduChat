// APPARTENANCE D'UN COMPTE À PLUSIEURS ÉCOLES — le socle de la décision B.
//
// Un enseignant partagé entre deux collèges n'avait qu'un
// users.etablissement_id : le second rattachement écrasait le premier, et
// l'on devait choisir laquelle de ses deux écoles il « était ». La table de
// liaison user_etablissements (voir les migrations de src/server/db.ts) porte
// désormais l'appartenance, avec pour CHAQUE lien le fait d'y être
// administrateur — parce qu'administrer un collège ne dit rien de l'autre.
//
// QUI FAIT FOI, ET POUR QUOI :
//   user_etablissements  → l'AUTORISATION. Toute garde serveur s'y adosse.
//   users.etablissement_id → l'ÉCOLE PRINCIPALE : le défaut d'école active, et
//     le rattachement que lit tout l'existant (catalogue des tuteurs, séance,
//     facturation, /etablissement). On ne le supprime pas, on le complète.
//   users.is_school_admin → un MIROIR dénormalisé (« administrateur d'au moins
//     une école »), conservé pour les listes d'administration déjà écrites.
//     Il ne décide plus rien : definirAdminEcole() écrit les deux ensemble.
//
// L'ÉCOLE ACTIVE NE SE CROIT JAMAIS SUR PAROLE. Le navigateur ANNONCE un
// choix (en-tête x-educhat-ecole) ; le serveur le REVÉRIFIE contre la table à
// chaque requête. Un identifiant affirmé et cru donnerait une école — donc le
// porte-monnaie, les comptes et le catalogue d'une école — à qui n'y
// appartient pas. C'est la faille que ce module existe pour fermer.

import type { NextApiRequest } from 'next';
import { getDb } from './db';
import { requireAuth } from './token';

/**
 * En-tête qui porte le choix d'école active du navigateur.
 *
 * Le sélecteur d'école (chantier suivant) l'ajoutera dans authHeaders()
 * (src/utils/account.ts). Toute route qui lit ce choix passe par ce module :
 * l'en-tête n'est qu'une PROPOSITION, jamais une autorisation.
 */
export const ENTETE_ECOLE = 'x-educhat-ecole';

/** Une école à laquelle un compte appartient, telle que la lira le sélecteur. */
export type Appartenance = {
  etablissementId: number;
  name: string;
  /** Administrateur DE CETTE école — jamais des autres. */
  isAdmin: boolean;
  /** Vrai pour users.etablissement_id : l'école par défaut du compte. */
  principale: boolean;
};

/** L'école principale du compte (users.etablissement_id), ou null. */
export function ecolePrincipale(email: string): number | null {
  const row = getDb().prepare('SELECT etablissement_id FROM users WHERE email = ?')
    .get(email.toLowerCase()) as { etablissement_id: number | null } | undefined;
  return row?.etablissement_id ?? null;
}

/**
 * Les écoles du compte, la principale d'abord puis par ancienneté du lien.
 *
 * La jointure est INTERNE : un lien qui désigne un établissement effacé de la
 * base ne doit pas produire une école sans nom dans le sélecteur.
 */
export function listerEcoles(email: string): Appartenance[] {
  const mail = email.toLowerCase();
  const principale = ecolePrincipale(mail);
  return (getDb().prepare(`
    SELECT l.etablissement_id AS etablissementId, e.name AS name, l.is_admin AS isAdmin
    FROM user_etablissements l JOIN etablissements e ON e.id = l.etablissement_id
    WHERE l.email = ?
    ORDER BY l.created_at, l.etablissement_id
  `).all(mail) as Array<{ etablissementId: number; name: string; isAdmin: number }>)
    .map(r => ({
      etablissementId: r.etablissementId,
      name: r.name,
      isAdmin: !!r.isAdmin,
      principale: r.etablissementId === principale,
    }))
    .sort((a, b) => Number(b.principale) - Number(a.principale));
}

/** Le compte appartient-il à cette école ? (la question de toutes les gardes) */
export function estMembre(email: string, etablissementId: number): boolean {
  return !!getDb().prepare(
    'SELECT 1 FROM user_etablissements WHERE email = ? AND etablissement_id = ?')
    .get(email.toLowerCase(), etablissementId);
}

/** Le compte est-il administrateur DE CETTE école ? */
export function estAdminDe(email: string, etablissementId: number): boolean {
  return !!getDb().prepare(
    'SELECT 1 FROM user_etablissements WHERE email = ? AND etablissement_id = ? AND is_admin = 1')
    .get(email.toLowerCase(), etablissementId);
}

/**
 * Le compte est-il ENSEIGNANT DE CETTE ÉCOLE — au sens où l'école en répond ?
 *
 * DEUX CONDITIONS, ET LA SECONDE EST TOUT L'ENJEU.
 *
 *  1. users.is_teacher — mais ce drapeau se DÉCLARE : c'est la case « je suis
 *     enseignant » de /verifier, recopiée telle quelle par
 *     src/pages/api/verify/confirm.ts. Il dit un métier annoncé, jamais un
 *     rattachement vérifié. Seul, il n'autorise rien.
 *  2. l'école est son ÉCOLE PRINCIPALE (users.etablissement_id) — et cette
 *     colonne-là, personne ne se l'écrit : elle est posée par le site
 *     (/api/admin/users, réservé au super) ou par l'inscription en
 *     libre-service, qui fait du demandeur l'administrateur de l'école qu'il
 *     vient de créer. C'est donc la trace d'une DÉCISION d'administration.
 *
 * POURQUOI PAS estMembre() : le lien d'appartenance se gagne aussi tout seul,
 * en vérifiant son adresse depuis une IP d'établissement (confirm.ts). Élèves
 * compris. « Membre + case cochée » suffirait alors à donner à un élève du
 * réseau la relecture, la modification et la modération des tuteurs de tout
 * son collège — un rang d'administration obtenu par une case à cocher.
 *
 * LE JOUR OÙ user_etablissements PORTERA UNE PROVENANCE (ip / admin /
 * inscription), c'est ici qu'il faudra lire « lien non posé par une IP » au
 * lieu de l'école principale : la règle voulue est « une administration l'a
 * rattaché », l'école principale n'en est aujourd'hui que le seul témoin.
 */
export function estEnseignantDe(email: string, etablissementId: number): boolean {
  return !!getDb().prepare(
    'SELECT 1 FROM users WHERE email = ? AND is_teacher = 1 AND etablissement_id = ?')
    .get(email.toLowerCase(), etablissementId);
}

/** Les comptes rattachés à une école — la liste que servira /etablissement. */
export function listerMembres(etablissementId: number): Array<{ email: string; isAdmin: boolean; depuis: number }> {
  return (getDb().prepare(`
    SELECT email, is_admin AS isAdmin, created_at AS depuis
    FROM user_etablissements WHERE etablissement_id = ? ORDER BY created_at, email
  `).all(etablissementId) as Array<{ email: string; isAdmin: number; depuis: number }>)
    .map(r => ({ email: r.email, isAdmin: !!r.isAdmin, depuis: r.depuis }));
}

/**
 * Rattache un compte à une école, SANS droit d'administration.
 *
 * Idempotent, et volontairement AVEUGLE au lien existant : un INSERT OR
 * IGNORE, jamais un upsert. Un administrateur d'école qui repasse par la
 * vérification d'email depuis l'IP de son collège serait autrement rétrogradé
 * en silence par sa propre reconnaissance.
 *
 * NE TOUCHE PAS users.etablissement_id : l'école principale commande le
 * catalogue et la facturation, elle ne se donne pas au passage d'une IP.
 *
 * @returns vrai si le lien vient d'être créé.
 */
export function lierCompte(email: string, etablissementId: number): boolean {
  return getDb().prepare(`
    INSERT OR IGNORE INTO user_etablissements (email, etablissement_id, is_admin, created_at)
    VALUES (?, ?, 0, ?)
  `).run(email.toLowerCase(), etablissementId, Date.now()).changes > 0;
}

/**
 * Donne ou retire le rang d'administrateur POUR UNE ÉCOLE, et met à jour le
 * miroir users.is_school_admin dans la MÊME transaction — deux écritures
 * séparées finiraient par diverger, et c'est le miroir qu'affichent les
 * listes d'administration.
 *
 * Donner le rang crée le lien s'il manque (on n'administre que ce dont on est
 * membre). Le retirer LAISSE le lien : cesser d'administrer n'est pas quitter
 * l'école.
 */
export function definirAdminEcole(email: string, etablissementId: number, admin: boolean): void {
  const mail = email.toLowerCase();
  const db = getDb();
  db.transaction(() => {
    if (admin) {
      db.prepare(`
        INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at)
        VALUES (?, ?, 1, ?)
        ON CONFLICT(email, etablissement_id) DO UPDATE SET is_admin = 1
      `).run(mail, etablissementId, Date.now());
    } else {
      db.prepare('UPDATE user_etablissements SET is_admin = 0 WHERE email = ? AND etablissement_id = ?')
        .run(mail, etablissementId);
    }
    rafraichirMiroirAdmin(mail);
  })();
}

/** Détache un compte d'une école (le lien, et le rang qui allait avec). */
export function delierCompte(email: string, etablissementId: number): void {
  const mail = email.toLowerCase();
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM user_etablissements WHERE email = ? AND etablissement_id = ?')
      .run(mail, etablissementId);
    rafraichirMiroirAdmin(mail);
  })();
}

/**
 * Le miroir users.is_school_admin = « administrateur d'AU MOINS une école ».
 * Il ne sert plus qu'à l'affichage ; l'autorisation, elle, se lit lien par
 * lien (voir l'en-tête de ce fichier).
 */
function rafraichirMiroirAdmin(email: string): void {
  getDb().prepare(`
    UPDATE users SET is_school_admin =
      (SELECT COUNT(*) > 0 FROM user_etablissements WHERE email = ? AND is_admin = 1)
    WHERE email = ?
  `).run(email, email);
}

/**
 * Le choix d'école ANNONCÉ par la requête — l'en-tête d'abord, à défaut le
 * champ `ecoleActiveId` du corps. Rien ici n'autorise quoi que ce soit : la
 * valeur est une PROPOSITION, revérifiée par ecoleActivePourCompte().
 *
 * LE NOM DU CHAMP N'EST PAS « etablissementId » — et c'est délibéré. Ce
 * nom-là circule déjà dans des corps de requête où il désigne l'école d'un
 * AUTRE (le rattachement qu'un administrateur pose sur un compte, l'école
 * d'une recharge). Le confondre avec « l'école depuis laquelle je travaille »
 * ferait basculer la portée d'une garde au gré d'un champ écrit pour tout
 * autre chose.
 */
export function choixEcole(req: NextApiRequest): number | null {
  // Un en-tête peut arriver en tableau (répété) : on ne lit que le premier.
  const brut = req.headers[ENTETE_ECOLE];
  const enTete = Array.isArray(brut) ? brut[0] : brut;
  // Le corps n'existe pas en GET, et peut être une chaîne (bodyParser désactivé).
  const corps = req.body && typeof req.body === 'object'
    ? (req.body as Record<string, unknown>).ecoleActiveId : undefined;
  const valeur = Number(enTete ?? corps);
  return Number.isInteger(valeur) && valeur > 0 ? valeur : null;
}

/**
 * L'ÉCOLE ACTIVE d'un compte — l'unique invariant de ce module : ce qui sort
 * d'ici est TOUJOURS une école dont le lien existe en base À CET INSTANT.
 *
 * Dans l'ordre : le choix annoncé s'il est encore lié ; sinon l'école
 * principale si elle l'est ; sinon le plus ancien lien. Ce dernier degré
 * n'est pas décoratif : l'enseignant reconnu par l'IP d'un second collège
 * peut n'avoir aucune école principale, et sans lui il n'aurait aucune école
 * active alors qu'il est bel et bien membre d'une.
 */
export function ecoleActivePourCompte(email: string, choix: number | null): number | null {
  const mail = email.toLowerCase();
  if (choix !== null && estMembre(mail, choix)) return choix;

  const principale = ecolePrincipale(mail);
  if (principale !== null && estMembre(mail, principale)) return principale;

  const premier = getDb().prepare(
    'SELECT etablissement_id AS id FROM user_etablissements WHERE email = ? ORDER BY created_at, etablissement_id LIMIT 1')
    .get(mail) as { id: number } | undefined;
  return premier?.id ?? null;
}

/** L'école active du signataire de la requête, ou null (non signée, sans école). */
export function ecoleActive(req: NextApiRequest): number | null {
  const auth = requireAuth(req);
  if (!auth) return null;
  return ecoleActivePourCompte(auth.email, choixEcole(req));
}
