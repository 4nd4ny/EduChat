// UC-10 — Tests fonctionnels : « Modérer le cycle de vie d'un tuteur ».
// Enchaîne les vraies routes PATCH/DELETE /api/prompts/[name],
// GET /api/admin/prompts et, pour constater l'effet des gestes, le catalogue
// (GET /api/prompts) et la fiche (GET /api/prompts/[name]). La traduction
// lancée à la publication part sans clé Anthropic (aucune en test) : elle
// échoue en silence, et le réseau est de toute façon doublé.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appeler } from '../../helpers/api';
import { viderBase, base, creerCompte, creerEtablissement, creerTuteur } from '../../helpers/db';
import { doublerFetch } from '../../helpers/fetch';

const notifications: string[] = [];
vi.mock('../../../src/server/mail', () => ({
  notifyAdmin: vi.fn((sujet: string) => { notifications.push(sujet); }),
  sendVerificationCode: vi.fn(async () => {}),
  sendEmailChangeCode: vi.fn(async () => {}),
  sendEmailChangeWarning: vi.fn(() => {}),
}));

import catalogue from '../../../src/pages/api/prompts/index';
import tuteur from '../../../src/pages/api/prompts/[name]/index';
import brouillon from '../../../src/pages/api/drafts/[token]';
import listeAdmin from '../../../src/pages/api/admin/prompts';

let n = 0;
const ipNeuve = () => `203.0.113.${++n}`;
const CORPS_2 = 'Tu es Socrate, version revue. Une seule question à la fois, jamais la réponse.';

let reseau: ReturnType<typeof doublerFetch>;
beforeEach(async () => {
  await viderBase();
  notifications.length = 0;
  reseau = doublerFetch(() => { throw new Error('aucun appel réseau attendu'); });
});

/** Laisse la traduction d'arrière-plan (lancée par approve/republish) se terminer. */
const laisserFinir = () => new Promise(r => setTimeout(r, 20));

async function agir(nom: string, body: Record<string, unknown>, token?: string, headers?: Record<string, string>) {
  const r = await appeler(tuteur, { method: 'PATCH', query: { name: nom }, body, token, headers, ip: ipNeuve() });
  await laisserFinir();
  return r;
}

async function statut(nom: string) {
  return ((await base()).prepare('SELECT status FROM prompts WHERE name = ?').get(nom) as any)?.status;
}

async function nomsDuCatalogue(ip = ipNeuve(), token?: string) {
  const r = await appeler(catalogue, { query: { sort: 'name' }, ip, token });
  return r.json.prompts.map((p: any) => p.name);
}

describe('Scénario nominal : approuver, dépublier, republier', () => {
  it('le super-administrateur valide un tuteur soumis, qui entre au catalogue', async () => {
    const sup = await creerCompte('super@educh.at');
    await creerTuteur({ name: 'Socrate', status: 'pending', authorEmail: 'auteur@x.ch' });
    expect(await nomsDuCatalogue()).toEqual([]);

    const r = await agir('Socrate', { action: 'approve' }, sup);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, status: 'published' });
    expect(await nomsDuCatalogue()).toEqual(['Socrate']);
    const fiche = await appeler(tuteur, { query: { name: 'Socrate' }, ip: ipNeuve() });
    expect(fiche.status).toBe(200);
    // Traduction planifiée en arrière-plan : sans clé, elle échoue sans bloquer.
    expect(reseau).not.toHaveBeenCalled();
    const etats = (await base()).prepare('SELECT state FROM prompt_translations').all() as any[];
    expect(etats.map(e => e.state)).toEqual(['failed', 'failed', 'failed']);
  });

  it('l’auteur dépublie son tuteur puis le republie ; rien n’est supprimé', async () => {
    const auteur = await creerCompte('auteur@x.ch');
    await creerTuteur({ name: 'Socrate', status: 'published', authorEmail: 'auteur@x.ch' });

    const retrait = await agir('Socrate', { action: 'retire' }, auteur);
    expect(retrait.json).toEqual({ ok: true, status: 'retired' });
    expect(await nomsDuCatalogue()).toEqual([]);
    expect((await appeler(tuteur, { query: { name: 'Socrate' }, ip: ipNeuve() })).status).toBe(404);
    expect(await statut('Socrate')).toBe('retired');

    const retour = await agir('Socrate', { action: 'republish' }, auteur);
    expect(retour.json).toEqual({ ok: true, status: 'published' });
    expect(await nomsDuCatalogue()).toEqual(['Socrate']);
  });
});

