/* Controlli sui file dei casi e dei capitoli. Restituiscono un elenco di problemi
   { level: 'error' | 'warning', path, msg }: con un errore il caso non si pubblica, un avviso va solo letto.
   Li usano i test (npm test) e l'editor, dal vivo. */
import { DIFFS, VITALS, ECG, PATIENT, SKIN, LENSES, STEP_TAGS, HUD_SOURCES } from './catalog.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const isText = (s) => typeof s === 'string' && s.trim().length > 0;
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const HEX = /^#[0-9a-f]{6}$/i;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/* nomi leggibili dei percorsi, per mostrarli nell'editor */
export function describePath(path) {
  return path
    .replace(/^steps\[(\d+)\]/, (_, i) => `Tappa ${+i + 1}`)
    .replace(/\.opts\[(\d+)\]/, (_, i) => ` · Opzione ${'ABCDE'[+i] || +i + 1}`)
    .replace(/\.seq\[(\d+)\]/, (_, i) => ` · Animazione, momento ${+i + 1}`)
    .replace(/^scheda\[(\d+)\]/, (_, i) => `Scheda clinica, riga ${+i + 1}`)
    .replace(/^hud\[(\d+)\]/, (_, i) => `Monitor, valore ${+i + 1}`)
    .replace(/^src\[(\d+)\]/, (_, i) => `Fonte ${+i + 1}`)
    .replace(/^abcde\.?/, 'ABCDE ')
    .replace(/^base\./, 'Stato iniziale · ');
}

function checkState(st, path, out, { mode } = {}) {
  if (st == null) return;
  if (typeof st !== 'object') { out.push({ level: 'error', path, msg: 'stato non valido' }); return; }
  for (const k of Object.keys(st)) if (!['vit', 'pat', 'phys'].includes(k)) out.push({ level: 'warning', path, msg: `campo sconosciuto "${k}"` });
  for (const [k, v] of Object.entries(st.vit || {})) {
    if (k === 'ecg') { if (!ECG[v]) out.push({ level: 'error', path: `${path}.vit.ecg`, msg: `ritmo ECG sconosciuto "${v}"` }); continue; }
    const def = VITALS[k];
    if (!def) out.push({ level: 'warning', path: `${path}.vit`, msg: `parametro vitale sconosciuto "${k}"` });
    else if (!isNum(v) || v < def.min || v > def.max) out.push({ level: 'error', path: `${path}.vit.${k}`, msg: `${def.label} fuori dall'intervallo ${def.min}–${def.max}` });
  }
  for (const [k, v] of Object.entries(st.pat || {})) {
    if (k === 'skin') { if (!SKIN[v]) out.push({ level: 'error', path: `${path}.pat.skin`, msg: `colore della cute sconosciuto "${v}"` }); continue; }
    const def = PATIENT[k];
    if (!def) out.push({ level: 'warning', path: `${path}.pat`, msg: `aspetto del paziente sconosciuto "${k}"` });
    else if (!isNum(v) || v < def.min || v > def.max) out.push({ level: 'error', path: `${path}.pat.${k}`, msg: `${def.label} fuori dall'intervallo ${def.min}–${def.max}` });
  }
  if (st.phys) {
    const m = st.phys.mode || mode;
    if (st.phys.mode && !LENSES[st.phys.mode]) out.push({ level: 'error', path: `${path}.phys.mode`, msg: `lente sconosciuta "${st.phys.mode}"` });
    const lens = LENSES[m];
    for (const [k, v] of Object.entries(st.phys)) {
      if (k === 'mode') continue;
      const def = lens && lens.params[k];
      if (!def) { if (lens) out.push({ level: 'warning', path: `${path}.phys`, msg: `parametro "${k}" non usato dalla lente "${lens.label}"` }); continue; }
      if (!isNum(v) || v < def.min || v > def.max) out.push({ level: 'error', path: `${path}.phys.${k}`, msg: `${def.label} fuori dall'intervallo ${def.min}–${def.max}` });
    }
  }
}

