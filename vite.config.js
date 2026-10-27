import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const NIGHT = '#141a3f';

export default defineConfig({
  // GitHub Pages pubblica in /<nome-repo>/: la workflow passa BASE_PATH, in locale resta '/'
  base: process.env.BASE_PATH || '/',
  build: {
    target: 'es2022',
    // due pagine: il gioco e l'editor dei casi (riservato alla redazione)
    rollupOptions: { input: { main: 'index.html', editor: 'editor/index.html' } },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // icone generate da public/icon.svg (vedi pwa-assets.config.js) e collegate in automatico
      pwaAssets: { config: true, overrideManifestIcons: true },
      manifest: {
        name: 'Turno di Notte',
        short_name: 'Turno di Notte',
        description: 'Casi clinici animati di infermieristica: guardi la scena, leggi i parametri, decidi cosa fare e perché.',
        lang: 'it',
        dir: 'ltr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: NIGHT,
        theme_color: NIGHT,
        categories: ['education', 'games', 'medical'],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // l'editor non va nella cache offline dei giocatori, e il service worker non deve intercettarne la pagina
        globIgnores: ['editor/**', 'assets/editor-*'],
        navigateFallbackDenylist: [/\/editor\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
