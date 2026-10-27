/* Editor dei casi: accesso riservato alla redazione, elenco, modifica con controlli dal vivo,
   anteprima nel gioco vero, bozze e versioni, revisione, capitoli e redazione. */
import '@fontsource/vt323/400.css';
import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '../styles/main.css';
import '../styles/account.css';
import '../styles/editor.css';
import * as S from '../account/session.js';
import * as D from './store.js';
import { CASE_FILES, CHAPTERS } from '../data/index.js';
import { validateCase, validateChapters, describePath } from '../content/validate.js';
import { mountForm } from './form.js';
import { clone, newCase, duplicateCase, nextCaseId, diffCases, permissions, fileName, STATUS_LABELS } from './model.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (d) => (d ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(d)) : '—');
const chip = (status) => `<span class="chip st-${status}">${STATUS_LABELS[status] || status}</span>`;
const PUBLISHED = [...CASE_FILES].sort((a, b) => a.id - b.id);
const chapterOf = (id) => CHAPTERS.find((ch) => ch.cases.includes(id));
const who = (uid) => (uid && uid === S.state.user?.id ? 'tu' : 'un altro membro della redazione');
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage pieno o bloccato */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* idem */ } };

let leaveGuard = null; // salvataggio in sospeso quando si cambia pagina

/* ---------------------------------------------------------------- avvio e accesso */

async function boot() {
  if (!S.enabled) { app.innerHTML = page('Editor non disponibile', '<p>Gli account non sono configurati in questa installazione (mancano le chiavi di Supabase).</p>'); return; }
  // si ridisegna solo quando cambia chi è collegato o il suo ruolo, non a ogni rinnovo della sessione
  let current = null;
  S.onChange((st) => { const k = `${st.user?.id || ''}:${st.role || ''}`; if (k !== current) { current = k; route(); } });
  await S.init(null, { progress: false });
  current = `${S.state.user?.id || ''}:${S.state.role || ''}`;
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', (e) => { if (leaveGuard?.dirty()) { e.preventDefault(); e.returnValue = ''; } });
  route();
}

function page(title, body, { back } = {}) {
  return `<header class="edhead"><div class="left">${back ? `<a class="back" href="${back}">← Indietro</a>` : ''}<div class="ttl"><div class="eyebrow">Turno di Notte · Editor dei casi</div><h2>${title}</h2></div></div>
    ${S.state.user ? `<div class="row"><span class="whoami">● ${esc(S.state.profile?.display_name)} · ${S.state.role === 'admin' ? 'amministratore' : S.state.role === 'autore' ? 'autore' : 'nessun ruolo'}</span><button class="back" data-logout>Esci</button></div>` : ''}</header>${body}`;
}

function loginPage(msg = '') {
  app.innerHTML = page('Accesso riservato', `<div class="card narrow"><p class="story">L'editor è per la redazione: entra con l'account del gioco.</p>
    <form class="form" id="fEdLogin" novalidate>
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn" type="submit">Accedi</button></form>
    <p class="msg${msg ? ' bad' : ''}" id="edMsg"${msg ? '' : ' hidden'}>${esc(msg)}</p>
    <p class="hint">Non hai un account? Crealo dal gioco, poi chiedi all'amministratore di aggiungerti alla redazione.</p></div>`);
  $('fEdLogin').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try { await S.signIn({ email: f.email.value.trim(), password: f.password.value }); } catch (err) { loginPage(S.explain(err)); }
  };
}

document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-logout]')) { if (leaveGuard) await leaveGuard.flush(); await S.signOut(); location.hash = '#/'; }
});

