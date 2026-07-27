import { useEffect, useState } from 'react';
import { SCHOOL_PROVIDER_IDS, type ProviderId } from '../shared/providers';
import { authHeaders } from '../utils/account';

// QUELS FOURNISSEURS CE VISITEUR-CI A LE DROIT DE VOIR.
//
// LE NAVIGATEUR NE DÉCIDE PLUS RIEN, ET NE RECALCULE PLUS RIEN. La règle vit
// dans src/server/accesFournisseurs.ts — d'où l'on appelle, qui l'on est, et
// si l'on paie soi-même — et /api/providers en rend le RÉSULTAT : une liste.
// Ce hook la reçoit et la reflète. Il ne peut pas la contourner : la route de
// complétion applique exactement la même fonction.
//
// Ce hook existe parce que la règle était écrite DEUX fois. Le chat
// l'appliquait, la page « duel » offrait la liste complète à tout le monde : un
// élève y choisissait Grok ou DeepSeek et récoltait une erreur du serveur au
// lieu de ne pas voir l'option. Une règle de conformité recopiée est une règle
// qui finira par diverger — et c'est toujours la copie la plus permissive qui
// survit.

/**
 * Pourquoi des fournisseurs manquent à l'appel, ou null s'il n'en manque pas.
 *
 * `null` = rien à expliquer, OU le serveur n'a pas encore répondu. Ce second
 * état compte : sans lui, l'écran afficherait une explication une fraction de
 * seconde à qui n'était pas concerné, à chaque chargement.
 *
 * IL N'Y A PLUS QU'UN SEUL MOTIF À DIRE, et c'est un progrès. « ecole » — on
 * appelle depuis le réseau d'un établissement, qui écarte ces fournisseurs de
 * ses élèves. Le visiteur anonyme hors campus, lui, ne reçoit AUCUNE note :
 * il n'a rien à arbitrer et rien à réparer, la liste est simplement courte —
 * l'alarmer reviendrait à lui décrire un droit qu'il n'a pas demandé.
 */
export type MotifAIAct = 'ecole' | null;

// LA DÉMONSTRATION N'EST PAS UN MOTIF, C'EST UN ÉTAT — et c'est pourquoi elle
// sort du type ci-dessus plutôt que d'y ajouter une troisième valeur.
//
// `MotifAIAct` répond à « pourquoi des fournisseurs MANQUENT-ILS ? », et
// NoteAIAct l'affiche dans un cadre : un CONSTAT, sur un droit qu'on n'a pas.
// L'anonyme hors campus n'a rien à constater — il n'a jamais eu ces
// fournisseurs, on ne les lui a pas retirés. Ce qu'il faut lui dire est d'un
// autre ordre : CE QU'IL A (une démonstration gratuite) et ce qu'un compte
// ouvrirait. Une invitation, pas un refus, et elle ne se loge donc pas au même
// endroit — voir ChatPlaceholder et l'étiquette du menu de ChatSettings.

export type Fournisseurs = {
  served: string[] | null;
  motifAIAct: MotifAIAct;
  visibles: readonly ProviderId[];
  /** Ce visiteur n'a que le repli gratuit : ni compte, ni réseau d'école. */
  demonstration: boolean;
  /**
   * APPELLE-T-ON DEPUIS LE RÉSEAU D'UN ÉTABLISSEMENT ?
   *
   * Le fait ne se déduit pas de `motif` : une école dont un enseignant paie
   * lui-même reçoit 'tout' comme un visiteur de son salon (voir
   * perimetreFournisseurs). Il est donc rendu à part par /api/providers, qui le
   * tient de surLeCampus() — la SEULE autorité sur cette question. On le porte
   * ici tel quel, sans jamais le recalculer côté navigateur : une adresse
   * réseau ne se devine pas dans une page.
   *
   * `false` tant que le serveur n'a pas répondu : hors campus est le cas par
   * défaut, et c'est le bon sens du doute — une porte qui mène au catalogue
   * commun ne trompe personne, l'inverse enverrait un visiteur du dehors sur
   * la page d'une école qui n'est pas la sienne.
   */
  campus: boolean;
  /**
   * LE SERVEUR A-T-IL RÉPONDU ? — `visibles` vaut avant cela la liste d'attente
   * d'une salle de classe, qui n'est le périmètre de personne en particulier.
   * Un appelant qui se contente d'AFFICHER cette liste n'a pas besoin de le
   * savoir ; un appelant qui ÉCRIT quelque chose à partir d'elle, si. Sans ce
   * drapeau, ChatSettings remplacerait « grok » par le premier fournisseur
   * scolaire à chaque chargement de page, une fraction de seconde avant
   * d'apprendre que ce compte a droit à tout — et le choix de l'utilisateur
   * serait effacé par une supposition.
   */
  pret: boolean;
};