describe('Scénario alternatif : qui peut approuver', () => {
  it('un promptagogue vérifié approuve ce qui est soumis, pas un brouillon', async () => {
    const pg = await creerCompte('pg@x.ch');
    await creerTuteur({ name: 'Soumis', status: 'pending' });
    await creerTuteur({ name: 'Brouillon', status: 'draft' });
    expect((await agir('Soumis', { action: 'approve' }, pg)).status).toBe(200);
    const r = await agir('Brouillon', { action: 'approve' }, pg);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ERR_STATUS');
  });

  it('le super-administrateur peut publier directement un brouillon', async () => {
    const sup = await creerCompte('super@educh.at');
    await creerTuteur({ name: 'Brouillon', status: 'draft' });
    expect((await agir('Brouillon', { action: 'approve' }, sup)).json.status).toBe('published');
  });

  it('un enseignant non promptagogue valide les tuteurs soumis de SON école seulement', async () => {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    const prof = await creerCompte('prof@a.ch', { teacher: true, promptagogue: false, etablissementId: a });
    await creerTuteur({ name: 'Chez A', status: 'pending', etablissementId: a });
    await creerTuteur({ name: 'Chez B', status: 'pending', etablissementId: b });
    await creerTuteur({ name: 'Plateforme', status: 'pending' });
    expect((await agir('Chez A', { action: 'approve' }, prof)).status).toBe(200);
    expect((await agir('Chez B', { action: 'approve' }, prof)).status).toBe(403);
    expect((await agir('Plateforme', { action: 'approve' }, prof)).status).toBe(403);
  });

  it('un compte sans rôle ou un anonyme ne valide rien', async () => {
    const simple = await creerCompte('simple@x.ch', { promptagogue: false });
    await creerTuteur({ name: 'Socrate', status: 'pending' });
    for (const jeton of [simple, undefined]) {
      const r = await agir('Socrate', { action: 'approve' }, jeton);
      expect(r.status).toBe(403);
      expect(r.json.error.code).toBe('ERR_FORBIDDEN');
    }
  });

  // Comportement ACTUEL (voir « Anomalies constatées ») : tout compte vérifié
  // est promptagogue, et un promptagogue valide ce qui est soumis — y compris
  // son propre tuteur. La modération a priori se contourne donc en deux gestes.
  it('un auteur promptagogue peut soumettre puis approuver son propre tuteur', async () => {
    const auteur = await creerCompte('auteur@x.ch');
    await creerTuteur({ name: 'Socrate', status: 'draft', authorEmail: 'auteur@x.ch' });
    expect((await agir('Socrate', { action: 'submit' }, auteur)).status).toBe(200);
    expect((await agir('Socrate', { action: 'approve' }, auteur)).status).toBe(200);
    expect(await statut('Socrate')).toBe('published');
  });
});

