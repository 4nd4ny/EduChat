// Les parcours de la visite guidée, un par interface.
//
// Chaque étape désigne un attribut `data-tour` posé dans la page et la clé du
// texte qui l'explique. Une étape dont l'élément est absent est simplement
// sautée : c'est ce qui permet à un même parcours de servir une page selon
// qu'on y est identifié ou non.

export type TourStep = { target: string; shape: 'rect' | 'circle'; textKey: string };

export const TOURS: Record<string, TourStep[]> = {
  // L'exerciseur du chat — le parcours historique.
  chat: [
    { target: 'tutor', shape: 'rect', textKey: 'tour.tutor' },
    { target: 'messages', shape: 'rect', textKey: 'tour.messages' },
    { target: 'history', shape: 'rect', textKey: 'tour.history' },
    { target: 'provider', shape: 'rect', textKey: 'tour.provider' },
    { target: 'apikey', shape: 'rect', textKey: 'tour.apikey' },
    { target: 'composer', shape: 'rect', textKey: 'tour.composer' },
    { target: 'attach', shape: 'circle', textKey: 'tour.attach' },
    { target: 'voice', shape: 'circle', textKey: 'tour.voice' },
    { target: 'send', shape: 'circle', textKey: 'tour.send' },
    { target: 'tokens', shape: 'rect', textKey: 'tour.tokens' },
  ],

  // La console de classe, présentée déverrouillée et inerte.
  session: [
    { target: 'session-etat', shape: 'rect', textKey: 'tour.session.state' },
    { target: 'session-motdepasse', shape: 'rect', textKey: 'tour.session.password' },
    { target: 'session-duree', shape: 'rect', textKey: 'tour.session.duration' },
    { target: 'session-ouvrir', shape: 'rect', textKey: 'tour.session.open' },
    { target: 'session-tuteur', shape: 'rect', textKey: 'tour.session.tutor' },
    { target: 'session-web', shape: 'rect', textKey: 'tour.session.web' },
    { target: 'session-deployer', shape: 'rect', textKey: 'tour.session.deploy' },
  ],

  // L'espace du responsable d'établissement.
  etablissement: [
    { target: 'etab-identite', shape: 'rect', textKey: 'tour.etab.identity' },
    { target: 'etab-horaires', shape: 'rect', textKey: 'tour.etab.hours' },
    { target: 'etab-quotas', shape: 'rect', textKey: 'tour.etab.quotas' },
    { target: 'etab-conso', shape: 'rect', textKey: 'tour.etab.usage' },
  ],

  // L'atelier de comparaison, ouvert à tout compte vérifié.
  duel: [
    { target: 'duel-mode', shape: 'rect', textKey: 'tour.duel.mode' },
    { target: 'duel-colonneA', shape: 'rect', textKey: 'tour.duel.columnA' },
    { target: 'duel-colonneB', shape: 'rect', textKey: 'tour.duel.columnB' },
    { target: 'duel-question', shape: 'rect', textKey: 'tour.duel.question' },
    { target: 'duel-envoyer', shape: 'rect', textKey: 'tour.duel.send' },
  ],

  // « Mes données » — ce que chaque profil y trouve.
  compte: [
    { target: 'compte-conso', shape: 'rect', textKey: 'tour.compte.usage' },
    { target: 'compte-cles', shape: 'rect', textKey: 'tour.compte.keys' },
    { target: 'compte-conversations', shape: 'rect', textKey: 'tour.compte.conversations' },
    { target: 'compte-tuteurs', shape: 'rect', textKey: 'tour.compte.prompts' },
    { target: 'compte-identite', shape: 'rect', textKey: 'tour.compte.identity' },
    { target: 'compte-export', shape: 'rect', textKey: 'tour.compte.export' },
  ],

  // La vitrine de l'administration (page /admin-demo, données fictives).
  admin: [
    { target: 'admin-validation', shape: 'rect', textKey: 'tour.admin.validation' },
    { target: 'admin-prompts', shape: 'rect', textKey: 'tour.admin.prompts' },
    { target: 'admin-comptes', shape: 'rect', textKey: 'tour.admin.accounts' },
    { target: 'admin-etablissements', shape: 'rect', textKey: 'tour.admin.schools' },
    { target: 'admin-echelle', shape: 'rect', textKey: 'tour.admin.ladder' },
    { target: 'admin-facturation', shape: 'rect', textKey: 'tour.admin.billing' },
  ],
};
