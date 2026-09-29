// UC-05 — Tests unitaires : les deux courriels du changement d'adresse
// (src/server/mail.ts : sendEmailChangeCode, sendEmailChangeWarning).
// nodemailer est doublé ; la configuration SMTP est posée puis les modules
// rechargés (src/utils/env.ts fige ses constantes au chargement).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { poserEnv } from '../../helpers/env';

const envoyes: any[] = [];
let echec = false;
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn(async (m: any) => {
        envoyes.push(m);
        if (echec) throw new Error('SMTP indisponible');
      }),
    })),
  },
}));

beforeEach(() => { envoyes.length = 0; echec = false; });
afterEach(() => {
  poserEnv({ SECRET_SMTP_HOST: undefined, SECRET_SMTP_BCC: undefined });
  vi.restoreAllMocks();
});

async function chargerMail(env: Record<string, string | undefined>) {
  poserEnv(env);
  return import('../../../src/server/mail');
}

describe('sans SMTP configuré (développement)', () => {
  it('journalise au lieu d’envoyer, sans lever', async () => {
    const journal = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mail = await chargerMail({ SECRET_SMTP_HOST: undefined });
    await mail.sendEmailChangeCode('nouveau@ecole.ch', '123-456');
    mail.sendEmailChangeWarning('ancien@ecole.ch', 'nouveau@ecole.ch');
    expect(envoyes).toHaveLength(0);
    expect(journal.mock.calls.flat().join('\n')).toContain('123-456');
  });
});

describe('avec SMTP et copie de suivi', () => {
  it('le code part à la NOUVELLE adresse, sans copie cachée ; le suivi reçoit un avis SANS le code', async () => {
    const mail = await chargerMail({ SECRET_SMTP_HOST: 'smtp.test', SECRET_SMTP_BCC: 'suivi@educh.at' });
    await mail.sendEmailChangeCode('nouveau@ecole.ch', '987-654');
    const [code, avis] = envoyes;
    expect(code.to).toBe('nouveau@ecole.ch');
    expect(code.bcc).toBeUndefined();
    expect(code.text).toContain('987-654');
    expect(avis.to).toBe('suivi@educh.at');
    expect(avis.text).not.toContain('987-654');
    expect(avis.text).toContain('nouveau@ecole.ch');
  });

  it('l’avertissement part à l’ANCIENNE adresse, nomme la nouvelle et ne porte aucun code', async () => {
    const mail = await chargerMail({ SECRET_SMTP_HOST: 'smtp.test', SECRET_SMTP_BCC: 'suivi@educh.at' });
    mail.sendEmailChangeWarning('ancien@ecole.ch', 'nouveau@ecole.ch');
    await new Promise(r => setImmediate(r));
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0].to).toBe('ancien@ecole.ch');
    expect(envoyes[0].bcc).toBe('suivi@educh.at');
    expect(envoyes[0].text).toContain('nouveau@ecole.ch');
    expect(envoyes[0].text).toContain('super@educh.at'); // contact de l'administration
  });

  it('un échec d’envoi de l’avertissement n’est jamais fatal', async () => {
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mail = await chargerMail({ SECRET_SMTP_HOST: 'smtp.test' });
    echec = true;
    expect(() => mail.sendEmailChangeWarning('ancien@ecole.ch', 'nouveau@ecole.ch')).not.toThrow();
    await new Promise(r => setImmediate(r));
    expect(erreurs).toHaveBeenCalled();
  });

  it('un échec d’envoi du code, lui, remonte à l’appelant', async () => {
    const mail = await chargerMail({ SECRET_SMTP_HOST: 'smtp.test' });
    echec = true;
    await expect(mail.sendEmailChangeCode('nouveau@ecole.ch', '111-222')).rejects.toThrow('SMTP indisponible');
  });
});