async function route() {
  if (leaveGuard) { const g = leaveGuard; leaveGuard = null; await g.flush(); }
  if (!S.state.user) return loginPage();
  if (!S.state.role) {
    app.innerHTML = page('Accesso riservato', `<div class="card narrow"><p class="story">Il tuo account (${esc(S.state.profile?.display_name)}) non fa parte della redazione.</p>
      <p class="hint">Chiedi a un amministratore di aggiungerti come autore dalla pagina Redazione dell'editor, poi ricarica questa pagina.</p></div>`);
    return;
  }
  const [, view, arg] = (location.hash || '#/').match(/^#\/([^/]*)\/?(.*)$/) || [];
  try {
    if (view === 'bozza' && arg) await openDraft(arg);
    else if (view === 'capitoli') await chaptersPage();
    else if (view === 'redazione' && S.state.role === 'admin') await teamPage();
    else await homePage();
  } catch (err) {
    app.innerHTML = page('Errore', `<p class="msg bad">${esc(S.explain(err))}</p><p><a class="back" href="#/">← Torna all'elenco</a></p>`);
  }
}

/* ---------------------------------------------------------------- elenco */

async function homePage() {
  app.innerHTML = page('Casi e bozze', '<p class="hint">Caricamento…</p>');
  const drafts = await D.listDrafts();
  const admin = S.state.role === 'admin';
  const chOpts = CHAPTERS.map((ch) => `<option value="${esc(ch.id)}">${esc(`Stagione ${ch.season} · ${ch.title}`)}</option>`).join('');
  const openDrafts = drafts.filter((d) => d.status !== 'pubblicato');
  const draftFor = (id) => openDrafts.find((d) => d.case_id === id);
  app.innerHTML = page('Casi e bozze', `
    <div class="row edtools">
      <form class="row" id="fNew"><select name="chapter">${chOpts}</select><button class="btn" type="submit">+ Nuovo caso</button></form>
      <a class="btn ghost" href="#/capitoli">Capitoli</a>${admin ? '<a class="btn ghost" href="#/redazione">Redazione</a>' : ''}
    </div>
    <section class="card"><span class="tag">Bozze</span>
      <div class="row filt"><select id="fltStatus"><option value="">Tutti gli stati</option>${Object.entries(STATUS_LABELS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
        <select id="fltCh"><option value="">Tutti i capitoli</option>${chOpts}</select></div>
      <div id="draftList"></div>
    </section>
    <section class="card"><span class="tag fis">Casi pubblicati</span>
      <p class="hint">Sono i casi nel gioco. "Modifica" crea una bozza: il caso pubblicato cambia solo quando la bozza viene approvata e pubblicata.</p>
      <ul class="edlist">${PUBLISHED.map((c) => {
        const ch = chapterOf(c.id); const d = draftFor(c.id);
        return `<li><span><b>${String(c.id).padStart(3, '0')} · ${esc(c.title)}</b><small>${esc(c.area)} · ${esc(c.diff)}${ch ? ` · ${esc(ch.title)}` : ' · in nessun capitolo'}</small></span>
          <span class="row">${d ? `<a class="back" href="#/bozza/${d.id}">Apri la bozza ${chip(d.status)}</a>` : `<button class="back" data-edit="${c.id}">Modifica</button>`}<button class="back" data-dup="${c.id}">Duplica</button></span></li>`;
      }).join('')}</ul>
    </section>`);

  const renderDrafts = () => {
    const st = $('fltStatus').value, ch = $('fltCh').value;
    const list = drafts.filter((d) => (!st || d.status === st) && (!ch || d.chapter === ch));
    $('draftList').innerHTML = list.length ? `<ul class="edlist">${list.map((d) => {
      const errs = validateCase(d.data).filter((p) => p.level === 'error').length;
      return `<li><span><a href="#/bozza/${d.id}"><b>${esc(d.title)}</b></a><small>${d.case_id ? `modifica del caso ${d.case_id}` : `caso nuovo n. ${d.data?.id ?? '?'}`} · ${esc(CHAPTERS.find((c) => c.id === d.chapter)?.title || 'capitolo da scegliere')} · di ${who(d.author_id)} · ${fmt(d.updated_at)}</small></span>
        <span class="row">${chip(d.status)}${errs ? `<span class="chip st-err">${errs} ${errs === 1 ? 'errore' : 'errori'}</span>` : ''}</span></li>`;
    }).join('')}</ul>` : '<p class="hint">Nessuna bozza.</p>';
  };
  $('fltStatus').onchange = renderDrafts; $('fltCh').onchange = renderDrafts;
  renderDrafts();

  $('fNew').onsubmit = async (e) => {
    e.preventDefault();
    const data = newCase(nextCaseId(PUBLISHED, drafts));
    const d = await D.createDraft({ chapter: e.target.chapter.value, title: 'Nuovo caso', data });
    location.hash = `#/bozza/${d.id}`;
  };
  app.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = async () => {
    const c = PUBLISHED.find((x) => x.id === +b.dataset.edit);
    const d = await D.createDraft({ case_id: c.id, chapter: chapterOf(c.id)?.id || null, title: c.title, data: clone(c) });
    location.hash = `#/bozza/${d.id}`;
  }; });
  app.querySelectorAll('[data-dup]').forEach((b) => { b.onclick = async () => {
    const c = PUBLISHED.find((x) => x.id === +b.dataset.dup);
    const data = duplicateCase(c, nextCaseId(PUBLISHED, drafts));
    const d = await D.createDraft({ chapter: chapterOf(c.id)?.id || null, title: data.title, data });
    location.hash = `#/bozza/${d.id}`;
  }; });
}

