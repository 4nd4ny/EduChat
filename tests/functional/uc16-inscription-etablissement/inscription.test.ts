// UC-16 — Tests fonctionnels : « Inscrire un établissement en libre-service ».
// Parcours de la page /etablissement : GET /api/ip (adresse constatée et déjà
// revendiquée ?), puis POST /api/etablissement/inscription avec le jeton du
// compte, puis l'accueil public de la nouvelle école. Seule la notification à
// l'administration est doublée.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerEtablissement, creerCompte } from '../../helpers/db';

const notifications: Array<{ sujet: string; texte: string }> = [];
vi.mock('../../../src/server/mail', () => ({
  notifyAdmin: vi.fn((sujet: string, texte: string) => { notifications.push({ sujet, texte }); }),
  sendVerificationCode: vi.fn(async () => {}),
  sendEmailChangeCode: vi.fn(async () => {}),
  sendEmailChangeWarning: vi.fn(() => {}),
}));

import inscription from '../../../src/pages/api/etablissement/inscription';
import accueil from '../../../src/pages/api/etablissement/accueil';
import ip from '../../../src/pages/api/ip';
import { issueToken } from '../../../src/server/token';
import { mayUseServerKeys } from '../../../src/server/access';

// Adresses neuves par test : l'inscription est limitée à 3 / min / IP.
let n = 0;
const ipNeuve = () => `198.51.100.${++n}`;

beforeEach(async () => {
  await viderBase();
  notifications.length = 0;
});

const etab = async (id: number) => (await base()).prepare('SELECT * FROM etablissements WHERE id = ?').get(id) as any;
const user = async (email: string) => (await base()).prepare('SELECT * FROM users WHERE email = ?').get(email) as any;

describe('Scénario nominal : un enseignant inscrit son école depuis son réseau', () => {
  it('crée l’école sur l’adresse constatée, en fait son administrateur, et notifie la plateforme', async () => {
    const adresse = ipNeuve();
    const jeton = await creerCompte('resp@college.ch', { name: 'Marie' });

    // 1. La page affiche l'adresse que voit le serveur, libre.
    const avant = await appeler(ip, { method: 'GET', ip: adresse });
    expect(avant.json).toEqual({ ip: adresse, isIpAllowed: false, revendiquee: false });

    // 2. Deux champs, et rien d'autre.
    const r = await appeler(inscription, {
      method: 'POST', ip: adresse, token: jeton, body: { name: '  Collège du Lac  ', adminName: 'Marie Curie' },
    });
    expect(r.status).toBe(201);
    expect(r.json).toEqual({ ok: true, id: expect.any(Number), ipRetenue: adresse });

    const e = await etab(r.json.id);
    expect(e).toMatchObject({
      name: 'Collège du Lac', ips: adresse, billing_email: 'resp@college.ch',
      respire: 0, solde: 0, token_quota_monthly: 0, quota_per_student_daily: 0, contribution_pct: -1,
      billing_address: '', hours: '', catalogue_ouvert: 0, atelier_promptagogue: 0,
    });
    const u = await user('resp@college.ch');
    expect(u).toMatchObject({ is_teacher: 1, etablissement_id: r.json.id, is_school_admin: 1, name: 'Marie' });
    const lien = (await base()).prepare('SELECT is_admin FROM user_etablissements WHERE email = ? AND etablissement_id = ?')
      .get('resp@college.ch', r.json.id) as any;
    expect(lien.is_admin).toBe(1);

    expect(notifications).toHaveLength(1);
    expect(notifications[0].sujet).toBe("Inscription d'établissement : Collège du Lac");
    expect(notifications[0].texte).toContain('Marie Curie <resp@college.ch>');
    expect(notifications[0].texte).toContain(`IP de reconnaissance : ${adresse}`);

    // 3. L'école est désormais reconnue depuis son réseau.
    expect((await appeler(ip, { method: 'GET', ip: adresse })).json.revendiquee).toBe(true);
    const acc = await appeler(accueil, { method: 'GET', ip: adresse });
    expect(acc.json).toEqual({ ecole: { name: 'Collège du Lac' }, tuteurs: [] });
  });

  it('une école inscrite ne dépense rien d’office : ni RESPIRE, ni horaires, ni salle ouverte', async () => {
    const adresse = ipNeuve();
    const jeton = await creerCompte('resp@college.ch');
    await appeler(inscription, { method: 'POST', ip: adresse, token: jeton, body: { name: 'Collège', adminName: 'R' } });
    expect(await mayUseServerKeys(adresse)).toBe(false);
  });
});

