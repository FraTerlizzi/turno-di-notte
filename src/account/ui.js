/* Schermate account: accesso, profilo, area tutor, informativa. */
import { CASES, EVENTS } from '../data/index.js';
import * as S from './session.js';
import * as T from './tutor.js';
import { studentRows, topMistakes, studentAttempts } from './report.js';

const CONTENT = { CASES, EVENTS };
const GUEST_FLAG = 'turno-ospite';
const ASKED_IMPORT = (uid) => `turno-import-chiesto:${uid}`;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
const fmtDate = (d) => (d ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(d)) : '—');
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage bloccato */ } };

let engine = null;
let prevUid = null;
let backFrom = 'home';

/* ---------------------------------------------------------------- avvio */

export async function initAccounts(eng) {
  engine = eng;
  wireAuth();
  wireNav();
  if (!S.enabled) { engine.drawRandom(); return; }

  $('acctBar').hidden = false;
  S.onChange(onState);
  const hasUser = await S.init(eng);
  prevUid = S.state.user?.id || null;
  renderBar();

  if (S.state.recovery) openAuth('newpass');
  else if (hasUser) { engine.drawRandom(); maybeOfferImport(); }
  else if (lsGet(GUEST_FLAG)) engine.drawRandom();
  else openAuth('login', { first: true });
}

function onState(st) {
  renderBar();
  const uid = st.user?.id || null;
  if (st.recovery && $('fNewPass').hidden) openAuth('newpass');
  if (uid && uid !== prevUid) {
    prevUid = uid;
    if (!$('auth').hidden && !st.recovery) { engine.renderHome(); engine.show('home'); }
    maybeOfferImport();
  } else if (!uid && prevUid) {
    prevUid = null;
    if (!$('account').hidden || !$('tutor').hidden) { engine.renderHome(); engine.show('home'); }
  }
  if (!$('account').hidden && uid) renderAccountHead();
}

async function maybeOfferImport() {
  const uid = S.state.user?.id;
  if (!uid || lsGet(ASKED_IMPORT(uid)) || !S.hasGuestProgress()) return;
  lsSet(ASKED_IMPORT(uid), '1');
  const g = S.guestProgress();
  const st = Object.values(g.best).reduce((s, v) => s + v, 0);
  const ok = await ask('Progressi senza account',
    `Su questo dispositivo ci sono progressi giocati senza account (${st} stelle, ${g.xp} punti esperienza). Vuoi aggiungerli al profilo di ${esc(S.state.profile?.display_name)}?`,
    'Sì, aggiungili', 'No, lasciali');
  if (ok) await S.importGuestProgress().catch(() => {});
  engine.renderHome();
}

/* ---------------------------------------------------------------- barra account in home */

function renderBar() {
  const bar = $('acctBar');
  const st = S.state;
  if (!st.user) {
    bar.innerHTML = `<span class="who off">Giochi senza account</span><span class="sync">I progressi restano su questo dispositivo</span><button class="back" data-go="auth">Accedi o registrati</button>`;
    return;
  }
  const sync = !navigator.onLine ? 'Offline: sincronizzo appena torni online'
    : st.syncing ? 'Sincronizzazione…'
    : st.syncError ? 'Da sincronizzare'
    : 'Progressi salvati online';
  bar.innerHTML = `<span class="who">● ${esc(st.profile?.display_name || 'Giocatore')}</span><span class="sync${st.syncError ? ' warn' : ''}">${sync}</span><button class="back" data-go="account">Profilo</button><button class="back" data-go="tutor">Area tutor</button>`;
}
window.addEventListener('online', renderBar);
window.addEventListener('offline', renderBar);

/* ---------------------------------------------------------------- navigazione */

function wireNav() {
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) {
      const to = go.dataset.go;
      if (to === 'home') { engine.renderHome(); engine.show('home'); }
      else if (to === 'auth') openAuth('login');
      else if (to === 'account') openAccount();
      else if (to === 'tutor') openTutor();
      return;
    }
    if (e.target.closest('[data-privacy]')) {
      e.preventDefault();
      backFrom = !$('auth').hidden ? 'auth' : !$('account').hidden ? 'account' : 'home';
      engine.show('privacy');
    }
  });
  $('privacyBack').onclick = () => { if (backFrom === 'auth') engine.show('auth'); else if (backFrom === 'account') openAccount(); else engine.show('home'); };
  $('authBack').onclick = () => { engine.renderHome(); engine.show('home'); };
}

