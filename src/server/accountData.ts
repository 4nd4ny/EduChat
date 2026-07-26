// Tout ce que le serveur conserve à propos d'UN compte — la matière de la
// page « Mes données » et de son export.
//
// Deux principes qui expliquent la forme de ce module :
//
//  1. On ne montre que ce qui appartient VRAIMENT à la personne. Le journal
//     de consommation (usage_log) est indexé par IP d'établissement et par
//     identifiant anonyme de navigateur : ce sont les données d'une école et
//     de ses élèves, pas celles du titulaire du compte. Seule la part que
//     l'enseignant a lui-même déclenchée (ses sessions de classe) lui est
//     rattachable, et on le dit.
//  2. On n'invente aucun chiffre. Une clé personnelle n'est jamais
//     journalisée : la consommation « personnelle » n'existe pas côté
//     serveur, et la page l'annonce plutôt que d'afficher un zéro trompeur.

import { getDb } from './db';
import { isAdminEmail } from './token';
import { listUserKeys } from './userKeys';
import type { ProviderId } from '../shared/providers';

const QUOTA_AUTEUR_BYTES = 1024 * 1024;   // même plafond que /api/prompts
const MAX_EXPORT_BODY_BYTES = 8 * 1024 * 1024;  // borne de l'export, en mémoire

export type ConversationResume = {
  id: string;
  name: string;
  createdAt: number;
  lastMessage: number;
  messageCount: number;
  promptName: string;
  promptVersion: number;
  bytes: number;
};

export type PromptResume = {
  id: number; name: string; description: string; status: string;
  archived: boolean; version: number; usageCount: number; tokensTotal: number;
  ratingCount: number; sizeBytes: number; createdAt: number; updatedAt: number;
};

export type AccountData = {
  identite: {
    email: string; name: string; createdAt: number; verifiedAt: number | null;
    isPromptagogue: boolean; isTeacher: boolean; isAdmin: boolean;
    syncOptin: boolean; keysOptin: boolean;
  };
  consommation: {
    declaredTokens: number | null;       // compteur venant des navigateurs
    profileUpdatedAt: number | null;
    quota: { usedBytes: number; maxBytes: number };
    teacherPilotedTokens: number | null; // sessions de classe ouvertes par ce compte
    etablissement: { id: number; name: string; monthTokens: number } | null;
  };
  keys: { provider: ProviderId; updatedAt: number; readable: boolean }[];
  moderations: number;
  conversations: ConversationResume[];
  deletedConversations: number;
  prompts: PromptResume[];
  anonymousPromptsWarning: boolean;
};

/** Un compte n'existe que s'il est vérifié en base. */
export function isVerifiedAccount(email: string): boolean {
  const row = getDb().prepare('SELECT 1 FROM users WHERE email = ? AND verified_at IS NOT NULL').get(email);
  return !!row;
}

/** Lecture défensive du profil : il vient d'un navigateur, rien n'y est sûr. */
function lireProfil(email: string): { profile: any | null; updatedAt: number | null } {
  const row = getDb().prepare('SELECT data, updated_at AS updatedAt FROM profiles WHERE email = ?')
    .get(email) as { data: string; updatedAt: number } | undefined;
  if (!row) return { profile: null, updatedAt: null };
  try {
    return { profile: JSON.parse(row.data), updatedAt: row.updatedAt };
  } catch {
    return { profile: null, updatedAt: row.updatedAt };
  }
}

