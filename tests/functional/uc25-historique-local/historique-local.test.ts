// UC-25 — Tests fonctionnels : « Conserver son historique, ses favoris et le
// basculer d'un navigateur à l'autre ». Deux navigateurs simulés (stockages
// distincts) enchaînent le vrai code : historique, favoris, notes, compteur,
// export du profil (downloadProfile) puis import par la barre latérale.
//
// La barre latérale (src/chatSidebar/ChatSidebar.tsx, onDrop) est un composant
// React ; sa logique de tri du fichier déposé est reproduite À L'IDENTIQUE par
// deposerFichier() ci-dessous (JSON.parse → isProfile → applyProfile, sinon
// importConversation), avec les mêmes messages à l'utilisateur.
import { describe, it, expect, afterEach } from 'vitest';
import { installerNavigateur, retirerNavigateur, type Navigateur } from '../../unit/uc25-historique-local/navigateur';
import { storeConversation, getHistory, type Conversation } from '../../../src/context/History';
import { toggleFavorite, storeGivenRating, getFavorites, getGivenRating } from '../../../src/utils/favorites';
import { downloadProfile, isProfile, applyProfile } from '../../../src/utils/profile';
import { getClientId } from '../../../src/utils/clientId';
import { storeToken, getToken } from '../../../src/utils/account';
import { MAX_IMPORT_BYTES } from '../../../src/context/AnthropicProvider';

afterEach(() => { retirerNavigateur(); });

type Depot =
  | { issue: 'profil'; message: string }
  | { issue: 'conversation'; donnees: any }
  | { issue: 'erreur'; message: string };

/** Reproduction de ChatSidebar.onDrop (hors React). */
function deposerFichier(contenu: string): Depot {
  let jsonData: any;
  try {
    jsonData = JSON.parse(contenu);
  } catch {
    return { issue: 'erreur', message: "Fichier illisible : ce n'est pas du JSON valide." };
  }
  try {
    if (isProfile(jsonData)) {
      const { conversations } = applyProfile(jsonData);
      return { issue: 'profil', message: `Profil importé : ${conversations} conversation(s) ajoutée(s).` };
    }
    // Côté React : importConversation(jsonData) — hors du périmètre de ce test.
    return { issue: 'conversation', donnees: jsonData };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return { issue: 'erreur', message: message.startsWith('Profil') ? message : `Profil refusé : ${message || 'import impossible.'}` };
  }
}

const conv = (name: string, texte: string, extra: Partial<Conversation> = {}): Conversation => ({
  name, createdAt: 1_700_000_000_000, lastMessage: 1_700_000_500_000,
  messages: [{ role: 'user', content: texte } as any, { role: 'assistant', content: `Réponse à « ${texte} »` } as any],
  ...extra,
});

/** Exporte le profil du navigateur courant et rend le texte du fichier. */
async function exporter(nav: Navigateur): Promise<string> {
  nav.activer();
  downloadProfile();
  const t = nav.telechargements[nav.telechargements.length - 1];
  expect(t.nom).toMatch(/^educhat-profil-\d{4}-\d{2}-\d{2}\.json$/);
  return t.contenu;
}

/** Navigateur A : un élève qui a travaillé avec un tuteur et a un compte. */
function preparerNavigateurA() {
  const a = installerNavigateur();
  storeConversation('conv-a1', conv('Photosynthèse', 'Qu’est-ce que la chlorophylle ?', { promptName: 'socrate-bio', promptVersion: 2 }));
  storeConversation('conv-a2', conv('Pythagore', 'Pourquoi a² + b² = c² ?'));
  toggleFavorite('socrate-bio');
  toggleFavorite('maths-pas-a-pas');
  storeGivenRating('socrate-bio', 5);
  a.stockage.setItem('totalTokens', '12000');
  storeToken('jeton.compte-A');
  const clientA = getClientId();
  return { a, clientA };
}