/* ---------------------------------------------------------------- anteprima nel gioco vero */

const preview = (() => {
  let frame = null, ready = false, pending = null;
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    if (e.data?.type === 'turno-anteprima-pronta') { ready = true; if (pending) { send(pending); pending = null; } }
    if (e.data?.type === 'turno-anteprima-errore') $('pvMsg') && ($('pvMsg').textContent = 'Il caso non si può giocare: ' + e.data.msg);
  });
  const send = (m) => frame.contentWindow.postMessage(m, location.origin);
  return {
    open(doc, step = 0) {
      let box = $('pvBox');
      if (!box) {
        box = document.createElement('div');
        box.id = 'pvBox'; box.className = 'pvbox';
        box.innerHTML = `<div class="pvbar"><span class="eyebrow">Anteprima · come lo vedrà il giocatore (niente viene salvato)</span><span id="pvMsg" class="hint"></span><button class="back" id="pvClose">Chiudi ✕</button></div>
          <iframe id="pvFrame" title="Anteprima del caso" src="${import.meta.env.BASE_URL}?anteprima"></iframe>`;
        document.body.appendChild(box);
        frame = $('pvFrame'); ready = false;
        $('pvClose').onclick = () => { box.hidden = true; };
      }
      box.hidden = false;
      $('pvMsg').textContent = '';
      const msg = { type: 'turno-anteprima', case: clone(doc), step };
      if (ready) send(msg); else pending = msg;
    },
  };
})();

/* ---------------------------------------------------------------- modifica di una bozza */

