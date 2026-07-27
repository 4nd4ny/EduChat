// /session — L'ANCIENNE ADRESSE DE LA CONSOLE DE CLASSE.
//
// La console vit désormais sur /enseignant : la répartition par niveau
// (décision A) donne un nom à chacun des quatre espaces, et « session »
// désignait un objet technique (le verrou de la salle) plutôt que la personne
// à qui la page s'adresse.
//
// UNE RÉEXPORTATION, PAS UNE REDIRECTION. Les quatre guides désignent
// désormais /enseignant?visite=1, mais /session reste servie : les liens
// partagés hier et les favoris des enseignants la portent encore, ?visite=1
// compris. Une redirection côté navigateur perdrait ou décalerait la chaîne de
// requête — et la démonstration s'ouvrirait alors sur la console réelle.
// Réexporter rend EXACTEMENT la même page, avec la même URL et les mêmes
// paramètres.
export { default } from "./enseignant";