describe('Ce que l’inscrit peut écrire, et rien d’autre', () => {
  it('respire, solde, quotas, contribution, IP, email et adresse postale du corps sont ignorés', async () => {
    const adresse = ipNeuve();
    const jeton = await creerCompte('resp@college.ch');
    const r = await appeler(inscription, {
      method: 'POST', ip: adresse, token: jeton,
      body: {
        name: 'Collège', adminName: 'Resp',
        respire: 1, solde: 1_000_000, token_quota_monthly: 999, quotaMensuel: 999, contribution_pct: 0, contributionPct: 0,
        ips: '203.0.113.250', ip: '203.0.113.250', billing_email: 'pirate@ailleurs.ch', billingEmail: 'pirate@ailleurs.ch',
        billing_address: '1 rue du Vol', adresse: '1 rue du Vol', etablissementId: 1, is_admin: 1,
      },
    });
    expect(r.status).toBe(201);
    expect(await etab(r.json.id)).toMatchObject({
      respire: 0, solde: 0, token_quota_monthly: 0, contribution_pct: -1,
      ips: adresse, billing_email: 'resp@college.ch', billing_address: '',
    });
  });

  it('le nom de l’école est borné à 120 caractères', async () => {
    const jeton = await creerCompte('resp@college.ch');
    const r = await appeler(inscription, { method: 'POST', ip: ipNeuve(), token: jeton, body: { name: 'É'.repeat(300), adminName: 'R' } });
    expect((await etab(r.json.id)).name).toHaveLength(120);
  });

  it('le nom du responsable n’est écrit que si le compte n’en a pas', async () => {
    const jeton = await creerCompte('sansnom@college.ch', { name: 'x' });
    (await base()).prepare("UPDATE users SET name = '  ' WHERE email = ?").run('sansnom@college.ch');
    await appeler(inscription, { method: 'POST', ip: ipNeuve(), token: jeton, body: { name: 'Collège', adminName: '  Jeanne  ' } });
    expect((await user('sansnom@college.ch')).name).toBe('Jeanne');
  });
});