/** Résumés de conversations — jamais le contenu des messages. */
export function resumeConversations(profile: any): ConversationResume[] {
  const brutes = profile?.conversations;
  if (!brutes || typeof brutes !== 'object') return [];
  const resumes: ConversationResume[] = [];
  for (const [id, valeur] of Object.entries(brutes)) {
    const conversation = valeur as any;
    if (!conversation || typeof conversation !== 'object') continue;
    const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    resumes.push({
      id: String(id).slice(0, 64),
      name: String(conversation.name ?? '').slice(0, 200),
      createdAt: Number.isFinite(conversation.createdAt) ? conversation.createdAt : 0,
      lastMessage: Number.isFinite(conversation.lastMessage) ? conversation.lastMessage : 0,
      messageCount: messages.length,
      promptName: String(conversation.promptName ?? ''),
      promptVersion: Number.isFinite(conversation.promptVersion) ? conversation.promptVersion : 0,
      bytes: Buffer.byteLength(JSON.stringify(conversation ?? {}), 'utf8'),
    });
  }
  // La conversation la plus vivante d'abord — c'est celle qu'on cherche.
  return resumes.sort((a, b) => (b.lastMessage || b.createdAt) - (a.lastMessage || a.createdAt));
}

function debutDuMois(): number {
  const maintenant = new Date();
  return Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1);
}

export function collectAccountData(email: string): AccountData {
  const db = getDb();

  const user = db.prepare(`
    SELECT name, created_at AS createdAt, verified_at AS verifiedAt, is_promptagogue AS isPromptagogue,
           is_teacher AS isTeacher, etablissement_id AS etablissementId, sync_optin AS syncOptin,
           keys_optin AS keysOptin
    FROM users WHERE email = ?`).get(email) as any;

  const { profile, updatedAt } = lireProfil(email);

  const quota = db.prepare(
    'SELECT COALESCE(SUM(size_bytes), 0) AS used FROM prompts WHERE author_email = ? AND archived = 0')
    .get(email) as { used: number };

  // Consommation pilotée : uniquement les échanges passés par la clé INTERNE
  // d'un établissement pendant une session que ce compte a ouverte.
  const pilote = user?.isTeacher
    ? (db.prepare(
        'SELECT COALESCE(SUM(tokens), 0) AS total FROM usage_log WHERE teacher_email = ?')
        .get(email) as { total: number }).total
    : null;

  let etablissement: AccountData['consommation']['etablissement'] = null;
  if (user?.etablissementId) {
    const maison = db.prepare('SELECT id, name FROM etablissements WHERE id = ?')
      .get(user.etablissementId) as { id: number; name: string } | undefined;
    if (maison) {
      const mois = db.prepare(`
        SELECT COALESCE(SUM(tokens), 0) AS total FROM usage_log
        WHERE etablissement_id = ? AND used_server_key = 1 AND ts >= ?`)
        .get(maison.id, debutDuMois()) as { total: number };
      etablissement = { id: maison.id, name: maison.name, monthTokens: mois.total };
    }
  }

  const prompts = (db.prepare(`
    SELECT id, name, description, status, archived, version, usage_count AS usageCount,
           tokens_total AS tokensTotal, rating_count AS ratingCount, size_bytes AS sizeBytes,
           created_at AS createdAt, updated_at AS updatedAt
    FROM prompts WHERE author_email = ? ORDER BY updated_at DESC`)
    .all(email) as any[]).map(p => ({ ...p, archived: !!p.archived })) as PromptResume[];

  const effacees = db.prepare('SELECT COUNT(*) AS n FROM profile_deletions WHERE email = ?')
    .get(email) as { n: number };

  // Modérer un commentaire inscrit son email dans comments.moderated_by, et
  // un commentaire n'est jamais supprimé : c'est une donnée personnelle
  // conservée sans limite. La taire ici, c'est répondre faux à une demande
  // d'accès.
  const moderations = db.prepare(
    'SELECT COUNT(*) AS n FROM comments WHERE moderated_by = ?').get(email) as { n: number };

  return {
    identite: {
      email,
      name: user?.name ?? '',
      createdAt: Number(user?.createdAt ?? 0),
      verifiedAt: user?.verifiedAt ?? null,
      isPromptagogue: !!user?.isPromptagogue,
      isTeacher: !!user?.isTeacher,
      // « Mes données » n'affiche qu'un bouton « Administrer » : les deux
      // niveaux y ont droit, la page /admin fera le tri.
      isAdmin: isAdminEmail(email) || !!(getDb()
        .prepare('SELECT 1 FROM users WHERE email = ? AND is_school_admin = 1 AND etablissement_id IS NOT NULL')
        .get(email)),
      syncOptin: !!user?.syncOptin,
      keysOptin: !!user?.keysOptin,
    },
    consommation: {
      declaredTokens: Number.isFinite(profile?.totalTokens) ? profile.totalTokens : null,
      profileUpdatedAt: updatedAt,
      quota: { usedBytes: quota.used, maxBytes: QUOTA_AUTEUR_BYTES },
      teacherPilotedTokens: pilote,
      etablissement,
    },
    keys: listUserKeys(email),
    moderations: moderations.n,
    conversations: resumeConversations(profile),
    deletedConversations: effacees.n,
    prompts,
    // Un tuteur publié anonymement n'a pas d'auteur en base : il ne peut pas
    // apparaître ici, et son proposant ne peut pas le dépublier lui-même.
    // Le taire donnerait une réponse fausse à une demande d'accès.
    anonymousPromptsWarning: true,
  };
}

