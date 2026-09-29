// UC-06 — Tests unitaires : ce que le serveur sait d'un compte
// (src/server/accountData.ts : resumeConversations, collectAccountData,
// collectAccountExport).
import { describe, it, expect, beforeEach } from 'vitest';
import { viderBase, base, creerCompte, creerEtablissement, creerTuteur } from '../../helpers/db';
import { resumeConversations, collectAccountData, collectAccountExport } from '../../../src/server/accountData';
import { storeUserKey } from '../../../src/server/userKeys';
import { bouger, titulaireCompte } from '../../../src/server/porteMonnaie';

beforeEach(async () => { await viderBase(); });

describe('resumeConversations', () => {
  it('résume sans jamais rendre le contenu des messages, la plus récente d’abord', () => {
    const resumes = resumeConversations({
      conversations: {
        vieille: { name: 'Vieille', createdAt: 1, lastMessage: 10, messages: [{ role: 'user', content: 'secret' }] },
        recente: { name: 'Récente', createdAt: 2, lastMessage: 50, messages: [1, 2, 3], promptName: 'Socrate', promptVersion: 2 },
        sansDate: { name: 'Sans date', createdAt: 30, messages: [] },
      },
    });
    expect(resumes.map(r => r.id)).toEqual(['recente', 'sansDate', 'vieille']);
    expect(resumes[0]).toMatchObject({ name: 'Récente', messageCount: 3, promptName: 'Socrate', promptVersion: 2 });
    expect(resumes[0].bytes).toBeGreaterThan(0);
    expect(JSON.stringify(resumes)).not.toContain('secret');
  });

  it('résiste à un profil malformé venu d’un navigateur', () => {
    expect(resumeConversations(null)).toEqual([]);
    expect(resumeConversations({ conversations: 'texte' })).toEqual([]);
    const r = resumeConversations({
      conversations: { a: null, b: 42, ['x'.repeat(100)]: { name: 'n'.repeat(300), createdAt: 'hier', messages: 'pas un tableau' } },
    });
    expect(r).toHaveLength(1);
    expect(r[0].id).toHaveLength(64);
    expect(r[0].name).toHaveLength(200);
    expect(r[0].createdAt).toBe(0);
    expect(r[0].messageCount).toBe(0);
  });
});

