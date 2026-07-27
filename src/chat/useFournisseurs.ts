import { useEffect, useState } from 'react';
import { PROVIDER_IDS, PUBLIC_PROVIDER_IDS, DUEL_PUBLIC_PROVIDER_IDS, type ProviderId } from '../shared/providers';
import { authHeaders } from '../utils/account';

// QUELS FOURNISSEURS CE VISITEUR-CI A LE DROIT DE VOIR.
//
// La règle vit sur le serveur (server/adult.ts) : le réseau d'un établissement
// scolaire ferme l'accès aux fournisseurs écartés au titre de l'AI Act QUEL QUE
// SOIT le compte, et hors de ce réseau seul un compte certifié adulte les
// retrouve. Le navigateur ne fait que refléter cette décision — il ne la prend
// pas, et il ne peut pas la contourner : la route de complétion revérifie.
//
// Ce hook existe parce que la règle était écrite DEUX fois. Le chat l'appliquait,
// la page « duel » offrait la liste complète à tout le monde : un élève y
// choisissait Grok ou DeepSeek et récoltait une erreur du serveur au lieu de ne
// pas voir l'option. Une règle de conformité recopiée est une règle qui finira
// par diverger — celle-ci n'a plus qu'un seul point d'application.

/**
 * POURQUOI LE REFUS EST RENDU, ET PAS SEULEMENT L'AUTORISATION.
 *
 * Une absence non expliquée se lit comme une panne. Les deux motifs n'appellent
 * pourtant pas la même phrase : « réseau scolaire » ne se lève par AUCUN
 * compte, « pas certifié » se lève en s'adressant à l'administration. Les
 * confondre enverrait un enseignant réclamer dans son collège une certification
 * qui n'y changerait rien.
 *
 * `null` = le serveur n'a pas encore répondu. Ce troisième état compte : sans
 * lui, l'écran afficherait « certifiez-vous » une fraction de seconde à un
 * adulte déjà certifié, à chaque chargement.
 */
export type MotifAIAct = 'ecole' | 'certification' | null;

export function useFournisseurs(options?: { surface?: 'chat' | 'duel' }) {
  // « duel » retire en plus OpenRouter : voir DUEL_PUBLIC_PROVIDER_IDS — on y
  // nomme le modèle à la main, donc l'intermédiaire ne garantit plus rien.
  const publique = options?.surface === 'duel' ? DUEL_PUBLIC_PROVIDER_IDS : PUBLIC_PROVIDER_IDS;
  const [served, setServed] = useState<string[] | null>(null);
  const [adulteAutorise, setAdulteAutorise] = useState(false);
  // Le verdict AI Act tel qu'il est arrivé du serveur, ou null tant qu'il n'est
  // pas arrivé. Un SEUL état pour les deux informations : deux booléens séparés
  // se seraient inévitablement retrouvés en désaccord le temps d'un rendu.
  const [motifAIAct, setMotifAIAct] = useState<MotifAIAct>(null);

  useEffect(() => {
    // AVEC le jeton : sans lui, le serveur ne peut pas savoir que ce compte est
    // certifié adulte, et répond toujours « non ». Et à CHAQUE changement de
    // compte : la liste lue une seule fois au montage resterait celle du
    // visiteur anonyme juste après une identification réussie.
    const relire = () => {
      fetch('/api/providers', { headers: authHeaders() })
        .then(r => r.json())
        .then(d => {
          setServed(d.served ?? []);
          setAdulteAutorise(!!d.adultAllowed);
          // « école » PRIME, comme sur le serveur : c'est le motif qu'aucun
          // compte ne lève, donc celui qu'il faut annoncer quand les deux
          // pourraient s'appliquer.
          setMotifAIAct(d.adultAllowed ? null : d.adultBlockedBySchool ? 'ecole' : 'certification');
        })
        .catch(() => { /* liste inconnue : on retombe sur la liste publique */ });
    };
    relire();
    window.addEventListener('accountChanged', relire);
    return () => window.removeEventListener('accountChanged', relire);
  }, []);

  return {
    /** Servis par la clé interne ; les autres exigent une clé personnelle. */
    served,
    adulteAutorise,
    /** Pourquoi les fournisseurs écartés ne sont pas proposés, ou null. */
    motifAIAct,
    /** La liste à afficher. Tant que la réponse n'est pas là : la plus restrictive. */
    visibles: (adulteAutorise ? PROVIDER_IDS : publique) as readonly ProviderId[],
  };
}