/* ---------------------------------------------------------------- accesso e registrazione */

function setPane(name) {
  document.querySelectorAll('#auth [data-pane]').forEach((f) => { f.hidden = f.dataset.pane !== name; });
  document.querySelectorAll('#auth .tab').forEach((t) => {
    const on = t.dataset.auth === name || (name === 'reset' && t.dataset.auth === 'login');
    t.classList.toggle('on', on);
    t.setAttribute('aria-selected', String(on));
  });
  $('auth').querySelector('.tabs').hidden = name === 'newpass';
  $('authTitle').textContent = { login: 'Accedi', signup: 'Crea account', reset: 'Recupera password', newpass: 'Nuova password' }[name];
  message('');
}

function openAuth(pane, { first = false } = {}) {
  setPane(pane);
  $('authBack').hidden = first || pane === 'newpass';
  $('btnGuest').parentElement.hidden = pane === 'newpass';
  engine.show('auth');
}

function message(text, kind = '') {
  const m = $('authMsg');
  m.hidden = !text;
  m.className = 'msg' + (kind ? ' ' + kind : '');
  m.textContent = text;
}

async function busy(form, fn) {
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Attendi…';
  try { await fn(); } catch (err) { message(S.explain(err), 'bad'); } finally { btn.disabled = false; btn.textContent = label; }
}

const strong = (pw) => pw.length >= 8 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);
const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function wireAuth() {
  document.querySelectorAll('#auth [data-auth]').forEach((b) => { b.onclick = () => setPane(b.dataset.auth); });

  $('fLogin').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target, email = f.email.value.trim(), password = f.password.value;
    if (!validEmail(email) || !password) return message('Inserisci email e password.', 'bad');
    busy(f, async () => { await S.signIn({ email, password }); f.reset(); });
  };

  $('fSignup').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target, name = f.name.value.trim(), email = f.email.value.trim(), password = f.password.value;
    if (!name) return message('Scegli un nome da giocatore.', 'bad');
    if (!validEmail(email)) return message('Controlla l\'indirizzo email.', 'bad');
    if (!strong(password)) return message('La password deve avere almeno 8 caratteri, con lettere e numeri.', 'bad');
    if (!f.privacy.checked) return message('Per creare l\'account devi leggere e accettare l\'informativa privacy.', 'bad');
    busy(f, async () => {
      const { needsConfirm } = await S.signUp({ email, password, name });
      f.reset();
      if (needsConfirm) {
        setPane('login');
        $('fLogin').email.value = email;
        message(`Ti abbiamo mandato un'email a ${email}: apri il link per attivare l'account, poi accedi qui.`, 'ok');
      }
    });
  };

  $('fReset').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target, email = f.email.value.trim();
    if (!validEmail(email)) return message('Controlla l\'indirizzo email.', 'bad');
    busy(f, async () => {
      await S.sendReset(email);
      message('Se l\'email è registrata, entro qualche minuto ti arriva un link per scegliere una nuova password.', 'ok');
    });
  };

  $('fNewPass').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target, password = f.password.value;
    if (!strong(password)) return message('La password deve avere almeno 8 caratteri, con lettere e numeri.', 'bad');
    busy(f, async () => {
      await S.setNewPassword(password);
      f.reset();
      engine.renderHome();
      engine.show('home');
    });
  };

  $('btnGuest').onclick = () => {
    const first = !lsGet(GUEST_FLAG);
    lsSet(GUEST_FLAG, '1');
    if (first) engine.drawRandom();
    else { engine.renderHome(); engine.show('home'); }
  };
}

/* ---------------------------------------------------------------- profilo */

