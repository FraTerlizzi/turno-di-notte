/* Da file del caso (content/cases/*.json, quello che scrive l'editor) alla forma che usa il motore.
   Funzioni pure, senza DOM: le usano il gioco, l'editor (anteprima) e i test. */
import { ABC_L, ABC_PHY } from '../data/abcde.js';

const ORDER = ['A', 'B', 'C', 'D', 'E'];
const clone = (o) => JSON.parse(JSON.stringify(o));

/* tappa ABCDE costruita in automatico dai dati abcde del caso e messa in testa;
   l'eventuale animazione d'apertura della prima tappa passa a lei */
export function abcdeStep(ab, firstStep) {
  const seq = firstStep?.seq;
  const fi = ORDER.indexOf(ab.first);
  const opts = ORDER.map((L, i) => {
    const lab = `${L} · ${ABC_L[L][0]} (${ABC_L[L][1]})`;
    if (L === ab.first) return { t: lab, ok: 1, fb: `${ab[L]} ${ab.why}` };
    const before = i < fi;
    return { t: lab, fb: before
      ? `${ABC_L[L][0]}: ${ab[L]} Qui non serve un intervento immediato: prosegui con la lettera successiva.`
      : `${ABC_L[L][0]}: ${ab[L]} C'è però un problema prima, in ${ab.first} (${ABC_L[ab.first][0].toLowerCase()}): nell'ABCDE si interviene sul primo problema trovato, nell'ordine.` };
  });
  return {
    tag: 'ABCDE', kn: 1, abcde: ab, seq,
    text: seq ? "Ecco cosa succede. Poi valuta il paziente lettera per lettera, nell'ordine." : "Prima di qualsiasi decisione, valuta il paziente lettera per lettera, nell'ordine.",
    q: 'In quale lettera trovi il primo problema che richiede un intervento immediato?', win: 'Priorità trovata', opts,
    learn: 'Nei casi di trauma con emorragia massiva si parte dal controllo del sanguinamento (cABCDE). Dopo ogni intervento, e a ogni cambiamento, si ricomincia da A.',
    phy: ABC_PHY,
  };
}

/* valori extra del monitor: nel file sono descritti, qui diventano campi letti dal motore */
export function compileHud(h) {
  const out = { l: h.label, u: h.unit ?? '', lo: h.lo, hi: h.hi, source: h.source };
  if (h.decimals != null) out.d = h.decimals;
  if (h.bar) out.bar = 1;
  if (h.scale != null) out.scale = h.scale;
  if (h.invert) out.invert = true;
  return out;
}

/* valore attuale di un dato del monitor nello stato animato del motore ({vit, pat, phys}) */
export function hudValue(h, st) {
  if (h.source === 'calc.map') return st.vit.sys != null ? (st.vit.sys + 2 * st.vit.dia) / 3 : null;
  const [ns, key] = h.source.split('.');
  const raw = st[ns]?.[key];
  if (h.scale == null && !h.invert) return raw;
  if (raw == null) return null;
  return (h.invert ? 1 - raw : raw) * (h.scale ?? 1);
}

export function compileCase(file) {
  const c = clone(file);
  const steps = c.steps.map((s) => ({ ...s }));
  // senza lettera prioritaria (caso ancora in scrittura) la tappa ABCDE non si può costruire: l'anteprima parte dalla tappa 1
  if (c.abcde && ORDER.includes(c.abcde.first) && !steps[0]?.abcde) {
    const s0 = steps[0];
    const step = abcdeStep(c.abcde, s0);
    if (s0 && s0.seq) delete s0.seq;
    steps.unshift(step);
  }
  return {
    id: c.id, slug: c.slug, diff: c.diff, title: c.title, area: c.area, pt: c.pt, intro: c.intro,
    scheda: c.scheda || [], base: c.base, steps, src: c.src || [],
    hook: c.hook, hud: (c.hud || []).map(compileHud), look: c.look || null, notes: c.notes || '',
  };
}
