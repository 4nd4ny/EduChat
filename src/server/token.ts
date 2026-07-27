// Jeton de compte signé HMAC-SHA256 — crypto natif de Node, zéro dépendance.
//
// Payload {name, email, exp} en base64url + signature. Stocké côté client en
// localStorage 'educhat-token' (pas de cookie : la promesse « pas de cookies »
// de la page RGPD reste tenable, et le risque XSS est fermé par l'étape 3).
// Les RÔLES ne sont jamais portés par le jeton : ils sont relus en base et
// dans SECRET_ADMIN_EMAILS à chaque requête sensible — un vieux jeton ne
// donne aucun droit périmé.

import crypto from 'crypto';
import type { NextApiRequest } from 'next';
import { AdminEmails, TokenKey } from '../utils/env';

export type TokenPayload = { name: string; email: string; exp: number };

const TOKEN_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000; // ≈ 90 jours

function sign(data: string): string {
  return crypto.createHmac('sha256', TokenKey).update(data).digest('base64url');
}

export function issueToken(name: string, email: string): string {
  const payload = Buffer.from(JSON.stringify({
    name,
    email: email.toLowerCase(),
    exp: Date.now() + TOKEN_LIFETIME_MS,
  } satisfies TokenPayload)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TokenPayload;
    if (typeof parsed.email !== 'string' || typeof parsed.exp !== 'number') return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ─── LIEN DE VÉRIFICATION : LE LIEN VAUT LE CODE ────────────────────────────
//
// Le courriel ne portait jusqu'ici que le code, et l'arrivée sur /verifier
// redemandait l'adresse que le serveur connaissait déjà — une frustration
// gratuite, et sur téléphone une occasion de faute de frappe. Le lien porte
// donc désormais l'adresse ET le code, mais SIGNÉS et encodés : « un format
// qu'on ne peut pas dicter par téléphone ». On réutilise l'HMAC ci-dessus au
// lieu d'inventer un second schéma — deux mécanismes de signature dans un même
// dépôt, c'est un qui finira mal entretenu.
//
// LE PRÉFIXE DE CONTEXTE EST LA LIGNE LA PLUS IMPORTANTE DE CE FICHIER.
// Sans lui, les deux formats partageraient clé ET calcul : une charge de lien
// nommant ses champs « email » et « exp » passerait telle quelle dans
// verifyToken, donc en en-tête « Authorization: Bearer ». Or ce chemin-là ne
// consulte JAMAIS email_codes : un lien déjà consommé ouvrirait encore une
// session pendant tout son reste de vie, et la promesse « un lien rejoué
// n'ouvre rien » tomberait. Le préfixe rend les deux univers disjoints —
// verifyToken signe la charge NUE, jamais préfixée, et ne peut donc valider
// aucun lien ; l'inverse est vrai de même. Les champs sont en outre nommés
// court (e/c/x/s/t), ce qui ferme la porte une seconde fois.
const CONTEXTE_LIEN = 'lien-verification.v1|';

// e = email, c = code (forme « 123-456 »), x = expiration (ms epoch),
// s = synchronisation du profil demandée, t = rôle enseignant demandé.
// s et t voyagent dans le lien parce qu'ils sont choisis à la DEMANDE du code,
// sur un appareil qui n'est pas forcément celui qui ouvrira le lien.
export type ChargeLien = { e: string; c: string; x: number; s: boolean; t: boolean };

/** Charge signée à mettre dans le FRAGMENT du lien du courriel. */
export function signerLienVerification(charge: ChargeLien): string {
  const payload = Buffer.from(JSON.stringify(charge)).toString('base64url');
  return `${payload}.${sign(CONTEXTE_LIEN + payload)}`;
}

/**
 * Relit un lien de vérification. Renvoie null pour TOUTE anomalie — signature
 * invalide, charge illisible, expiration dépassée : l'appelant n'a pas à savoir
 * laquelle, et ne doit surtout pas pouvoir le dire à l'extérieur.
 */
export function lireLienVerification(lien: string): ChargeLien | null {
  const point = lien.lastIndexOf('.');
  if (point < 1) return null;
  const payload = lien.slice(0, point);
  const signature = lien.slice(point + 1);
  const attendue = sign(CONTEXTE_LIEN + payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(attendue);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const charge = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ChargeLien;
    if (typeof charge.e !== 'string' || typeof charge.c !== 'string' || typeof charge.x !== 'number') return null;
    // L'expiration du lien EST celle du code : elle est recopiée du même
    // calcul à l'émission (src/pages/api/verify/request.ts), jamais recalculée.
    if (Date.now() > charge.x) return null;
    return charge;
  } catch {
    return null;
  }
}

/** Identité vérifiée portée par l'en-tête Authorization: Bearer, ou null. */
export function requireAuth(req: NextApiRequest): TokenPayload | null {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return verifyToken(header.slice(7).trim());
}

/** L'email fait-il partie des administrateurs définis en dur ? */
export function isAdminEmail(email: string): boolean {
  return AdminEmails.includes(email.toLowerCase());
}
