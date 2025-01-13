import { NextApiRequest, NextApiResponse } from 'next';
import { SecretPasswords, AllowedHours, AllowedIps } from '../../utils/env';
import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcrypt';
import lockfile from 'proper-lockfile';
import requestIp from 'request-ip';
import { isIP } from 'net';
import { DateTime } from 'luxon';

// Fonction utilitaire pour convertir les minutes en millisecondes
const minutesToMilliseconds = (minutes: number): number => minutes * 60 * 1000;

// Chemin vers le fichier de verrouillage
const LOCK_FILE_PATH = path.join(process.cwd(), 'auth_lock.json');

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

// Obtenir l'adresse IP réelle du client
function getClientIp(req: NextApiRequest): string {
  const ip = requestIp.getClientIp(req) || 'unknown';
  return isIP(ip) ? ip : 'unknown';
}

// Enregistre les tentatives d'authentification
async function logAttempt(
  req: NextApiRequest,
  ip: string,
  password: string,
  success: boolean,
  method: 'password' | 'unlocked' | 'ip'
) {
  const now = new Date();
  const logEntry = `${now.toISOString()} | IP: ${ip} | Method: ${method} | Password: ${password} | Success: ${success}\n`;
  const logFilePath = path.join(process.cwd(), 'auth_log.txt');
  try {
    await fs.appendFile(logFilePath, logEntry);
  } catch (err) {
    console.error('Erreur lors de l\'écriture dans le fichier de log:', err);
  };
}

