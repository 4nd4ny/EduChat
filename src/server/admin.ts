// Garde d'administration : jeton valide ET adresse dans SECRET_ADMIN_EMAILS.
// La liste en dur est relue à CHAQUE requête — un vieux jeton ne suffit jamais.

import type { NextApiRequest } from 'next';
import { requireAuth, isAdminEmail, TokenPayload } from './token';

export function requireAdmin(req: NextApiRequest): TokenPayload | null {
  const auth = requireAuth(req);
  if (!auth || !isAdminEmail(auth.email)) return null;
  return auth;
}

/** Début du mois courant (UTC) — période de référence des quotas et factures. */
export function monthStartUtc(year?: number, month?: number): number {
  const now = new Date();
  return Date.UTC(year ?? now.getUTCFullYear(), (month ?? now.getUTCMonth() + 1) - 1, 1);
}
