import { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcrypt';
import { getDb } from '../../../server/db';
import { issueToken, lireLienVerification } from '../../../server/token';
import { getClientIp, isRateLimited } from '../../../server/access';
import { resolveEtablissementByIp } from '../../../server/etablissements';
import { lierCompte } from '../../../server/appartenance';
import { notifyAdmin } from '../../../server/mail';
import { ERR } from '../../../shared/providers';

const MAX_ATTEMPTS = 5;

// Confirmation et émission du jeton de compte. DEUX CHEMINS, UNE SEULE PORTE :
//   · POST { email, code, syncOptin?, isTeacher? }  — code recopié à la main ;
//   · POST { lien }                                 — lien signé du courriel,
//     qui porte l'adresse, le code et les deux choix (src/server/token.ts).
//
// Le second n'est PAS un justificatif parallèle : il livre le même code, qui se
// vérifie contre le même code_hash et se consomme par la même ligne supprimée
// plus bas. D'où deux propriétés qu'on obtient sans rien écrire : un lien
// rejoué après coup ne trouve plus de ligne, et redemander un code (qui écrase
// code_hash) périme le lien précédent.
//
// LES ÉCHECS DU CHEMIN PAR LIEN SE TAISENT. Signature invalide, lien périmé,
// lien déjà consommé, code qui ne correspond plus : même statut, même code
// d'erreur, même phrase. Répondre différemment selon le cas dirait à un curieux
// quelles adresses ont un compte sur le site — c'est ainsi qu'on énumère les
// comptes. Les erreurs du chemin par CODE restent distinctes, comme avant :
// l'adresse y est fournie par la personne elle-même, et lui dire « code
// expiré » plutôt que « code faux » lui évite de chercher au mauvais endroit.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  const ip = getClientIp(req);
  if (await isRateLimited(ip, 10, 'confirm')) {
    return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
  }

  const lienBrut = typeof req.body?.lien === 'string' ? req.body.lien.trim() : '';
  const parLien = lienBrut !== '';
  // La réponse UNIQUE du chemin par lien. Un seul point de sortie pour les
  // quatre causes d'échec : impossible d'en oublier une et de rouvrir l'oracle.
  const echecLien = () => res.status(400).json({ error: { code: 'ERR_LIEN_INVALIDE' } });

  let email: string;
  let normalized: string;
  let syncOptin: number;
  let isTeacher: number;

  if (parLien) {
    const charge = lireLienVerification(lienBrut);
    if (!charge) return echecLien();
    email = charge.e.trim().toLowerCase();
    normalized = charge.c;
    syncOptin = charge.s ? 1 : 0;
    isTeacher = charge.t ? 1 : 0;
    // Ceinture et bretelles : la charge est signée, donc de notre main, mais on
    // ne laisse pas une forme inattendue descendre jusqu'à bcrypt.
    if (!email || !/^\d{3}-\d{3}$/.test(normalized)) return echecLien();
  } else {
    email = String(req.body?.email ?? '').trim().toLowerCase();
    // Tolérant à la saisie : « 123-456 », « 123 456 » et « 123456 » sont équivalents.
    const code = String(req.body?.code ?? '').replace(/[\s-]/g, '');
    syncOptin = req.body?.syncOptin ? 1 : 0;
    isTeacher = req.body?.isTeacher ? 1 : 0;

    if (!email || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: { code: 'ERR_CODE_INVALID' } });
    }
    normalized = `${code.slice(0, 3)}-${code.slice(3)}`;
  }

  const db = getDb();
  const row = db.prepare('SELECT * FROM email_codes WHERE email = ?').get(email) as
    { email: string; name: string; code_hash: string; expires_at: number; attempts: number } | undefined;

  // LIGNE ABSENTE = LIEN DÉJÀ CONSOMMÉ (ou jamais émis, ou adresse inconnue) :
  // le rejeu s'arrête ici, et la réponse ne dit pas laquelle des trois.
  if (!row || Date.now() > row.expires_at) {
    return parLien ? echecLien() : res.status(400).json({ error: { code: 'ERR_CODE_EXPIRED' } });
  }
  // Le compteur d'essais protège un secret DEVINABLE — six chiffres. Une
  // signature HMAC ne se devine pas : le lien ne l'incrémente pas et ne s'y
  // heurte pas. Sinon un inconnu qui mitraille des codes faux sur votre adresse
  // condamnerait le lien que vous venez de recevoir.
  if (!parLien && row.attempts >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: { code: 'ERR_TOO_MANY_ATTEMPTS' } });
  }

  if (!bcrypt.compareSync(normalized, row.code_hash)) {
    // Un lien dont le code ne correspond plus est un lien périmé par un envoi
    // plus récent (ON CONFLICT a réécrit code_hash) : même silence.
    if (parLien) return echecLien();
    db.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE email = ?').run(email);
    return res.status(401).json({ error: { code: 'ERR_CODE_WRONG' } });
  }

  // Usage unique : le code est consommé, le compte créé ou réactivé.
  const now = Date.now();
  // Nouveau compte ou re-vérification ? (notification admin + rôles)
  const existing = db.prepare('SELECT is_teacher FROM users WHERE email = ?').get(email) as
    { is_teacher: number } | undefined;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM email_codes WHERE email = ?').run(email);
    // is_teacher se DEMANDE à la création ; le rattachement à un établissement,
    // lui, n'est effectif qu'une fois posé par un admin (étape 14).
    // Sur un compte EXISTANT, les rôles ne sont JAMAIS retouchés ici : sinon,
    // une simple re-vérification email annulerait un retrait de rôle décidé
    // par l'administration (les rôles se gèrent dans /admin ; une demande de
    // rôle enseignant sur compte existant part en notification ci-dessous).
    db.prepare(`
      INSERT INTO users (email, name, verified_at, is_promptagogue, is_teacher, sync_optin, created_at)
      VALUES (@email, @name, @now, 1, @teacher, @optin, @now)
      ON CONFLICT(email) DO UPDATE SET
        -- Le nom d'un compte EXISTANT n'est jamais réécrit : il a pu être
        -- personnalisé depuis « Mes données », et une simple re-vérification
        -- ne doit pas le ramener à la partie locale de l'adresse.
        name = CASE WHEN users.name != '' THEN users.name ELSE @name END,
        verified_at = @now, sync_optin = @optin
    `).run({ email, name: row.name, now, teacher: isTeacher, optin: syncOptin });
  });
  tx();

  // ─── RECONNAISSANCE PAR L'IP ────────────────────────────────────────────────
  //
  // Une adresse vérifiée depuis le réseau d'un établissement rattache le compte
  // à CET établissement — c'est ainsi qu'un enseignant qui donne des cours dans
  // un second collège y est reconnu sans que personne ait à l'y inscrire à la
  // main.
  //
  // CE CHEMIN VAUT POUR LES COMPTES EXISTANTS AUTANT QUE POUR LES NOUVEAUX, et
  // ce n'est pas un effet de bord : c'est le cas le plus fréquent. Un
  // enseignant a son compte depuis deux ans, il commence à enseigner dans un
  // second collège, il s'y identifie une fois depuis une salle — le lien se
  // pose. Rien dans le code ci-dessous ne regarde `existing` : le rattachement
  // n'est pas un geste d'inscription, c'est un constat de présence, et il se
  // refait à chaque vérification. lierCompte est idempotent (INSERT OR IGNORE
  // sur la clé primaire (email, etablissement_id)), donc le repasser ne coûte
  // rien et ne redit rien à l'administration.
  //
  // SANS DROIT D'ADMINISTRATION, jamais : le rang se donne, il ne se prend
  // pas en se connectant au bon réseau. lierCompte n'écrase donc aucun lien
  // existant — sans quoi un administrateur d'école qui repasse par la
  // vérification depuis son propre collège se rétrograderait lui-même.
  // L'école PRINCIPALE (users.etablissement_id) n'est pas touchée non plus :
  // elle commande le catalogue et la facturation, et ne se déplace pas au gré
  // d'une IP.
  //
  // ET LE LIEN NE DONNE PAS LE TITRE D'ENSEIGNANT — c'est la limite qu'il faut
  // garder en tête en lisant ce bloc. Depuis cette vague, l'école active d'un
  // compte l'emporte sur l'IP dans tout l'espace d'enseignement
  // (ecoleEnseignante, src/server/appartenance.ts) ; mais ce titre-là exige
  // estEnseignantDe, c'est-à-dire un rattachement posé par une administration.
  // Un lien ramassé sur le wifi du collège ouvre le sélecteur d'école, pas la
  // console : sinon un élève cochant « je suis enseignant » emporterait chez
  // lui la modération de tout son établissement. L'écran le DIT à l'intéressé
  // (voir /enseignant, « ecole.pasEncoreEnseignant ») ; le courriel ci-dessous
  // le dit à l'administration, qui seule peut trancher.
  const etabIp = resolveEtablissementByIp(ip);
  const rattachementNouveau = !!etabIp && lierCompte(email, etabIp.id);
  if (etabIp && rattachementNouveau) {
    notifyAdmin(
      `Rattachement par IP : ${email} → ${etabIp.name}`,
      `Le compte ${email} a vérifié son adresse depuis le réseau de ${etabIp.name} (${ip}) : ` +
      `il y est désormais rattaché, SANS droit d'administration.\n` +
      (isTeacher
        ? `Ce compte se déclare ENSEIGNANT. Le lien seul ne lui ouvre NI la console de classe, ` +
          `NI la modération des tuteurs de ${etabIp.name} : il y faut un rattachement posé dans ` +
          `/admin (école principale). À vérifier si la personne est bien enseignante là-bas.`
        : `Aucune action requise : ce lien ne donne que l'appartenance.`),
    );
  }

  // L'administration est prévenue de chaque NOUVELLE inscription, et d'une
  // demande de rôle enseignant émise par un compte existant qui ne l'a pas.
  if (!existing) {
    notifyAdmin(
      `Nouveau compte : ${row.name || email}`,
      `Une nouvelle personne vient de vérifier son adresse sur EduChat.\n` +
      `Nom public : ${row.name || '(non renseigné)'}\nEmail : ${email}\n` +
      `Rôle demandé : ${isTeacher ? 'ENSEIGNANT (rattachement à poser dans /admin)' : 'promptagogue'}`,
    );
  } else if (isTeacher && !existing.is_teacher) {
    notifyAdmin(
      `Demande de rôle enseignant : ${row.name || email}`,
      `Le compte existant ${email} (${row.name || 'sans nom'}) a re-vérifié son adresse en demandant ` +
      `le rôle ENSEIGNANT. Ce rôle ne s'accorde plus automatiquement : à poser dans /admin si légitime.`,
    );
  }

  // L'ÉCOLE RECONNUE EST DITE À L'INTÉRESSÉ, et pas seulement à l'administration.
  //
  // Le rattachement par IP se faisait jusqu'ici en silence : rien, dans
  // l'interface, n'apprenait à personne qu'il venait d'avoir lieu. Un
  // mécanisme invisible est un mécanisme dont on ne sait pas s'il fonctionne —
  // ni pour l'utilisateur, qui découvre un sélecteur d'école sans savoir d'où
  // il sort, ni pour qui vérifie que la vague a bien livré ce qu'elle promet.
  //
  // On rend donc l'école ET la nouveauté du lien. `nouvelle` distingue « on
  // vient de vous rattacher » de « vous l'êtes déjà » : la première mérite une
  // phrase, la seconde n'a rien à annoncer. Aucun secret n'est divulgué — le
  // nom de l'établissement d'où l'on écrit est affiché par ses propres murs.
  // `sync` ET `teacher` sont RENVOYÉS, et non déduits côté client : ouvert par
  // un lien, le navigateur ne sait pas ce qui a été coché sur l'appareil où le
  // code a été demandé. C'est le serveur qui vient de les lire dans la charge
  // signée. `teacher` commande la phrase qui dit à l'intéressé CE QUE LE
  // RATTACHEMENT NE DONNE PAS (voir /verifier) : sans lui, l'enseignant qui
  // ouvre le lien sur son téléphone lirait qu'on l'a rattaché à son collège
  // sans lire que la console de classe lui reste fermée.
  res.status(200).json({
    token: issueToken(row.name, email), name: row.name, email,
    sync: syncOptin === 1, teacher: isTeacher === 1,
    ecole: etabIp ? { id: etabIp.id, name: etabIp.name, nouvelle: rattachementNouveau } : null,
  });
}