describe('Scénarios alternatifs : unicité de l’adresse de reconnaissance', () => {
  it('A1 — adresse déjà revendiquée : l’école est créée SANS adresse, rien n’est volé', async () => {
    const adresse = ipNeuve();
    const voisine = await creerEtablissement({ name: 'Collège voisin', ips: `10.0.0.1, ${adresse}` });
    const jeton = await creerCompte('resp@college.ch');
    expect((await appeler(ip, { method: 'GET', ip: adresse })).json.revendiquee).toBe(true);

    const r = await appeler(inscription, { method: 'POST', ip: adresse, token: jeton, body: { name: 'Mon collège', adminName: 'R' } });
    expect(r.status).toBe(201);
    expect(r.json.ipRetenue).toBe('');
    expect((await etab(r.json.id)).ips).toBe('');
    expect(notifications[0].texte).toContain('(aucune — adresse absente ou déjà revendiquée)');
    // Les élèves de l'adresse restent à l'école voisine.
    expect((await appeler(accueil, { method: 'GET', ip: adresse })).json.ecole.name).toBe('Collège voisin');
    expect((await etab(voisine)).ips).toBe(`10.0.0.1, ${adresse}`);
  });

  it('A2 — dédoublonnage par forme canonique : IPv4 mappée et graphies IPv6 équivalentes', async () => {
    await creerEtablissement({ ips: '198.51.100.200, 2001:db8::7' });
    const j1 = await creerCompte('a@college.ch');
    const j2 = await creerCompte('b@college.ch');
    const r1 = await appeler(inscription, { method: 'POST', ip: '::ffff:198.51.100.200', token: j1, body: { name: 'X', adminName: 'A' } });
    expect(r1.json.ipRetenue).toBe('');
    const r2 = await appeler(inscription, { method: 'POST', ip: '2001:0DB8:0:0:0:0:0:7', token: j2, body: { name: 'Y', adminName: 'B' } });
    expect(r2.json.ipRetenue).toBe('');
  });

  it('A3 — l’adresse libre est enregistrée TELLE QUE vue (sans canonisation), pour être reconnue ensuite', async () => {
    const jeton = await creerCompte('resp@college.ch');
    const r = await appeler(inscription, { method: 'POST', ip: '::ffff:198.51.100.201', token: jeton, body: { name: 'Collège', adminName: 'R' } });
    expect(r.json.ipRetenue).toBe('::ffff:198.51.100.201');
    expect((await appeler(accueil, { method: 'GET', ip: '::ffff:198.51.100.201' })).json.ecole.name).toBe('Collège');
  });

  it('A4 — inscrire depuis le réseau d’une autre école (« mon établissement n’est pas celui-ci »)', async () => {
    const adresse = ipNeuve();
    await creerEtablissement({ name: 'École hôte', ips: adresse });
    const jeton = await creerCompte('visiteur@college.ch');
    const r = await appeler(inscription, { method: 'POST', ip: adresse, token: jeton, body: { name: 'Mon école', adminName: 'V' } });
    expect(r.status).toBe(201);
    expect((await user('visiteur@college.ch')).etablissement_id).toBe(r.json.id);
  });

  it('A5 — un compte simplement lié à une école (sans école principale) peut inscrire la sienne', async () => {
    const hote = await creerEtablissement();
    const jeton = await creerCompte('eleve@college.ch');
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,0,?)')
      .run('eleve@college.ch', hote, Date.now());
    const r = await appeler(inscription, { method: 'POST', ip: ipNeuve(), token: jeton, body: { name: 'École', adminName: 'E' } });
    expect(r.status).toBe(201);
  });
});