function renderAccountHead() {
  $('accName').textContent = S.state.profile?.display_name || 'Giocatore';
  const s = $('accSync');
  if (s) {
    const st = S.state;
    s.textContent = !navigator.onLine ? 'Offline: i progressi verranno inviati appena torni online.'
      : st.syncing ? 'Sincronizzazione in corso…'
      : st.syncError ? st.syncError
      : st.lastSync ? 'Ultima sincronizzazione: ' + fmtDate(st.lastSync) : 'Progressi salvati online.';
  }
}

async function openAccount() {
  if (!S.state.user) return openAuth('login');
  const st = S.state;
  $('accBody').innerHTML = `
    <div class="card">
      <span class="tag">Profilo</span>
      <form class="form" id="fName">
        <label class="field"><span>Nome da giocatore</span><input name="name" maxlength="40" value="${esc(st.profile?.display_name)}" required></label>
        <button class="btn ghost" type="submit">Salva il nome</button>
      </form>
      <p class="hint">Email dell'account: <b>${esc(st.user.email)}</b></p>
      <p class="hint" id="accSync"></p>
      <div class="row"><button class="btn ghost" id="btnSync">Sincronizza ora</button></div>
      <p class="msg" id="accMsg" hidden></p>
    </div>
    <div class="card">
      <span class="tag fis">I tuoi gruppi</span>
      <div id="myGroups" class="hint">Caricamento…</div>
      <form class="form" id="fJoin">
        <label class="field"><span>Codice del gruppo</span><input name="code" maxlength="12" autocomplete="off" autocapitalize="characters" placeholder="Es. 3FA9C21B" required></label>
        <p class="hint">Unendoti, il tutor del gruppo vedrà il tuo nome da giocatore, i tuoi progressi e le risposte sbagliate. Non vedrà la tua email.</p>
        <button class="btn ghost" type="submit">Unisciti al gruppo</button>
      </form>
    </div>
    <div class="card">
      <span class="tag ana">Area tutor</span>
      <p class="story">Segui un gruppo di studenti: crei il gruppo, condividi il codice e vedi progressi ed errori più frequenti di chi si unisce.</p>
      <div class="row"><button class="btn ghost" data-go="tutor">Apri l'area tutor</button></div>
    </div>
    <div class="card">
      <span class="tag">Account</span>
      <div class="row"><button class="btn ghost" id="btnLogout">Esci dall'account</button><button class="btn danger" id="btnDelete">Elimina account</button></div>
      <p class="hint"><button class="link" type="button" data-privacy>Informativa privacy</button></p>
    </div>`;
  renderAccountHead();
  engine.show('account');

  const accMsg = (t, k = '') => { const m = $('accMsg'); m.hidden = !t; m.className = 'msg' + (k ? ' ' + k : ''); m.textContent = t; };

  $('fName').onsubmit = async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    try { await S.rename(name); accMsg('Nome aggiornato.', 'ok'); } catch (err) { accMsg(S.explain(err), 'bad'); }
  };
  $('btnSync').onclick = async () => {
    try { await S.sync(); accMsg('Tutto sincronizzato.', 'ok'); } catch (err) { accMsg(S.explain(err), 'bad'); }
    renderAccountHead();
  };
  $('btnLogout').onclick = async () => {
    if (await ask('Esci dall\'account', 'Su questo dispositivo tornerai a giocare senza account. I tuoi progressi restano salvati online.', 'Esci', 'Annulla')) await S.signOut();
  };
  $('btnDelete').onclick = async () => {
    const ok = await ask('Elimina account',
      'Account, progressi e partite verranno cancellati subito e per sempre, anche dai gruppi dei tuoi tutor. Se sei tutor, verranno eliminati anche i tuoi gruppi.',
      'Elimina per sempre', 'Annulla', { confirmWord: 'ELIMINA' });
    if (!ok) return;
    try { await S.deleteAccount(); } catch (err) { accMsg(S.explain(err), 'bad'); }
  };
  $('fJoin').onsubmit = async (e) => {
    e.preventDefault();
    const code = e.target.code.value.trim();
    if (!code) return;
    try {
      const g = await S.joinGroup(code);
      e.target.reset();
      accMsg(`Ti sei unito al gruppo "${g?.name || ''}".`, 'ok');
      loadMyGroups();
    } catch (err) { accMsg(S.explain(err), 'bad'); }
  };
  loadMyGroups();
}

