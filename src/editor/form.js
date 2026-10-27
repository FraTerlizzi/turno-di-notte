/* Modulo del caso: schede, campi legati al file del caso tramite il loro percorso (data-path),
   componenti per lo stato del paziente. Ogni modifica chiama onChange(doc). */
import { DIFFS, VITALS, ECG, PATIENT, SKIN_LABELS, LENSES, STEP_TAGS, OUTCOMES, outcomeOf, HUD_SOURCES } from '../content/catalog.js';
import { getAt, setAt, move, emptyStep, emptyOption, clone, slugify } from './model.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

export const TABS = [
  ['generale', 'Generale'], ['scheda', 'Scheda clinica'], ['paziente', 'Paziente e monitor'],
  ['abcde', 'ABCDE'], ['tappe', 'Tappe'], ['fonti', 'Fonti e note'],
];
export function tabOf(path) {
  if (/^steps/.test(path)) return 'tappe';
  if (/^scheda/.test(path)) return 'scheda';
  if (/^(base|hud|look)/.test(path)) return 'paziente';
  if (/^abcde/.test(path)) return 'abcde';
  if (/^(src|notes)/.test(path)) return 'fonti';
  return 'generale';
}

/* ---------------------------------------------------------------- campi elementari */

const field = (label, inner, hint) => `<label class="field"><span>${label}</span>${inner}${hint ? `<small>${hint}</small>` : ''}</label>`;
const text = (doc, path, label, { hint, placeholder = '', max } = {}) =>
  field(label, `<input data-path="${path}" value="${esc(getAt(doc, path))}" placeholder="${esc(placeholder)}"${max ? ` maxlength="${max}"` : ''}>`, hint);
const area = (doc, path, label, { hint, rows = 3, placeholder = '' } = {}) =>
  field(label, `<textarea data-path="${path}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(getAt(doc, path))}</textarea>`, hint);
const num = (doc, path, label, { min, max, step = 1, placeholder = '', hint } = {}) => {
  const v = getAt(doc, path);
  return field(label, `<input type="number" data-path="${path}" data-type="num" value="${v ?? ''}" min="${min ?? ''}" max="${max ?? ''}" step="${step}" placeholder="${esc(placeholder)}">`, hint);
};
const select = (doc, path, label, options, { empty, hint, type = '' } = {}) => {
  const v = getAt(doc, path);
  const opts = (empty != null ? `<option value="">${esc(empty)}</option>` : '') +
    Object.entries(options).map(([k, l]) => `<option value="${esc(k)}"${String(v) === k ? ' selected' : ''}>${esc(l)}</option>`).join('');
  return field(label, `<select data-path="${path}"${type ? ` data-type="${type}"` : ''}>${opts}</select>`, hint);
};
const check = (doc, path, label) =>
  `<label class="check"><input type="checkbox" data-path="${path}" data-type="flag"${getAt(doc, path) ? ' checked' : ''}><span>${label}</span></label>`;
const color = (doc, path, label) => field(label, `<input type="color" data-path="${path}" value="${esc(getAt(doc, path) || '#888888')}">`);
const btn = (act, path, label, cls = 'back') => `<button type="button" class="${cls}" data-act="${act}" data-path="${path}">${label}</button>`;

/* ---------------------------------------------------------------- stato del paziente */

