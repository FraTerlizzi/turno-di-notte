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
import { CASES } from './data/index.js';
import { registerSW } from 'virtual:pwa-register';

// service worker: cache offline e aggiornamento automatico alla versione pubblicata
registerSW({ immediate: true });

const params = new URLSearchParams(location.search);
// ?caso=13 (e facoltativo &tappa=3): apre direttamente un caso in anteprima, anche se il suo capitolo
// non è ancora aperto. Serve a provare i casi nuovi prima di pubblicarli: niente progressi salvati.
const DIRECT = CASES.find((c) => String(c.id) === params.get('caso'));
// ?anteprima: pagina aperta dentro l'editor, che manda il caso da provare con postMessage
const PREVIEW = params.has('anteprima');
if (DIRECT) {
  engine.playPreview(DIRECT, Math.max(0, Number(params.get('tappa')) || 0));
} else if (PREVIEW) {
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