async function loadMyGroups() {
  const box = $('myGroups');
  try {
    const groups = await S.myGroups();
    box.innerHTML = groups.length
      ? `<ul class="glist">${groups.map((g) => `<li><span><b>${esc(g.name)}</b><small>Tutor: ${esc(g.tutor)} · dal ${fmtDate(g.joined_at)}</small></span><button class="back" data-leave="${esc(g.id)}">Esci</button></li>`).join('')}</ul>`
      : 'Non fai parte di nessun gruppo.';
    box.querySelectorAll('[data-leave]').forEach((b) => {
      b.onclick = async () => {
        if (!(await ask('Esci dal gruppo', 'Il tutor non vedrà più i tuoi progressi. Potrai rientrare con lo stesso codice.', 'Esci dal gruppo', 'Annulla'))) return;
        try { await S.leaveGroup(b.dataset.leave); loadMyGroups(); } catch (err) { box.textContent = S.explain(err); }
      };
    });
  } catch (err) {
    box.textContent = S.explain(err);
  }
}

/* ---------------------------------------------------------------- area tutor */

let tutorBack = () => openAccount();

async function openTutor() {
  if (!S.state.user) return openAuth('login');
  $('tutorEyebrow').textContent = 'Area tutor';
  $('tutorTitle').textContent = 'I tuoi gruppi';
  tutorBack = () => openAccount();
  $('tutorBack').textContent = '← Profilo';
  $('tutorBack').onclick = () => tutorBack();
  const body = $('tutorBody');
  body.innerHTML = '<p class="hint">Caricamento…</p>';
  engine.show('tutor');
  try {
    const groups = await T.listGroups();
    body.innerHTML = `
      <div class="levels">${groups.map((g) => `
        <button class="lvl" data-group="${esc(g.id)}"><span class="num">${esc(g.name.slice(0, 2).toUpperCase())}</span>
          <span><span class="t">${esc(g.name)}</span><span class="a">Codice ${esc(g.code)} · creato il ${fmtDate(g.created_at)}</span><span class="stars">▶ Apri</span></span></button>`).join('')}
      </div>
      ${groups.length ? '' : '<p class="hint">Non hai ancora creato gruppi.</p>'}
      <div class="card">
        <span class="tag ana">Nuovo gruppo</span>
        <form class="form" id="fGroup">
          <label class="field"><span>Nome del gruppo</span><input name="name" maxlength="60" placeholder="Es. Infermieristica 2° anno · tirocinio" required></label>
          <button class="btn" type="submit">Crea il gruppo</button>
        </form>
        <p class="hint">Riceverai un codice da dare agli studenti: lo inseriscono nel loro Profilo e da quel momento vedi i loro progressi.</p>
        <p class="msg" id="tMsg" hidden></p>
      </div>`;
    body.querySelectorAll('[data-group]').forEach((b) => { b.onclick = () => openGroup(groups.find((g) => g.id === b.dataset.group)); });
    $('fGroup').onsubmit = async (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      if (!name) return;
      try { const g = await T.createGroup(name); openGroup(g); } catch (err) { const m = $('tMsg'); m.hidden = false; m.className = 'msg bad'; m.textContent = S.explain(err); }
    };
  } catch (err) {
    body.innerHTML = `<p class="msg bad">${esc(S.explain(err))}</p>`;
  }
}

