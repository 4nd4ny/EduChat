// UC-01 — Tests fonctionnels : « Consulter le catalogue des tuteurs ».
// Parcours de la page d'accueil (GET /api/prompts : tri, recherche, locale)
// puis de la fiche publique (GET /api/prompts/[name]), pour chacun des
// appelants que distingue la portée : visiteur de passage, élève sur le
// réseau d'une école (catalogue fermé ou ouvert), enseignant chez lui.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerEtablissement, creerCompte, creerTuteur } from '../../helpers/db';

// La fiche importe mail.ts (notifications de ses actions PATCH) : aucune
// n'est déclenchée ici, mais aucun envoi réel ne doit être possible.
vi.mock('../../../src/server/mail', () => ({
  notifyAdmin: vi.fn(),
  sendVerificationCode: vi.fn(async () => {}),
  sendEmailChangeCode: vi.fn(async () => {}),
  sendEmailChangeWarning: vi.fn(),
}));

import catalogue from '../../../src/pages/api/prompts/index';
import fiche from '../../../src/pages/api/prompts/[name]/index';
import { lierCompte } from '../../../src/server/appartenance';

// Chaque test a sa propre adresse IP « hors école » : la lecture n'est pas
// limitée en débit, mais on garde la discipline du modèle.
let n = 0;
const ipNeuve = () => `203.0.113.${++n}`;

const IP_ECOLE_A = '198.51.100.10';
const IP_ECOLE_B = '198.51.100.20';

beforeEach(async () => { await viderBase(); });

async function lister(query: Record<string, string> = {}, o: { ip?: string; token?: string; headers?: Record<string, string> } = {}) {
  const r = await appeler(catalogue, { method: 'GET', query, ip: o.ip ?? ipNeuve(), token: o.token, headers: o.headers });
  expect(r.status).toBe(200);
  return r;
}
const nomsDe = (r: { json: any }) => (r.json.prompts as Array<{ name: string }>).map(p => p.name);

/** Deux écoles, A (catalogue fermé) et B, et un tuteur de chaque sorte. */
async function paysage(o: { aOuvert?: boolean } = {}) {
  const a = await creerEtablissement({ name: 'Collège A', ips: IP_ECOLE_A, catalogueOuvert: o.aOuvert });
  const b = await creerEtablissement({ name: 'Collège B', ips: IP_ECOLE_B });
  await creerTuteur({ name: 'Plateforme' });
  await creerTuteur({ name: 'Reserve A', etablissementId: a });
  await creerTuteur({ name: 'Reserve B', etablissementId: b });
  await creerTuteur({ name: 'Partage B', etablissementId: b, publie: true });
  return { a, b };
}

