// UC-17 — Tests unitaires : le taux de contribution qu'une école choisit
// (src/server/porteMonnaie.ts, reglerContribution / contributionDe).
import { describe, it, expect, beforeEach } from 'vitest';
import { viderBase, creerEtablissement, base } from '../../helpers/db';
import {
  CONTRIBUTION_MIN, CONTRIBUTION_MAX, reglerContribution, contributionDe, titulaireEcole,
} from '../../../src/server/porteMonnaie';

beforeEach(async () => { await viderBase(); });

describe('reglerContribution', () => {
  it('les bornes sont 3.5 et 10 %', () => {
    expect(CONTRIBUTION_MIN).toBe(3.5);
    expect(CONTRIBUTION_MAX).toBe(10);
  });
  it('enregistre un taux dans les bornes tel quel', async () => {
    const id = await creerEtablissement();
    expect(reglerContribution(id, 6.25)).toBe(6.25);
    expect(((await base()).prepare('SELECT contribution_pct FROM etablissements WHERE id=?').get(id) as any).contribution_pct).toBe(6.25);
  });
  it('ramène un taux hors bornes à la borne la plus proche', async () => {
    const id = await creerEtablissement();
    expect(reglerContribution(id, 1)).toBe(3.5);
    expect(reglerContribution(id, 42)).toBe(10);
    expect(reglerContribution(id, -5)).toBe(3.5);
  });
});

describe('contributionDe (école)', () => {
  it('sans choix (-1), le réglage du serveur s’applique (10 % par défaut)', async () => {
    const id = await creerEtablissement();
    expect(contributionDe(titulaireEcole(id))).toBe(10);
  });
  it('le choix de l’école, borné même s’il a été écrit hors bornes en base', async () => {
    const id = await creerEtablissement({ contributionPct: 5 });
    expect(contributionDe(titulaireEcole(id))).toBe(5);
    (await base()).prepare('UPDATE etablissements SET contribution_pct = 50 WHERE id = ?').run(id);
    expect(contributionDe(titulaireEcole(id))).toBe(10);
  });
  it('une personne paie toujours le plancher', () => {
    expect(contributionDe({ genre: 'compte', email: 'x@ecole.ch' })).toBe(3.5);
  });
});
