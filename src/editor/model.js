/* Logica pura dell'editor: modello di caso nuovo, numerazione, accesso ai campi per percorso,
   confronto tra versioni. Nessun DOM, nessuna rete: si testa in tests/editor.test.js. */

export const clone = (o) => JSON.parse(JSON.stringify(o));

export const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48).replace(/-$/, '') || 'caso';

export const fileName = (c) => `${String(c.id).padStart(3, '0')}-${c.slug}.json`;

/* primo numero libero, contando i casi pubblicati e quelli in bozza */
export function nextCaseId(published, drafts) {
  const ids = [...published.map((c) => c.id), ...drafts.map((d) => d.data?.id ?? d.case_id)].filter(Number.isInteger);
  return (ids.length ? Math.max(...ids) : 0) + 1;
}

export const emptyOption = (ok = false) => (ok ? { t: '', ok: 1, fb: '' } : { t: '', fb: '' });

export function emptyStep(tag = 'Decisione') {
  const s = { tag, text: '', q: '', win: '', opts: [emptyOption(true), emptyOption(), emptyOption()], learn: '', phy: ['', ''] };
  if (tag === 'Fisiologia') Object.assign(s, { fis: 1, kn: 1 });
  if (tag === 'Anatomia') Object.assign(s, { ana: 1, kn: 1 });
  return s;
}

export function newCase(id) {
  return {
    id, slug: `caso-${id}`, title: '', diff: 'Media', area: '', pt: '', hook: '', intro: '',
    look: { gown: '#4f86c6', hair: '#2b1d14' },
    scheda: [['Motivo del ricovero', ''], ['Anamnesi', ''], ['Terapia', ''], ['Parametri', '']],
    base: {
      vit: { hr: 80, sys: 125, dia: 75, spo2: 97, rr: 16, temp: 36.8, ecg: 'sinus' },
      pat: { pose: 1, skin: 'normal', eyes: 1 },
      phys: { mode: 'vessel', dilation: 0.3 },
    },
    hud: [
      { label: 'Saturazione', source: 'vit.spo2', unit: '%', lo: 92, hi: 101 },
      { label: 'Freq. cardiaca', source: 'vit.hr', unit: 'bpm', lo: 50, hi: 110 },
    ],
    abcde: { bad: '', first: '', A: '', B: '', C: '', D: '', E: '', why: '' },
    steps: [emptyStep('Valutazione'), emptyStep('Decisione')],
    src: [''],
    notes: '',
  };
}

/* copia di un caso con un numero nuovo (per "Duplica") */
export function duplicateCase(c, id) {
  const d = clone(c);
  d.id = id;
  d.title = c.title ? `${c.title} (copia)` : '';
  d.slug = slugify(d.title || `caso-${id}`);
  return d;
}

/* percorsi come "steps[2].opts[0].fb" */
export function parsePath(path) {
  return String(path).split('.').flatMap((part) => {
    const out = [];
    const m = part.match(/^([^[\]]*)((?:\[\d+\])*)$/);
    if (!m) return [part];
    if (m[1]) out.push(m[1]);
    for (const n of m[2].matchAll(/\[(\d+)\]/g)) out.push(Number(n[1]));
    return out;
  });
}

export function getAt(obj, path) {
  return parsePath(path).reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/* scrive un valore creando gli oggetti intermedi; undefined o '' su un campo numerico opzionale lo cancella */
export function setAt(obj, path, value) {
  const keys = parsePath(path);
  let o = obj;
  keys.slice(0, -1).forEach((k, i) => {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = typeof keys[i + 1] === 'number' ? [] : {};
    o = o[k];
  });
  const last = keys[keys.length - 1];
  if (value === undefined) { if (Array.isArray(o)) o.splice(last, 1); else delete o[last]; }
  else o[last] = value;
  return obj;
}

export function move(arr, i, delta) {
  const j = i + delta;
  if (j < 0 || j >= arr.length) return arr;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return arr;
}

/* cosa è cambiato tra due versioni di un caso, in parole: per lo storico delle versioni */
const LABELS = {
  title: 'titolo', diff: 'difficoltà', area: 'area', pt: 'paziente', hook: 'domanda-gancio', intro: 'introduzione',
  look: 'aspetto', scheda: 'scheda clinica', base: 'stato iniziale', hud: 'monitor', abcde: 'ABCDE', src: 'fonti', notes: 'note', slug: 'nome breve', id: 'numero',
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function diffCases(a, b) {
  if (!a || !b) return ['tutto'];
  const out = [];
  for (const [k, label] of Object.entries(LABELS)) if (!same(a[k], b[k])) out.push(label);
  const sa = a.steps || [], sb = b.steps || [];
  if (sa.length !== sb.length) out.push(`tappe: da ${sa.length} a ${sb.length}`);
  const n = Math.min(sa.length, sb.length);
  for (let i = 0; i < n; i++) if (!same(sa[i], sb[i])) out.push(`tappa ${i + 1}`);
  return out;
}

/* chi può fare cosa su una bozza (le stesse regole le applica il database) */
export function permissions(draft, { uid, role }) {
  const admin = role === 'admin';
  const mine = draft?.author_id === uid;
  return {
    edit: admin || (role === 'autore' && mine && draft.status === 'bozza'),
    submit: (admin || mine) && draft?.status === 'bozza',
    review: admin && draft?.status === 'in-revisione',
    remove: admin,
  };
}

export const STATUS_LABELS = { bozza: 'Bozza', 'in-revisione': 'In revisione', approvato: 'Approvato', pubblicato: 'Pubblicato' };
