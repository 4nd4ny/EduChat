import { NextApiRequest, NextApiResponse } from 'next';
import { SecretPasswords, DataDir, MaxUnlockMinutes } from '../../utils/env';
import {
  checkAuthLock, clearAuthLock, getClientIp, isAccessAllowed, isKnownIp,
  salleDepuisIp, setAuthLock,
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

// Fonction pour extraire le mot de passe et la durée
function extractPasswordAndDuration(passwordWithDuration: string): { password: string; duration: number } | null {
  const regex = /^(.+?)(\d+)$/;
  const match = passwordWithDuration.match(regex);
  if (match) {
    const password = match[1];
    const duration = parseInt(match[2], 10);
    return { password, duration };
  }
  // Si la chaîne ne se termine pas par des chiffres, considérer que la durée est par défaut
  return { password: passwordWithDuration, duration: 0 };
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
    const extracted = extractPasswordAndDuration(String(req.body?.password ?? ''));
    const isMatch = !!extracted && SecretPasswords.some(secret =>
      bcrypt.compareSync(extracted.password, secret));
    if (!isMatch) {
      logAttempt(clientIp, false, 'password', 'fermeture');
      handleFailedAttempt(clientIp);
      res.status(401).json({ success: false, message: 'Mot de passe incorrect' });
      return;
    }
    // On ne referme QUE sa propre salle. L'ancien code supprimait le fichier
    // entier : sur un fichier désormais partagé, un enseignant refermant son
    // cours aurait coupé la classe de toutes les autres écoles au même instant.
    if (!portee) {
      logAttempt(clientIp, false, 'password', 'fermeture hors reseau');
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
      logAttempt(clientIp, false, 'password', 'fermeture non enregistree');
      res.status(500).json({ success: false, error: { code: 'ERR_LOCK_WRITE' } });
      return;
    }
    logAttempt(clientIp, true, 'password', 'fermeture');
    res.status(200).json({ success: true, message: 'Accès fermé' });
    return;
  }

  // La salle de CETTE école est-elle déjà ouverte ? Le court-circuit qui suit
  // ne parle plus du « site » mais du réseau d'où part la requête : un visiteur
  // quelconque n'a pas de salle, donc jamais d'auto-login.
  if (portee && await checkAuthLock(portee.cle)) {
    // Aucune donnée individuelle n'est retenue : la salle est ouverte, tout
    // élève de CE réseau entre sans compte et sans clé. Le budget mensuel de
    // l'école borne la dépense (quotas, /etablissement).
    logAttempt(ANONYMOUS, true, 'unlocked'); // Même si c'est une auto-authentification, préciser que c'est via verrou
    res.status(200).json({ success: true, message: "Autologin activé via verrou" });
    return;
  }

  // Vérifier si l'IP est dans la liste des IP autorisées et dans la plage horaire autorisée, sans qu'il soit nécessaire de déverrouiller le site
  if (isKnownIp(clientIp) && isAccessAllowed()) {
    logAttempt(ANONYMOUS, true, 'ip'); // Ne mémorise pas les IP connues des postes-école utilisés par les élèves
    // Le verrou de courtoisie porte la salle de CETTE adresse. `portee` ne peut
    // pas être nul ici : isKnownIp vient d'être vérifié, et salleDepuisIp rend
    // au minimum la portée d'amorçage pour une adresse connue.
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
    if (portee) {
      try { await setAuthLock(portee.cle, 30); }
      catch (erreur) { console.error('Verrou de courtoisie non posé :', erreur); }
    }
    res.status(200).json({ success: true, message: "Connexion autorisée via IP" });
    return;
  }

  // Vérifier si l'IP est verrouillée en raison de trop de tentatives échouées
  if (await isIpLocked(clientIp)) {
    logAttempt(clientIp, false, 'ip', 'verrouillee'); // A prioris c'est l'IP de l'enseignant (moi) qui s'est trompé en tapant le mot de passe
    res.status(429).json({ success: false, message: "Trop de tentatives échouées. Veuillez réessayer plus tard." });
    return;
  }

  // Gestion des requêtes POST : mode de déverrouillage par mot de passe
  if (req.method === 'POST') {
    const { password } = req.body;
    const userPassword = password;

    if (SecretPasswords === undefined) {
      console.error('SECRET_PASSWD n\'est pas défini dans .env');
      res.status(500).json({ success: false, message: 'Erreur de configuration du serveur' });
      return;
    }

    if (userPassword === undefined) {
      console.error('User password n\'est pas défini');
      res.status(500).json({ success: false, message: 'Erreur du formulaire de connexion' });
      return;
    }

    // Extraire le mot de passe et la durée
    const extracted = extractPasswordAndDuration(userPassword);
    if (!extracted) {
      res.status(400).json({ success: false, message: 'Format de mot de passe invalide' });
      return;
    }

    const { password: authPassword, duration: requestedDuration } = extracted;
    // Plafonne la durée demandée : un suffixe démesuré ne doit pas ouvrir le site indéfiniment.
    const authDuration = Math.min(requestedDuration, MaxUnlockMinutes);
    if (requestedDuration > MaxUnlockMinutes) {
      console.warn(`Duree de deverrouillage demandee (${requestedDuration} min) ramenee au plafond de ${MaxUnlockMinutes} min.`);
    }
    const isMatch = SecretPasswords.some(secretPassword => 
      bcrypt.compareSync(authPassword, secretPassword)      
    );

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
        logAttempt(clientIp, false, 'password', 'ouverture hors reseau');
        res.status(403).json({ success: false, error: { code: 'ERR_NO_ETABLISSEMENT' } });
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
        logAttempt(clientIp, false, 'password', 'ouverture non enregistree');
        res.status(500).json({ success: false, error: { code: 'ERR_LOCK_WRITE' } });
        return;
      }
      logAttempt(clientIp, true, 'password', `duree=${authDuration}min`);
      console.log(`Ouverture de la salle ${portee.cle} pour ${authDuration} minutes.`);
      res.status(200).json({ success: true, message: "Connexion autorisée" });
    } else {
      logAttempt(clientIp, false, 'password');
      handleFailedAttempt(clientIp);
      res.status(401).json({ success: false, message: "Mot de passe incorrect" });
    }
  } 
  else if (req.method === 'GET') {
    logAttempt(clientIp, false, 'password', 'GET');
    res.status(200).json({ authorized: false }); 
  } else {
    res.setHeader('Allow', ['POST', 'GET']);
    res.status(405).end(`Méthode ${req.method} non autorisée`);
  }
}
