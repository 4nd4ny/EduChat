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
import { SmtpConfig } from '../utils/env';

const SITE_URL = process.env.SITE_URL || 'https://educh.at';

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

  const transporter = nodemailer.createTransport({
    host: SmtpConfig.host,
    port: SmtpConfig.port,
    secure: SmtpConfig.port === 465,
    auth: { user: SmtpConfig.user, pass: SmtpConfig.pass },
  });
  await transporter.sendMail({ from: SmtpConfig.from, to: email, subject, text });
}
