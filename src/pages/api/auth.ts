import { NextApiRequest, NextApiResponse } from 'next';
import { SecretPasswords, DataDir, MaxUnlockMinutes } from '../../utils/env';
import {
  checkAuthLock, clearAuthLock, getClientIp, horairesOuverts, salleDepuisIp,
  setAuthLock,
} from '../../server/access';
import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcrypt';
import lockfile from 'proper-lockfile';

// Fonction utilitaire pour convertir les minutes en millisecondes
const minutesToMilliseconds = (minutes: number): number => minutes * 60 * 1000;

// Chemins des fichiers d'état, dans le répertoire de données persistantes.
// En conteneur, DataDir pointe sur un volume monté : sans cela, ces fichiers
// seraient perdus à chaque redéploiement.
const ATTEMPTS_FILE_PATH = path.join(DataDir, 'failed_attempts.json');
const LOG_FILE_PATH = path.join(DataDir, 'auth_log.txt');

// Configuration du nombre de tentatives maximales
const MAX_ATTEMPTS = 5;

// Configuration de la durée du verrouillage en cas de nombre de tentatives maximales 
const LOCK_DURATION_ON_MAX_ATTEMPTS = 15; // minutes

// Durée d'ouverture quand le mot de passe arrive SANS suffixe de minutes —
// cas de l'écran verrouillé de /school (ProtectedPage.tsx), qui envoie le mot
// de passe tel que tapé. 60 min est la valeur par défaut de la console
// /enseignant ; elle reste plafonnée par MaxUnlockMinutes comme toute durée.
// Auparavant la durée valait 0 : la route répondait « Connexion autorisée »
// sur une salle restée fermée.
const DEFAULT_UNLOCK_MINUTES = 60;

// Nombre maximal de chiffres finaux essayés comme suffixe de durée (en plus de
// la lecture historique, voir lecturesPossibles). 6 chiffres couvrent toute
// durée utile — elle est de toute façon plafonnée par MaxUnlockMinutes.
const MAX_CHIFFRES_DUREE = 6;

/**
 * LES LECTURES POSSIBLES D'UNE SAISIE « <mot de passe><minutes> ».
 *
 * La console /enseignant colle la durée au mot de passe ; l'écran /school
 * envoie le mot de passe seul. L'ancienne lecture (`/^(.+?)(\d+)$/`) prenait
 * TOUS les chiffres finaux pour la durée : un mot de passe comme `Salle2024`
 * était comparé comme `Salle`, et ne pouvait donc jamais ouvrir la salle
 * (UC-14, anomalie 3). Aucune coupure fixe ne lève l'ambiguïté — seul le haché
 * sait où finit le mot de passe. On essaie donc, dans cet ordre :
 *   1. la saisie ENTIÈRE, sans suffixe → durée par défaut ;
 *   2. la saisie privée de 1, 2, … MAX_CHIFFRES_DUREE chiffres finaux ;
 *   3. la coupure HISTORIQUE (tous les chiffres finaux), si elle n'est pas
 *      déjà dans la liste — rétrocompatibilité stricte : toute saisie qui
 *      ouvrait avant ouvre encore, avec la même durée (un mot de passe sans
 *      chiffre final n'a qu'une coupure qui le retrouve : celle-là).
 * La première lecture qui correspond à un haché l'emporte : les chiffres
 * appartiennent au mot de passe tant que c'est possible.
 *
 * COÛT BORNÉ : au plus MAX_CHIFFRES_DUREE + 2 lectures par secret, quelle que
 * soit la longueur de la saisie — une traînée de mille chiffres ne déclenche
 * pas mille comparaisons bcrypt.
 */
function lecturesPossibles(saisie: string): Array<{ password: string; duration: number }> {
  const lectures = [{ password: saisie, duration: DEFAULT_UNLOCK_MINUTES }];
  // Le mot de passe garde au moins un caractère (comme `.+?` autrefois).
  const coupureHistorique = Math.min(saisie.match(/\d+$/)?.[0].length ?? 0, saisie.length - 1);
  for (let k = 1; k <= coupureHistorique; k++) {
    if (k > MAX_CHIFFRES_DUREE && k !== coupureHistorique) continue;
    lectures.push({ password: saisie.slice(0, -k), duration: parseInt(saisie.slice(-k), 10) });
  }
  return lectures;
}