describe('collectAccountData', () => {
  it('rassemble identité, quota, clés, modérations, conversations et tuteurs', async () => {
    const etab = await creerEtablissement({ name: 'Collège du Lac' });
    await creerCompte('ada@ecole.ch', { name: 'Ada', teacher: true, etablissementId: etab, schoolAdmin: true, syncOptin: true });
    const db = await base();
    const now = Date.now();
    db.prepare('UPDATE users SET keys_optin = 1 WHERE email = ?').run('ada@ecole.ch');
    const t1 = await creerTuteur({ name: 'Actif', authorEmail: 'ada@ecole.ch', body: 'a'.repeat(100) });
    await creerTuteur({ name: 'Archivé', authorEmail: 'ada@ecole.ch', body: 'b'.repeat(50), archived: true });
    db.prepare('INSERT INTO profiles (email, data, updated_at) VALUES (?, ?, ?)').run('ada@ecole.ch',
      JSON.stringify({ educhatProfile: 1, totalTokens: 1234, conversations: { c1: { name: 'Maths', createdAt: 1, messages: [] } } }), now);
    db.prepare('INSERT INTO profile_deletions (email, conversation_id, deleted_at) VALUES (?, ?, ?), (?, ?, ?)')
      .run('ada@ecole.ch', 'x1', now, 'ada@ecole.ch', 'x2', now);
    db.prepare("INSERT INTO comments (prompt_id, body, status, created_at, moderated_by) VALUES (?, 'ok', 'approved', ?, ?)").run(t1, now, 'ada@ecole.ch');
    // Journal : 100 jetons pilotés par Ada ; 500 jetons de clé interne ce mois ; 700 hors clé interne.
    db.prepare("INSERT INTO usage_log (ts, provider, teacher_email, etablissement_id, tokens, used_server_key) VALUES (?, 'openai', ?, ?, 100, 1)").run(now, 'ada@ecole.ch', etab);
    db.prepare("INSERT INTO usage_log (ts, provider, etablissement_id, tokens, used_server_key) VALUES (?, 'openai', ?, 400, 1)").run(now, etab);
    db.prepare("INSERT INTO usage_log (ts, provider, etablissement_id, tokens, used_server_key) VALUES (?, 'openai', ?, 700, 0)").run(now, etab);
    storeUserKey('ada@ecole.ch', 'openai', 'sk-secret-123');

    const d = collectAccountData('ada@ecole.ch');
    expect(d.identite).toMatchObject({
      email: 'ada@ecole.ch', name: 'Ada', isPromptagogue: true, isTeacher: true,
      isAdmin: true, isSuper: false, syncOptin: true, keysOptin: true,
    });
    expect(d.identite.verifiedAt).toBeGreaterThan(0);
    expect(d.consommation.declaredTokens).toBe(1234);
    expect(d.consommation.profileUpdatedAt).toBe(now);
    expect(d.consommation.quota).toEqual({ usedBytes: 100, maxBytes: 1024 * 1024 }); // archivé non compté
    expect(d.consommation.teacherPilotedTokens).toBe(100);
    expect(d.consommation.etablissement).toEqual({ id: etab, name: 'Collège du Lac', monthTokens: 500 });
    expect(d.keys).toEqual([{ provider: 'openai', updatedAt: expect.any(Number), readable: true }]);
    expect(JSON.stringify(d)).not.toContain('sk-secret-123');
    expect(d.moderations).toBe(1);
    expect(d.conversations.map(c => c.id)).toEqual(['c1']);
    expect(d.deletedConversations).toBe(2);
    expect(d.prompts.map(p => p.name).sort()).toEqual(['Actif', 'Archivé']);
    expect(d.prompts.find(p => p.name === 'Archivé')!.archived).toBe(true);
    expect(d.anonymousPromptsWarning).toBe(true);
  });

  it('un compte sans rien : valeurs nulles plutôt que des zéros inventés', async () => {
    await creerCompte('vide@ecole.ch');
    const d = collectAccountData('vide@ecole.ch');
    expect(d.consommation).toEqual({
      declaredTokens: null, profileUpdatedAt: null, quota: { usedBytes: 0, maxBytes: 1024 * 1024 },
      teacherPilotedTokens: null, etablissement: null,
    });
    expect(d.keys).toEqual([]);
    expect(d.conversations).toEqual([]);
    expect(d.porteMonnaie).toMatchObject({ ouvert: false, solde: 0, mouvements: [] });
  });

  it('un profil illisible n’empêche pas la lecture (date conservée)', async () => {
    await creerCompte('p@ecole.ch');
    (await base()).prepare('INSERT INTO profiles (email, data, updated_at) VALUES (?, ?, ?)').run('p@ecole.ch', '{pas du json', 77);
    const d = collectAccountData('p@ecole.ch');
    expect(d.conversations).toEqual([]);
    expect(d.consommation.profileUpdatedAt).toBe(77);
  });

  it('le super-administrateur est admin même sans école', async () => {
    await creerCompte('super@educh.at');
    expect(collectAccountData('super@educh.at').identite).toMatchObject({ isAdmin: true, isSuper: true });
  });

  it('le relevé du porte-monnaie est limité aux 50 derniers mouvements', async () => {
    await creerCompte('w@ecole.ch');
    for (let i = 0; i < 55; i++) bouger(titulaireCompte('w@ecole.ch'), 'recharge', 1, `r${i}`, 'test');
    const d = collectAccountData('w@ecole.ch');
    expect(d.porteMonnaie.ouvert).toBe(true);
    expect(d.porteMonnaie.solde).toBe(55);
    expect(d.porteMonnaie.mouvements).toHaveLength(50);
    expect(d.porteMonnaie.mouvements[0]).not.toHaveProperty('par');
  });
});

