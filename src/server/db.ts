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
  used_server_key  INTEGER NOT NULL DEFAULT 0
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
};
