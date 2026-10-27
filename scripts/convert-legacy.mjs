// Conversione una tantum, già eseguita: dai vecchi moduli in src/data/ a un file JSON per caso in content/cases/
// e all'elenco dei capitoli in content/chapters.json. Conservato come documentazione del passaggio:
// src/data/cases.js e physiology.js non esistono più (sono nella cronologia git), quindi lo script non va rieseguito.
import { mkdirSync, writeFileSync } from 'node:fs';
import { CASES, ROAD } from '../src/data/cases.js';
import { PHY } from '../src/data/physiology.js';
import { ABCDE } from '../src/data/abcde.js';
import { GOWN, HAIR } from '../src/data/costumes.js';

// i valori extra del monitor erano funzioni dentro il motore (EXTRA in src/game.js): qui in forma dichiarativa
const H = (label, source, unit, lo, hi, more = {}) => ({ label, source, unit, lo, hi, ...more });
const HOOK_HUD = {
  1: ['Perché non il cioccolato?', [H('Glicemia', 'phys.glu', 'mg/dL', 70, 250), H('Freq. cardiaca', 'vit.hr', 'bpm', 50, 110)]],
  2: ['Perché seduta con le gambe giù?', [H('Saturazione', 'vit.spo2', '%', 92, 101), H('Respiri/min', 'vit.rr', '', 10, 24)]],
  3: ['Perché non puntare al 100%?', [H('Saturazione', 'vit.spo2', '%', 88, 93), H('CO₂ nel sangue', 'phys.co2', '%', 0, 70, { scale: 100, bar: true })]],
  4: ['Perché dorme così bene?', [H('Respiri/min', 'vit.rr', '', 10, 24), H('Saturazione', 'vit.spo2', '%', 92, 101)]],
  5: ['Perché l\'adrenalina nella coscia?', [H('PA sistolica', 'vit.sys', 'mmHg', 90, 180), H('Saturazione', 'vit.spo2', '%', 92, 101)]],
  6: ['Perché restare nei primi 15 minuti?', [H('Temperatura', 'vit.temp', '°C', 35, 38, { decimals: 1 }), H('PA sistolica', 'vit.sys', 'mmHg', 90, 180)]],
  7: ['Perché conta l\'ultima volta visto bene?', [H('Flusso cerebrale', 'phys.occlusion', '%', 60, 101, { scale: 100, invert: true }), H('PA sistolica', 'vit.sys', 'mmHg', 90, 185)]],
  8: ['Perché non massaggiare il polpaccio?', [H('Saturazione', 'vit.spo2', '%', 92, 101), H('Freq. cardiaca', 'vit.hr', 'bpm', 50, 110)]],
  9: ['Perché crolla la pressione senza perdere sangue?', [H('Pressione media', 'calc.map', 'mmHg', 65, 110), H('Temperatura', 'vit.temp', '°C', 35, 38, { decimals: 1 })]],
  10: ['Perché il calcio, se non abbassa il potassio?', [H('Potassio', 'phys.k', 'mmol/L', 3.5, 5.5, { decimals: 1 }), H('Freq. cardiaca', 'vit.hr', 'bpm', 50, 110)]],
  11: ['Perché non partire subito con l\'insulina?', [H('Glicemia', 'phys.glu', 'mg/dL', 70, 250), H('Respiri/min', 'vit.rr', '', 10, 24)]],
  12: ['Perché è svenuta appena seduta?', [H('PA sistolica', 'vit.sys', 'mmHg', 90, 180), H('Riempimento', 'phys.preload', '%', 30, 101, { scale: 100, bar: true })]],
};

export const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48).replace(/-$/, '');

mkdirSync('content/cases', { recursive: true });
CASES.forEach((c, i) => {
  const [hook, hud] = HOOK_HUD[c.id];
  const phy = PHY[c.id] || [];
  const { id, title, diff, area, pt, intro, scheda, base, steps, src, ...rest } = c;
  if (Object.keys(rest).length) throw new Error(`caso ${id}: campi non previsti ${Object.keys(rest)}`);
  const out = {
    id, slug: slugify(title), title, diff, area, pt, hook, intro,
    look: { gown: GOWN[i % GOWN.length], hair: HAIR[i % HAIR.length] },
    scheda, base, hud,
    abcde: ABCDE[id],
    steps: steps.map((s, j) => (phy[j] ? { ...s, phy: phy[j] } : { ...s })),
    src,
    notes: '',
  };
  const file = `content/cases/${String(id).padStart(3, '0')}-${out.slug}.json`;
  writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  console.log(file);
});

const chapters = [
  { id: 'c1', season: 1, title: 'Primo turno', area: 'Medicina e reparti', status: 'aperto', cases: CASES.map((c) => c.id) },
  ...ROAD.map(([, area, from, to], k) => ({ id: `c${k + 2}`, season: k + 2, title: area, area, status: 'in-arrivo', cases: [], planned: [from, to] })),
];
writeFileSync('content/chapters.json', JSON.stringify(chapters, null, 2) + '\n');
console.log('content/chapters.json');