async function openGroup(g) {
  $('tutorEyebrow').textContent = 'Area tutor · Gruppo';
  $('tutorTitle').textContent = g.name;
  $('tutorBack').textContent = '← Gruppi';
  tutorBack = () => openTutor();
  const body = $('tutorBody');
  body.innerHTML = '<p class="hint">Caricamento…</p>';
  window.scrollTo(0, 0);
  try {
    const data = await T.groupData(g.id);
    const rows = studentRows(data);
    const mistakes = topMistakes(data.attempts, CONTENT);
    body.innerHTML = `
      <div class="card codebox">
        <span class="tag">Codice per gli studenti</span>
        <div class="row" style="align-items:center"><b class="code">${esc(g.code)}</b><button class="back" id="btnCopy">Copia</button></div>
        <p class="hint">Lo inseriscono in Profilo → I tuoi gruppi. ${rows.length} ${rows.length === 1 ? 'studente' : 'studenti'} nel gruppo.</p>
      </div>
      <div class="card">
        <span class="tag fis">Studenti</span>
        ${rows.length ? `<div class="tscroll"><table class="tbl">
          <thead><tr><th>Nome</th><th>XP</th><th>Episodi</th><th>Stelle</th><th>Fuori turno</th><th>Partite</th><th>Errori</th><th>Ultima partita</th></tr></thead>
          <tbody>${rows.map((r) => `<tr data-student="${esc(r.id)}" tabindex="0"><td><b>${esc(r.name)}</b></td><td>${r.xp}</td><td>${r.cases}/${CASES.length}</td><td>${r.stars}/${CASES.length * 3}</td><td>${r.events}/${EVENTS.length}</td><td>${r.played}</td><td>${r.errors}</td><td>${fmtDate(r.last)}</td></tr>`).join('')}</tbody>
        </table></div><p class="hint">Tocca uno studente per vedere le sue partite e gli errori.</p>` : '<p class="hint">Ancora nessuno studente: condividi il codice del gruppo.</p>'}
      </div>
      <div class="card">
        <span class="tag abc">Errori più frequenti nel gruppo</span>
        ${mistakes.length ? `<ol class="mistakes">${mistakes.map((m) => `
          <li><span class="eyebrow">${esc(m.label)} · ${esc(m.title)} · ${esc(m.tag)}</span>
            ${m.q ? `<span class="mq">${esc(m.q)}</span>` : ''}
            <span class="mw">✖ ${esc(m.text)}</span>
            <small>${m.students} ${m.students === 1 ? 'studente' : 'studenti'} · ${m.count} ${m.count === 1 ? 'volta' : 'volte'}</small></li>`).join('')}</ol>`
          : '<p class="hint">Nessun errore registrato finora.</p>'}
      </div>
      <div class="card">
        <span class="tag">Gestione</span>
        <form class="form" id="fRename"><label class="field"><span>Nome del gruppo</span><input name="name" maxlength="60" value="${esc(g.name)}" required></label><button class="btn ghost" type="submit">Rinomina</button></form>
        <div class="row"><button class="btn danger" id="btnDelGroup">Elimina il gruppo</button></div>
        <p class="msg" id="gMsg" hidden></p>
      </div>`;
    const gMsg = (t, k) => { const m = $('gMsg'); m.hidden = !t; m.className = 'msg ' + (k || ''); m.textContent = t; };
    $('btnCopy').onclick = async () => { try { await navigator.clipboard.writeText(g.code); $('btnCopy').textContent = 'Copiato'; } catch { /* clipboard non disponibile */ } };
    body.querySelectorAll('[data-student]').forEach((tr) => {
      const open = () => openStudent(g, rows.find((r) => r.id === tr.dataset.student), data);
      tr.onclick = open;
      tr.onkeydown = (e) => { if (e.key === 'Enter') open(); };
    });
    $('fRename').onsubmit = async (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      if (!name) return;
      try { await T.renameGroup(g.id, name); g.name = name; $('tutorTitle').textContent = name; gMsg('Nome aggiornato.', 'ok'); } catch (err) { gMsg(S.explain(err), 'bad'); }
    };
    $('btnDelGroup').onclick = async () => {
      const ok = await ask('Elimina il gruppo', `Il gruppo "${esc(g.name)}" verrà eliminato e non vedrai più i progressi dei suoi studenti. I loro account e progressi non vengono toccati.`, 'Elimina', 'Annulla', { confirmWord: 'ELIMINA' });
      if (!ok) return;
      try { await T.deleteGroup(g.id); openTutor(); } catch (err) { gMsg(S.explain(err), 'bad'); }
    };
  } catch (err) {
    body.innerHTML = `<p class="msg bad">${esc(S.explain(err))}</p>`;
  }
}

