// Envoi des codes de vérification par SMTP OVH (nodemailer).
//
// RÈGLE D'OR : le code voyage dans le CORPS de l'email et dans le FRAGMENT
// du lien (#123-456) — jamais en query string ni en chemin, pour qu'aucun
// journal (serveur, proxy) ne puisse le capter.
//
// En développement, sans SECRET_SMTP_HOST configuré (la boîte noreply@educh.at
// n'existe pas encore), le code est journalisé côté serveur : le flux complet
// reste testable sans email réel.

import nodemailer from 'nodemailer';
import { AdminEmails, SmtpConfig } from '../utils/env';

const SITE_URL = process.env.SITE_URL || 'https://educh.at';

function makeTransporter() {
  return nodemailer.createTransport({
    host: SmtpConfig.host,
    port: SmtpConfig.port,
    secure: SmtpConfig.port === 465,
    auth: { user: SmtpConfig.user, pass: SmtpConfig.pass },
  });
}

/**
 * Notification à l'ADMINISTRATION (nouveau compte, prompt à modérer, nouveau
 * commentaire, IP gourmande...). TOUJOURS en tâche de fond : jamais attendue,
 * jamais bloquante, jamais fatale — une notification perdue est un moindre mal
 * comparé à une réponse utilisateur sacrifiée. Sans SMTP configuré (dev), la
 * notification va dans les logs du serveur.
 */
export function notifyAdmin(subject: string, text: string): void {
  const fullSubject = `[EduChat] ${subject}`;
  const fullText = `${text}\n\n— Notification automatique d'EduChat (${SITE_URL}/admin)`;
  if (!SmtpConfig.host) {
    console.log(`[DEV — SMTP non configuré] Notification admin : ${fullSubject}\n${text}`);
    return;
  }
  if (!AdminEmails.length) return;
  makeTransporter()
    .sendMail({ from: SmtpConfig.from, to: AdminEmails.join(', '), subject: fullSubject, text: fullText })
    .catch(error => console.error('Notification admin non envoyée :', error?.message));
}

export async function sendVerificationCode(email: string, name: string, code: string): Promise<void> {
  const link = `${SITE_URL}/verifier#${code}`;
  const subject = 'EduChat — votre code de vérification';
  const text = [
    `Bonjour ${name || ''},`.trim(),
    '',
    `Votre code de vérification EduChat : ${code}`,
    '',
    `Vous pouvez aussi cliquer sur ce lien puis confirmer votre adresse : ${link}`,
    '',
    'Ce code expire dans 15 minutes. Si vous n\'êtes pas à l\'origine de cette demande, ignorez ce message.',
  ].join('\n');

  if (!SmtpConfig.host) {
    // Repli développement : pas de boîte SMTP → le code va dans les logs serveur.
    console.log(`[DEV — SMTP non configuré] Code de vérification pour ${email} : ${code}`);
    return;
  }

  await makeTransporter().sendMail({ from: SmtpConfig.from, to: email, subject, text });
}