describe('collectAccountExport', () => {
  it('ajoute le contenu intégral : profil, corps des tuteurs, versions, modérations, relevé complet', async () => {
    await creerCompte('e@ecole.ch', { name: 'E' });
    const db = await base();
    const t = await creerTuteur({ name: 'Mon tuteur', authorEmail: 'e@ecole.ch', body: 'Corps v1' });
    db.prepare('INSERT INTO prompt_versions (prompt_id, version, body, created_at) VALUES (?, 2, ?, ?)').run(t, 'Corps v2', Date.now() + 1);
    db.prepare("INSERT INTO comments (prompt_id, body, status, created_at, moderated_at, moderated_by) VALUES (?, 'x', 'hidden', 1, 2, ?)").run(t, 'e@ecole.ch');
    db.prepare('INSERT INTO profiles (email, data, updated_at) VALUES (?, ?, 5)').run('e@ecole.ch',
      JSON.stringify({ educhatProfile: 1, conversations: { c: { name: 'C', messages: [{ role: 'user', content: 'bonjour' }] } } }));
    db.prepare("INSERT INTO usage_log (ts, ip, provider, teacher_email, tokens) VALUES (1, '203.0.113.9', 'openai', ?, 5)").run('e@ecole.ch');
    storeUserKey('e@ecole.ch', 'mistral', 'cle-mistral-secrete');
    for (let i = 0; i < 60; i++) bouger(titulaireCompte('e@ecole.ch'), 'recharge', 1, '', 'test');

    const x = collectAccountExport('e@ecole.ch');
    expect(x.educhatAccountExport).toBe(1);
    expect(x.identite.email).toBe('e@ecole.ch');
    expect(x.profilSynchronise.conversations.c.messages[0].content).toBe('bonjour');
    expect(x.profilMisAJour).toBe(5);
    expect(x.tuteurs).toEqual([{ name: 'Mon tuteur', language: 'fr', description: 'Description de Mon tuteur', body: 'Corps v1' }]);
    expect(x.versionsDesTuteurs.map(v => v.body)).toEqual(['Corps v2', 'Corps v1']);
    expect(x.versionsNonDetaillees).toEqual([]);
    expect(x.moderations).toEqual([{ id: expect.any(Number), promptId: t, status: 'hidden', moderatedAt: 2 }]);
    expect(x.porteMonnaie.mouvements).toHaveLength(60); // pas de plafond à 50 dans l'export
    expect(x.clesMemorisees).toEqual([{ provider: 'mistral', updatedAt: expect.any(Number), readable: true }]);
    const texte = JSON.stringify(x);
    expect(texte).not.toContain('cle-mistral-secrete');
    expect(texte).not.toContain('203.0.113.9'); // aucun journal de consommation
  });

  it('borne les versions à 8 Mo, les plus récentes d’abord, et dit ce qui a été laissé', async () => {
    await creerCompte('lourd@ecole.ch');
    const db = await base();
    const t = await creerTuteur({ name: 'Lourd', authorEmail: 'lourd@ecole.ch', body: 'v1', createdAt: 1 });
    const trois = 'x'.repeat(3 * 1024 * 1024);
    for (let v = 2; v <= 5; v++) {
      db.prepare('INSERT INTO prompt_versions (prompt_id, version, body, created_at) VALUES (?, ?, ?, ?)').run(t, v, trois, 1000 + v);
    }
    const x = collectAccountExport('lourd@ecole.ch');
    // 5 et 4 (6 Mo) passent ; 3 et 2 dépasseraient ; v1 (2 octets) passe encore.
    expect(x.versionsDesTuteurs.map(v => v.version)).toEqual([5, 4, 1]);
    expect(x.versionsNonDetaillees.map(v => v.version)).toEqual([3, 2]);
    expect(x.versionsNonDetaillees[0]).toMatchObject({ promptName: 'Lourd', bytes: 3 * 1024 * 1024 });
  });
});