/* base = stato iniziale (campi pieni); altrimenti è un cambiamento: i campi vuoti restano come prima */
function stateFields(doc, path, { base = false, mode } = {}) {
  const st = getAt(doc, path) || {};
  const ph = base ? 'non impostato' : 'invariato';
  const lensMode = st.phys?.mode || mode;
  const lens = LENSES[lensMode];
  const vit = Object.entries(VITALS).map(([k, d]) => num(doc, `${path}.vit.${k}`, `${d.label} <i>${d.unit}</i>`, { min: d.min, max: d.max, step: d.step, placeholder: ph })).join('');
  const pat = Object.entries(PATIENT).map(([k, d]) => num(doc, `${path}.pat.${k}`, d.label, { min: d.min, max: d.max, step: d.step, placeholder: ph, hint: d.hint })).join('');
  const phys = lens ? Object.entries(lens.params).map(([k, d]) => num(doc, `${path}.phys.${k}`, d.label, { min: d.min, max: d.max, step: d.step, placeholder: ph, hint: d.hint })).join('') : '';
  return `<div class="stategrid">
    <fieldset><legend>Parametri vitali</legend>${vit}${select(doc, `${path}.vit.ecg`, 'Ritmo ECG', ECG, { empty: base ? undefined : 'invariato' })}</fieldset>
    <fieldset><legend>Aspetto del paziente</legend>${select(doc, `${path}.pat.skin`, 'Colore della cute', SKIN_LABELS, { empty: base ? undefined : 'invariato' })}${pat}</fieldset>
    <fieldset><legend>Lente sul corpo${lens ? ` · ${esc(lens.label)}` : ''}</legend>
      ${base ? select(doc, `${path}.phys.mode`, 'Lente', Object.fromEntries(Object.entries(LENSES).map(([k, l]) => [k, `${l.label} (${l.where})`]))) : ''}
      ${phys || '<p class="hint">Scegli prima la lente del caso.</p>'}</fieldset>
  </div>`;
}

const detailsBlock = (title, inner, open = false) => `<details class="sub"${open ? ' open' : ''}><summary>${title}</summary>${inner}</details>`;

/* ---------------------------------------------------------------- schede */

function tabGenerale(doc, ctx) {
  return `<div class="formgrid">
    ${text(doc, 'title', 'Titolo', { placeholder: 'Es. Sudore freddo alle 21:30', max: 120 })}
    ${field('Capitolo', `<select data-ctx="chapter">${ctx.chapters.map((ch) => `<option value="${esc(ch.id)}"${ch.id === ctx.chapter ? ' selected' : ''}>${esc(`Stagione ${ch.season} · ${ch.title}`)}${ch.status !== 'aperto' ? ` (${ch.status})` : ''}</option>`).join('')}</select>`, 'Dove andrà il caso. L\'ordine dentro il capitolo si decide nella pagina Capitoli.')}
    ${select(doc, 'diff', 'Difficoltà', Object.fromEntries(DIFFS.map((d) => [d, d])))}
    ${text(doc, 'area', 'Area', { placeholder: 'Es. Cardiologia' })}
    ${text(doc, 'pt', 'Paziente', { placeholder: 'Es. Sig. Marco R., 58 anni · Medicina interna, letto 7' })}
    ${text(doc, 'hook', 'Domanda-gancio', { placeholder: 'Es. Perché non il cioccolato?', hint: 'Compare sulla scena all\'inizio e come titolo del riepilogo finale.' })}
    ${field('Numero e nome breve', `<div class="row"><input value="${doc.id}" disabled style="max-width:90px"><input data-path="slug" value="${esc(doc.slug)}"><button type="button" class="back" data-act="slug" data-path="slug">Dal titolo</button></div>`, 'Il nome del file sarà numero-nome-breve.json.')}
  </div>
  ${area(doc, 'intro', 'Introduzione', { rows: 3, placeholder: 'La situazione in cui si trova l\'infermiere quando inizia l\'episodio.' })}`;
}

function tabScheda(doc) {
  const rows = (doc.scheda || []).map((r, i) => `<div class="listrow">
    <input data-path="scheda[${i}][0]" value="${esc(r[0])}" placeholder="Voce (es. Anamnesi)">
    <textarea data-path="scheda[${i}][1]" rows="2" placeholder="Contenuto">${esc(r[1])}</textarea>
    <div class="rowbtns">${btn('up', `scheda[${i}]`, '↑')}${btn('down', `scheda[${i}]`, '↓')}${btn('del', `scheda[${i}]`, '✕')}</div></div>`).join('');
  return `<p class="hint">La cartella che il giocatore legge prima di iniziare. Le parole presenti nel glossario diventano cliccabili da sole.</p>
    <div class="list">${rows}</div>${btn('add-scheda', 'scheda', '+ Aggiungi riga', 'btn ghost')}`;
}

