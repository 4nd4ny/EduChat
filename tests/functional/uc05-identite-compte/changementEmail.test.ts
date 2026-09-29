// UC-05 — Tests fonctionnels : « Changer d'adresse email » (POST/PUT
// /api/me/email). Le code part vers la NOUVELLE adresse, l'avertissement vers
// l'ANCIENNE ; la confirmation migre le compte dans toutes les tables. Seul
// l'envoi des courriels est doublé, pour capturer le code.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerCompte, creerEtablissement, creerTuteur } from '../../helpers/db';

const codes: Array<{ email: string; code: string }> = [];
const avertissements: Array<{ ancien: string; nouveau: string }> = [];
vi.mock('../../../src/server/mail', () => ({
  sendEmailChangeCode: vi.fn(async (email: string, code: string) => { codes.push({ email, code }); }),
  sendEmailChangeWarning: vi.fn((ancien: string, nouveau: string) => { avertissements.push({ ancien, nouveau }); }),
  sendVerificationCode: vi.fn(async () => {}),
  notifyAdmin: vi.fn(),
}));

import changerEmail from '../../../src/pages/api/me/email';
import me from '../../../src/pages/api/me';
import { verifyToken } from '../../../src/server/token';

// Le limiteur « email-change » admet 5 appels par minute et par IP.
let n = 0;
const ipNeuve = () => `198.18.5.${++n}`;

beforeEach(async () => {
  await viderBase();
  codes.length = 0;
  avertissements.length = 0;
});

async function demander(jeton: string, newEmail: string, ip = ipNeuve()) {
  return appeler(changerEmail, { method: 'POST', token: jeton, body: { newEmail }, ip });
}
async function confirmer(jeton: string, code: string, ip = ipNeuve()) {
  return appeler(changerEmail, { method: 'PUT', token: jeton, body: { code }, ip });
}

