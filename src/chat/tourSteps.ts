// Les parcours de la visite guidée, un par interface.
//
// Chaque étape désigne un attribut `data-tour` posé dans la page et la clé du
// texte qui l'explique. Une étape dont l'élément est absent est simplement
// sautée : c'est ce qui permet à un même parcours de servir une page selon
// qu'on y est identifié ou non.
//
// UNE RÈGLE, ET ELLE EST STRICTE : la visite ne se lance QUE sur ?visite=1,
// c'est-à-dire en DÉMONSTRATION. Une étape qui désigne un élément absent de la
// démonstration n'est donc pas « sautée quelquefois » : elle ne se voit
// JAMAIS. Avant d'ajouter une étape, il faut vérifier deux choses dans le
// JSX — que l'ancre existe, et qu'elle est peinte quand `demo` est vrai. C'est
// pour cela que /etablissement montre désormais un porte-monnaie fictif et que
// les deux consoles montrent un sélecteur d'école fictif : sans quoi les deux
// nouveautés qui changent le plus de choses restaient indescriptibles.

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
    // Il n'y a plus d'étape « modèle » ni « niveau de raisonnement » : le chat
    // ne nomme plus de modèle (l'échelle des trois barreaux est réglée par
    // l'administration, et « Régénérer » monte d'un cran). Décrire un menu
    // disparu était pire que se taire.
  ],

  // LA CLASSE — /enseignant (l'ancienne /session, qui la réexporte).
  //
  // Le parcours s'appelait « session », du nom de l'objet technique ; il porte
  // maintenant celui de la page et de la personne à qui elle s'adresse. Les
  // ancres gardent leur préfixe `session-` : ce sont celles du verrou de
  // salle, et les renommer n'aurait rien appris à personne.
  enseignant: [
    { target: 'ecole-selecteur', shape: 'rect', textKey: 'tour.ecole.selecteur' },
    { target: 'session-etat', shape: 'rect', textKey: 'tour.session.state' },
    { target: 'session-motdepasse', shape: 'rect', textKey: 'tour.session.password' },
    { target: 'session-duree', shape: 'rect', textKey: 'tour.session.duration' },
    { target: 'session-ouvrir', shape: 'rect', textKey: 'tour.session.open' },
    { target: 'session-tuteur', shape: 'rect', textKey: 'tour.session.tutor' },
    { target: 'session-web', shape: 'rect', textKey: 'tour.session.web' },
    { target: 'session-fournisseurs', shape: 'rect', textKey: 'tour.session.providers' },
    { target: 'session-deployer', shape: 'rect', textKey: 'tour.session.deploy' },
    { target: 'ens-etablissement', shape: 'rect', textKey: 'tour.session.school' },
  ],

  // L'ÉCOLE — /etablissement. Les horaires et les quotas ne sont plus tout :
  // l'école y tient son porte-monnaie, sa facture, ses comptes et son
  // catalogue. Seul le porte-monnaie est peint en démonstration (les trois
  // autres interrogeraient le serveur), et lui seul a donc une étape.
  etablissement: [
    { target: 'ecole-selecteur', shape: 'rect', textKey: 'tour.ecole.selecteur' },
    { target: 'etab-identite', shape: 'rect', textKey: 'tour.etab.identity' },
    { target: 'etab-horaires', shape: 'rect', textKey: 'tour.etab.hours' },
    { target: 'etab-quotas', shape: 'rect', textKey: 'tour.etab.quotas' },
    // L'ATELIER DE PROMPTAGOGUE. C'est le seul réglage de cette page dont
    // l'effet se voit AILLEURS — sur l'accueil, et seulement depuis le réseau
    // de l'école. Personne ne devinerait qu'une case cochée ici fait
    // reparaître une tuile là-bas : sans cette étape, le réglage restait celui
    // qu'on ne comprend qu'en l'essayant. L'école fictive de la démonstration
    // l'a rouvert exprès, pour que l'étape désigne une case COCHÉE.
    { target: 'etab-atelier', shape: 'rect', textKey: 'tour.etab.workshop' },
    { target: 'etab-conso', shape: 'rect', textKey: 'tour.etab.usage' },
    { target: 'etab-portemonnaie', shape: 'rect', textKey: 'tour.etab.wallet' },
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

  // La vitrine de l'administration DU SITE (page /admin-demo, données
  // fictives). Ce qui appartient à une école — porte-monnaie, comptes,
  // facture, catalogue — a quitté cet écran pour /etablissement : les textes
  // le disent, plutôt que de le montrer deux fois.
  admin: [
    { target: 'admin-validation', shape: 'rect', textKey: 'tour.admin.validation' },
    { target: 'admin-prompts', shape: 'rect', textKey: 'tour.admin.prompts' },
    { target: 'admin-comptes', shape: 'rect', textKey: 'tour.admin.accounts' },
    // L'ordre suit celui de la page : zone Comptes (comptes, facturation,
    // établissements), puis zone Modèles.
    { target: 'admin-facturation', shape: 'rect', textKey: 'tour.admin.billing' },
    { target: 'admin-etablissements', shape: 'rect', textKey: 'tour.admin.schools' },
    { target: 'admin-echelle', shape: 'rect', textKey: 'tour.admin.ladder' },
  ],
};