function tabPaziente(doc) {
  const hud = (doc.hud || []).map((h, i) => `<fieldset class="hudrow"><legend>Valore ${i + 1} del monitor</legend>
    ${text(doc, `hud[${i}].label`, 'Etichetta')}
    ${select(doc, `hud[${i}].source`, 'Che cosa mostra', HUD_SOURCES)}
    ${text(doc, `hud[${i}].unit`, 'Unità')}
    ${num(doc, `hud[${i}].lo`, 'Normale da', { step: 'any' })}${num(doc, `hud[${i}].hi`, 'a', { step: 'any' })}
    ${num(doc, `hud[${i}].scale`, 'Moltiplica per', { step: 'any', placeholder: '1', hint: 'Es. 100 per mostrare in % un valore da 0 a 1' })}
    ${num(doc, `hud[${i}].decimals`, 'Decimali', { min: 0, max: 2, placeholder: '0' })}
    ${check(doc, `hud[${i}].invert`, 'Mostra l\'opposto (1 − valore)')}${check(doc, `hud[${i}].bar`, 'Mostra come barra')}
  </fieldset>`).join('');
  return `<h3 class="sec">Stato all'inizio dell'episodio</h3>${stateFields(doc, 'base', { base: true })}
    <h3 class="sec">Monitor</h3><p class="hint">Oltre ai parametri vitali, il monitor mostra due valori scelti da te: in alto il principale, a destra il secondo con il suo andamento.</p>
    <div class="hudgrid">${hud}</div>
    <h3 class="sec">Aspetto</h3><div class="formgrid">${color(doc, 'look.gown', 'Camice')}${color(doc, 'look.hair', 'Capelli')}</div>`;
}

