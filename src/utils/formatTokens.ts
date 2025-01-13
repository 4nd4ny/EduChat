// Fonction pour formater les tokens en kt, mt, gt, etc.
export const formatTokens = (totalTokens: number): string => {
    let num = totalTokens;
    // Définition des seuils et unités
    // K: Mille, M: Million, B: Milliard, T: Billion (trillion), P: Billiard, E: Trillion, Z: Quadrillion, Y: Quintillion
    const units = ["", "K", "M", "G", "T", "P", "E", "Z", "Y"]; 
    let unitIndex = 0;

    // Boucle tant que le nombre est supérieur ou égal à 1000 et qu'on a des unités disponibles
    while (num >= 1000 && unitIndex < units.length - 1) {
        num /= 1000;
        unitIndex++;
    }

    // Limite le nombre à 3 chiffres significatifs
    const formattedNumber = num < 10 ? num.toFixed(2) : (num < 100 ? num.toFixed(1) : num.toFixed(0));

    // Retourne le nombre formaté avec son unité
    return `${formattedNumber} ${units[unitIndex]}Tok.`;
}