function openStudent(g, r, data) {
  $('tutorEyebrow').textContent = 'Area tutor · ' + g.name;
  $('tutorTitle').textContent = r.name;
  $('tutorBack').textContent = '← Gruppo';
  tutorBack = () => openGroup(g);
  window.scrollTo(0, 0);
  const list = studentAttempts(data.attempts, r.id, CONTENT);
  $('tutorBody').innerHTML = `
    <div class="stats">
      <div class="stat"><b>${r.xp}</b><small>Punti esperienza</small></div>
      <div class="stat"><b>${r.cases}/${CASES.length}</b><small>Episodi superati</small></div>
      <div class="stat"><b>${r.stars}</b><small>Stelle</small></div>
      <div class="stat"><b>${r.errors}</b><small>Errori</small></div>
      <div class="stat"><b>${r.deaths}</b><small>Decessi</small></div>
    </div>
    <div class="card">
      <span class="tag">Episodi</span>
      <div class="epgrid">${CASES.map((c) => `<div class="${r.best[c.id] ? 'ok' : ''}"><span class="eyebrow">Ep. ${String(c.id).padStart(2, '0')}</span><b>${r.best[c.id] ? stars(r.best[c.id]) : '—'}</b><small>${esc(c.title)}</small></div>`).join('')}</div>
    </div>
    <div class="card">
      <span class="tag fis">Partite</span>
      ${list.length ? `<ul class="attempts">${list.map((a) => `
        <li class="${a.win ? 'win' : 'loss'}"><div class="ahead"><span class="eyebrow">${esc(a.label)} · ${fmtDate(a.played_at)}</span><b>${esc(a.title)}</b>
          <span class="res">${a.win ? stars(a.stars) : 'Non superato'} · ${a.errors} ${a.errors === 1 ? 'errore' : 'errori'}${a.deaths ? ' · ' + a.deaths + (a.deaths === 1 ? ' decesso' : ' decessi') : ''}</span></div>
          ${a.wrongs.length ? `<ul class="wrongs">${a.wrongs.map((w) => `<li><small>${esc(w.tag)}${w.q ? ' · ' + esc(w.q) : ''}</small><span>✖ ${esc(w.text)}</span></li>`).join('')}</ul>` : ''}</li>`).join('')}</ul>`
        : '<p class="hint">Nessuna partita registrata da quando è nel gruppo.</p>'}
    </div>
    <div class="card">
      <span class="tag">Gestione</span>
      <p class="hint">Nel gruppo dal ${fmtDate(r.joined)}.</p>
      <div class="row"><button class="btn danger" id="btnRemove">Rimuovi dal gruppo</button></div>
      <p class="msg" id="sMsg" hidden></p>
    </div>`;
  $('btnRemove').onclick = async () => {
    if (!(await ask('Rimuovi dal gruppo', `${esc(r.name)} uscirà dal gruppo e non vedrai più i suoi progressi. Potrà rientrare con il codice.`, 'Rimuovi', 'Annulla'))) return;
    try { await T.removeMember(g.id, r.id); openGroup(g); } catch (err) { const m = $('sMsg'); m.hidden = false; m.className = 'msg bad'; m.textContent = S.explain(err); }
  };
}

/* ---------------------------------------------------------------- finestra di conferma */

function ask(title, html, okLabel, cancelLabel, { confirmWord } = {}) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'askdlg';
    d.innerHTML = `<form method="dialog" class="form">
      <h3>${esc(title)}</h3><p>${html}</p>
      ${confirmWord ? `<label class="field"><span>Per confermare scrivi ${confirmWord}</span><input name="w" autocomplete="off"></label>` : ''}
      <div class="row"><button class="btn${confirmWord ? ' danger' : ''}" value="ok">${esc(okLabel)}</button><button class="btn ghost" value="no">${esc(cancelLabel)}</button></div></form>`;
    document.body.appendChild(d);
    const okBtn = d.querySelector('[value=ok]');
    if (confirmWord) {
      const inp = d.querySelector('input');
      okBtn.disabled = true;
      inp.oninput = () => { okBtn.disabled = inp.value.trim().toUpperCase() !== confirmWord; };
    }
    d.addEventListener('close', () => { resolve(d.returnValue === 'ok'); d.remove(); });
    d.showModal();
  });
}
