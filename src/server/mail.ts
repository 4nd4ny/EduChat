// Envoi des codes de vérification par SMTP OVH (nodemailer).
//
// RÈGLE D'OR : le code voyage dans le CORPS de l'email et dans le FRAGMENT
// du lien (#123-456) — jamais en query string ni en chemin, pour qu'aucun
// journal (serveur, proxy) ne puisse le capter.
//
// En développement, sans SECRET_SMTP_HOST configuré (la boîte noreply@educh.at
// n'existe pas encore), le code est journalisé côté serveur : le flux complet
// reste testable sans email réel.
//
// SUIVI DE LA PLATEFORME (SECRET_SMTP_BCC) : une adresse peut recevoir copie
// cachée de tout ce qui part. Avec UNE exception délibérée — les deux messages
// qui portent un CODE. Un code de vérification est le seul justificatif
// d'identité du site (il n'y a pas de mot de passe) : en recevoir copie
// permettrait de se connecter au compte d'autrui, ou de s'emparer d'une
// adresse en cours de changement. Ces deux-là déclenchent donc, à la place, un
// AVIS qui rapporte l'événement — qui, quand, pourquoi — sans le code.

import nodemailer from 'nodemailer';
import { AdminEmails, SmtpConfig } from '../utils/env';

const SITE_URL = process.env.SITE_URL || 'https://educh.at';

/** Copie cachée de suivi, quand une adresse est configurée. */
function copie() {
  return SmtpConfig.bcc ? { bcc: SmtpConfig.bcc } : {};
}

/**
 * Avis de suivi pour les messages dont le CONTENU ne doit pas être copié.
 * Fire-and-forget : le suivi ne fait jamais échouer l'envoi qu'il observe.
 */
function tracer(sujet: string, texte: string): void {
  if (!SmtpConfig.bcc) return;
  if (!SmtpConfig.host) { console.log(`[DEV — SMTP non configuré] Suivi : ${sujet}`); return; }
  makeTransporter()
    .sendMail({ from: SmtpConfig.from, to: SmtpConfig.bcc, subject: `[EduChat · suivi] ${sujet}`, text: texte })
    .catch(error => console.error('Avis de suivi non envoyé :', error?.message));
}

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
    .sendMail({ from: SmtpConfig.from, to: AdminEmails.join(', '), ...copie(), subject: fullSubject, text: fullText })
    .catch(error => console.error('Notification admin non envoyée :', error?.message));
}

/**
 * Code envoyé à la NOUVELLE adresse lors d'un changement.
 */
export async function sendEmailChangeCode(newEmail: string, code: string): Promise<void> {
  const subject = 'EduChat — confirmez votre nouvelle adresse';
  const text = [
    'Vous avez demandé à rattacher votre compte EduChat à cette adresse.',
    '',
    `Votre code de confirmation : ${code}`,
    '',
    "Saisissez-le sur la page « Mes données » du compte concerné. Ce code expire dans 15 minutes.",
    "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien ne changera.",
  ].join('\n');
  if (!SmtpConfig.host) {
    console.log(`[DEV — SMTP non configuré] Code de changement d'adresse pour ${newEmail} : ${code}`);
    return;
  }
  await makeTransporter().sendMail({ from: SmtpConfig.from, to: newEmail, subject, text });
  tracer("changement d'adresse demandé",
    `Un code de confirmation vient d'être envoyé à ${newEmail} pour rattacher un compte à cette adresse.\n`
    + "Le code lui-même n'est pas reproduit ici : il vaut justificatif d'identité.");
}

/**
 * Avertissement à l'ANCIENNE adresse. C'est la protection réelle du procédé :
 * si le compte a été détourné, son titulaire l'apprend immédiatement, à une
 * adresse que l'intrus ne contrôle pas. Jamais bloquant.
 */
export function sendEmailChangeWarning(oldEmail: string, newEmail: string): void {
  const subject = 'EduChat — demande de changement d\'adresse sur votre compte';
  const text = [
    `Une demande de changement d'adresse vient d'être faite sur votre compte EduChat (${oldEmail}).`,
    '',
    `Nouvelle adresse demandée : ${newEmail}`,
    '',
    "Elle ne prendra effet que si le code envoyé à cette nouvelle adresse est confirmé.",
    "Si vous n'êtes pas à l'origine de cette demande, écrivez immédiatement à l'administration :",
    `${AdminEmails.join(', ') || 'blanvillain@harmonia.education'}`,
  ].join('\n');
  if (!SmtpConfig.host) {
    console.log(`[DEV — SMTP non configuré] Avertissement de changement d'adresse à ${oldEmail} (vers ${newEmail})`);
    return;
  }
  makeTransporter()
    .sendMail({ from: SmtpConfig.from, to: oldEmail, ...copie(), subject, text })
    .catch(error => console.error("Avertissement de changement d'adresse non envoyé :", error?.message));
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
  tracer("code de vérification demandé",
    `Un code de vérification vient d'être envoyé à ${email}${name ? ` (${name})` : ''}.\n`
    + "Le code lui-même n'est pas reproduit ici : sans mot de passe sur EduChat, il suffirait à ouvrir ce compte.");
}
