// UC-10 — Tests unitaires : ce que la modération change à la VISIBILITÉ d'un
// tuteur (src/server/prompts.ts) — statut, archivage, rattachement et
// « publie » — via estVisible, CLAUSE_VISIBLE (listPublished,
// getPublishedByName), porteeDepuisIp et nomsDeLEcole.
import { describe, it, expect, beforeEach } from 'vitest';
import { viderBase, base, creerTuteur, creerEtablissement } from '../../helpers/db';
import {
  estVisible, listPublished, getPublishedByName, porteeDepuisIp, porteeDeLEcole, nomsDeLEcole, parametresPortee,
  PorteeCatalogue,
} from '../../../src/server/prompts';
import type { PromptRow } from '../../../src/server/db';

beforeEach(async () => { await viderBase(); });

const DEHORS: PorteeCatalogue = { etablissementId: null, publicsExternes: true };

async function row(id: number) {
  return (await base()).prepare('SELECT * FROM prompts WHERE id = ?').get(id) as PromptRow;
}

describe('estVisible et CLAUSE_VISIBLE disent la même chose', () => {
  it('seul un tuteur publié et non archivé est visible', async () => {
    const cas = [
      { name: 'Brouillon', status: 'draft' as const, attendu: false },
      { name: 'Attente', status: 'pending' as const, attendu: false },
      { name: 'Retiré', status: 'retired' as const, attendu: false },
      { name: 'Publié', status: 'published' as const, attendu: true },
      { name: 'Archivé', status: 'published' as const, archived: true, attendu: false },
    ];
    for (const c of cas) {
      const id = await creerTuteur(c);
      expect(estVisible(await row(id), DEHORS)).toBe(c.attendu);
      expect(!!getPublishedByName(c.name, DEHORS)).toBe(c.attendu);
    }
    expect(listPublished('name', '', undefined, DEHORS).map(c => c.name)).toEqual(['Publié']);
  });

  it('un tuteur d’école : visible chez elle ; ailleurs seulement s’il est « publie » et que la portée l’accepte', async () => {
    const a = await creerEtablissement({ name: 'A' });
    const b = await creerEtablissement({ name: 'B' });
    const reserve = await creerTuteur({ name: 'Réservé', etablissementId: a });
    const partage = await creerTuteur({ name: 'Partagé', etablissementId: a, publie: true });
    const plateforme = await creerTuteur({ name: 'Plateforme' });

    const chezA: PorteeCatalogue = { etablissementId: a, publicsExternes: false };
    const chezBFerme: PorteeCatalogue = { etablissementId: b, publicsExternes: false };
    const chezBOuvert: PorteeCatalogue = { etablissementId: b, publicsExternes: true };

    const table: Array<[number, PorteeCatalogue, boolean]> = [
      [reserve, chezA, true], [reserve, chezBOuvert, false], [reserve, DEHORS, false],
      [partage, chezA, true], [partage, chezBFerme, false], [partage, chezBOuvert, true], [partage, DEHORS, true],
      [plateforme, chezBFerme, true], [plateforme, DEHORS, true],
    ];
    for (const [id, portee, attendu] of table) {
      const r = await row(id);
      expect(estVisible(r, portee)).toBe(attendu);
      expect(!!getPublishedByName(r.name, portee)).toBe(attendu);
    }
  });
});

describe('porteeDepuisIp / porteeDeLEcole / parametresPortee', () => {
  it('hors établissement : aucune école, publics externes visibles', () => {
    expect(porteeDepuisIp('203.0.113.200')).toEqual(DEHORS);
  });
  it('dans une école : son catalogue ouvert ou fermé décide du dehors', async () => {
    const ferme = await creerEtablissement({ ips: '192.0.2.1' });
    const ouvert = await creerEtablissement({ ips: '192.0.2.2', catalogueOuvert: true });
    expect(porteeDepuisIp('192.0.2.1')).toEqual({ etablissementId: ferme, publicsExternes: false });
    expect(porteeDepuisIp('192.0.2.2')).toEqual({ etablissementId: ouvert, publicsExternes: true });
    expect(porteeDeLEcole(ouvert)).toEqual({ etablissementId: ouvert, publicsExternes: true });
  });
  it('traduit la portée en paramètres SQL', () => {
    expect(parametresPortee({ etablissementId: 4, publicsExternes: false })).toEqual({ etab: 4, externes: 0 });
    expect(parametresPortee(DEHORS)).toEqual({ etab: null, externes: 1 });
  });
});

describe('nomsDeLEcole', () => {
  it('ne nomme que les tuteurs visibles qui appartiennent à l’école', async () => {
    const a = await creerEtablissement();
    await creerTuteur({ name: 'Le nôtre', etablissementId: a });
    await creerTuteur({ name: 'Le nôtre retiré', etablissementId: a, status: 'retired' });
    await creerTuteur({ name: 'Le nôtre archivé', etablissementId: a, archived: true });
    await creerTuteur({ name: 'Plateforme' });
    expect(nomsDeLEcole(a)).toEqual(['Le nôtre']);
  });
});
