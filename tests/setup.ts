// Préparation commune à TOUS les fichiers de test.
//
// Un DATA_DIR temporaire par fichier : la base SQLite, le verrou de salle et
// le fichier de limitation de débit y vivent — jamais dans le dépôt, et
// jamais partagés entre deux fichiers qui tourneraient en parallèle.
//
// L'environnement est posé AVANT le premier import d'un module serveur
// (src/utils/env.ts lit process.env au chargement). Un test qui veut une autre
// configuration la pose lui-même puis charge ses modules dynamiquement
// (voir tests/helpers/env.ts).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll } from 'vitest';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'educhat-test-'));
process.env.DATA_DIR = dir;
process.env.SECRET_TOKEN_KEY = 'cle-de-test-suffisamment-longue-0123456789';
process.env.SECRET_ADMIN_EMAILS = 'super@educh.at';
process.env.SET_TIME_ZONE = 'Europe/Zurich';
// Aucun proxy de confiance configuré : X-Real-IP est honoré (mode historique),
// ce qui permet aux tests de choisir l'adresse de l'appelant.
delete process.env.SECRET_PROXY_TOKEN;
delete process.env.TRUSTED_PROXY_IPS;
// Aucun envoi réel : sans hôte SMTP, mail.ts journalise au lieu d'envoyer.
delete process.env.SECRET_SMTP_HOST;
delete process.env.SECRET_SMTP_BCC;
// Aucune clé de fournisseur réelle ne doit fuiter de l'environnement du poste.
for (const k of Object.keys(process.env)) {
  if (/^SECRET_.*_API_KEY$/.test(k) || k.startsWith('SECRET_FREE_') || k.startsWith('PAYPAL_')) {
    delete process.env[k];
  }
}
delete process.env.SECRET_ALLOWED_IPS;
delete process.env.SECRET_ALLOWED_HOURS;
delete process.env.SECRET_PASSWD;

afterAll(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* sans effet */ }
});
