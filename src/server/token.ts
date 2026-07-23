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
