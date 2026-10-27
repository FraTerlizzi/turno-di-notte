import { defineConfig } from 'vitest/config';

// configurazione separata da vite.config.js: i test non devono caricare il plugin PWA
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