// Fonction pour vérifier si une IP est verrouillée
async function isIpLocked(ip: string): Promise<boolean> {
  const attemptsFilePath = path.join(process.cwd(), 'failed_attempts.json');
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
  const attemptsFilePath = path.join(process.cwd(), 'failed_attempts.json');

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

// Vérifie le verrou d'authentification
async function checkAuthLock(): Promise<boolean> {
  try {
    const fileExists = await fs.access(LOCK_FILE_PATH).then(() => true).catch(() => false);
    if (fileExists) {
      const fileContent = await fs.readFile(LOCK_FILE_PATH, 'utf8');
      const lockData = JSON.parse(fileContent);
      if (Date.now() < lockData.timestamp) {
        return true;
      } else {
        await fs.unlink(LOCK_FILE_PATH); // Supprimer le fichier de verrouillage expiré
      }
    }
  } catch (error) {
    console.error('Erreur lors de la vérification du verrou d\'authentification:', error);
  }
  return false;
}

// Crée le verrou d'authentification
async function setAuthLock(durationInMinutes: number) {
  try {
    await fs.writeFile(
      LOCK_FILE_PATH,
      JSON.stringify({ timestamp: Date.now() + minutesToMilliseconds(durationInMinutes) })
    );
  } catch (error) {
    console.error('Erreur lors de la création du verrou d\'authentification:', error);
  }
} 
  
// Fonction pour vérifier si l'heure actuelle est dans une plage horaire d'ouverture du site
function isInTimeRange(startHour: number, startMinute: number, endHour: number, endMinute: number, currentHour: number, currentMinute: number): boolean {
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  const current = currentHour * 60 + currentMinute;
  return current >= start && current <= end;
}

// Fonction pour vérifier si l'accès est dans la plage horaire autorisée
function isAccessAllowed() {
  // Récupérer le fuseau horaire à partir de la variable d'environnement
  const timeZone = process.env.SET_TIME_ZONE || 'Europe/Zurich'; // Défaut sur 'Europe/Zurich'

  // Obtenir la date et l'heure actuelles dans le fuseau horaire spécifié
  const localTime = DateTime.now().setZone(timeZone);

  // Obtenir le jour de la semaine (0 = Dimanche, 1 = Lundi, ..., 6 = Samedi)
  const currentDay = localTime.weekday % 7; // luxon utilise 1 = Lundi, on ajuste pour 0 = Dimanche

  // Obtenir l'heure et les minutes actuelles
  const currentHour = localTime.hour;
  const currentMinute = localTime.minute;
  // Récupérer les plages horaires définies dans l'environnement
  const accessHours = JSON.parse(AllowedHours || '[]');

  // Vérifier si l'heure actuelle correspond à une des plages autorisées
  for (let entry of accessHours) {
    const [startHour, startMinute] = entry.start.split(':').map(Number);
    const [endHour, endMinute] = entry.end.split(':').map(Number);
    // Si le jour correspond et que l'heure est dans la plage, on autorise l'accès
    if (entry.day === currentDay && isInTimeRange(startHour, startMinute, endHour, endMinute, currentHour, currentMinute)) {
      return true;
    }
  }

  // Si aucune plage n'a été trouvée, accès refusé
  return false;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {

  const clientIp = getClientIp(req);
  const ANONYMOUS = 'anonymous';

  // Vérifier le verrou d'authentification pour savoir si le site est vérouillé
  if (await checkAuthLock()) {
    // Grace à la RGPD, toute personne peut se connecter sur le site lorsqu'il est dévérouillé sans que je puisse le détecter
    // Ce qui limitera le nombre de tokens disponible pour les élèves (le budget mensuel de dépense alloué à la clé API est fixe)
    logAttempt(req, ANONYMOUS, 'AutoAuth', true, 'unlocked'); // Même si c'est une auto-authentification, préciser que c'est via verrou
    res.status(200).json({ success: true, message: "Autologin activé via verrou" });
    return;
  } 

  // Vérifier si l'IP est dans la liste des IP autorisées et dans la plage horaire autorisée, sans qu'il soit nécessaire de déverrouiller le site
  if (AllowedIps.includes(clientIp) && isAccessAllowed()) {
    logAttempt(req, ANONYMOUS, 'IP Check', true, 'ip'); // Ne mémorise pas les IP connues des postes-école utilisés par les élèves
    setAuthLock(30); // Définir une durée de verrouillage par défaut, par exemple 30 minutes
    res.status(200).json({ success: true, message: "Connexion autorisée via IP" });
    return;
  }

  // Vérifier si l'IP est verrouillée en raison de trop de tentatives échouées
  if (await isIpLocked(clientIp)) {
    logAttempt(req, clientIp, 'Locked', false, 'ip'); // A prioris c'est l'IP de l'enseignant (moi) qui s'est trompé en tapant le mot de passe
    res.status(429).json({ success: false, message: "Trop de tentatives échouées. Veuillez réessayer plus tard." });
    return;
  }

  // Gestion des requêtes POST : mode de déverrouillage par mot de passe
  if (req.method === 'POST') {
    const { password } = req.body;
    const userPassword = password;

    if (SecretPasswords === undefined) {
      console.error('SECRET_APP_PASSWD n\'est pas défini dans .env');
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

    const { password: authPassword, duration: authDuration } = extracted;
    const isMatch = SecretPasswords.some(secretPassword => 
      bcrypt.compareSync(authPassword, secretPassword)      
    );

    // Vérifie si le mot de passe est correct
    if (isMatch) {
      // Applique la durée à la fonction de verrouillage
      logAttempt(req, clientIp, 'CorrectPwd ' + authDuration, true, 'password');
      setAuthLock(authDuration);
      console.log(`Déverrouillage du site pour ${authDuration} minutes.`);
      res.status(200).json({ success: true, message: "Connexion autorisée" });
    } else {
      logAttempt(req, clientIp, authPassword, false, 'password');
      handleFailedAttempt(clientIp);
      res.status(401).json({ success: false, message: "Mot de passe incorrect" });
    }
  } 
  else if (req.method === 'GET') {
    logAttempt(req, clientIp, 'GET', false, 'password');
    res.status(200).json({ authorized: false }); 
  } else {
    res.setHeader('Allow', ['POST', 'GET']);
    res.status(405).end(`Méthode ${req.method} non autorisée`);
  }
}