export function validateCase(c) {
  const out = [];
  const err = (path, msg) => out.push({ level: 'error', path, msg });
  const warn = (path, msg) => out.push({ level: 'warning', path, msg });
  if (!c || typeof c !== 'object') return [{ level: 'error', path: '', msg: 'il caso è vuoto' }];

  if (!Number.isInteger(c.id) || c.id < 1) err('id', 'numero del caso mancante o non valido');
  if (!SLUG.test(c.slug || '')) err('slug', 'nome breve mancante o non valido (solo lettere minuscole, numeri e trattini)');
  for (const [k, label] of [['title', 'Titolo'], ['area', 'Area'], ['pt', 'Paziente'], ['intro', 'Introduzione'], ['hook', 'Domanda-gancio']]) if (!isText(c[k])) err(k, `${label} mancante`);
  if (!DIFFS.includes(c.diff)) err('diff', `difficoltà da scegliere tra ${DIFFS.join(', ')}`);

  if (!Array.isArray(c.scheda) || !c.scheda.length) warn('scheda', 'la scheda clinica è vuota');
  (c.scheda || []).forEach((r, i) => { if (!Array.isArray(r) || !isText(r[0]) || !isText(r[1])) err(`scheda[${i}]`, 'riga incompleta: servono voce e contenuto'); });

  if (!c.look || !HEX.test(c.look.gown || '') || !HEX.test(c.look.hair || '')) warn('look', 'colori di camice e capelli mancanti: ne verranno usati di predefiniti');

  if (!c.base || !c.base.vit || !c.base.pat || !c.base.phys) err('base', 'stato iniziale incompleto: servono parametri vitali, aspetto del paziente e lente');
  else {
    if (!LENSES[c.base.phys.mode]) err('base.phys.mode', 'scegli la lente sul corpo');
    checkState(c.base, 'base', out);
    for (const k of ['hr', 'sys', 'dia', 'spo2', 'rr', 'temp']) if (c.base.vit[k] == null) warn(`base.vit.${k}`, `${VITALS[k].label} iniziale non impostata`);
  }
  const mode = c.base?.phys?.mode;

  if (!Array.isArray(c.hud) || c.hud.length !== 2) err('hud', 'servono esattamente due valori extra per il monitor');
  (c.hud || []).forEach((h, i) => {
    if (!isText(h.label)) err(`hud[${i}]`, 'etichetta mancante');
    if (!HUD_SOURCES[h.source]) err(`hud[${i}]`, `fonte del valore sconosciuta "${h.source}"`);
    if (!isNum(h.lo) || !isNum(h.hi) || h.lo >= h.hi) err(`hud[${i}]`, 'intervallo normale non valido (il minimo deve essere sotto il massimo)');
    if (h.source?.startsWith('phys.') && LENSES[mode] && !LENSES[mode].params[h.source.slice(5)]) warn(`hud[${i}]`, 'il valore viene da una lente diversa da quella del caso: resterà vuoto finché quella lente non è attiva');
  });

  const ab = c.abcde;
  if (!ab) err('abcde', 'valutazione ABCDE mancante');
  else {
    if (!LETTERS.includes(ab.first)) err('abcde.first', 'scegli la lettera prioritaria');
    else if (!(ab.bad || '').includes(ab.first)) err('abcde.bad', 'la lettera prioritaria deve essere tra quelle alterate');
    if ([...(ab.bad || '')].some((L) => !LETTERS.includes(L))) err('abcde.bad', 'lettere alterate non valide');
    for (const L of LETTERS) if (!isText(ab[L])) err(`abcde.${L}`, `manca la descrizione della lettera ${L}`);
    if (!isText(ab.why)) err('abcde.why', 'manca il perché della priorità');
  }

  if (!Array.isArray(c.steps) || !c.steps.length) err('steps', 'il caso non ha tappe');
  (c.steps || []).forEach((s, i) => {
    const P = `steps[${i}]`;
    if (s.abcde) { err(P, 'la tappa ABCDE si genera da sola: non va scritta tra le tappe'); return; }
    if (!STEP_TAGS[s.tag]) err(`${P}.tag`, `tipo di tappa sconosciuto "${s.tag}"`);
    else for (const [f, v] of Object.entries(STEP_TAGS[s.tag].flags)) if (s[f] !== v) warn(`${P}.tag`, `le tappe "${s.tag}" di solito hanno ${f}=${v}`);
    if (!isText(s.text)) err(`${P}.text`, 'testo della tappa mancante');
    if (!isText(s.q)) err(`${P}.q`, 'domanda mancante');
    if (!Array.isArray(s.opts) || s.opts.length < 2) err(`${P}.opts`, 'servono almeno due opzioni');
    else if (s.opts.length > 5) err(`${P}.opts`, 'al massimo cinque opzioni (lettere A-E)');
    const opts = s.opts || [];
    const right = opts.filter((o) => o.ok);
    if (!right.length) err(`${P}.opts`, 'nessuna risposta giusta');
    if (right.length > 1) warn(`${P}.opts`, 'più di una risposta giusta: basta sceglierne una qualsiasi per andare avanti');
    opts.forEach((o, j) => {
      const O = `${P}.opts[${j}]`;
      if (!isText(o.t)) err(O, 'testo dell\'opzione mancante');
      if (!isText(o.fb)) err(O, 'feedback mancante');
      if (o.ok) { if (o.x || o.dead) err(O, 'una risposta giusta non può peggiorare il paziente'); return; }
      const x = o.x != null ? o.x : s.kn ? 0 : 1;
      if (![0, 1, 2].includes(x)) err(O, 'gravità non valida');
      if (o.dead && x !== 2) err(O, 'il decesso richiede gravità "evento critico"');
      if (x > 0 && !isText(o.end)) warn(O, 'manca la didascalia dell\'esito (la frase mostrata sulla scena)');
      if (x > 0 && !o.s) warn(O, 'l\'esito non cambia lo stato del paziente: la scena resterà uguale');
      checkState(o.s, `${O}.s`, out, { mode });
    });
    if (!isText(s.learn)) warn(`${P}.learn`, 'manca il "Perché" mostrato dopo la risposta giusta');
    if (s.phy && (!Array.isArray(s.phy) || s.phy.length !== 2 || !s.phy.every(isText))) err(`${P}.phy`, 'la fisiologia al volo vuole una spiegazione e un esempio');
    if (!s.phy) warn(`${P}.phy`, 'manca la fisiologia al volo');
    (s.seq || []).forEach((q, k) => {
      if (!isNum(q.d) || q.d <= 0) err(`${P}.seq[${k}]`, 'durata del momento non valida');
      checkState(q.s, `${P}.seq[${k}].s`, out, { mode });
    });
    checkState(s.out, `${P}.out`, out, { mode });
    checkState(s.state, `${P}.state`, out, { mode });
    if (s.physMode && !LENSES[s.physMode.mode]) err(`${P}.physMode`, 'lente sconosciuta');
  });

  if (!Array.isArray(c.src) || !c.src.length) err('src', 'servono le fonti');
  (c.src || []).forEach((s, i) => { if (!isText(s)) err(`src[${i}]`, 'fonte vuota'); });
  return out;
}