describe('Scénario alternatif : dépublier et republier — droits et états', () => {
  it('le super-administrateur peut dépublier et republier n’importe quel tuteur', async () => {
    const sup = await creerCompte('super@educh.at');
    await creerTuteur({ name: 'Socrate', status: 'published', authorEmail: 'auteur@x.ch' });
    expect((await agir('Socrate', { action: 'retire' }, sup)).status).toBe(200);
    expect((await agir('Socrate', { action: 'republish' }, sup)).status).toBe(200);
  });

  it('ni un tiers, ni l’administrateur ou l’enseignant de l’école propriétaire, ni l’URL secrète ne dépublient', async () => {
    const a = await creerEtablissement();
    const tiers = await creerCompte('tiers@x.ch');
    const adm = await creerCompte('admin@a.ch', { schoolAdmin: true, etablissementId: a });
    const prof = await creerCompte('prof@a.ch', { teacher: true, etablissementId: a });
    await creerTuteur({ name: 'Socrate', status: 'published', etablissementId: a, shareToken: 'e'.repeat(32) });
    for (const [jeton, extra] of [[tiers, {}], [adm, {}], [prof, {}], [undefined, { shareToken: 'e'.repeat(32) }]] as const) {
      const r = await agir('Socrate', { action: 'retire', ...extra }, jeton);
      expect(r.status).toBe(403);
    }
    expect(await statut('Socrate')).toBe('published');
  });

  it('on ne dépublie qu’un tuteur publié, on ne republie qu’un tuteur dépublié', async () => {
    const sup = await creerCompte('super@educh.at');
    await creerTuteur({ name: 'Attente', status: 'pending' });
    await creerTuteur({ name: 'Publié', status: 'published' });
    expect((await agir('Attente', { action: 'retire' }, sup)).json.error.code).toBe('ERR_STATUS');
    expect((await agir('Attente', { action: 'republish' }, sup)).json.error.code).toBe('ERR_STATUS');
    expect((await agir('Publié', { action: 'republish' }, sup)).status).toBe(409);
  });
});

describe('Scénario alternatif : archiver (jamais supprimer)', () => {
  it('le super archive un tuteur dépublié : figé, hors administration, hors URL secrète, mais toujours en base', async () => {
    const sup = await creerCompte('super@educh.at');
    const id = await creerTuteur({ name: 'Refusé', status: 'pending', shareToken: 'f'.repeat(32), usage: 12 });
    const r = await agir('Refusé', { action: 'archive' }, sup);
    expect(r.json).toEqual({ ok: true, archived: true });

    const liste = await appeler(listeAdmin, { token: sup });
    expect(liste.json.prompts.map((p: any) => p.name)).not.toContain('Refusé');
    expect((await appeler(brouillon, { query: { token: 'f'.repeat(32) } })).status).toBe(404);
    for (const action of ['approve', 'edit', 'republish', 'archive']) {
      const x = await agir('Refusé', { action, body: CORPS_2 }, sup);
      expect(x.status).toBe(409);
      expect(x.json.error.code).toBe('ERR_ARCHIVED');
    }
    const ligne = (await base()).prepare('SELECT * FROM prompts WHERE id = ?').get(id) as any;
    expect(ligne).toMatchObject({ archived: 1, usage_count: 12, status: 'pending' });
    expect((await base()).prepare('SELECT COUNT(*) AS n FROM prompt_versions WHERE prompt_id = ?').get(id)).toEqual({ n: 1 });
  });

  it('un tuteur publié doit d’abord être dépublié', async () => {
    const sup = await creerCompte('super@educh.at');
    await creerTuteur({ name: 'Socrate', status: 'published' });
    const r = await agir('Socrate', { action: 'archive' }, sup);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ERR_STATUS');
  });

  it('seul le super-administrateur archive (pas l’administrateur d’école, pas l’auteur)', async () => {
    const a = await creerEtablissement();
    const adm = await creerCompte('admin@a.ch', { schoolAdmin: true, etablissementId: a });
    const auteur = await creerCompte('auteur@a.ch');
    await creerTuteur({ name: 'Socrate', status: 'retired', etablissementId: a, authorEmail: 'auteur@a.ch' });
    expect((await agir('Socrate', { action: 'archive' }, adm)).status).toBe(403);
    expect((await agir('Socrate', { action: 'archive' }, auteur)).status).toBe(403);
  });

  it('DELETE est désactivé pour tous, super-administrateur compris', async () => {
    const sup = await creerCompte('super@educh.at');
    await creerTuteur({ name: 'Socrate', status: 'retired' });
    const r = await appeler(tuteur, { method: 'DELETE', query: { name: 'Socrate' }, token: sup, ip: ipNeuve() });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ERR_DELETE_DISABLED');
    expect(await statut('Socrate')).toBe('retired');
  });
});