async function openDraft(id) {
  app.innerHTML = page('Bozza', '<p class="hint">Caricamento…</p>', { back: '#/' });
  const draft = await D.getDraft(id);
  if (!draft) { app.innerHTML = page('Bozza non trovata', '<p>Forse è stata eliminata.</p>', { back: '#/' }); return; }
  const perm = permissions(draft, { uid: S.state.user.id, role: S.state.role });
  const LOCAL = `turno-editor-bozza:${id}`;
  let doc = clone(draft.data && Object.keys(draft.data).length ? draft.data : newCase(draft.case_id || 1));
  let chapter = draft.chapter;
  let dirty = false, savedAt = draft.updated_at, timer = null, saving = null;

  // copia locale più recente del server (per esempio dopo una chiusura offline)
  const local = lsGet(LOCAL);
  let restoreNote = '';
  if (perm.edit && local && local.at > Date.parse(draft.updated_at) && JSON.stringify(local.doc) !== JSON.stringify(draft.data)) {
    doc = local.doc; chapter = local.chapter ?? chapter; dirty = true;
    restoreNote = '<p class="msg ok">Ho ripreso le modifiche salvate su questo dispositivo che non erano arrivate online. Salva per inviarle.</p>';
  }

  app.innerHTML = page(esc(doc.title || 'Caso senza titolo'), `
    <div class="edbar">
      <span>${chip(draft.status)} <span class="hint" id="saveState"></span></span>
      <span class="row">
        ${perm.edit ? '<button class="btn" id="bSave">Salva</button><button class="back" id="bVer">Salva versione…</button>' : ''}
        <button class="back" id="bPrev">▶ Anteprima</button><button class="back" id="bDl">Scarica il file</button>
        ${perm.submit ? '<button class="btn" id="bSubmit">Invia in revisione</button>' : ''}
        ${perm.review ? '<button class="btn" id="bOk">Approva</button><button class="back" id="bNo">Rimanda all\'autore</button>' : ''}
        ${perm.remove ? '<button class="btn danger" id="bDel">Elimina</button>' : ''}
      </span>
    </div>
    ${draft.review_note && draft.status === 'bozza' ? `<p class="msg bad"><b>Nota della revisione:</b> ${esc(draft.review_note)}</p>` : ''}
    ${!perm.edit ? `<p class="msg">${draft.status === 'bozza' ? 'Questa bozza è di un altro autore: puoi leggerla e provarla, non modificarla.' : `Bozza ${STATUS_LABELS[draft.status].toLowerCase()}: per cambiarla serve un amministratore${draft.status === 'in-revisione' ? ' che la rimandi all\'autore' : ''}.`}</p>` : ''}
    ${restoreNote}
    <div class="edgrid"><div id="form"></div>
      <aside class="edside"><section class="card"><span class="tag abc">Controlli</span><div id="issues"></div></section>
        <section class="card"><span class="tag">Versioni</span><div id="versions" class="hint">Caricamento…</div></section></aside></div>`, { back: '#/' });

  const setState = (t) => { $('saveState').textContent = t; };
  const refreshState = () => setState(dirty ? (navigator.onLine ? 'Modifiche non salvate' : 'Offline: modifiche tenute su questo dispositivo') : `Salvato ${fmt(savedAt)}`);

  function renderIssues() {
    const list = validateCase(doc);
    const errs = list.filter((p) => p.level === 'error');
    $('issues').innerHTML = list.length ? `<p class="hint">${errs.length} ${errs.length === 1 ? 'errore' : 'errori'}, ${list.length - errs.length} ${list.length - errs.length === 1 ? 'avviso' : 'avvisi'}. Tocca un problema per andare al campo.</p>
      <ul class="issues">${list.map((p, i) => `<li class="${p.level}" data-issue="${i}"><b>${p.level === 'error' ? 'Errore' : 'Avviso'}</b> <span>${esc(describePath(p.path) || 'Caso')}</span><small>${esc(p.msg)}</small></li>`).join('')}</ul>`
      : '<p class="msg ok">Nessun problema: il caso è pronto per la revisione.</p>';
    $('issues').querySelectorAll('[data-issue]').forEach((li) => { li.onclick = () => form.focus(list[+li.dataset.issue].path); });
    const sb = $('bSubmit'); if (sb) { sb.disabled = errs.length > 0; sb.title = errs.length ? 'Correggi prima gli errori' : ''; }
    const ok = $('bOk'); if (ok) { ok.disabled = errs.length > 0; ok.title = errs.length ? 'Il caso ha errori: rimandalo all\'autore' : ''; }
  }

  async function save() {
    if (!perm.edit || !dirty) return;
    if (saving) return saving;
    clearTimeout(timer);
    const snapshot = clone(doc);
    saving = (async () => {
      try {
        setState('Salvataggio…');
        const r = await D.saveDraft(id, { chapter, title: snapshot.title, data: snapshot });
        savedAt = r.updated_at;
        if (JSON.stringify(snapshot) === JSON.stringify(doc)) { dirty = false; lsDel(LOCAL); }
        loadVersions();
      } catch (err) {
        setState(S.explain(err));
        throw err;
      } finally { saving = null; }
      refreshState();
    })();
    return saving.catch(() => {});
  }

  function onChange() {
    dirty = true;
    lsSet(LOCAL, { doc, chapter, at: Date.now() });
    refreshState();
    renderIssues();
    const h = app.querySelector('.edhead h2'); if (h) h.textContent = doc.title || 'Caso senza titolo';
    // salvataggio online automatico un minuto dopo l'ultima modifica (ogni salvataggio diventa una versione)
    clearTimeout(timer); timer = setTimeout(save, 60000);
  }

  const form = mountForm($('form'), {
    doc, chapter, chapters: CHAPTERS, readOnly: !perm.edit,
    onChange,
    onChapter: (v) => { chapter = v; onChange(); },
    // in gioco la tappa ABCDE viene prima della tappa 1, se la priorità è già scelta
    onPreview: (i) => preview.open(doc, i + (['A', 'B', 'C', 'D', 'E'].includes(doc.abcde?.first) ? 1 : 0)),
  });
  leaveGuard = { dirty: () => dirty, flush: save };
  renderIssues(); refreshState();

  async function loadVersions() {
    try {
      const vs = await D.listVersions(id);
      $('versions').innerHTML = vs.length ? `<ul class="versions">${vs.map((v, i) => {
        const ch = diffCases(vs[i + 1]?.data, v.data);
        return `<li><span><b>${fmt(v.saved_at)}</b>${v.note ? ` · ${esc(v.note)}` : ''}<small>di ${who(v.saved_by)} · ${i === vs.length - 1 ? 'prima versione' : ch.length ? 'cambiati: ' + esc(ch.slice(0, 6).join(', ')) + (ch.length > 6 ? '…' : '') : 'nessun cambiamento nel contenuto'}</small></span>
          ${perm.edit && i > 0 ? `<button class="back" data-restore="${v.id}">Ripristina</button>` : ''}</li>`;
      }).join('')}</ul>` : 'Nessuna versione salvata.';
      $('versions').querySelectorAll('[data-restore]').forEach((b) => { b.onclick = async () => {
        const v = vs.find((x) => x.id === b.dataset.restore);
        if (!confirm(`Riportare il caso alla versione del ${fmt(v.saved_at)}? Il contenuto attuale resta nello storico.`)) return;
        doc = clone(v.data); dirty = true;
        await save();
        route();
      }; });
    } catch (err) { $('versions').textContent = S.explain(err); }
  }
  loadVersions();

  $('bSave') && ($('bSave').onclick = save);
  $('bVer') && ($('bVer').onclick = async () => {
    const note = prompt('Nota per questa versione (es. "prima stesura", "corrette le dosi"):', '');
    if (note === null) return;
    await save();
    try { await D.saveVersion(id, note); loadVersions(); } catch (err) { setState(S.explain(err)); }
  });
  $('bPrev').onclick = () => preview.open(doc, 0);
  $('bDl').onclick = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fileName(doc); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('bSubmit') && ($('bSubmit').onclick = async () => {
    await save();
    if (!confirm('Inviare il caso in revisione? Finché un amministratore non lo rimanda indietro non potrai modificarlo.')) return;
    try { await D.submitDraft(id); route(); } catch (err) { setState(S.explain(err)); }
  });
  $('bOk') && ($('bOk').onclick = async () => {
    if (!confirm('Approvare il caso? Verrà incluso nella prossima pubblicazione dei contenuti.')) return;
    try { await D.reviewDraft(id, true); route(); } catch (err) { setState(S.explain(err)); }
  });
  $('bNo') && ($('bNo').onclick = async () => {
    const note = prompt('Cosa deve correggere l\'autore?', '');
    if (!note) return;
    try { await D.reviewDraft(id, false, note); route(); } catch (err) { setState(S.explain(err)); }
  });
  $('bDel') && ($('bDel').onclick = async () => {
    if (!confirm('Eliminare questa bozza e tutte le sue versioni? Non si può annullare.')) return;
    try { await D.deleteDraft(id); lsDel(LOCAL); dirty = false; location.hash = '#/'; } catch (err) { setState(S.explain(err)); }
  });
  window.addEventListener('online', refreshState);
}

