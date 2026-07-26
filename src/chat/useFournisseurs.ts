import { useEffect, useState } from 'react';
import { PROVIDER_IDS, PUBLIC_PROVIDER_IDS, type ProviderId } from '../shared/providers';
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

export function useFournisseurs() {
  const [served, setServed] = useState<string[] | null>(null);
  const [adulteAutorise, setAdulteAutorise] = useState(false);
  const [bloqueParEcole, setBloqueParEcole] = useState(false);

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
          setBloqueParEcole(!!d.adultBlockedBySchool);
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
    /** Refusé PARCE QUE l'on est sur le réseau d'une école, compte adulte ou non. */
    bloqueParEcole,
    /** La liste à afficher. Tant que la réponse n'est pas là : la plus restrictive. */
    visibles: (adulteAutorise ? PROVIDER_IDS : PUBLIC_PROVIDER_IDS) as readonly ProviderId[],
  };
}