describe('Scénario alternatif : renommer', () => {
  it('le super renomme — même publié — sans toucher à l’identité du tuteur', async () => {
    const sup = await creerCompte('super@educh.at');
    const id = await creerTuteur({ name: 'Socrate', status: 'published' });
    const r = await agir('Socrate', { action: 'rename', newName: '  Socrate II  ' }, sup);
    expect(r.json).toEqual({ ok: true, name: 'Socrate II' });
    expect(((await base()).prepare('SELECT name FROM prompts WHERE id = ?').get(id) as any).name).toBe('Socrate II');
  });
  it('nom invalide, nom pris, ou appelant non super', async () => {
    const sup = await creerCompte('super@educh.at');
    const auteur = await creerCompte('auteur@x.ch');
    await creerTuteur({ name: 'Socrate', authorEmail: 'auteur@x.ch' });
    await creerTuteur({ name: 'Hypatie' });
    expect((await agir('Socrate', { action: 'rename', newName: 'essai' }, sup)).json.error.code).toBe('ERR_NAME_INVALID');
    expect((await agir('Socrate', { action: 'rename', newName: 'Hypatie' }, sup)).json.error.code).toBe('ERR_NAME_TAKEN');
    expect((await agir('Socrate', { action: 'rename', newName: 'Socrate' }, sup)).status).toBe(200);
    expect((await agir('Socrate', { action: 'rename', newName: 'Autre' }, auteur)).status).toBe(403);
  });
});

describe('Scénario alternatif : publier hors de l’école (partager / réserver)', () => {
  it('l’administration de l’école propriétaire partage puis réserve son tuteur', async () => {
    const a = await creerEtablissement({ ips: '192.0.2.50' });
    const adm = await creerCompte('admin@a.ch', { schoolAdmin: true, etablissementId: a });
    await creerTuteur({ name: 'Maison', etablissementId: a });
    expect(await nomsDuCatalogue()).toEqual([]);                // dehors : invisible
    expect(await nomsDuCatalogue('192.0.2.50')).toEqual(['Maison']); // chez elle : visible

    expect((await agir('Maison', { action: 'partager' }, adm)).json).toEqual({ ok: true, publie: true });
    expect(await nomsDuCatalogue()).toEqual(['Maison']);
    expect((await agir('Maison', { action: 'reserver' }, adm)).json).toEqual({ ok: true, publie: false });
    expect(await nomsDuCatalogue()).toEqual([]);
  });

  it('un enseignant simple, l’administrateur d’une autre école ou l’auteur ne partagent pas', async () => {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    const prof = await creerCompte('prof@a.ch', { teacher: true, etablissementId: a });
    const admB = await creerCompte('admin@b.ch', { schoolAdmin: true, etablissementId: b });
    const auteur = await creerCompte('auteur@x.ch');
    await creerTuteur({ name: 'Maison', etablissementId: a, authorEmail: 'auteur@x.ch' });
    for (const jeton of [prof, admB, auteur]) {
      const r = await agir('Maison', { action: 'partager' }, jeton);
      expect(r.status).toBe(403);
      expect(r.json.error.code).toBe('ERR_FORBIDDEN');
    }
  });

  it('le super tranche partout ; un tuteur de la plateforme n’a rien à partager', async () => {
    const a = await creerEtablissement();
    const sup = await creerCompte('super@educh.at');
    await creerTuteur({ name: 'Maison', etablissementId: a });
    await creerTuteur({ name: 'Plateforme' });
    expect((await agir('Maison', { action: 'partager' }, sup)).status).toBe(200);
    const r = await agir('Plateforme', { action: 'partager' }, sup);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ERR_NOT_SCHOOL_OWNED');
  });
});

