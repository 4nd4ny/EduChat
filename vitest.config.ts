// Configuration des jeux de tests d'EduChat (unitaires et fonctionnels).
//
// Chaque fichier de test s'exécute dans un registre de modules neuf : le
// singleton SQLite (src/server/db.ts) et les constantes lues dans
// l'environnement au chargement (src/utils/env.ts) sont donc propres à un
// fichier. tests/setup.ts lui attribue en outre un DATA_DIR temporaire à lui.
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    pool: 'forks',
    testTimeout: 20000,
    // Les journaux du serveur (codes de développement, notifications) ne
    // disent rien d'utile en test : on les tait, sauf erreur d'assertion.
    silent: 'passed-only',
  },
});