function tabAbcde(doc) {
  const ab = doc.abcde || {};
  const letters = LETTERS.map((L) => `<div class="abcedit">
    <label class="check"><input type="checkbox" data-ctx="bad" data-l="${L}"${(ab.bad || '').includes(L) ? ' checked' : ''}><span><b>${L}</b> alterata</span></label>
    ${area(doc, `abcde.${L}`, `Cosa trova l'infermiere in ${L}`, { rows: 2 })}</div>`).join('');
  return `<p class="hint">La tappa ABCDE viene creata da sola all'inizio dell'episodio: qui scrivi cosa si trova in ogni lettera e qual è la priorità. Le spiegazioni delle risposte sbagliate si compongono in automatico.</p>
    ${letters}
    <div class="formgrid">${select(doc, 'abcde.first', 'Primo problema da trattare', Object.fromEntries(LETTERS.map((L) => [L, L])), { empty: 'scegli' })}</div>
    ${area(doc, 'abcde.why', 'Perché è la priorità', { rows: 2 })}`;
}

function optionBlock(doc, i, j, s, mode) {
  const P = `steps[${i}].opts[${j}]`;
  const o = s.opts[j];
  const out = o.ok ? null : outcomeOf(o, s);
  return `<div class="optedit${o.ok ? ' right' : ''}">
    <div class="opthead"><b>${'ABCDE'[j] || j + 1}</b>
      <label class="check"><input type="checkbox" data-path="${P}.ok" data-type="flag"${o.ok ? ' checked' : ''}><span>Risposta giusta</span></label>
      <div class="rowbtns">${btn('up', P, '↑')}${btn('down', P, '↓')}${btn('del', P, '✕')}</div></div>
    ${area(doc, `${P}.t`, 'Testo dell\'opzione', { rows: 2 })}
    ${area(doc, `${P}.fb`, o.ok ? 'Feedback (perché è giusta)' : 'Feedback (perché è sbagliata)', { rows: 2 })}
    ${o.ok ? '' : `<div class="formgrid">
      ${field('Esito sul paziente', `<select data-ctx="outcome" data-path="${P}">${Object.entries(OUTCOMES).map(([k, d]) => `<option value="${k}"${k === out ? ' selected' : ''}>${d.label}</option>`).join('')}</select>`)}
      ${out !== 'none' ? text(doc, `${P}.end`, 'Didascalia sulla scena', { placeholder: 'Es. Diventa soporoso: glicemia 36' }) : ''}</div>
      ${out !== 'none' ? detailsBlock('Come cambia il paziente', stateFields(doc, `${P}.s`, { mode })) : ''}`}
  </div>`;
}

function stepBlock(doc, i, open) {
  const s = doc.steps[i];
  const P = `steps[${i}]`;
  const mode = s.physMode?.mode || doc.base?.phys?.mode;
  const seq = (s.seq || []).map((q, k) => `<div class="seqrow">
    <div class="formgrid">${num(doc, `${P}.seq[${k}].d`, 'Durata (secondi)', { min: 0.2, step: 0.1 })}${text(doc, `${P}.seq[${k}].cap`, 'Didascalia')}</div>
    ${detailsBlock('Stato del paziente in questo momento', stateFields(doc, `${P}.seq[${k}].s`, { mode }))}
    <div class="rowbtns">${btn('up', `${P}.seq[${k}]`, '↑')}${btn('down', `${P}.seq[${k}]`, '↓')}${btn('del', `${P}.seq[${k}]`, '✕ Togli momento')}</div></div>`).join('');
  return `<details class="stepedit" data-step="${i}"${open ? ' open' : ''}>
    <summary><span class="eyebrow">Tappa ${i + 1} · ${esc(s.tag)}</span><b>${esc(s.q || 'Domanda da scrivere')}</b></summary>
    <div class="rowbtns">${btn('up', P, '↑ Su')}${btn('down', P, '↓ Giù')}${btn('dup', P, 'Duplica')}${btn('preview', P, '▶ Prova da qui')}${btn('del', P, '✕ Elimina tappa')}</div>
    <div class="formgrid">
      ${field('Tipo di tappa', `<select data-ctx="tag" data-path="${P}">${Object.keys(STEP_TAGS).map((t) => `<option${t === s.tag ? ' selected' : ''}>${t}</option>`).join('')}</select>`)}
      ${check(doc, `${P}.kn`, 'Domanda di ragionamento: le risposte sbagliate costano un cuore ma non peggiorano il paziente')}
    </div>
    ${area(doc, `${P}.text`, 'Cosa succede', { rows: 3 })}
    ${area(doc, `${P}.q`, 'Domanda', { rows: 2 })}
    <h4 class="sec">Opzioni</h4>
    ${s.opts.map((_, j) => optionBlock(doc, i, j, s, mode)).join('')}
    ${s.opts.length < 5 ? btn('add-opt', `${P}.opts`, '+ Aggiungi opzione', 'btn ghost') : ''}
    <h4 class="sec">Dopo la risposta giusta</h4>
    ${text(doc, `${P}.win`, 'Didascalia sulla scena', { placeholder: 'Es. La glicemia risale' })}
    ${area(doc, `${P}.learn`, 'Perché', { rows: 2, hint: 'Il principio da ricordare. Compare anche nel riepilogo finale.' })}
    ${area(doc, `${P}.phy[0]`, 'Fisiologia al volo · spiegazione semplice', { rows: 2 })}
    ${area(doc, `${P}.phy[1]`, 'Fisiologia al volo · esempio concreto', { rows: 2 })}
    ${detailsBlock('Come cambia il paziente dopo la risposta giusta', stateFields(doc, `${P}.out`, { mode }))}
    <h4 class="sec">Scena all'inizio della tappa</h4>
    ${detailsBlock('Stato del paziente all\'inizio della tappa', stateFields(doc, `${P}.state`, { mode }))}
    ${detailsBlock(`Animazione d'apertura (${(s.seq || []).length} momenti)`, `<p class="hint">Una sequenza di momenti mostrata prima della domanda: ogni momento dura qualche secondo, ha una didascalia e porta il paziente a un nuovo stato.${i === 0 ? ' Quella della prima tappa si vede prima della valutazione ABCDE.' : ''}</p>${seq}${btn('add-seq', `${P}.seq`, '+ Aggiungi momento', 'btn ghost')}`)}
    ${field('Cambia lente in questa tappa', `<select data-ctx="physmode" data-path="${P}"><option value="">nessun cambio</option>${Object.entries(LENSES).map(([k, l]) => `<option value="${k}"${s.physMode?.mode === k ? ' selected' : ''}>${esc(l.label)}</option>`).join('')}</select>`)}
  </details>`;
}

function tabTappe(doc, ctx) {
  return `<p class="hint">Le tappe dell'episodio, nell'ordine. La valutazione ABCDE viene aggiunta da sola prima della tappa 1.</p>
    ${doc.steps.map((_, i) => stepBlock(doc, i, ctx.openSteps.has(i))).join('')}
    <div class="row">${Object.keys(STEP_TAGS).map((t) => btn('add-step', t, `+ ${t}`, 'btn ghost')).join('')}</div>`;
}

function tabFonti(doc) {
  const src = (doc.src || []).map((s, i) => `<div class="listrow one"><input data-path="src[${i}]" value="${esc(s)}" placeholder="Es. ADA Standards of Care 2026"><div class="rowbtns">${btn('del', `src[${i}]`, '✕')}</div></div>`).join('');
  return `<h3 class="sec">Fonti</h3><p class="hint">Linee guida e riferimenti: compaiono nel riepilogo finale dell'episodio.</p>
    <div class="list">${src}</div>${btn('add-src', 'src', '+ Aggiungi fonte', 'btn ghost')}
    <h3 class="sec">Note per lo sviluppo</h3>
    ${area(doc, 'notes', 'Cosa servirebbe nel gioco per questo caso', { rows: 4, placeholder: 'Es. scena: sala operatoria · paziente: bambino di 6 anni · lente: pressione intracranica', hint: 'Il gioco non le mostra: servono a chi sviluppa nuove scene, pazienti e animazioni.' })}`;
}

const RENDER = { generale: tabGenerale, scheda: tabScheda, paziente: tabPaziente, abcde: tabAbcde, tappe: tabTappe, fonti: tabFonti };

/* ---------------------------------------------------------------- montaggio */

export function mountForm(root, { doc, chapter, chapters, readOnly, onChange, onChapter, onPreview }) {
  const ctx = { chapter, chapters, openSteps: new Set([0]), tab: 'generale' };
  const changed = () => onChange(doc);

  function render() {
    const y = window.scrollY;
    root.innerHTML = `<nav class="tabs ftabs">${TABS.map(([k, l]) => `<button type="button" class="tab${k === ctx.tab ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('')}</nav>
      <fieldset class="formbody"${readOnly ? ' disabled' : ''}>${RENDER[ctx.tab](doc, ctx)}</fieldset>`;
    window.scrollTo(0, y);
  }

  function rememberOpen() {
    ctx.openSteps = new Set([...root.querySelectorAll('.stepedit[open]')].map((d) => +d.dataset.step));
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { rememberOpen(); ctx.tab = t.dataset.tab; render(); return; }
    const b = e.target.closest('[data-act]');
    if (!b || readOnly) return;
    rememberOpen();
    const { act, path } = b.dataset;
    const keys = path.match(/^(.*)\[(\d+)\]$/);
    const parent = keys ? getAt(doc, keys[1]) : null;
    const idx = keys ? +keys[2] : -1;
    if (act === 'up' || act === 'down') {
      move(parent, idx, act === 'up' ? -1 : 1);
      if (/^steps\[\d+\]$/.test(path)) { ctx.openSteps = new Set([idx + (act === 'up' ? -1 : 1)]); }
    } else if (act === 'del') {
      parent.splice(idx, 1);
    } else if (act === 'dup') {
      parent.splice(idx + 1, 0, clone(parent[idx]));
      ctx.openSteps = new Set([idx + 1]);
    } else if (act === 'preview') {
      onPreview(idx); return;
    } else if (act === 'slug') {
      doc.slug = slugify(doc.title);
    } else if (act === 'add-scheda') {
      (doc.scheda = doc.scheda || []).push(['', '']);
    } else if (act === 'add-src') {
      (doc.src = doc.src || []).push('');
    } else if (act === 'add-opt') {
      getAt(doc, path).push(emptyOption());
    } else if (act === 'add-seq') {
      const p = path.replace(/\.seq$/, '');
      const s = getAt(doc, p);
      (s.seq = s.seq || []).push({ d: 1.5, cap: '', s: {} });
    } else if (act === 'add-step') {
      doc.steps.push(emptyStep(path));
      ctx.openSteps = new Set([doc.steps.length - 1]);
    }
    render();
    changed();
  });

  function readValue(el) {
    const type = el.dataset.type;
    if (type === 'flag') return el.checked ? 1 : undefined;
    if (type === 'num') return el.value === '' ? undefined : Number(el.value);
    if (el.tagName === 'SELECT' && el.value === '') return undefined;
    return el.value;
  }

  root.addEventListener('input', (e) => {
    const el = e.target;
    if (readOnly || !el.dataset.path || el.dataset.ctx || el.type === 'checkbox' || el.tagName === 'SELECT') return;
    setAt(doc, el.dataset.path, readValue(el));
    changed();
  });

  root.addEventListener('change', (e) => {
    const el = e.target;
    if (readOnly) return;
    const c = el.dataset.ctx;
    if (c === 'chapter') { onChapter(el.value); return; }
    if (c === 'bad') {
      const set = new Set((doc.abcde.bad || '').split(''));
      if (el.checked) set.add(el.dataset.l); else set.delete(el.dataset.l);
      doc.abcde.bad = LETTERS.filter((L) => set.has(L)).join('');
      changed(); return;
    }
    rememberOpen();
    if (c === 'outcome') {
      const o = getAt(doc, el.dataset.path);
      const d = OUTCOMES[el.value];
      o.x = d.x;
      if (d.dead) o.dead = 1; else delete o.dead;
      if (el.value === 'none') { delete o.s; delete o.end; }
      render(); changed(); return;
    }
    if (c === 'tag') {
      const s = getAt(doc, el.dataset.path);
      s.tag = el.value;
      delete s.fis; delete s.ana;
      Object.assign(s, STEP_TAGS[el.value].flags);
      render(); changed(); return;
    }
    if (c === 'physmode') {
      const s = getAt(doc, el.dataset.path);
      if (el.value) s.physMode = { mode: el.value }; else delete s.physMode;
      render(); changed(); return;
    }
    if (!el.dataset.path) return;
    const path = el.dataset.path;
    setAt(doc, path, readValue(el));
    // una risposta giusta non ha esito sul paziente
    if (/\.ok$/.test(path) && el.checked) {
      const o = getAt(doc, path.replace(/\.ok$/, ''));
      delete o.x; delete o.dead; delete o.s; delete o.end;
    }
    // cambiando lente nello stato iniziale si tengono solo i parametri della nuova lente
    if (path === 'base.phys.mode') {
      const lens = LENSES[el.value];
      for (const k of Object.keys(doc.base.phys)) if (k !== 'mode' && !(k in lens.params)) delete doc.base.phys[k];
    }
    if (el.type === 'checkbox' || el.tagName === 'SELECT') render();
    changed();
  });

  render();
  return {
    render,
    /* porta al campo di un problema segnalato dai controlli */
    focus(path) {
      ctx.tab = tabOf(path);
      const step = path.match(/^steps\[(\d+)\]/);
      if (step) ctx.openSteps = new Set([+step[1]]);
      render();
      const el = [...root.querySelectorAll('[data-path]')].find((x) => x.dataset.path === path || x.dataset.path.startsWith(path + '.') || x.dataset.path.startsWith(path + '['))
        || [...root.querySelectorAll('[data-path]')].find((x) => path.startsWith(x.dataset.path));
      if (el) {
        let d = el.closest('details');
        while (d) { d.open = true; d = d.parentElement.closest('details'); }
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.focus({ preventScroll: true });
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 1600);
      }
    },
  };
}
