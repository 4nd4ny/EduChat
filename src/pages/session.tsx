// /session — L'ANCIENNE ADRESSE DE LA CONSOLE DE CLASSE.
//
// La console vit désormais sur /enseignant : la répartition par niveau
// (décision A) donne un nom à chacun des quatre espaces, et « session »
// désignait un objet technique (le verrou de la salle) plutôt que la personne
// à qui la page s'adresse.
//
// UNE RÉEXPORTATION, PAS UNE REDIRECTION. Les quatre guides, la tuile de
// l'accueil et la visite guidée pointent vers /session?visite=1 ; une
// redirection côté navigateur perdrait ou décalerait la chaîne de requête —
// et la démonstration s'ouvrirait alors sur la console réelle. Réexporter rend
// EXACTEMENT la même page, avec la même URL et les mêmes paramètres.
export { default } from "./enseignant";
