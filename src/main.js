// Font inclusi nel pacchetto: il gioco funziona anche offline, senza Google Fonts.
import '@fontsource/vt323/400.css';
import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './styles/main.css';
import './styles/account.css';
import * as engine from './game.js';
import { initAccounts } from './account/ui.js';
import { compileCase } from './content/compile.js';
import { registerSW } from 'virtual:pwa-register';

// service worker: cache offline e aggiornamento automatico alla versione pubblicata
registerSW({ immediate: true });

// ?anteprima: pagina aperta dentro l'editor, che manda il caso da provare con postMessage
const PREVIEW = new URLSearchParams(location.search).has('anteprima');
if (PREVIEW) {
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.data?.type !== 'turno-anteprima') return;
    try {
      engine.playPreview(compileCase(e.data.case), e.data.step || 0);
      e.source?.postMessage({ type: 'turno-anteprima-ok' }, location.origin);
    } catch (err) {
      e.source?.postMessage({ type: 'turno-anteprima-errore', msg: String(err?.message || err) }, location.origin);
    }
  });
  window.parent?.postMessage({ type: 'turno-anteprima-pronta' }, location.origin);
} else {
  // account: ripristina la sessione, poi parte il caso a sorpresa oppure la schermata di accesso
  initAccounts(engine);
}
