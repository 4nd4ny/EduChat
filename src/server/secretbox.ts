// Chiffrement symétrique des secrets confiés par les utilisateurs
// (aujourd'hui : leurs clés API, mémorisées SUR DEMANDE EXPLICITE).
//
// AES-256-GCM, crypto natif de Node, zéro dépendance. La clé de chiffrement
// dérive de SECRET_TOKEN_KEY : elle ne vit donc que dans l'environnement du
// serveur, jamais en base. Conséquences assumées et documentées :
//  - qui perd SECRET_TOKEN_KEY perd les clés mémorisées (elles deviennent
//    indéchiffrables — c'est le comportement voulu, pas une panne) ;
//  - qui obtient À LA FOIS le fichier de base ET la variable d'environnement
//    peut les déchiffrer : le chiffrement protège une copie de la base, pas
//    une compromission complète du serveur.
// Sans SECRET_TOKEN_KEY configurée (dev), la clé de repli est publique : la
// mémorisation est alors refusée plus haut, dans la route.

import crypto from 'crypto';
import { TokenKey } from '../utils/env';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;   // taille recommandée pour GCM
const TAG_BYTES = 16;

/** Clé AES dérivée de la clé de signature du serveur. */
function derivedKey(): Buffer {
  return crypto.createHash('sha256').update(`educhat:secretbox:${TokenKey}`).digest();
}

/** Chiffre une valeur ; renvoie « base64(iv|tag|chiffré) ». */
export function seal(plain: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, derivedKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

/** Déchiffre une valeur scellée ; null si le contenu a été altéré ou la clé changée. */
export function open(sealed: string): string | null {
  try {
    const raw = Buffer.from(sealed, 'base64');
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const decipher = crypto.createDecipheriv(ALGO, derivedKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** La configuration permet-elle de mémoriser des secrets en sécurité ? */
export function canSealSecrets(): boolean {
  return TokenKey !== 'dev-only-insecure-key' && TokenKey.length >= 16;
}
