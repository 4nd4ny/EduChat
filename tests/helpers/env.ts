// Changer la configuration serveur le temps d'un test.
//
// src/utils/env.ts fige ses constantes au chargement : pour qu'une nouvelle
// valeur soit vue, il faut poser l'environnement PUIS recharger les modules.
// avecEnv() fait les deux ; les modules chargés ensuite (import dynamique)
// voient la nouvelle configuration — et une base neuve si DATA_DIR change.
import { vi } from 'vitest';

export function poserEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  vi.resetModules();
}