describe('Scénario nominal : changement d’adresse confirmé', () => {
  it('envoie le code à la nouvelle adresse et avertit l’ancienne', async () => {
    const jeton = await creerCompte('ancien@ecole.ch');
    const r = await demander(jeton, '  Nouveau@Ecole.CH ');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true });
    expect(codes).toHaveLength(1);
    expect(codes[0].email).toBe('nouveau@ecole.ch');
    expect(codes[0].code).toMatch(/^\d{3}-\d{3}$/);
    expect(avertissements).toEqual([{ ancien: 'ancien@ecole.ch', nouveau: 'nouveau@ecole.ch' }]);
    // Seul le hash du code est conservé.
    const ligne = (await base()).prepare('SELECT * FROM email_changes WHERE old_email=?').get('ancien@ecole.ch') as any;
    expect(ligne.new_email).toBe('nouveau@ecole.ch');
    expect(ligne.code_hash).not.toContain(codes[0].code);
    expect(ligne.expires_at - Date.now()).toBeGreaterThan(14 * 60_000);
  });

  it('migre le compte dans toutes les tables et délivre un nouveau jeton', async () => {
    const etab = await creerEtablissement({ name: 'Collège du Lac' });
    const jeton = await creerCompte('ancien@ecole.ch', { name: 'Ada', etablissementId: etab, schoolAdmin: true });
    const db = await base();
    const now = Date.now();
    const tuteur = await creerTuteur({ name: 'Tuteur-A', authorEmail: 'ancien@ecole.ch' });
    db.prepare('INSERT INTO profiles (email, data, updated_at) VALUES (?, ?, ?)').run('ancien@ecole.ch', '{"educhatProfile":1}', now);
    db.prepare('INSERT INTO profile_deletions (email, conversation_id, deleted_at) VALUES (?, ?, ?)').run('ancien@ecole.ch', 'c1', now);
    db.prepare('INSERT INTO user_keys (email, provider, key_enc, updated_at) VALUES (?, ?, ?, ?)').run('ancien@ecole.ch', 'openai', 'x', now);
    db.prepare("INSERT INTO usage_log (ts, provider, teacher_email) VALUES (?, 'openai', ?)").run(now, 'ancien@ecole.ch');
    db.prepare('INSERT INTO session_settings (etablissement_id, set_by_email, expires_at) VALUES (?, ?, ?)').run(etab, 'ancien@ecole.ch', now + 1e6);
    db.prepare("INSERT INTO comments (prompt_id, body, status, created_at, moderated_by) VALUES (?, 'Bravo', 'approved', ?, ?)").run(tuteur, now, 'ancien@ecole.ch');
    db.prepare("INSERT INTO facture_mentions (etablissement_id, periode, par) VALUES (?, '2026-09', ?)").run(etab, 'ancien@ecole.ch');

    await demander(jeton, 'nouveau@ecole.ch');
    const r = await confirmer(jeton, codes[0].code);
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(r.json.email).toBe('nouveau@ecole.ch');
    const charge = verifyToken(r.json.token)!;
    expect(charge.email).toBe('nouveau@ecole.ch');
    expect(charge.name).toBe('Ada');

    const compter = (sql: string, email: string) => (db.prepare(sql).get(email) as { n: number }).n;
    const requetes = [
      'SELECT COUNT(*) AS n FROM users WHERE email = ?',
      'SELECT COUNT(*) AS n FROM profiles WHERE email = ?',
      'SELECT COUNT(*) AS n FROM profile_deletions WHERE email = ?',
      'SELECT COUNT(*) AS n FROM user_keys WHERE email = ?',
      'SELECT COUNT(*) AS n FROM prompts WHERE author_email = ?',
      'SELECT COUNT(*) AS n FROM usage_log WHERE teacher_email = ?',
      'SELECT COUNT(*) AS n FROM session_settings WHERE set_by_email = ?',
      'SELECT COUNT(*) AS n FROM comments WHERE moderated_by = ?',
      'SELECT COUNT(*) AS n FROM user_etablissements WHERE email = ?',
      'SELECT COUNT(*) AS n FROM facture_mentions WHERE par = ?',
    ];
    for (const sql of requetes) {
      expect(compter(sql, 'ancien@ecole.ch'), sql).toBe(0);
      expect(compter(sql, 'nouveau@ecole.ch'), sql).toBe(1);
    }
    // Le rang d'administrateur d'école suit la personne.
    expect((db.prepare('SELECT is_admin FROM user_etablissements WHERE email=?').get('nouveau@ecole.ch') as any).is_admin).toBe(1);
    // La demande est consommée.
    expect(db.prepare('SELECT 1 FROM email_changes').get()).toBeUndefined();

    // Le nouveau jeton ouvre le compte ; l'ancien ne peut plus rien demander.
    const moi = await appeler(me, { token: r.json.token });
    expect(moi.json.email).toBe('nouveau@ecole.ch');
    expect(moi.json.ecoles[0]).toMatchObject({ id: etab, isAdmin: true });
    const vieux = await demander(jeton, 'autre@ecole.ch');
    expect(vieux.status).toBe(401);
  });

  it('une nouvelle demande remplace la précédente (un seul code valide)', async () => {
    const jeton = await creerCompte('a@ecole.ch');
    await demander(jeton, 'b@ecole.ch');
    await demander(jeton, 'c@ecole.ch');
    const premier = codes[0].code;
    const second = codes[1].code;
    if (premier !== second) {
      const r = await confirmer(jeton, premier);
      expect(r.status).toBe(403);
    }
    const ok = await confirmer(jeton, second);
    expect(ok.json.email).toBe('c@ecole.ch');
  });
});

describe('Scénarios d’erreur à la demande', () => {
  it('adresse invalide, identique ou déjà prise', async () => {
    const jeton = await creerCompte('a@ecole.ch');
    await creerCompte('pris@ecole.ch');
    const invalide = await demander(jeton, 'pas-une-adresse');
    expect(invalide.status).toBe(400);
    expect(invalide.json.error.code).toBe('ERR_EMAIL_INVALID');
    const meme = await demander(jeton, 'A@Ecole.ch');
    expect(meme.status).toBe(400);
    expect(meme.json.error.code).toBe('ERR_EMAIL_SAME');
    const prise = await demander(jeton, 'pris@ecole.ch');
    expect(prise.status).toBe(409);
    expect(prise.json.error.code).toBe('ERR_EMAIL_TAKEN');
    expect(codes).toHaveLength(0);
    expect(avertissements).toHaveLength(0);
  });

  it('refuse sans jeton, ou pour un compte absent de la base', async () => {
    const { issueToken } = await import('../../../src/server/token');
    expect((await appeler(changerEmail, { method: 'POST', body: { newEmail: 'x@y.ch' }, ip: ipNeuve() })).status).toBe(401);
    const r = await demander(issueToken('X', 'inconnu@ecole.ch'), 'x@y.ch');
    expect(r.status).toBe(401);
    expect(r.json.error.code).toBe('ERR_AUTH_REQUIRED');
  });

  it('au-delà de 5 appels par minute depuis une IP : 429', async () => {
    const jeton = await creerCompte('a@ecole.ch');
    const ip = ipNeuve();
    for (let i = 0; i < 5; i++) expect((await demander(jeton, `n${i}@ecole.ch`, ip)).status).toBe(200);
    const r = await demander(jeton, 'n9@ecole.ch', ip);
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe('ERR_RATE_LIMIT');
  });

  it('refuse les méthodes autres que POST et PUT', async () => {
    const jeton = await creerCompte('a@ecole.ch');
    const r = await appeler(changerEmail, { method: 'GET', token: jeton, ip: ipNeuve() });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toEqual(['POST', 'PUT']);
  });
});