describe('Scénario nominal : export sur A, import sur un autre navigateur B', () => {
  it('B retrouve conversations (tuteur et version compris), favoris, notes et compteur ; rien de secret ne voyage', async () => {
    const { a, clientA } = preparerNavigateurA();
    const fichier = await exporter(a);
    expect(fichier).not.toContain('jeton.compte-A');
    expect(fichier).not.toContain(clientA);

    // Navigateur B, déjà utilisé : une conversation, un favori, une note, son propre compte.
    const b = installerNavigateur();
    storeConversation('conv-b1', conv('Révolution', 'Pourquoi 1789 ?'));
    toggleFavorite('histoire');
    storeGivenRating('socrate-bio', 3);
    b.stockage.setItem('totalTokens', '500');
    storeToken('jeton.compte-B');
    const clientB = getClientId();

    const r = deposerFichier(fichier);
    expect(r).toEqual({ issue: 'profil', message: 'Profil importé : 2 conversation(s) ajoutée(s).' });

    const h = getHistory();
    expect(Object.keys(h).sort()).toEqual(['conv-a1', 'conv-a2', 'conv-b1']);
    expect(h['conv-a1']).toMatchObject({ name: 'Photosynthèse', promptName: 'socrate-bio', promptVersion: 2, createdAt: 1_700_000_000_000 });
    expect(h['conv-a1'].messages).toHaveLength(2);
    expect(getFavorites()).toEqual(['histoire', 'socrate-bio', 'maths-pas-a-pas']);
    expect(getGivenRating('socrate-bio')).toBe(3); // la note locale de B prime
    expect(b.stockage.getItem('totalTokens')).toBe('12000');
    expect(b.evenements).toContain('totalTokensUpdated');

    // Identité de B intacte : jeton et identifiant anonyme propres à ce navigateur.
    expect(getToken()).toBe('jeton.compte-B');
    expect(getClientId()).toBe(clientB);
    expect(clientB).not.toBe(clientA);
  });

  it('réimporter le même fichier est sans effet (idempotent)', async () => {
    const { a } = preparerNavigateurA();
    const fichier = await exporter(a);
    const b = installerNavigateur();
    expect(deposerFichier(fichier)).toMatchObject({ message: 'Profil importé : 2 conversation(s) ajoutée(s).' });
    const avant = b.stockage.instantane();
    expect(deposerFichier(fichier)).toMatchObject({ message: 'Profil importé : 0 conversation(s) ajoutée(s).' });
    expect(b.stockage.instantane()).toEqual(avant);
  });

  it('aller-retour A → B → A : les deux navigateurs convergent', async () => {
    const { a } = preparerNavigateurA();
    const b = installerNavigateur();
    storeConversation('conv-b1', conv('Révolution', 'Pourquoi 1789 ?'));
    toggleFavorite('histoire');

    const aller = await exporter(a); // exporter() réactive A…
    b.activer();                     // …puis on dépose le fichier sur B
    expect(deposerFichier(aller)).toMatchObject({ message: 'Profil importé : 2 conversation(s) ajoutée(s).' });
    const retour = await exporter(b);
    a.activer();
    expect(deposerFichier(retour)).toMatchObject({ message: 'Profil importé : 1 conversation(s) ajoutée(s).' });

    const histA = getHistory();
    b.activer();
    expect(getHistory()).toEqual(histA);
    a.activer();
    expect(new Set(getFavorites())).toEqual(new Set(['socrate-bio', 'maths-pas-a-pas', 'histoire']));
    expect(getToken()).toBe('jeton.compte-A');
  });
});

describe('Scénarios alternatifs', () => {
  it('A1 — navigateur vierge : l’import restaure tout le profil', async () => {
    const { a } = preparerNavigateurA();
    const fichier = await exporter(a);
    const b = installerNavigateur();
    deposerFichier(fichier);
    expect(Object.keys(getHistory()).sort()).toEqual(['conv-a1', 'conv-a2']);
    expect(getFavorites()).toEqual(['socrate-bio', 'maths-pas-a-pas']);
    expect(getGivenRating('socrate-bio')).toBe(5);
    expect(getToken()).toBeNull(); // aucun compte n'a voyagé
    expect(b.stockage.getItem('educhat-client')).toBeNull();
  });

  it('A2 — même identifiant de conversation des deux côtés : la version locale est conservée', async () => {
    const { a } = preparerNavigateurA();
    const fichier = await exporter(a);
    installerNavigateur();
    storeConversation('conv-a1', conv('Ma version', 'Autre question'));
    expect(deposerFichier(fichier)).toMatchObject({ message: 'Profil importé : 1 conversation(s) ajoutée(s).' });
    expect(getHistory()['conv-a1'].name).toBe('Ma version');
  });

  it('A3 — une conversation exportée seule (pas un profil) est aiguillée vers importConversation', () => {
    installerNavigateur();
    const r = deposerFichier(JSON.stringify(conv('Seule', 'Bonjour')));
    expect(r.issue).toBe('conversation');
    expect(getHistory()).toEqual({}); // rien d'écrit par le chemin « profil »
  });
});