/**
 * Compare la saisie aux hachés de SECRET_PASSWD ; rend la durée demandée
 * (minutes, non plafonnée) si l'une des lectures correspond, `null` sinon.
 * Comparaisons ASYNCHRONES : jusqu'à huit bcrypt par secret ne doivent pas
 * geler le serveur pour les autres requêtes. L'appelant ne compte qu'UN échec
 * par requête, quel que soit le nombre de lectures essayées.
 */
async function verifierMotDePasse(saisie: string): Promise<number | null> {
  for (const lecture of lecturesPossibles(saisie)) {
    for (const secret of SecretPasswords) {
      const ok = await bcrypt.compare(lecture.password, secret).catch(() => false);
      if (ok) return lecture.duration;
    }
  }
  return null;
}

// Enregistre les tentatives d'authentification.
// IMPORTANT : le mot de passe saisi n'est JAMAIS journalisé — une tentative
// erronée est souvent un mot de passe réel mal tapé. Le paramètre `detail` ne
// doit contenir que des informations non sensibles (durée demandée, motif).
async function logAttempt(
  ip: string,
  success: boolean,
  method: 'password' | 'unlocked' | 'ip',
  detail: string = ''
) {
  const now = new Date();
  const suffix = detail ? ` | ${detail}` : '';
  const logEntry = `${now.toISOString()} | IP: ${ip} | Method: ${method} | Success: ${success}${suffix}\n`;
  try {
    await fs.appendFile(LOG_FILE_PATH, logEntry);
  } catch (err) {
    console.error('Erreur lors de l\'écriture dans le fichier de log:', err);
  };
}

// Fonction pour vérifier si une IP est verrouillée
async function isIpLocked(ip: string): Promise<boolean> {
  const attemptsFilePath = ATTEMPTS_FILE_PATH;
  const fileExists = await fs.access(attemptsFilePath).then(() => true).catch(() => false);
  if (fileExists) {
    try {
      const fileContent = await fs.readFile(attemptsFilePath, 'utf8');
      const attemptsData = JSON.parse(fileContent);
      const ipData = attemptsData[ip];
      if (ipData && ipData.lockUntil && Date.now() < ipData.lockUntil) {
        return true;
      }
    } catch (error) {
      console.error("Erreur lors de la lecture du fichier des tentatives échouées:", error);
    }
  }
  return false;
}