export function validateChapters(chapters, cases) {
  const out = [];
  const ids = new Set(cases.map((c) => c.id));
  const seen = new Map();
  if (!Array.isArray(chapters) || !chapters.length) return [{ level: 'error', path: 'chapters', msg: 'nessun capitolo' }];
  const chIds = chapters.map((ch) => ch.id);
  chapters.forEach((ch, i) => {
    const P = `chapters[${i}]`;
    if (!isText(ch.id) || chIds.indexOf(ch.id) !== i) out.push({ level: 'error', path: P, msg: 'id del capitolo mancante o ripetuto' });
    if (!isText(ch.title)) out.push({ level: 'error', path: P, msg: 'titolo del capitolo mancante' });
    if (!['aperto', 'in-arrivo', 'bozza'].includes(ch.status)) out.push({ level: 'error', path: P, msg: `stato non valido "${ch.status}"` });
    if (ch.status === 'aperto' && !(ch.cases || []).length) out.push({ level: 'error', path: P, msg: 'un capitolo aperto deve avere almeno un caso' });
    for (const id of ch.cases || []) {
      if (!ids.has(id)) out.push({ level: 'error', path: P, msg: `il caso ${id} non esiste` });
      if (seen.has(id)) out.push({ level: 'error', path: P, msg: `il caso ${id} è già nel capitolo ${seen.get(id)}` });
      seen.set(id, ch.id);
    }
  });
  return out;
}

export function validateCollection(cases, chapters) {
  const out = [];
  const dup = (key) => cases.map((c) => c[key]).filter((v, i, a) => a.indexOf(v) !== i);
  for (const id of new Set(dup('id'))) out.push({ level: 'error', path: 'id', msg: `numero di caso ripetuto: ${id}` });
  for (const s of new Set(dup('slug'))) out.push({ level: 'error', path: 'slug', msg: `nome breve ripetuto: ${s}` });
  return out.concat(validateChapters(chapters, cases));
}

export const errorsOnly = (list) => list.filter((p) => p.level === 'error');