describe('Scénarios d’erreur à la confirmation', () => {
  it('aucune demande en cours : 404', async () => {
    const jeton = await creerCompte('a@ecole.ch');
    const r = await confirmer(jeton, '123-456');
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe('ERR_CODE_UNKNOWN');
  });

  it('code faux : 403, puis blocage après 5 essais même avec le bon code', async () => {
    const jeton = await creerCompte('a@ecole.ch');
    await demander(jeton, 'b@ecole.ch');
    const bon = codes[0].code;
    const faux = bon === '100-100' ? '200-200' : '100-100';
    for (let i = 0; i < 5; i++) {
      const r = await confirmer(jeton, faux);
      expect(r.status).toBe(403);
      expect(r.json.error.code).toBe('ERR_CODE_INVALID');
    }
    const bloque = await confirmer(jeton, bon);
    expect(bloque.status).toBe(429);
    expect(bloque.json.error.code).toBe('ERR_TOO_MANY_ATTEMPTS');
    expect((await base()).prepare('SELECT 1 FROM users WHERE email=?').get('a@ecole.ch')).toBeDefined();
  });

  it('le code se recopie avec ou sans tiret, avec des espaces (même normalisation que /api/verify)', async () => {
    // Anomalie corrigée : « 123456 » ou « 123 456 » ne comptent plus comme un essai faux.
    const jeton = await creerCompte('a@ecole.ch');
    await demander(jeton, 'b@ecole.ch');
    const chiffres = codes[0].code.replace('-', '');
    // Un code de bonne forme mais faux compte toujours comme un essai.
    const faux = chiffres === '100100' ? '200 200' : '100 100';
    expect((await confirmer(jeton, faux)).status).toBe(403);
    const essais = (await base()).prepare('SELECT attempts FROM email_changes').get() as any;
    expect(essais.attempts).toBe(1);
    const r = await confirmer(jeton, `${chiffres.slice(0, 3)} ${chiffres.slice(3)}`);
    expect(r.status).toBe(200);
    expect(r.json.email).toBe('b@ecole.ch');
  });

  it('les formes « 123456 » et «  123-456  » sont acceptées elles aussi', async () => {
    for (const forme of [(c: string) => c.replace('-', ''), (c: string) => `  ${c} `]) {
      await viderBase();
      codes.length = 0;
      const jeton = await creerCompte('a@ecole.ch');
      await demander(jeton, 'b@ecole.ch');
      expect((await confirmer(jeton, forme(codes[0].code))).status).toBe(200);
    }
  });

  it('code expiré : 410 et la demande est effacée', async () => {
    const jeton = await creerCompte('a@ecole.ch');
    await demander(jeton, 'b@ecole.ch');
    const db = await base();
    db.prepare('UPDATE email_changes SET expires_at = ?').run(Date.now() - 1);
    const r = await confirmer(jeton, codes[0].code);
    expect(r.status).toBe(410);
    expect(r.json.error.code).toBe('ERR_CODE_EXPIRED');
    expect(db.prepare('SELECT 1 FROM email_changes').get()).toBeUndefined();
  });

  it('adresse prise entre la demande et la confirmation : 409, rien ne bouge', async () => {
    const jeton = await creerCompte('a@ecole.ch');
    await demander(jeton, 'b@ecole.ch');
    await creerCompte('b@ecole.ch');
    const r = await confirmer(jeton, codes[0].code);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ERR_EMAIL_TAKEN');
    expect((await base()).prepare('SELECT 1 FROM users WHERE email=?').get('a@ecole.ch')).toBeDefined();
  });

  it('un lien d’école déjà posé sur la nouvelle adresse annule TOUTE la migration', async () => {
    const etab = await creerEtablissement();
    const jeton = await creerCompte('a@ecole.ch', { etablissementId: etab });
    await creerTuteur({ name: 'T', authorEmail: 'a@ecole.ch' });
    await demander(jeton, 'b@ecole.ch');
    const db = await base();
    // Lien orphelin (sans ligne users) sur l'adresse visée.
    db.prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?, ?, 0, 0)').run('b@ecole.ch', etab);
    // La violation de clé primaire remonte en exception (500 en production).
    await expect(confirmer(jeton, codes[0].code)).rejects.toThrow();
    expect(db.prepare('SELECT 1 FROM users WHERE email=?').get('a@ecole.ch')).toBeDefined();
    expect(db.prepare('SELECT 1 FROM users WHERE email=?').get('b@ecole.ch')).toBeUndefined();
    expect((db.prepare('SELECT author_email FROM prompts WHERE name=?').get('T') as any).author_email).toBe('a@ecole.ch');
  });
});