describe('Scénario nominal : le visiteur parcourt le catalogue', () => {
  it('reçoit les tuteurs publiés, en cartes publiques, sans cache partagé', async () => {
    await creerTuteur({ name: 'Socrate', usage: 50, shareToken: 'f'.repeat(32) });
    await creerTuteur({ name: 'Brouillon', status: 'draft' });
    const r = await lister();
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(nomsDe(r)).toEqual(['Socrate']);
    const carte = r.json.prompts[0];
    expect(carte).toMatchObject({ name: 'Socrate', title: 'Socrate', usageCount: 50, ratingAvg: null });
    expect(r.text + JSON.stringify(r.json)).not.toContain('f'.repeat(32));
    expect(carte).not.toHaveProperty('body');
  });

  it('trie selon le paramètre sort (score par défaut)', async () => {
    await creerTuteur({ name: 'Zénon', usage: 1, createdAt: Date.now() });
    await creerTuteur({ name: 'Archimède', usage: 500, createdAt: Date.now() - 86_400_000 });
    expect(nomsDe(await lister())).toEqual(['Archimède', 'Zénon']);
    expect(nomsDe(await lister({ sort: 'name' }))).toEqual(['Archimède', 'Zénon']);
    expect(nomsDe(await lister({ sort: 'recent' }))).toEqual(['Zénon', 'Archimède']);
    expect(nomsDe(await lister({ sort: 'inconnu' }))).toEqual(['Archimède', 'Zénon']);
  });

  it('filtre par la recherche q (nom ou description)', async () => {
    await creerTuteur({ name: 'Pythagore', description: 'Géométrie' });
    await creerTuteur({ name: 'Molière', description: 'Théâtre' });
    expect(nomsDe(await lister({ q: '  géom  ' }))).toEqual(['Pythagore']);
    expect(nomsDe(await lister({ q: 'zzz' }))).toEqual([]);
  });

  it('sert titre et description dans la locale demandée, le nom restant canonique', async () => {
    const id = await creerTuteur({ name: 'Socrate', description: 'Pose des questions' });
    (await base()).prepare(`INSERT INTO prompt_translations (prompt_id, locale, name, description, body, auto, updated_at, source_version, state)
      VALUES (?, 'it', 'Socrate IT', 'Fa domande', 'Corpo tradotto del tutore.', 1, ?, 1, 'ok')`).run(id, Date.now());
    const it_ = await lister({ locale: 'it' });
    expect(it_.json.prompts[0]).toMatchObject({ name: 'Socrate', title: 'Socrate IT', description: 'Fa domande', translated: true });
    const fr = await lister({ locale: 'fr' });
    expect(fr.json.prompts[0]).toMatchObject({ title: 'Socrate', translated: false });
    // La recherche passe aussi par la traduction affichée.
    expect(nomsDe(await lister({ locale: 'it', q: 'domande' }))).toEqual(['Socrate']);
  });

  it('ouvre la fiche publique : corps, versions, filiation, états de traduction', async () => {
    const source = await creerTuteur({ name: 'Source' });
    const id = await creerTuteur({ name: 'Variante', body: 'Tu es Variante, tu questionnes sans jamais conclure.' });
    const db = await base();
    db.prepare('UPDATE prompts SET inspired_by = ? WHERE id = ?').run(source, id);
    const r = await appeler(fiche, { method: 'GET', query: { name: 'Variante' }, ip: ipNeuve() });
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.json.prompt).toMatchObject({
      name: 'Variante', body: 'Tu es Variante, tu questionnes sans jamais conclure.',
      inspiredBy: 'Source', variants: [],
    });
    expect(r.json.prompt.translations.map((t: any) => t.locale)).toEqual(['en', 'it', 'de']);
    expect(r.json.versions).toHaveLength(1);
    expect(r.json.versions[0].version).toBe(1);
    const src = await appeler(fiche, { method: 'GET', query: { name: 'Source' }, ip: ipNeuve() });
    expect(src.json.prompt.variants).toEqual(['Variante']);
    expect(src.json.prompt.inspiredBy).toBeNull();
  });

  it('la fiche sert le corps traduit frais dans la locale demandée', async () => {
    const id = await creerTuteur({ name: 'Socrate' });
    (await base()).prepare(`INSERT INTO prompt_translations (prompt_id, locale, name, description, body, auto, updated_at, source_version, state)
      VALUES (?, 'en', 'Socrates', 'Asks', 'You are Socrates, never give the answer.', 1, ?, 1, 'ok')`).run(id, Date.now());
    const r = await appeler(fiche, { method: 'GET', query: { name: 'Socrate', locale: 'en' }, ip: ipNeuve() });
    expect(r.json.prompt).toMatchObject({ name: 'Socrate', title: 'Socrates', body: 'You are Socrates, never give the answer.' });
  });
});

