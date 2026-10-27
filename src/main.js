// Font inclusi nel pacchetto: il gioco funziona anche offline, senza Google Fonts.
import '@fontsource/vt323/400.css';
import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './styles/main.css';
import './game.js';
import { registerSW } from 'virtual:pwa-register';

// service worker: cache offline e aggiornamento automatico alla versione pubblicata
registerSW({ immediate: true });
