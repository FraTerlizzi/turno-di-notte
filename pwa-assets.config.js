import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

const NIGHT = '#141a3f';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // sfondo notte invece del bianco predefinito per icone mascherabili e iOS
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: NIGHT } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: NIGHT } },
  },
  images: ['public/icon.svg'],
});
