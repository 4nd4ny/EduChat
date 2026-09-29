// Fonction pour formater les tokens en kt, mt, gt, etc.
export const formatTokens = (totalTokens: number): string => {
    // Un compteur négatif, NaN ou infini ne peut venir que d'un stockage
    // corrompu : on affiche 0 plutôt que « NaN Tok. » ou « -5000.00 Tok. ».
    let num = Number.isFinite(totalTokens) && totalTokens > 0 ? totalTokens : 0;
    // Définition des seuils et unités
    // K: Mille, M: Million, B: Milliard, T: Billion (trillion), P: Billiard, E: Trillion, Z: Quadrillion, Y: Quintillion
    const units = ["", "K", "M", "G", "T", "P", "E", "Z", "Y"]; 
    let unitIndex = 0;

    // Boucle tant que le nombre est supérieur ou égal à 1000 et qu'on a des unités disponibles
    while (num >= 1000 && unitIndex < units.length - 1) {
        num /= 1000;
        unitIndex++;
    }

    // L'arrondi à 3 chiffres significatifs peut atteindre 1000 (999 999 → « 1000 K ») :
    // on passe alors à l'unité suivante (« 1.00 M »), sauf au plafond Y.
    if (Number(num.toFixed(0)) >= 1000 && num < 1000 && unitIndex < units.length - 1) {
        num /= 1000;
        unitIndex++;
    }

    // Limite le nombre à 3 chiffres significatifs
    const formattedNumber = num < 10 ? num.toFixed(2) : (num < 100 ? num.toFixed(1) : num.toFixed(0));

    // Retourne le nombre formaté avec son unité
    return `${formattedNumber} ${units[unitIndex]}Tok.`;
}