/**
 * Export intégral : ce que la page montre, PLUS le contenu que la page
 * résume (conversations entières, corps des tuteurs et de leurs versions).
 * Aucune ligne du journal de consommation : elle porte l'IP d'une école et
 * le pseudonyme d'un élève, ce ne sont pas les données du titulaire.
 */
export function collectAccountExport(email: string) {
  const db = getDb();
  const donnees = collectAccountData(email);
  const { profile, updatedAt } = lireProfil(email);

  // Les versions successives ne sont plafonnées par RIEN (le quota d'auteur
  // ne compte que la version courante) : un tuteur souvent retouché peut en
  // accumuler des centaines, à 256 ko pièce. On borne donc l'export en
  // OCTETS, en commençant par les plus récentes, et on dit franchement ce
  // qui a été laissé de côté plutôt que de faire tomber le serveur.
  const versions = db.prepare(`
    SELECT p.name AS promptName, v.version, v.body, v.created_at AS createdAt
    FROM prompt_versions v JOIN prompts p ON p.id = v.prompt_id
    WHERE p.author_email = ? ORDER BY v.created_at DESC`).all(email) as
    { promptName: string; version: number; body: string; createdAt: number }[];

  const retenues: typeof versions = [];
  const allegees: { promptName: string; version: number; createdAt: number; bytes: number }[] = [];
  let cumul = 0;
  for (const v of versions) {
    const taille = Buffer.byteLength(v.body ?? '', 'utf8');
    if (cumul + taille <= MAX_EXPORT_BODY_BYTES) {
      retenues.push(v);
      cumul += taille;
    } else {
      allegees.push({ promptName: v.promptName, version: v.version, createdAt: v.createdAt, bytes: taille });
    }
  }

  const corps = db.prepare(
    'SELECT name, language, description, body FROM prompts WHERE author_email = ? ORDER BY name')
    .all(email);

  return {
    educhatAccountExport: 1,
    exportedAt: Date.now(),
    apropos: "Export intégral des données conservées par educh.at pour ce compte. "
      + "Le journal de consommation n'y figure pas : il est rattaché à l'IP d'un établissement "
      + "et à des identifiants anonymes de navigateurs, ce ne sont pas vos données personnelles. "
      + "Les clés API mémorisées n'y figurent pas non plus : elles sont chiffrées et ne quittent "
      + "jamais le serveur, même pour leur propriétaire.",
    identite: donnees.identite,
    consommation: donnees.consommation,
    clesMemorisees: donnees.keys,
    profilSynchronise: profile ?? null,
    profilMisAJour: updatedAt,
    tuteurs: corps,
    versionsDesTuteurs: retenues,
    versionsNonDetaillees: allegees,
    moderations: db.prepare(
      'SELECT id, prompt_id AS promptId, status, moderated_at AS moderatedAt FROM comments WHERE moderated_by = ? ORDER BY moderated_at DESC')
      .all(email),
  };
}
