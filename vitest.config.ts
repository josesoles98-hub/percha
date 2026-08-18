import { defineConfig } from 'vitest/config';

/**
 * Tests de la base de datos.
 *
 * Van aparte de los de los workspaces porque levantan un PostgreSQL entero
 * por archivo y son bastante más lentos. Se lanzan con `npm run test:db`.
 */
export default defineConfig({
  test: {
    include: ['supabase/tests/**/*.test.ts'],
    // Levantar el motor y aplicar siete migraciones lleva su tiempo.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Un PostgreSQL por archivo en paralelo se come la memoria.
    fileParallelism: false,
  },
});