describe('Non-régression : le porte-monnaie personnel suit la personne', () => {
  it('le solde, le relevé, les recharges et les traces « par » suivent la nouvelle adresse', async () => {
    // Anomalie corrigée : titulaire_email et les colonnes de traçabilité sont migrés.
    const jeton = await creerCompte('a@ecole.ch', { solde: 12 });
    const etab = await creerEtablissement();
    const db = await base();
    db.prepare(`INSERT INTO credit_mouvements (etablissement_id, titulaire_email, ts, genre, montant, solde, detail, par)
                VALUES (0, ?, ?, 'recharge', 12, 12, '', 'paypal')`).run('a@ecole.ch', Date.now());
    // Mouvement de l'ÉCOLE saisi par la personne : seule la trace « par » la désigne.
    db.prepare(`INSERT INTO credit_mouvements (etablissement_id, titulaire_email, ts, genre, montant, solde, detail, par)
                VALUES (?, NULL, ?, 'ajustement', 3, 3, '', ?)`).run(etab, Date.now(), 'a@ecole.ch');
    db.prepare(`INSERT INTO recharges (order_id, etablissement_id, titulaire_email, montant, cree_at, par)
                VALUES ('ORD-1', 0, ?, 5, ?, ?)`).run('a@ecole.ch', Date.now(), 'a@ecole.ch');
    await creerCompte('eleve@ecole.ch');
    db.prepare('UPDATE users SET adult_verified_by = ? WHERE email = ?').run('a@ecole.ch', 'eleve@ecole.ch');
    await demander(jeton, 'b@ecole.ch');
    expect((await confirmer(jeton, codes[0].code)).status).toBe(200);

    expect((db.prepare('SELECT solde FROM users WHERE email=?').get('b@ecole.ch') as any).solde).toBe(12);
    expect(db.prepare('SELECT COUNT(*) AS n FROM credit_mouvements WHERE titulaire_email=?').get('b@ecole.ch')).toEqual({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM credit_mouvements WHERE titulaire_email=?').get('a@ecole.ch')).toEqual({ n: 0 });
    // La recharge EN ATTENTE créditera la nouvelle adresse au retour de PayPal.
    expect(db.prepare('SELECT titulaire_email, par, etat FROM recharges WHERE order_id=?').get('ORD-1'))
      .toEqual({ titulaire_email: 'b@ecole.ch', par: 'b@ecole.ch', etat: 'attente' });
    // Traces de saisie : l'adresse migre, les valeurs techniques (« paypal ») ne bougent pas.
    expect(db.prepare("SELECT COUNT(*) AS n FROM credit_mouvements WHERE par = 'a@ecole.ch'").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM credit_mouvements WHERE par = 'b@ecole.ch'").get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM credit_mouvements WHERE par = 'paypal'").get()).toEqual({ n: 1 });
    expect((db.prepare('SELECT adult_verified_by FROM users WHERE email=?').get('eleve@ecole.ch') as any).adult_verified_by).toBe('b@ecole.ch');
  });
});