describe('Scénarios d’erreur', () => {
  it('sans jeton (ou jeton invalide) : 401 ERR_AUTH_REQUIRED', async () => {
    for (const token of [undefined, 'faux.jeton']) {
      const r = await appeler(inscription, { method: 'POST', ip: ipNeuve(), token, body: { name: 'X', adminName: 'Y' } });
      expect(r.status).toBe(401);
      expect(r.json.error.code).toBe('ERR_AUTH_REQUIRED');
    }
    expect(((await base()).prepare('SELECT COUNT(*) AS n FROM etablissements').get() as any).n).toBe(0);
  });

  it('nom d’école ou de responsable vide : 400', async () => {
    const jeton = await creerCompte('resp@college.ch');
    const a = await appeler(inscription, { method: 'POST', ip: ipNeuve(), token: jeton, body: { name: '   ', adminName: 'R' } });
    expect(a.status).toBe(400);
    expect(a.json.error.code).toBe('ERR_NAME_INVALID');
    const b = await appeler(inscription, { method: 'POST', ip: ipNeuve(), token: jeton, body: { name: 'Collège' } });
    expect(b.status).toBe(400);
    expect(b.json.error.code).toBe('ERR_ADMIN_NAME_INVALID');
  });

  it('compte déjà rattaché à une école principale : 409 ERR_ALREADY_ATTACHED, rien de créé', async () => {
    const existante = await creerEtablissement();
    const jeton = await creerCompte('prof@college.ch', { teacher: true, etablissementId: existante });
    const r = await appeler(inscription, { method: 'POST', ip: ipNeuve(), token: jeton, body: { name: 'Seconde', adminName: 'P' } });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ERR_ALREADY_ATTACHED');
    expect(((await base()).prepare('SELECT COUNT(*) AS n FROM etablissements').get() as any).n).toBe(1);
    expect(notifications).toHaveLength(0);
  });

  it('une seconde inscription par le même compte est refusée', async () => {
    const jeton = await creerCompte('resp@college.ch');
    expect((await appeler(inscription, { method: 'POST', ip: ipNeuve(), token: jeton, body: { name: 'A', adminName: 'R' } })).status).toBe(201);
    expect((await appeler(inscription, { method: 'POST', ip: ipNeuve(), token: jeton, body: { name: 'B', adminName: 'R' } })).status).toBe(409);
  });

  it('jeton valide mais compte effacé : 500 ERR_SIGNUP_FAILED et l’école est annulée (transaction)', async () => {
    const jeton = issueToken('Fantome', 'fantome@college.ch');
    const r = await appeler(inscription, { method: 'POST', ip: ipNeuve(), token: jeton, body: { name: 'Fantôme', adminName: 'F' } });
    expect(r.status).toBe(500);
    expect(r.json.error.code).toBe('ERR_SIGNUP_FAILED');
    expect(((await base()).prepare('SELECT COUNT(*) AS n FROM etablissements').get() as any).n).toBe(0);
    expect(notifications).toHaveLength(0);
  });

  it('plus de 3 tentatives par minute depuis un réseau : 429 ERR_RATE_LIMIT (refus en transaction compris)', async () => {
    const adresse = ipNeuve();
    const jeton = await creerCompte('resp@college.ch');
    // Tout ce qui atteint la transaction compte, qu'il aboutisse (201) ou non (409).
    expect((await appeler(inscription, { method: 'POST', ip: adresse, token: jeton, body: { name: 'A', adminName: 'R' } })).status).toBe(201);
    expect((await appeler(inscription, { method: 'POST', ip: adresse, token: jeton, body: { name: 'B', adminName: 'R' } })).status).toBe(409);
    expect((await appeler(inscription, { method: 'POST', ip: adresse, token: jeton, body: { name: 'C', adminName: 'R' } })).status).toBe(409);
    const autre = await creerCompte('autre@college.ch');
    const r = await appeler(inscription, { method: 'POST', ip: adresse, token: autre, body: { name: 'Collège', adminName: 'R' } });
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe('ERR_RATE_LIMIT');
  });

  it('corrigé : les saisies invalides (400) ne consomment pas le débit du réseau', async () => {
    const adresse = ipNeuve();
    const jeton = await creerCompte('resp@college.ch');
    for (let i = 0; i < 5; i++) {
      expect((await appeler(inscription, { method: 'POST', ip: adresse, token: jeton, body: { name: '' } })).status).toBe(400);
    }
    const r = await appeler(inscription, { method: 'POST', ip: adresse, token: jeton, body: { name: 'Collège', adminName: 'R' } });
    expect(r.status).toBe(201);
  });

  it('méthode autre que POST : 405', async () => {
    const r = await appeler(inscription, { method: 'GET', ip: ipNeuve() });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toEqual(['POST']);
  });
});

describe('Anomalie corrigée : /api/ip et l’inscription jugent « revendiquée » de la même façon', () => {
  it('une IPv4 mappée d’une adresse prise est annoncée revendiquée, et l’inscription l’écarte', async () => {
    await creerEtablissement({ ips: '198.51.100.210' });
    const jeton = await creerCompte('resp@college.ch');
    const vu = await appeler(ip, { method: 'GET', ip: '::ffff:198.51.100.210' });
    expect(vu.json.revendiquee).toBe(true); // forme canonique, comme l'inscription
    const r = await appeler(inscription, { method: 'POST', ip: '::ffff:198.51.100.210', token: jeton, body: { name: 'X', adminName: 'R' } });
    expect(r.json.ipRetenue).toBe('');
  });

  it('une graphie IPv6 équivalente est annoncée revendiquée', async () => {
    await creerEtablissement({ ips: '2001:db8::7' });
    const vu = await appeler(ip, { method: 'GET', ip: '2001:DB8:0:0:0:0:0:7' });
    expect(vu.json.revendiquee).toBe(true);
  });

  it('non-régression : une adresse libre est annoncée libre, et l’inscription la garde', async () => {
    await creerEtablissement({ ips: '198.51.100.211' });
    const jeton = await creerCompte('resp@college.ch');
    expect((await appeler(ip, { method: 'GET', ip: '198.51.100.212' })).json.revendiquee).toBe(false);
    const r = await appeler(inscription, { method: 'POST', ip: '198.51.100.212', token: jeton, body: { name: 'X', adminName: 'R' } });
    expect(r.json.ipRetenue).toBe('198.51.100.212');
  });
});