// Fonction pour gérer les tentatives échouées
async function handleFailedAttempt(ip: string): Promise<void> {
  const attemptsFilePath = ATTEMPTS_FILE_PATH;

  // Options pour le verrouillage
  const lockOptions = {
    retries: {
      retries: 10,
      factor: 2,
      minTimeout: 100,
      maxTimeout: 1000,
    },
    stale: 2000, // Verrou considéré comme obsolète après 2 secondes 
  };

  let release: (() => Promise<void>) | null = null;

  try {
    // Vérifier si le fichier existe, sinon le créer
    const fileExists = await fs.access(attemptsFilePath).then(() => true).catch(() => false);
    if (!fileExists) {
      await fs.writeFile(attemptsFilePath, JSON.stringify({}, null, 2), 'utf8');
    }

    // Acquérir le verrou sur le fichier
    release = await lockfile.lock(attemptsFilePath, lockOptions);
    // console.log(`Verrou acquis pour le fichier ${attemptsFilePath}`);

    let attemptsData: Record<string, { count: number; lockUntil: number }> = {};

    // Lire les données existantes
    try {
      const fileContent = await fs.readFile(attemptsFilePath, 'utf8');
      attemptsData = JSON.parse(fileContent);
    } catch (error) {
      console.error('Erreur lors de la lecture du fichier des tentatives échouées :', error);
      // En cas d'erreur, on peut réinitialiser les données
      attemptsData = {};
    }

    const currentTime = Date.now();

    // Initialiser les données pour l'IP si elles n'existent pas
    if (!attemptsData[ip]) {
      attemptsData[ip] = { count: 0, lockUntil: 0 };
    }

    const ipData = attemptsData[ip];

    // Vérifier si l'IP est actuellement verrouillée
    if (ipData.lockUntil > 0 && currentTime > ipData.lockUntil) {
      // Le verrouillage a expiré, réinitialiser le compteur et le verrouillage
      console.log(`Le verrouillage pour l'IP ${ip} est expiré. Réinitialisation du compteur.`);
      ipData.count = 0;
      ipData.lockUntil = 0;
    } else if (ipData.lockUntil > currentTime) {
      const remainingLockTime = ipData.lockUntil - currentTime;
      console.log(`IP ${ip} est toujours verrouillée pour encore ${Math.ceil(remainingLockTime / 60000)} minutes.`);
      // Ne pas incrémenter le compteur si l'IP est verrouillée
      return;
    }

    // Incrémenter le compteur de tentatives échouées
    ipData.count += 1;

    if (ipData.count >= MAX_ATTEMPTS) {
      // Verrouiller l'IP
      ipData.lockUntil = currentTime + minutesToMilliseconds(LOCK_DURATION_ON_MAX_ATTEMPTS);
      ipData.count = 0; // Réinitialiser le compteur après verrouillage
      console.warn(`IP ${ip} est verrouillée pour ${LOCK_DURATION_ON_MAX_ATTEMPTS} minutes suite à trop de tentatives échouées.`);
    } else {
      console.warn(`IP ${ip} a ${ipData.count} tentative(s) échouée(s).`);
    }

    // Mettre à jour les données
    attemptsData[ip] = ipData;
    
    // Écrire les données mises à jour dans le fichier
    await fs.writeFile(attemptsFilePath, JSON.stringify(attemptsData, null, 2), 'utf8');
    console.log(`Données mises à jour pour l'IP ${ip}.`);
    
  } catch (error) {
    console.error('Erreur lors de la gestion des tentatives échouées :', error);
  } finally {
    // Libérer le verrou
    if (release) {
      try {
        await release();
        // console.log(`Verrou libéré pour le fichier ${attemptsFilePath}`);
      } catch (releaseError) {
        console.error('Erreur lors de la libération du verrou :', releaseError);
      }
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {

  // MÉTHODE D'ABORD. Ce refus était en fin de route, derrière le court-circuit
  // « salle déjà ouverte » : dans une salle ouverte, un DELETE répondait
  // « Autologin » (200) au lieu de 405 (UC-14, anomalie 6). La route ne connaît
  // que GET (état) et POST (ouvrir / refermer), quel que soit l'état de la salle.
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'GET']);
    res.status(405).end(`Méthode ${req.method} non autorisée`);
    return;
  }

  const clientIp = getClientIp(req);
  const ANONYMOUS = 'anonymous';

  // ─── LA PORTÉE, ET ELLE VIENT DE L'ADRESSE — JAMAIS DU CORPS DE LA REQUÊTE ──
  //
  // Le mot de passe de salle est un secret de SERVEUR (SECRET_PASSWD), commun à
  // tout le déploiement : il prouve qu'un enseignant est là, il ne dit pas dans
  // quelle école. C'est l'adresse appelante qui le dit, et rien d'autre. Un
  // déverrouillage ne vise donc QUE l'école d'où part la demande ; laisser le
  // client nommer sa cible aurait remplacé le trou global par un trou
  // paramétrable — même clé, même portée mondiale, une ligne de JSON en plus.
  //
  // COROLLAIRE ASSUMÉ : depuis la maison, on n'ouvre plus rien. On peut y
  // préparer la séance (/api/session-settings accepte le compte enseignant),
  // mais pas y ouvrir la dépense — c'est exactement la doctrine de
  // mayUseServerKeys : « payer sur la clé d'une école exige d'être physiquement
  // sur son réseau ». Un jeton d'enseignant N'EST PAS accepté ici pour cette
  // raison : il rouvrirait la dépense à distance par une autre porte.
  const portee = await salleDepuisIp(clientIp);

  // FERMETURE ANTICIPÉE de l'accès (console enseignante /enseignant) — le
  // contrepoids de l'échéance : une salle ouverte puis oubliée se referme
  // d'elle-même à l'heure dite, et celle-ci peut être refermée avant.
  // Traitée AVANT le court-circuit « salle déjà ouverte » ci-dessous, sans quoi
  // la requête repartirait aussitôt avec un succès sans rien fermer.
  // Le mot de passe de salle reste exigé : sans lui, n'importe quel élève
  // pourrait couper l'accès de toute la classe.
  if (req.method === 'POST' && req.body?.action === 'close') {
    // Le verrouillage après 5 échecs vaut AUSSI pour la fermeture : elle
    // compare le même mot de passe, et répond 401 ou 200/403 selon qu'il est
    // juste. Traitée avant le contrôle général plus bas, elle offrait à une IP
    // verrouillée un oracle de force brute sans limite.
    if (await isIpLocked(clientIp)) {
      await logAttempt(clientIp, false, 'ip', 'verrouillee (fermeture)');
      res.status(429).json({ success: false, message: "Trop de tentatives échouées. Veuillez réessayer plus tard." });
      return;
    }
    // La durée éventuellement suffixée est ignorée : seule compte la validité.
    const isMatch = (await verifierMotDePasse(String(req.body?.password ?? ''))) !== null;
    if (!isMatch) {
      await logAttempt(clientIp, false, 'password', 'fermeture');
      // Attendu : le compteur doit être inscrit AVANT la réponse, sans quoi des
      // essais rapprochés passeraient avant que le verrouillage ne soit écrit.
      await handleFailedAttempt(clientIp);
      res.status(401).json({ success: false, message: 'Mot de passe incorrect' });
      return;
    }
    // On ne referme QUE sa propre salle. L'ancien code supprimait le fichier
    // entier : sur un fichier désormais partagé, un enseignant refermant son
    // cours aurait coupé la classe de toutes les autres écoles au même instant.
    if (!portee) {
      await logAttempt(clientIp, false, 'password', 'fermeture hors reseau');
      res.status(403).json({ success: false, error: { code: 'ERR_NO_ETABLISSEMENT' } });
      return;
    }
    // « FERMÉ » NE SE DIT QUE SI ÇA A FERMÉ. clearAuthLock lève quand l'état
    // n'a pas pu être écrit (disque plein, verrou de fichier jamais obtenu) ;
    // sans ce catch, la console répondait « Accès fermé » et l'enseignant
    // repartait en croyant sa salle refermée alors qu'elle courait jusqu'à son
    // échéance. Un échec annoncé se répare d'un second clic.
    try {
      await clearAuthLock(portee.cle);
    } catch (erreur) {
      console.error('Fermeture de salle non enregistrée :', erreur);
      await logAttempt(clientIp, false, 'password', 'fermeture non enregistree');
      res.status(500).json({ success: false, error: { code: 'ERR_LOCK_WRITE' } });
      return;
    }
    await logAttempt(clientIp, true, 'password', 'fermeture');
    res.status(200).json({ success: true, message: 'Accès fermé' });
    return;
  }

  // La salle de CETTE école est-elle déjà ouverte ? Le court-circuit qui suit
  // ne parle plus du « site » mais du réseau d'où part la requête : un visiteur
  // quelconque n'a pas de salle, donc jamais d'auto-login.
  //
  // GET SEULEMENT (UC-14, anomalie 6). Ce court-circuit répondait succès à
  // TOUTE requête du réseau, y compris un POST au mot de passe faux — la route
  // disait « oui » à un mot de passe qu'elle n'avait pas lu. Un POST est une
  // demande d'OUVERTURE : il passe désormais par la vérification ordinaire (401
  // et échec compté s'il est faux) et, s'il est juste, REMPLACE l'échéance par
  // la durée demandée — la console /enseignant annonçait déjà « ouvert pour
  // N minutes », c'est désormais vrai même sur une salle déjà ouverte. L'écran
  // /school (ProtectedPage.tsx) n'est pas concerné : il interroge en GET et ne
  // POSTe que si la salle est fermée.
  if (req.method === 'GET' && portee && await checkAuthLock(portee.cle)) {
    // Aucune donnée individuelle n'est retenue : la salle est ouverte, tout
    // élève de CE réseau entre sans compte et sans clé. Le budget mensuel de
    // l'école borne la dépense (quotas, /etablissement).
    await logAttempt(ANONYMOUS, true, 'unlocked'); // Même si c'est une auto-authentification, préciser que c'est via verrou
    res.status(200).json({ success: true, message: "Autologin activé via verrou" });
    return;
  }

  // Adresse d'une école DANS SES HORAIRES : entrée sans mot de passe.
  //
  // MÊME RÈGLE QUE LA DÉPENSE (UC-14, anomalie 4). Ce test ne regardait que
  // SECRET_ALLOWED_IPS et les horaires globaux ; une école enregistrée en base,
  // dans ses horaires propres, avait pourtant le droit de dépenser
  // (mayUseServerKeys) mais l'écran verrouillé de /school lui demandait le mot
  // de passe. horairesOuverts est désormais la règle unique des deux.
  // GET seulement, pour la même raison que le court-circuit précédent : un
  // POST porte un mot de passe, qui doit être vérifié.
  if (req.method === 'GET' && portee && await horairesOuverts(portee)) {
    await logAttempt(ANONYMOUS, true, 'ip'); // Ne mémorise pas les IP connues des postes-école utilisés par les élèves
    // Le verrou de courtoisie porte la salle de CETTE adresse — celle de
    // l'école en base, ou la portée d'amorçage.
    //
    // ATTENDU, là où l'ancien code partait sans se retourner : l'écriture prend
    // maintenant un verrou de fichier (jusqu'à dix essais), et c'est la branche
    // qu'emprunte une classe entière qui allume ses postes à la même minute.
    // Attendre ici sérialise proprement ces écritures ; les requêtes suivantes
    // court-circuitent de toute façon plus haut, la salle étant devenue ouverte.
    //
    // AU MIEUX DE SES POSSIBILITÉS, ET SEULEMENT ICI. setAuthLock lève depuis
    // qu'une écriture perdue ne passe plus en silence ; mais cette branche-ci
    // n'a rien demandé — l'adresse était déjà autorisée, et le verrou n'est
    // qu'une commodité. Refuser la connexion de toute une classe parce qu'un
    // fichier n'a pas pu s'écrire serait le remède pire que le mal : les
    // horaires suffisent à ouvrir, la salle se rouvrira au prochain appel.
    try { await setAuthLock(portee.cle, 30); }
    catch (erreur) { console.error('Verrou de courtoisie non posé :', erreur); }
    res.status(200).json({ success: true, message: "Connexion autorisée via IP" });
    return;
  }

  // Vérifier si l'IP est verrouillée en raison de trop de tentatives échouées
  if (await isIpLocked(clientIp)) {
    await logAttempt(clientIp, false, 'ip', 'verrouillee'); // A prioris c'est l'IP de l'enseignant (moi) qui s'est trompé en tapant le mot de passe
    res.status(429).json({ success: false, message: "Trop de tentatives échouées. Veuillez réessayer plus tard." });
    return;
  }

  // Gestion des requêtes POST : mode de déverrouillage par mot de passe
  if (req.method === 'POST') {
    // Corps absent ou non-objet : on retombe sur « password manquant » (400)
    // plutôt que de lever à la déstructuration (500).
    const { password } = (req.body ?? {}) as { password?: unknown };
    const userPassword = password;

    if (SecretPasswords === undefined) {
      console.error('SECRET_PASSWD n\'est pas défini dans .env');
      res.status(500).json({ success: false, message: 'Erreur de configuration du serveur' });
      return;
    }

    // Champ absent ou d'un autre type qu'une chaîne : erreur du CLIENT (400),
    // pas du serveur. Non compté comme échec : aucun mot de passe n'a été essayé.
    if (typeof userPassword !== 'string') {
      console.error('User password n\'est pas défini');
      res.status(400).json({ success: false, message: 'Erreur du formulaire de connexion' });
      return;
    }

    // Vérifier le mot de passe et en déduire la durée demandée (voir
    // lecturesPossibles : un mot de passe peut lui-même finir par des chiffres).
    const requestedDuration = await verifierMotDePasse(userPassword);
    const isMatch = requestedDuration !== null;
    // Plafonne la durée demandée : un suffixe démesuré ne doit pas ouvrir le site indéfiniment.
    const authDuration = Math.min(requestedDuration ?? 0, MaxUnlockMinutes);
    if (isMatch && requestedDuration > MaxUnlockMinutes) {
      console.warn(`Duree de deverrouillage demandee (${requestedDuration} min) ramenee au plafond de ${MaxUnlockMinutes} min.`);
    }

    // Vérifie si le mot de passe est correct
    if (isMatch) {
      // BON MOT DE PASSE, MAUVAIS ENDROIT. Le secret prouve l'enseignant, il ne
      // désigne aucune école : sans salle derrière l'adresse, il n'y a rien à
      // ouvrir. Refuser ici est le cœur de la correction — c'est précisément
      // par cette porte qu'un mot de passe échappé ouvrait la clé de la
      // plateforme depuis n'importe où sur Internet.
      //
      // Ce n'est PAS une tentative échouée : le mot de passe était bon, et
      // compter cet appel dans failed_attempts verrouillerait pour un quart
      // d'heure un enseignant qui s'est simplement trompé de réseau. On le
      // journalise, on ne le punit pas.
      if (!portee) {
        await logAttempt(clientIp, false, 'password', 'ouverture hors reseau');
        res.status(403).json({ success: false, error: { code: 'ERR_NO_ETABLISSEMENT' } });
        return;
      }
      // DURÉE NULLE EXPLICITE (« motdepasse0 ») : ouvrir pour 0 minute, c'est
      // ne rien ouvrir. Mieux vaut le dire (400) que répondre « Connexion
      // autorisée » sur une salle fermée. Pas un échec : le mot de passe était bon.
      if (authDuration <= 0) {
        await logAttempt(clientIp, false, 'password', 'duree nulle');
        res.status(400).json({ success: false, message: 'Durée d\'ouverture invalide' });
        return;
      }
      // Applique la durée à la salle de CETTE école, et à elle seule.
      //
      // UNE OUVERTURE QUI N'A PAS PU S'ÉCRIRE N'EST PAS UNE OUVERTURE. Répondre
      // « Connexion autorisée » enverrait l'enseignant lancer sa séance, puis
      // toute sa classe buter sur des refus qu'aucun écran n'explique. Le dire
      // tout de suite laisse au moins une chance de réessayer.
      try {
        await setAuthLock(portee.cle, authDuration);
      } catch (erreur) {
        console.error('Ouverture de salle non enregistrée :', erreur);
        await logAttempt(clientIp, false, 'password', 'ouverture non enregistree');
        res.status(500).json({ success: false, error: { code: 'ERR_LOCK_WRITE' } });
        return;
      }
      await logAttempt(clientIp, true, 'password', `duree=${authDuration}min`);
      console.log(`Ouverture de la salle ${portee.cle} pour ${authDuration} minutes.`);
      res.status(200).json({ success: true, message: "Connexion autorisée" });
    } else {
      await logAttempt(clientIp, false, 'password');
      await handleFailedAttempt(clientIp);
      res.status(401).json({ success: false, message: "Mot de passe incorrect" });
    }
  } 
  else {
    // GET (les autres méthodes ont été refusées en tête de route).
    await logAttempt(clientIp, false, 'password', 'GET');
    res.status(200).json({ authorized: false }); 
  }
}
