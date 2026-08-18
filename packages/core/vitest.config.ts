import { defineConfig } from 'vitest/config';

/**
 * Config propia para que no herede la de la raíz, que apunta a los tests
 * de la base de datos.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
