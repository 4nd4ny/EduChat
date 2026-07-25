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
  // Adresse mise en copie CACHÉE de tout ce qui part, pour le suivi de la
  // plateforme. En copie cachée et non visible : le destinataire n'a pas à
  // savoir que son message est doublé, et personne ne doit pouvoir répondre
  // « à tous » sur un code de vérification.
  bcc: process.env.SECRET_SMTP_BCC || '',
};

// Clé de signature des jetons de compte (HMAC-SHA256). En dev sans .env, une
// clé de repli PRÉVISIBLE est utilisée : ne jamais s'en servir en production.
export const TokenKey: string = process.env.SECRET_TOKEN_KEY || 'dev-only-insecure-key';

// Contrôle de cohérence anti-usurpation d'IP. L'IP identifie l'établissement
// (accès, quotas, facture) : on ne peut faire confiance à l'en-tête X-Real-IP
// que s'il vient VRAIMENT du reverse proxy, pas d'un voisin sur le réseau Docker
// qui joindrait le conteneur en direct. Deux mécanismes, au choix :
//  - SECRET_PROXY_TOKEN : un secret que le proxy ajoute en en-tête X-Proxy-Token
//    (robuste aux changements d'IP — recommandé) ;
//  - TRUSTED_PROXY_IPS : liste d'IP socket de proxys de confiance.
// Si AUCUN n'est configuré : comportement historique (X-Real-IP honoré), NON
// durci — à n'utiliser qu'en développement ou derrière un proxy maîtrisé.
export const ProxyToken: string = process.env.SECRET_PROXY_TOKEN || '';
export const TrustedProxyIps: string[] = (process.env.TRUSTED_PROXY_IPS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

// Administrateurs, définis en dur côté serveur (exigence n°9).
export const AdminEmails: string[] = (process.env.SECRET_ADMIN_EMAILS || 'blanvillain@harmonia.education')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

// Repli GRATUIT public : quand aucune clé personnelle n'est saisie et que la
// session n'est pas déverrouillée, le site répond quand même via ce fournisseur
// et ce modèle gratuits, en utilisant la clé serveur de ce fournisseur
// (typiquement SECRET_OPENROUTER_API_KEY, plafonnée chez le fournisseur).
// Vide = pas de repli (comportement verrouillé historique).
export const FreeProvider: string = (process.env.SECRET_FREE_PROVIDER || '').trim();
// SECRET_FREE_MODEL peut lister PLUSIEURS modèles (séparés par des virgules) :
// une CASCADE de secours. Si le premier modèle gratuit est saturé (429), le
// serveur bascule automatiquement sur le suivant. Ex :
//   SECRET_FREE_MODEL=google/gemma-4-26b-a4b-it:free,openai/gpt-oss-20b:free,nvidia/nemotron-3-super-120b-a12b:free
// (DeepSeek/Qwen n'ont pas de variante :free sur OpenRouter actuellement ; les
//  ajouter le jour où elles reviennent = éditer cette ligne, sans toucher au code.)
export const FreeModels: string[] = (process.env.SECRET_FREE_MODEL || '')
  .split(',').map(m => m.trim()).filter(Boolean);
export const FreeModel: string = FreeModels[0] || ''; // compat : premier de la liste

// Alerte « IP gourmande » : dès qu'une même IP dépasse ce volume de tokens sur
// la CLÉ INTERNE dans la journée (UTC), une notification part vers
// l'administration — une seule par IP et par jour. 0 = alerte désactivée.
// Ce n'est PAS un blocage : juste de la visibilité avant la fin du mois.
export const AlertIpDailyTokens: number = (() => {
  const parsed = parseInt(process.env.SECRET_ALERT_IP_TOKENS_DAILY ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 100000;
})();

// Clés API du SERVEUR, par fournisseur. Source unique : la route de complétion
// les dépense, le compteur public s'en sert pour savoir si le repli gratuit est
// réellement opérationnel. Une clé absente = ce fournisseur n'est pas servi.
export const DeveloperKeys: Record<string, string | undefined> = {
  anthropic: process.env.SECRET_ANTHROPIC_API_KEY,
  openai: process.env.SECRET_OPENAI_API_KEY,
  gemini: process.env.SECRET_GEMINI_API_KEY,
  openrouter: process.env.SECRET_OPENROUTER_API_KEY,
  grok: process.env.SECRET_XAI_API_KEY,
  mistral: process.env.SECRET_MISTRAL_API_KEY,
  // Aucune clé serveur pour les fournisseurs à drapeau rouge (DeepSeek,
  // Qwen, Kimi, GLM, MiniMax) : ils ne sont accessibles qu'en clé
  // PERSONNELLE, et la route de complétion refuse de les servir sur la clé
  // interne d'un établissement. Voir CatalogueKeys ci-dessous : lire une
  // liste de modèles n'est pas converser.
};

/**
 * Clés utilisées UNIQUEMENT pour lire les CATALOGUES de modèles.
 *
 * Séparées de DeveloperKeys à dessein. Interroger « /models » n'envoie aucune
 * donnée d'élève : c'est une lecture de métadonnées, et elle est nécessaire
 * pour que le champ « Modèle » propose autre chose qu'une seule ligne à qui
 * apporte sa propre clé DeepSeek ou Qwen. Converser, en revanche, reste
 * interdit sur la clé interne pour ces fournisseurs — d'où deux tables plutôt
 * qu'un drapeau, pour qu'aucune inattention ne puisse les confondre.
 */
export const CatalogueKeys: Record<string, string | undefined> = {
  ...DeveloperKeys,
  deepseek: process.env.SECRET_DEEPSEEK_API_KEY,
  qwen: process.env.SECRET_QWEN_API_KEY,
  kimi: process.env.SECRET_KIMI_API_KEY,
  glm: process.env.SECRET_GLM_API_KEY,
  minimax: process.env.SECRET_MINIMAX_API_KEY,
};

// Budget quotidien du repli GRATUIT public, en USD — le plafond réel est posé
// CHEZ le fournisseur (OpenRouter) ; cette valeur sert au compteur public
// « crédits gratuits restants aujourd'hui » affiché en bas de l'accueil.
export const FreeDailyUsd: number = (() => {
  const parsed = parseFloat(process.env.SECRET_FREE_DAILY_USD ?? '');
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
})();

// Prix moyen (USD par million de tokens) du filet PAYANT de la cascade
// gratuite — les modèles « :free » ne coûtent rien et sont comptés à zéro.
// Sert uniquement à estimer les crédits consommés du jour.
export const FreePricePerMtok: number = (() => {
  const parsed = parseFloat(process.env.SECRET_FREE_PRICE_PER_MTOK ?? '');
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0.08;
})();

// Fonction de validation d'IP : est-ce vraiment utile ?
function isValidIP(ip: string): boolean {
  const ipv4Regex = /^(25[0-5]|2[0-4]\d|[01]?\d\d?)\.((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){2}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
  const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7}([0-9a-fA-F]{1,4}|:))$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}