/* ---------------------------------------------------------------- capitoli */

async function chaptersPage() {
  app.innerHTML = page('Capitoli', '<p class="hint">Caricamento…</p>', { back: '#/' });
  const admin = S.state.role === 'admin';
  const [draft, drafts] = await Promise.all([D.getChaptersDraft(), D.listDrafts()]);
  let data = draft ? clone(draft.data.chapters || []) : clone(CHAPTERS);
  const editable = draft ? (admin || (draft.author_id === S.state.user.id && draft.status === 'bozza')) : true;
  const pool = [...PUBLISHED.map((c) => ({ id: c.id, title: c.title, from: 'pubblicato' })),
    ...drafts.filter((d) => !d.case_id && d.status !== 'pubblicato' && d.data?.id).map((d) => ({ id: d.data.id, title: d.title, from: STATUS_LABELS[d.status].toLowerCase() }))];
  const title = (id) => pool.find((c) => c.id === id)?.title || `caso ${id}`;

  const render = () => {
    const used = new Set(data.flatMap((ch) => ch.cases));
    const free = pool.filter((c) => !used.has(c.id));
    const issues = validateChapters(data, pool.map((c) => ({ id: c.id })));
    app.innerHTML = page('Capitoli', `
      <div class="edbar"><span>${draft ? `${chip(draft.status)} <span class="hint">proposta di ${who(draft.author_id)} · ${fmt(draft.updated_at)}</span>` : '<span class="hint">Nessuna proposta in corso: stai guardando i capitoli pubblicati.</span>'}</span>
        <span class="row">${editable ? '<button class="btn" id="bChSave">Salva la proposta</button>' : ''}
          ${draft && draft.status === 'bozza' && (admin || draft.author_id === S.state.user.id) ? '<button class="btn" id="bChSubmit">Invia in revisione</button>' : ''}
          ${draft && admin && draft.status === 'in-revisione' ? '<button class="btn" id="bChOk">Approva</button><button class="back" id="bChNo">Rimanda</button>' : ''}</span></div>
      ${draft?.review_note && draft.status === 'bozza' ? `<p class="msg bad"><b>Nota della revisione:</b> ${esc(draft.review_note)}</p>` : ''}
      ${issues.length ? `<ul class="issues">${issues.map((p) => `<li class="${p.level}"><b>${p.level === 'error' ? 'Errore' : 'Avviso'}</b> <small>${esc(p.msg)}</small></li>`).join('')}</ul>` : ''}
      <fieldset class="formbody"${editable ? '' : ' disabled'}>
      ${data.map((ch, i) => `<section class="card chedit">
        <div class="formgrid">
          <label class="field"><span>Titolo</span><input data-ch="${i}" data-k="title" value="${esc(ch.title)}"></label>
          <label class="field"><span>Area</span><input data-ch="${i}" data-k="area" value="${esc(ch.area)}"></label>
          <label class="field"><span>Stagione</span><input type="number" min="1" data-ch="${i}" data-k="season" value="${ch.season}"></label>
          <label class="field"><span>Stato</span><select data-ch="${i}" data-k="status">${[['aperto', 'Aperto: si gioca'], ['in-arrivo', 'In arrivo: solo anteprima'], ['bozza', 'Bozza: nascosto']].map(([k, l]) => `<option value="${k}"${ch.status === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <ol class="chcases">${ch.cases.map((id, j) => `<li><span>${String(id).padStart(3, '0')} · ${esc(title(id))}</span><span class="rowbtns"><button class="back" data-mv="${i}:${j}:-1">↑</button><button class="back" data-mv="${i}:${j}:1">↓</button><button class="back" data-rm="${i}:${j}">✕</button></span></li>`).join('') || '<li class="hint">Nessun caso.</li>'}</ol>
        ${free.length ? `<div class="row"><select data-addsel="${i}">${free.map((c) => `<option value="${c.id}">${String(c.id).padStart(3, '0')} · ${esc(c.title)} (${c.from})</option>`).join('')}</select><button class="back" data-add="${i}">+ Aggiungi al capitolo</button></div>` : ''}
        <div class="rowbtns"><button class="back" data-chmv="${i}:-1">↑ Sposta su</button><button class="back" data-chmv="${i}:1">↓ Sposta giù</button>${ch.cases.length ? '' : `<button class="back" data-chdel="${i}">✕ Elimina capitolo</button>`}</div>
      </section>`).join('')}
      <button class="btn ghost" id="bChNew">+ Nuovo capitolo</button></fieldset>
      <p class="hint">I capitoli cambiano nel gioco quando la proposta viene approvata e pubblicata insieme ai casi.</p>`, { back: '#/' });
    wire();
  };

  const wire = () => {
    app.querySelectorAll('[data-ch]').forEach((el) => { el.onchange = () => { const ch = data[+el.dataset.ch]; ch[el.dataset.k] = el.type === 'number' ? Number(el.value) : el.value; render(); }; });
    app.querySelectorAll('[data-mv]').forEach((b) => { b.onclick = () => { const [i, j, d] = b.dataset.mv.split(':').map(Number); const a = data[i].cases; const k = j + d; if (k >= 0 && k < a.length) [a[j], a[k]] = [a[k], a[j]]; render(); }; });
    app.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { const [i, j] = b.dataset.rm.split(':').map(Number); data[i].cases.splice(j, 1); render(); }; });
    app.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => { const i = +b.dataset.add; const v = +app.querySelector(`[data-addsel="${i}"]`).value; data[i].cases.push(v); render(); }; });
    app.querySelectorAll('[data-chmv]').forEach((b) => { b.onclick = () => { const [i, d] = b.dataset.chmv.split(':').map(Number); const k = i + d; if (k >= 0 && k < data.length) [data[i], data[k]] = [data[k], data[i]]; render(); }; });
    app.querySelectorAll('[data-chdel]').forEach((b) => { b.onclick = () => { data.splice(+b.dataset.chdel, 1); render(); }; });
    $('bChNew') && ($('bChNew').onclick = () => {
      const n = Math.max(0, ...data.map((ch) => Number(String(ch.id).replace(/\D/g, '')) || 0)) + 1;
      data.push({ id: `c${n}`, season: Math.max(1, ...data.map((ch) => ch.season || 1)) + 1, title: 'Nuovo capitolo', area: '', status: 'bozza', cases: [] });
      render();
    });
    $('bChSave') && ($('bChSave').onclick = async () => {
      try {
        if (draft) await D.saveChaptersDraft(draft.id, { chapters: data });
        else await D.createChaptersDraft({ chapters: data });
        chaptersPage();
      } catch (err) { alert(S.explain(err)); }
    });
    $('bChSubmit') && ($('bChSubmit').onclick = async () => { try { await D.saveChaptersDraft(draft.id, { chapters: data }); await D.submitDraft(draft.id); chaptersPage(); } catch (err) { alert(S.explain(err)); } });
    $('bChOk') && ($('bChOk').onclick = async () => { try { await D.reviewDraft(draft.id, true); chaptersPage(); } catch (err) { alert(S.explain(err)); } });
    $('bChNo') && ($('bChNo').onclick = async () => { const note = prompt('Cosa va corretto?', ''); if (!note) return; try { await D.reviewDraft(draft.id, false, note); chaptersPage(); } catch (err) { alert(S.explain(err)); } });
  };
  render();
}

/* ---------------------------------------------------------------- redazione */

async function teamPage() {
  app.innerHTML = page('Redazione', '<p class="hint">Caricamento…</p>', { back: '#/' });
  const list = await D.listEditors();
  app.innerHTML = page('Redazione', `
    <section class="card"><span class="tag">Membri</span>
      <ul class="edlist">${list.map((m) => `<li><span><b>${esc(m.display_name)}</b><small>${m.role === 'admin' ? 'Amministratore' : 'Autore'} · dal ${fmt(m.added_at)}${m.user_id === S.state.user.id ? ' · sei tu' : ''}</small></span>
        <span class="row"><button class="back" data-remove="${m.user_id}">Togli</button></span></li>`).join('')}</ul>
      <p class="hint">Per cambiare il ruolo di qualcuno, aggiungilo di nuovo qui sotto con il ruolo giusto.</p></section>
    <section class="card"><span class="tag ana">Aggiungi</span>
      <form class="form" id="fAdd"><label class="field"><span>Email del suo account</span><input name="email" type="email" required><small>La persona deve essersi già registrata nel gioco. L'email serve solo a trovarla: non viene mostrata.</small></label>
        <label class="field"><span>Ruolo</span><select name="role"><option value="autore">Autore: crea e modifica i propri casi, li invia in revisione</option><option value="admin">Amministratore: approva, pubblica e gestisce la redazione</option></select></label>
        <button class="btn" type="submit">Aggiungi alla redazione</button></form>
      <p class="msg" id="tMsg" hidden></p></section>`, { back: '#/' });
  const msg = (t, k) => { const m = $('tMsg'); m.hidden = !t; m.className = 'msg ' + (k || ''); m.textContent = t; };
  $('fAdd').onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await D.addEditor(e.target.email.value, e.target.role.value); teamPage(); setTimeout(() => msg(`${r?.display_name || 'Utente'} aggiunto.`, 'ok'), 50); } catch (err) { msg(S.explain(err), 'bad'); }
  };
  app.querySelectorAll('[data-remove]').forEach((b) => { b.onclick = async () => {
    if (!confirm('Togliere questa persona dalla redazione? Le sue bozze restano.')) return;
    try { await D.removeEditor(b.dataset.remove); teamPage(); } catch (err) { msg(S.explain(err), 'bad'); }
  }; });
}

boot();
