import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'dev-dist/', 'legacy/', 'node_modules/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', { caughtErrors: 'none' }],
    },
  },
  {
    files: ['*.config.js', 'tests/**', 'scripts/**'],
    languageOptions: { globals: { ...globals.node } },
  },
];