describe('Scénarios alternatifs : la portée de l’appelant', () => {
  it('visiteur hors école : plateforme et tuteurs partagés, jamais les réservés', async () => {
    await paysage();
    expect(nomsDe(await lister({ sort: 'name' }))).toEqual(['Partage B', 'Plateforme']);
  });

  it('élève sur le réseau d’une école au catalogue fermé : plateforme et tuteurs de son école', async () => {
    await paysage();
    expect(nomsDe(await lister({ sort: 'name' }, { ip: IP_ECOLE_A }))).toEqual(['Plateforme', 'Reserve A']);
  });

  it('élève sur le réseau d’une école au catalogue ouvert : s’y ajoutent les partagés du dehors', async () => {
    await paysage({ aOuvert: true });
    expect(nomsDe(await lister({ sort: 'name' }, { ip: IP_ECOLE_A }))).toEqual(['Partage B', 'Plateforme', 'Reserve A']);
  });

  it('une école voit toujours ses propres tuteurs, partagés ou non', async () => {
    await paysage();
    expect(nomsDe(await lister({ sort: 'name' }, { ip: IP_ECOLE_B }))).toEqual(['Partage B', 'Plateforme', 'Reserve B']);
  });

  it('enseignant identifié chez lui : les réservés de son école ET les publics du monde', async () => {
    const { a } = await paysage();
    const jeton = await creerCompte('prof@a.ch', { teacher: true, etablissementId: a });
    expect(nomsDe(await lister({ sort: 'name' }, { token: jeton }))).toEqual(['Partage B', 'Plateforme', 'Reserve A']);
    // Et sa fiche lui est ouverte, avec le jeton.
    const r = await appeler(fiche, { method: 'GET', query: { name: 'Reserve A' }, token: jeton, ip: ipNeuve() });
    expect(r.status).toBe(200);
  });

  it('un simple membre rattaché par l’IP n’emporte pas son école chez lui', async () => {
    const { a } = await paysage();
    const jeton = await creerCompte('eleve@a.ch', { teacher: true });
    lierCompte('eleve@a.ch', a);
    expect(nomsDe(await lister({ sort: 'name' }, { token: jeton }))).toEqual(['Partage B', 'Plateforme']);
  });

  it('annoncer l’école d’autrui (x-educhat-ecole) ne donne rien de plus', async () => {
    const { a, b } = await paysage();
    const jeton = await creerCompte('prof@a.ch', { teacher: true, etablissementId: a });
    const r = await lister({ sort: 'name' }, { token: jeton, headers: { 'x-educhat-ecole': String(b) } });
    expect(nomsDe(r)).toEqual(['Partage B', 'Plateforme', 'Reserve A']);
  });

  it('la filiation ne trahit pas le nom d’un tuteur réservé à une autre école', async () => {
    const { b } = await paysage();
    const db = await base();
    const reserveB = (db.prepare("SELECT id FROM prompts WHERE name = 'Reserve B'").get() as any).id;
    const plat = (db.prepare("SELECT id FROM prompts WHERE name = 'Plateforme'").get() as any).id;
    db.prepare('UPDATE prompts SET inspired_by = ? WHERE id = ?').run(reserveB, plat);
    const dehors = await appeler(fiche, { method: 'GET', query: { name: 'Plateforme' }, ip: ipNeuve() });
    expect(dehors.json.prompt.inspiredBy).toBeNull();
    const chezB = await appeler(fiche, { method: 'GET', query: { name: 'Plateforme' }, ip: IP_ECOLE_B });
    expect(chezB.json.prompt.inspiredBy).toBe('Reserve B');
    expect(b).toBeGreaterThan(0);
  });
});

describe('Scénarios d’erreur', () => {
  it('fiche inconnue, brouillon, dépubliée, archivée ou réservée ailleurs : 404 indistinct', async () => {
    await paysage();
    await creerTuteur({ name: 'Brouillon', status: 'draft' });
    await creerTuteur({ name: 'Retire', status: 'retired' });
    await creerTuteur({ name: 'Archive', archived: true });
    for (const name of ['Inconnu', 'Brouillon', 'Retire', 'Archive', 'Reserve A']) {
      const r = await appeler(fiche, { method: 'GET', query: { name }, ip: ipNeuve() });
      expect(r.status).toBe(404);
      expect(r.json.error.code).toBe('ERR_PROMPT_UNKNOWN');
    }
  });

  it('refuse les méthodes non prévues', async () => {
    const r = await appeler(catalogue, { method: 'PUT', ip: ipNeuve() });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toEqual(['GET', 'POST']);
    const f = await appeler(fiche, { method: 'PUT', query: { name: 'X' }, ip: ipNeuve() });
    expect(f.status).toBe(405);
    expect(f.headers.allow).toEqual(['GET', 'PATCH', 'DELETE']);
  });
});
