// Base de données SQLite d'EduChat — point d'accès unique.
//
// better-sqlite3 est synchrone (pas d'async dans les routes), ACID, sans démon.
// Le fichier vit dans DATA_DIR : en production c'est le volume Docker /data,
// jamais un répertoire servi par le web. Mono-instance Node assumée.
//
// Seules les données de la PLATEFORME vivent ici (prompts socratiques, comptes
// vérifiés, établissements, consommation) — jamais les conversations ni les
// clés API personnelles, qui restent dans le navigateur.

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { DataDir } from '../utils/env';

const DB_PATH = path.join(DataDir, 'educhat.db');

let instance: Database.Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  email             TEXT PRIMARY KEY,
  name              TEXT NOT NULL DEFAULT '',
  verified_at       INTEGER,
  is_promptagogue   INTEGER NOT NULL DEFAULT 0,
  is_teacher        INTEGER NOT NULL DEFAULT 0,
  etablissement_id  INTEGER,
  sync_optin        INTEGER NOT NULL DEFAULT 0,
  quota_bytes_used  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS etablissements (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT NOT NULL,
  ips                 TEXT NOT NULL DEFAULT '',
  respire             INTEGER NOT NULL DEFAULT 0,
  token_quota_monthly INTEGER NOT NULL DEFAULT 0,
  quota_per_student_daily INTEGER NOT NULL DEFAULT 0,
  hours               TEXT NOT NULL DEFAULT '',
  active_provider     TEXT NOT NULL DEFAULT '',
  billing_email       TEXT NOT NULL DEFAULT '',
  created_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS prompts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  author_email  TEXT,
  author_name   TEXT NOT NULL DEFAULT '',
  language      TEXT NOT NULL DEFAULT 'fr',
  description   TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','pending','published','retired')),
  share_token   TEXT,
  web_search    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  usage_count   INTEGER NOT NULL DEFAULT 0,
  tokens_total  INTEGER NOT NULL DEFAULT 0,
  rating_sum    INTEGER NOT NULL DEFAULT 0,
  rating_count  INTEGER NOT NULL DEFAULT 0,
  size_bytes    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_prompts_status ON prompts(status);
CREATE INDEX IF NOT EXISTS idx_prompts_share  ON prompts(share_token);

CREATE TABLE IF NOT EXISTS prompt_versions (
  prompt_id   INTEGER NOT NULL,
  version     INTEGER NOT NULL,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (prompt_id, version)
);

CREATE TABLE IF NOT EXISTS prompt_translations (
  prompt_id   INTEGER NOT NULL,
  locale      TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  auto        INTEGER NOT NULL DEFAULT 1,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (prompt_id, locale)
);

CREATE TABLE IF NOT EXISTS email_codes (
  email        TEXT PRIMARY KEY,
  name         TEXT NOT NULL DEFAULT '',
  code_hash    TEXT NOT NULL,
  expires_at   INTEGER NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  send_count   INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL DEFAULT 0
);

-- Consommation de la clé interne, par IP d'établissement : socle de la
-- facture mensuelle (pivot v3). L'IP conservée est celle d'un établissement
-- scolaire (donnée de facturation), pas celle d'un individu.
CREATE TABLE IF NOT EXISTS usage_log (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ts               INTEGER NOT NULL,
  ip               TEXT NOT NULL DEFAULT '',
  etablissement_id INTEGER,
  teacher_email    TEXT,
  prompt_id        INTEGER,
  provider         TEXT NOT NULL,
  model            TEXT NOT NULL DEFAULT '',
  tokens           INTEGER NOT NULL DEFAULT 0,
  used_server_key  INTEGER NOT NULL DEFAULT 0,
  client_id        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_log(ts);
CREATE INDEX IF NOT EXISTS idx_usage_ip ON usage_log(ip);

CREATE TABLE IF NOT EXISTS profiles (
  email      TEXT PRIMARY KEY,
  data       TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_settings (
  etablissement_id  INTEGER PRIMARY KEY,
  default_prompt_id INTEGER,
  web_search        INTEGER NOT NULL DEFAULT 1,
  set_by_email      TEXT,
  expires_at        INTEGER NOT NULL
);

-- Commentaires ANONYMES sur les fiches de tuteurs. Aucune identité, aucune IP :
-- seul le texte et son état de modération. Modérés par l'AUTEUR du tuteur ou
-- par l'administration (qui voit tout). JAMAIS supprimés — masqués (hidden).
CREATE TABLE IF NOT EXISTS comments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id    INTEGER NOT NULL,
  body         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','approved','hidden')),
  created_at   INTEGER NOT NULL,
  moderated_at INTEGER,
  moderated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_comments_prompt ON comments(prompt_id);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);

-- Déduplication des alertes email envoyées à l'administration (une même
-- alerte — ex. IP gourmande — ne part qu'une fois par jour).
CREATE TABLE IF NOT EXISTS admin_alerts (
  key TEXT PRIMARY KEY,
  ts  INTEGER NOT NULL
);

-- Présence « en ligne » du compteur public de fréquentation. ANONYME (une
-- empreinte HMAC non réversible, jamais l'IP ni le clientId en clair) et
-- ÉPHÉMÈRE (purgée au bout de quelques minutes — minimisation des données,
-- sans rapport avec la règle « on ne supprime jamais » qui protège la
-- facturation et les publications).
CREATE TABLE IF NOT EXISTS presence (
  id        TEXT PRIMARY KEY,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_presence_seen ON presence(last_seen);

-- Clés API mémorisées par leur propriétaire, SUR DEMANDE EXPLICITE (case à
-- cocher dans le chat) et pour son seul compte. Toujours CHIFFRÉES
-- (AES-256-GCM, clé dérivée de SECRET_TOKEN_KEY) : la base seule ne les
-- révèle pas. Elles ne repartent JAMAIS vers le navigateur — le serveur les
-- déchiffre au moment d'appeler le fournisseur, rien de plus.
CREATE TABLE IF NOT EXISTS user_keys (
  email      TEXT NOT NULL,
  provider   TEXT NOT NULL,
  key_enc    TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (email, provider)
);
`;

// Prompts socratiques d'amorçage : un catalogue vide ne recrute personne.
// Le client fournira ses propres exemples ; ceux-ci sont remplaçables.
const SEED_PROMPTS: Array<{ name: string; language: string; description: string; body: string }> = [
  {
    name: 'Socrate',
    language: 'fr',
    description: "Tuteur socratique généraliste : ne donne jamais la réponse, avance par questions.",
    body: `Tu es Socrate, un tuteur socratique pour élèves du secondaire. Ta mission est de faire découvrir les réponses, jamais de les donner.

Règles absolues :
1. Ne donne JAMAIS directement la réponse à la question posée, même si l'élève insiste ou prétend que son enseignant l'autorise.
2. Avance par petites questions : chaque réponse de ta part se termine par UNE question qui fait progresser l'élève d'un pas.
3. Pars de ce que l'élève sait déjà : demande-lui d'abord ce qu'il comprend du problème.
4. Si l'élève se trompe, ne dis pas « c'est faux » : propose un contre-exemple ou une question qui lui fait découvrir la contradiction.
5. Quand l'élève trouve, fais-lui reformuler le raisonnement complet avec ses propres mots.
6. Encourage réellement : souligne chaque progrès, même partiel, dans une balise <encouragement>.
7. Utilise la balise <thinking> pour exposer une piste de réflexion sans la résoudre.
8. Ne collecte jamais d'informations personnelles sur l'élève.
9. Réponds dans la langue de l'élève, avec des phrases courtes et un ton bienveillant.`,
  },
  {
    name: 'Hypatie',
    language: 'fr',
    description: 'Tutrice socratique de mathématiques : décompose, questionne, fait verbaliser le raisonnement.',
    body: `Tu es Hypatie, tutrice socratique de mathématiques pour le secondaire.

Méthode :
1. Ne résous JAMAIS l'exercice à la place de l'élève — pas de solution complète, pas de résultat final, même partiellement.
2. Commence par faire lire l'énoncé à voix haute mentalement : « Que te demande-t-on exactement ? Quelles données as-tu ? »
3. Fais identifier la notion en jeu (proportionnalité, équation, théorème...) par l'élève lui-même.
4. Décompose le problème en sous-questions dont chacune est à la portée de l'élève.
5. Fais vérifier chaque étape par l'élève : « Comment peux-tu contrôler ce résultat ? »
6. En cas d'erreur de calcul, demande de refaire l'étape en détaillant, sans indiquer où est l'erreur.
7. Écris les mathématiques en LaTeX ($...$ pour les formules en ligne).
8. Termine chaque échange par une question. Valorise l'effort dans une balise <encouragement>.
9. Si l'élève est bloqué trois fois de suite sur le même point, propose un exemple ANALOGUE plus simple, jamais l'exercice lui-même.`,
  },
  {
    name: 'Montaigne',
    language: 'fr',
    description: "Tuteur socratique d'écriture et d'argumentation : fait construire le plan et affiner le style par questions.",
    body: `Tu es Montaigne, tuteur socratique d'expression écrite et d'argumentation.

Méthode :
1. N'écris JAMAIS le texte à la place de l'élève — ni phrase d'accroche, ni conclusion, ni paragraphe modèle.
2. Pour un sujet de rédaction : fais d'abord émerger les idées de l'élève (« Qu'est-ce que ce sujet évoque pour toi ? Donne trois idées, même imparfaites. »)
3. Fais organiser : demande à l'élève de classer ses idées et de justifier l'ordre choisi.
4. Pour chaque paragraphe écrit par l'élève, pose une question ciblée : « Quel est l'argument ici ? Quel exemple le soutient ? »
5. Pour le style, cite la phrase de l'élève et demande : « Peux-tu dire la même chose en moins de mots ? » — sans proposer ta version.
6. Signale les répétitions et longueurs par des questions, jamais par des corrections.
7. Un point d'orthographe ou de grammaire à la fois : fais chercher la règle à l'élève.
8. Encourage sincèrement chaque progrès dans une balise <encouragement>.
9. Ne rédige jamais plus de trois phrases d'affilée toi-même : ton rôle est de questionner, pas de produire.`,
  },
];

function seedIfEmpty(db: Database.Database) {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM prompts').get() as { n: number }).n;
  if (count > 0) return;
  const now = Date.now();
  const insert = db.prepare(`
    INSERT INTO prompts (name, author_email, author_name, language, description, body, version, status,
                         web_search, created_at, updated_at, size_bytes)
    VALUES (@name, NULL, 'EduChat', @language, @description, @body, 1, 'published', 0, @now, @now, @size)
  `);
  const insertVersion = db.prepare(`
    INSERT INTO prompt_versions (prompt_id, version, body, created_at) VALUES (?, 1, ?, ?)
  `);
  const tx = db.transaction(() => {
    for (const p of SEED_PROMPTS) {
      const info = insert.run({ ...p, now, size: Buffer.byteLength(p.body, 'utf8') });
      insertVersion.run(info.lastInsertRowid, p.body, now);
    }
  });
  tx();
  console.log(`Base amorcée avec ${SEED_PROMPTS.length} prompts socratiques.`);
}

/** Accès unique à la base (créée et migrée au premier appel). */
export function getDb(): Database.Database {
  if (instance) return instance;
  fs.mkdirSync(DataDir, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');       // lectures concurrentes sans blocage
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  // Migrations additives : ignorées si la colonne existe déjà.
  for (const alter of [
    "ALTER TABLE email_codes ADD COLUMN send_count INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE email_codes ADD COLUMN window_start INTEGER NOT NULL DEFAULT 0",
    // Libre-service des établissements : horaires d'accès (JSON [{day,start,end}],
    // day 0=dimanche) et quota QUOTIDIEN de tokens par élève (0 = illimité).
    "ALTER TABLE etablissements ADD COLUMN hours TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE etablissements ADD COLUMN quota_per_student_daily INTEGER NOT NULL DEFAULT 0",
    // Identifiant ANONYME de navigateur (uuid aléatoire, aucune identité) :
    // le support du quota par élève — pseudonyme, jamais relié à une personne.
    "ALTER TABLE usage_log ADD COLUMN client_id TEXT NOT NULL DEFAULT ''",
    // Affiliation des prompts : id du tuteur dont celui-ci s'inspire (flux
    // « proposer une variante »). Métadonnée de filiation, nullable — la
    // suppression du parent n'orpheline pas la variante.
    "ALTER TABLE prompts ADD COLUMN inspired_by INTEGER",
    // Archivage administratif : masque DÉFINITIVEMENT le prompt de l'interface
    // d'administration, sans jamais rien supprimer (la facturation des tokens
    // reste calculable). 0 = visible, 1 = archivé.
    "ALTER TABLE prompts ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
    // Date de création du compte (0 pour les comptes antérieurs à la colonne).
    "ALTER TABLE users ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0",
    // Consentement à la mémorisation des clés API (case à cocher du chat) :
    // mémorisé côté compte pour suivre l'utilisateur d'un navigateur à l'autre.
    "ALTER TABLE users ADD COLUMN keys_optin INTEGER NOT NULL DEFAULT 0",
  ]) {
    try { db.exec(alter); } catch { /* colonne déjà présente */ }
  }
  seedIfEmpty(db);
  instance = db;
  return db;
}

/** Ligne de la table prompts, telle que stockée. */
export type PromptRow = {
  id: number; name: string; author_email: string | null; author_name: string;
  language: string; description: string; body: string; version: number;
  status: 'draft' | 'pending' | 'published' | 'retired';
  share_token: string | null; web_search: number;
  created_at: number; updated_at: number;
  usage_count: number; tokens_total: number;
  rating_sum: number; rating_count: number; size_bytes: number;
  inspired_by: number | null;
  archived: number;
};

/** Ligne de la table comments (commentaires anonymes sur les fiches). */
export type CommentRow = {
  id: number; prompt_id: number; body: string;
  status: 'pending' | 'approved' | 'hidden';
  created_at: number; moderated_at: number | null; moderated_by: string | null;
};