type ReponseProviders = {
  served?: string[];
  visibles?: ProviderId[];
  motif?: 'tout' | 'ecole' | 'demo';
  campus?: boolean;
  compte?: boolean;
};

// `surface` est conservé dans la signature — les appelants le passent, et il
// documente d'où l'on parle — mais il n'infléchit plus la liste : voir
// l'explication devant `visibles`.
export function useFournisseurs(_options?: { surface?: 'chat' | 'duel' }): Fournisseurs {
  const [served, setServed] = useState<string[] | null>(null);
  // Le périmètre tel qu'il est arrivé du serveur, ou null tant qu'il n'est pas
  // arrivé. UN SEUL ÉTAT pour la liste et son motif : deux états séparés se
  // seraient inévitablement retrouvés en désaccord le temps d'un rendu.
  const [perimetre, setPerimetre] = useState<ReponseProviders | null>(null);

  useEffect(() => {
    // AVEC le jeton : sans lui, le serveur ne peut pas savoir qui appelle, et
    // répond le périmètre d'un anonyme. Et à CHAQUE changement de compte : la
    // liste lue une seule fois au montage resterait celle du visiteur anonyme
    // juste après une identification réussie.
    const relire = () => {
      fetch('/api/providers', { headers: authHeaders() })
        .then(r => r.json())
        .then((d: ReponseProviders) => {
          setServed(d.served ?? []);
          setPerimetre(d);
        })
        .catch(() => { /* périmètre inconnu : on reste sur la liste d'attente */ });
    };
    relire();
    window.addEventListener('accountChanged', relire);
    return () => window.removeEventListener('accountChanged', relire);
  }, []);

  // TANT QUE LE SERVEUR N'A PAS RÉPONDU : la liste d'une salle de classe. C'est
  // le seul périmètre qu'on puisse afficher sans savoir d'où l'on appelle, et
  // il ne contient aucun fournisseur écarté — le pire qu'il en coûte est une
  // option de trop pendant une fraction de seconde, jamais une de trop en
  // classe.
  const recus = perimetre?.visibles ?? SCHOOL_PROVIDER_IDS;

  // « DUEL » N'A PLUS DE RÈGLE À LUI, ET C'EST UN GAIN.
  //
  // Il en avait une : retirer les intermédiaires, parce qu'on nomme ici le
  // modèle à la main et qu'OpenRouter devenait alors une porte vers n'importe
  // lequel. Trois faits l'ont vidée de son objet, et il vaut mieux les écrire
  // que laisser un filtre dont plus personne ne saura s'il protège :
  //   · SUR LE CAMPUS, la liste rendue est déjà SCHOOL_PROVIDER_IDS, d'où tout
  //     intermédiaire est absent par construction (`!ecarte && !wrng`). Le
  //     filtre n'y retirait rien.
  //   · AVEC UN COMPTE, la liste est complète et le filtre ne s'appliquait pas.
  //   · HORS CAMPUS ET SANS COMPTE, il ne reste que le repli gratuit — et
  //     /api/completion ÉPINGLE son modèle côté serveur (`effModel = FreeModel
  //     || providerDefaults[...].model`). Le nommer à la main n'y change rien :
  //     la porte que le filtre gardait n'existe plus.
  // Il ne restait donc à ce filtre qu'un seul effet réel : vider la liste de ce
  // dernier visiteur, puis obliger à lui substituer un décor de trois
  // fournisseurs que le serveur lui aurait refusés. Une interface qui propose
  // ce qu'elle sait devoir refuser est pire que celle qui ne propose rien —
  // c'est précisément la divergence que ce hook existe pour empêcher.
  //
  // La page reste fermée à ce visiteur (ERR_PROMPTAGOGUE_ONLY), et duel.tsx
  // sait se taire devant une liste vide (`if (!repli) return previous;`) au
  // cas où aucun repli gratuit ne serait configuré.
  const visibles = recus;

  return {
    /** Servis par une clé de la plateforme ; les autres exigent une clé personnelle. */
    served,
    // UNE NOTE NE DOIT JAMAIS CONTREDIRE LA LISTE QU'ELLE SURPLOMBE : le motif
    // est celui que le serveur a rendu AVEC cette liste-là, et plus rien ne
    // s'interpose entre les deux.
    motifAIAct: (perimetre?.motif === 'ecole' ? 'ecole' : null) as MotifAIAct,
    /** La liste à afficher. Tant que la réponse n'est pas là : celle d'une école. */
    visibles: visibles as readonly ProviderId[],
    demonstration: perimetre?.motif === 'demo',
    campus: perimetre?.campus === true,
    pret: perimetre !== null,
  };
}
