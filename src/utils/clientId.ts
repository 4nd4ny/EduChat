// Identifiant ANONYME de navigateur : un uuid aléatoire, généré une fois,
// jamais relié à une identité. Il sert uniquement au quota quotidien par
// élève des établissements (contournable en vidant le stockage — assumé
// « assez bon » dans le modèle de confiance d'une classe).

import { v4 as uuidv4 } from 'uuid';

const KEY = 'educhat-client';

export function getClientId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = uuidv4();
    localStorage.setItem(KEY, id);
  }
  return id;
}
