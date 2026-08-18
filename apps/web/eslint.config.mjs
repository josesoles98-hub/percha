import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

/**
 * ESLint de la app web.
 *
 * `core-web-vitals` trae las reglas de accesibilidad y rendimiento de Next,
 * que son justo las que importan aquí: la app se usa en un iPhone con datos
 * móviles.
 *
 * eslint-config-next 16 ya exporta configuración plana, así que no hace
 * falta el puente de compatibilidad de @eslint/eslintrc.
 */
const config = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },

  ...coreWebVitals,
  ...typescript,

  {
    rules: {
      // Las variables sin usar son error, pero se permite el prefijo _ para
      // los argumentos que hay que declarar aunque no se usen.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

export default config;