describe('Scénario alternatif : liste de modération GET /api/admin/prompts', () => {
  async function peupler() {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    await creerTuteur({ name: 'A publié', status: 'published', etablissementId: a, createdAt: 1 });
    await creerTuteur({ name: 'A soumis', status: 'pending', etablissementId: a, createdAt: 2 });
    await creerTuteur({ name: 'B brouillon', status: 'draft', etablissementId: b, createdAt: 3 });
    await creerTuteur({ name: 'Plateforme', status: 'retired', createdAt: 4 });
    await creerTuteur({ name: 'Archivé', status: 'retired', archived: true, createdAt: 5 });
    return { a, b };
  }
  const noms = (r: any) => r.json.prompts.map((p: any) => p.name);

  it('le super voit tout sauf l’archivé, les soumis d’abord, avec corps et état des traductions', async () => {
    await peupler();
    const sup = await creerCompte('super@educh.at');
    const r = await appeler(listeAdmin, { token: sup });
    expect(r.status).toBe(200);
    expect(noms(r)).toEqual(['A soumis', 'B brouillon', 'A publié', 'Plateforme']);
    expect(r.json.prompts[0].body).toContain('Tu es A soumis');
    expect(r.json.prompts[0].translations).toMatchObject({ total: 3, pretes: 0, aVerifier: false });
  });

  it('l’administrateur d’école voit les siens et ceux de la plateforme ; l’enseignant, les siens seulement', async () => {
    const { a } = await peupler();
    const adm = await creerCompte('admin@a.ch', { schoolAdmin: true, etablissementId: a });
    const prof = await creerCompte('prof@a.ch', { teacher: true, etablissementId: a });
    expect(noms(await appeler(listeAdmin, { token: adm }))).toEqual(['A soumis', 'A publié', 'Plateforme']);
    expect(noms(await appeler(listeAdmin, { token: prof }))).toEqual(['A soumis', 'A publié']);
  });

  it('?portee=ecole ramène le super à son école active, ou à une liste vide sans école', async () => {
    const { a } = await peupler();
    const sup = await creerCompte('super@educh.at');
    expect((await appeler(listeAdmin, { token: sup, query: { portee: 'ecole' } })).json).toEqual({ prompts: [] });
    (await base()).prepare('INSERT INTO user_etablissements (email, etablissement_id, is_admin, created_at) VALUES (?,?,0,0)')
      .run('super@educh.at', a);
    expect(noms(await appeler(listeAdmin, { token: sup, query: { portee: 'ecole' } }))).toEqual(['A soumis', 'A publié', 'Plateforme']);
  });

  it('anonyme ou compte sans rôle : 403 ; méthode autre que GET : 405', async () => {
    const simple = await creerCompte('simple@x.ch');
    const sup = await creerCompte('super@educh.at');
    expect((await appeler(listeAdmin, {})).status).toBe(403);
    expect((await appeler(listeAdmin, { token: simple })).status).toBe(403);
    expect((await appeler(listeAdmin, { method: 'POST', token: sup })).status).toBe(405);
    // La garde de droits passe AVANT la garde de méthode.
    expect((await appeler(listeAdmin, { method: 'POST' })).status).toBe(403);
  });
});

describe('Scénarios d’erreur communs', () => {
  it('tuteur inconnu : 404 ; action inconnue : 400 ; méthode : 405', async () => {
    const sup = await creerCompte('super@educh.at');
    await creerTuteur({ name: 'Socrate' });
    expect((await agir('Inconnu', { action: 'approve' }, sup)).status).toBe(404);
    expect((await agir('Socrate', { action: 'publier-partout' }, sup)).json.error.code).toBe('ERR_ACTION_UNKNOWN');
    expect((await appeler(tuteur, { method: 'PUT', query: { name: 'Socrate' }, ip: ipNeuve() })).status).toBe(405);
  });

  it('retraduire est réservé au super-administrateur', async () => {
    const a = await creerEtablissement();
    const adm = await creerCompte('admin@a.ch', { schoolAdmin: true, etablissementId: a });
    await creerTuteur({ name: 'Socrate', etablissementId: a });
    expect((await agir('Socrate', { action: 'retranslate' }, adm)).status).toBe(403);
  });
});
