export const SecretPasswords: string[] = process.env.SECRET_PASSWD ? process.env.SECRET_PASSWD.split(',').map(pwd => pwd.trim()): [];
export const AllowedHours: string = process.env.SECRET_ALLOWED_HOURS ?? '[]';
export const AllowedIps: string[] = process.env.SECRET_ALLOWED_IPS ? process.env.SECRET_ALLOWED_IPS.split(',').map(ip => ip.trim()).filter(ip => isValidIP(ip)): [];

// Répertoire des données persistantes. En production (conteneur Docker) il pointe
// sur le volume monté ; en développement, sur la racine du projet.
export const DataDir: string = process.env.DATA_DIR || process.cwd();

// Plafond de la durée de déverrouillage suffixée au mot de passe prof.
// Évite qu'un suffixe démesuré (ex. « motdepasse99999 ») ouvre le site indéfiniment.
export const MaxUnlockMinutes: number = (() => {
  const parsed = parseInt(process.env.SECRET_MAX_UNLOCK_MINUTES ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 600;
})();

// SMTP OVH pour les codes de vérification (boîte noreply@educh.at).
// Si SECRET_SMTP_HOST est absent (dev), le code est journalisé côté serveur.
export const SmtpConfig = {
  host: process.env.SECRET_SMTP_HOST || '',
  port: parseInt(process.env.SECRET_SMTP_PORT || '465', 10),
  user: process.env.SECRET_SMTP_USER || '',
  pass: process.env.SECRET_SMTP_PASS || '',
  from: process.env.SECRET_SMTP_FROM || 'EduChat <noreply@educh.at>',
};

// Clé de signature des jetons de compte (HMAC-SHA256). En dev sans .env, une
// clé de repli PRÉVISIBLE est utilisée : ne jamais s'en servir en production.
export const TokenKey: string = process.env.SECRET_TOKEN_KEY || 'dev-only-insecure-key';

// Administrateurs, définis en dur côté serveur (exigence n°9).
export const AdminEmails: string[] = (process.env.SECRET_ADMIN_EMAILS || 'blanvillain@harmonia.education')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

// Fonction de validation d'IP : est-ce vraiment utile ?
function isValidIP(ip: string): boolean {
  const ipv4Regex = /^(25[0-5]|2[0-4]\d|[01]?\d\d?)\.((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){2}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
  const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7}([0-9a-fA-F]{1,4}|:))$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}