describe('Scénarios d’erreur : fichiers corrompus ou hostiles', () => {
  const initial = () => {
    const nav = installerNavigateur();
    storeConversation('garde', conv('À garder', 'Bonjour'));
    toggleFavorite('fav');
    return { nav, avant: nav.stockage.instantane() };
  };

  it('JSON illisible (tronqué, vide, binaire) : message utilisateur, historique intact', async () => {
    const { a } = preparerNavigateurA();
    const tronque = (await exporter(a)).slice(0, 200);
    const { nav, avant } = initial();
    for (const contenu of [tronque, '', '\u0000\u0001PK\u0003\u0004', '{"educhatProfile":1,']) {
      expect(deposerFichier(contenu)).toEqual({ issue: 'erreur', message: "Fichier illisible : ce n'est pas du JSON valide." });
    }
    expect(nav.stockage.instantane()).toEqual(avant);
  });

  it('profil sans conversations : rejeté sans écriture, avec la raison exacte (pas « pas du JSON valide »)', () => {
    const { nav, avant } = initial();
    const r = deposerFichier(JSON.stringify({ educhatProfile: 1, favorites: ['intrus'] }));
    expect(r).toEqual({ issue: 'erreur', message: 'Profil invalide : aucune conversation.' });
    expect(deposerFichier(JSON.stringify({ educhatProfile: 1, conversations: [] })))
      .toEqual({ issue: 'erreur', message: 'Profil invalide : aucune conversation.' });
    expect(nav.stockage.instantane()).toEqual(avant);
  });

  it('profil d’une version inconnue : refus explicite, sans écriture', () => {
    const { nav, avant } = initial();
    expect(deposerFichier(JSON.stringify({ educhatProfile: 2, conversations: {} })))
      .toEqual({ issue: 'erreur', message: 'Profil invalide : version 2 non prise en charge.' });
    expect(nav.stockage.instantane()).toEqual(avant);
  });

  it('historique local corrompu : l’export comme l’import restent possibles', async () => {
    const { a } = preparerNavigateurA();
    const fichier = await exporter(a);
    const b = installerNavigateur();
    b.stockage.setItem('pg-history', '{corrompu');
    expect(deposerFichier(fichier)).toMatchObject({ message: 'Profil importé : 2 conversation(s) ajoutée(s).' });
    expect(Object.keys(getHistory()).sort()).toEqual(['conv-a1', 'conv-a2']);
    const reexport = JSON.parse(await exporter(b));
    expect(Object.keys(reexport.conversations).sort()).toEqual(['conv-a1', 'conv-a2']);
  });

  it('profil hostile : ni pollution de prototype, ni vol de jeton, ni écrasement', () => {
    const { nav } = initial();
    storeToken('jeton.legitime');
    const hostile = `{"educhatProfile":1,
      "conversations":{"__proto__":{"messages":[]},"garde":{"name":"Écrasée","messages":[]}},
      "ratings":{"__proto__":{"admin":true}},
      "favorites":[],"totalTokens":-5,
      "educhat-token":"jeton.pirate"}`;
    expect(deposerFichier(hostile)).toMatchObject({ message: 'Profil importé : 0 conversation(s) ajoutée(s).' });
    expect(({} as any).admin).toBeUndefined();
    expect(getHistory().garde.name).toBe('À garder');
    expect(getToken()).toBe('jeton.legitime');
    expect(nav.stockage.getItem('totalTokens')).toBe('0');
  });

  it('le chemin « profil » applique la validation des messages du chemin « conversation » : refus sans écriture', () => {
    const { nav, avant } = initial();
    // Mêmes règles que parseImportedMessages (AnthropicProvider.tsx).
    const r = deposerFichier(JSON.stringify({
      educhatProfile: 1,
      conversations: {
        saine: conv('Saine', 'Bonjour'),
        x: { name: '<img src=x onerror=alert(1)>', messages: [{ role: 'system', content: { html: '<script>' } }] },
      },
    }));
    expect(r).toEqual({ issue: 'erreur', message: 'Profil invalide : conversation « x », message 1 : rôle « system » non autorisé.' });
    expect(nav.stockage.instantane()).toEqual(avant);
  });

  it('volume : 2 Mo par la zone de dépôt ; au-delà de 5000 messages, le profil est refusé comme une conversation seule', () => {
    expect(MAX_IMPORT_BYTES).toBe(2 * 1024 * 1024);
    installerNavigateur();
    const messages = Array.from({ length: 6000 }, () => ({ role: 'user', content: 'x' }));
    expect(deposerFichier(JSON.stringify({ educhatProfile: 1, conversations: { gros: { messages } } })))
      .toEqual({ issue: 'erreur', message: 'Profil invalide : conversation « gros » trop longue (plus de 5000 messages).' });
    expect(getHistory()).toEqual({});
  });
});
