/* Account e sincronizzazione con Supabase.
   Se VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY mancano, gli account sono disattivati
   e il gioco funziona come prima, solo in locale. */
import { createClient } from '@supabase/supabase-js';
import { GUEST_KEY, userKey, load, store, merge, isEmpty, sameProgress, readQueue, writeQueue, attemptRow, normalize } from './progress.js';

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const enabled = Boolean(SB_URL && SB_KEY);
// letto prima di creare il client, che ripulisce l'indirizzo: arrivo dal link "recupera password"
const RECOVERY_LANDING = /[#&]type=recovery\b/.test(location.hash);
// flusso implicit: i link delle email funzionano anche se aperti in un browser diverso da quello della richiesta
export const sb = enabled ? createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' } }) : null;

const ls = (() => { try { return window.localStorage; } catch { return null; } })();
const mem = new Map();
const storage = ls || { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };

// role: ruolo nella redazione dell'editor dei casi ('admin' | 'autore'), null per chi non ne fa parte
export const state = { user: null, profile: null, role: null, recovery: enabled && RECOVERY_LANDING, syncing: false, lastSync: null, syncError: null };
const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = () => listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } });

// la pagina pubblicata vive in una sottocartella su GitHub Pages: i link delle email devono tornare lì
const appUrl = () => new URL(import.meta.env.BASE_URL, location.origin).href;

/* ---------------------------------------------------------------- messaggi d'errore leggibili */

export function explain(err) {
  const m = String(err?.message || err || '');
  if (!navigator.onLine || /fetch|network/i.test(m)) return 'Nessuna connessione. Riprova quando sei online.';
  if (/invalid login credentials/i.test(m)) return 'Email o password non corretti.';
  if (/email not confirmed/i.test(m)) return 'Devi prima confermare l\'email: apri il link che ti abbiamo inviato.';
  if (/already registered|already exists/i.test(m)) return 'Esiste già un account con questa email. Prova ad accedere.';
  if (/password should be at least|weak password|password is too/i.test(m)) return 'Password troppo debole: usa almeno 8 caratteri, con lettere e numeri.';
  if (/rate limit|too many/i.test(m)) return 'Troppi tentativi ravvicinati. Aspetta qualche minuto e riprova.';
  if (/codice non valido/i.test(m)) return 'Codice gruppo non valido. Controllalo con il tuo tutor.';
  if (/same.*password|different from the old/i.test(m)) return 'La nuova password deve essere diversa da quella attuale.';
  if (/accesso richiesto/i.test(m)) return 'Devi prima accedere con il tuo account.';
  // editor dei casi: messaggi delle funzioni in supabase/migrations/20261028090000_editor.sql
  if (/utente non trovato/i.test(m)) return 'Nessun account con questa email: la persona deve prima registrarsi nel gioco.';
  if (/almeno un amministratore/i.test(m)) return 'Deve restare almeno un amministratore: prima nominane un altro.';
  if (/non fa parte della redazione/i.test(m)) return 'Questa persona non fa parte della redazione.';
  if (/riservato agli amministratori/i.test(m)) return 'Operazione riservata agli amministratori.';
  if (/riservato alla redazione/i.test(m)) return 'Operazione riservata ad autori e amministratori.';
  if (/ruolo non valido/i.test(m)) return 'Ruolo non valido: scegli amministratore o autore.';
  if (/bozza non trovata/i.test(m)) return 'Bozza non trovata: forse è stata eliminata.';
  if (/serve una nota/i.test(m)) return 'Per rimandare la bozza all\'autore scrivi una nota.';
  if (/non è in revisione/i.test(m)) return 'Questa bozza non è in revisione: forse l\'ha già gestita un altro amministratore.';
  if (/solo una bozza può essere inviata/i.test(m)) return 'Questa bozza è già stata inviata in revisione.';
  if (/solo (le|delle) tue bozze/i.test(m)) return 'Puoi farlo solo con le bozze che hai scritto tu.';
  if (/_title_check/i.test(m)) return 'Il titolo deve avere da 1 a 120 caratteri.';
  if (/_data_check/i.test(m)) return 'Il contenuto della bozza non è valido o è troppo grande.';
  if (/row-level security|permission denied/i.test(m)) return 'Non hai i permessi per questa operazione.';
  return 'Qualcosa è andato storto: ' + m;
}

// ruolo letto dalla tabella editors: valgono solo i due previsti, qualsiasi altra cosa (o nessuna riga) è null
export const roleFrom = (row) => (row?.role === 'admin' || row?.role === 'autore' ? row.role : null);

const check = ({ data, error }) => { if (error) throw error; return data; };

/* ---------------------------------------------------------------- accesso */

export async function signUp({ email, password, name }) {
  const data = check(await sb.auth.signUp({
    email, password,
    options: { data: { display_name: name.trim() }, emailRedirectTo: appUrl() },
  }));
  // con la conferma email attiva non arriva una sessione: l'utente deve aprire il link
  return { needsConfirm: !data.session };
}

export async function signIn({ email, password }) {
  check(await sb.auth.signInWithPassword({ email, password }));
}

export async function signOut() {
  await flush().catch(() => {});
  await sb.auth.signOut({ scope: 'local' });
}

export async function sendReset(email) {
  check(await sb.auth.resetPasswordForEmail(email, { redirectTo: appUrl() }));
}

export async function setNewPassword(password) {
  check(await sb.auth.updateUser({ password }));
  state.recovery = false;
  emit();
}

export async function rename(name) {
  const display_name = name.trim();
  check(await sb.from('profiles').update({ display_name }).eq('id', state.user.id));
  state.profile = { ...state.profile, display_name };
  emit();
}

export async function deleteAccount() {
  const uid = state.user.id;
  check(await sb.rpc('delete_own_account'));
  storage.removeItem(userKey(uid));
  writeQueue(storage, uid, []);
  await sb.auth.signOut({ scope: 'local' }).catch(() => {});
}

/* ---------------------------------------------------------------- gruppi (lato studente) */

export async function myGroups() { return check(await sb.rpc('my_groups')) || []; }
export async function joinGroup(code) { return (check(await sb.rpc('join_group', { p_code: code })) || [])[0]; }
export async function leaveGroup(groupId) {
  check(await sb.from('group_members').delete().eq('group_id', groupId).eq('user_id', state.user.id));
}

/* ---------------------------------------------------------------- progressi */

let game = null;          // { useProgress, getProgress } dal motore
let pushTimer = null;
let lastPushed = null;

export function localProgressKey() { return state.user ? userKey(state.user.id) : GUEST_KEY; }
export function guestProgress() { return load(storage, GUEST_KEY); }
export function clearGuestProgress() { storage.removeItem(GUEST_KEY); }

async function pull() {
  const uid = state.user.id;
  const local = load(storage, userKey(uid));
  const row = check(await sb.from('progress').select('data, updated_at').eq('user_id', uid).maybeSingle());
  const merged = merge(row?.data, local);
  store(storage, userKey(uid), merged);
  lastPushed = row ? normalize(row.data) : null;
  return merged;
}

async function push() {
  if (!state.user || !navigator.onLine) return;
  const uid = state.user.id;
  const data = normalize(game.getProgress());
  if (lastPushed && sameProgress(lastPushed, data)) return;
  const at = new Date().toISOString();
  const updated = check(await sb.from('progress').update({ data, updated_at: at }).eq('user_id', uid).select('user_id'));
  // riga assente (account creato prima della tabella): la si crea
  if (!updated?.length) check(await sb.from('progress').insert({ user_id: uid, data, updated_at: at }));
  lastPushed = data;
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => sync().catch(() => {}), 1500);
}

/* ---------------------------------------------------------------- partite (per l'area tutor) */

function queueAttempt(detail) {
  if (!state.user) return;
  const q = readQueue(storage, state.user.id);
  q.push(attemptRow(detail, crypto.randomUUID()));
  writeQueue(storage, state.user.id, q);
  schedulePush();
}

async function flushAttempts() {
  if (!state.user || !navigator.onLine) return;
  const uid = state.user.id;
  const q = readQueue(storage, uid);
  if (!q.length) return;
  // upsert con ignoreDuplicates: se un invio precedente era arrivato ma la risposta no, non si duplica
  check(await sb.from('attempts').upsert(q, { onConflict: 'id', ignoreDuplicates: true }));
  const sent = new Set(q.map((r) => r.id));
  writeQueue(storage, uid, readQueue(storage, uid).filter((r) => !sent.has(r.id)));
}

export async function sync() {
  if (!state.user) return;
  state.syncing = true; emit();
  try {
    await push();
    await flushAttempts();
    state.lastSync = new Date();
    state.syncError = null;
  } catch (e) {
    state.syncError = explain(e);
    throw e;
  } finally {
    state.syncing = false; emit();
  }
}
export const flush = () => sync();

/* ---------------------------------------------------------------- collegamento con il motore */

async function enterUser(user) {
  state.user = user;
  state.role = null;
  const uid = user.id;
  // gioca subito con la copia locale, poi la allinea a quella online
  game.useProgress(userKey(uid), load(storage, userKey(uid)));
  try {
    // ruolo nella redazione: se la tabella manca o la lettura fallisce si resta senza ruolo, il gioco non cambia
    const [{ data }, { data: editor }] = await Promise.all([
      sb.from('profiles').select('id, display_name').eq('id', uid).maybeSingle(),
      sb.from('editors').select('role').eq('user_id', uid).maybeSingle(),
    ]);
    state.profile = data || { id: uid, display_name: user.user_metadata?.display_name || 'Giocatore' };
    state.role = roleFrom(editor);
    const merged = await pull();
    if (state.user?.id === uid) game.useProgress(userKey(uid), merged);
    await sync();
  } catch (e) {
    state.profile = state.profile || { id: uid, display_name: user.user_metadata?.display_name || 'Giocatore' };
    state.syncError = explain(e);
  }
  emit();
}

function leaveUser() {
  clearTimeout(pushTimer);
  state.user = null; state.profile = null; state.role = null; lastPushed = null; state.syncError = null;
  game.useProgress(GUEST_KEY, load(storage, GUEST_KEY));
  emit();
}

/* collega il motore e ripristina la sessione salvata; restituisce true se c'è un utente collegato */
export async function init(engine) {
  game = engine;
  if (!enabled) return false;

  engine.gameEvents.addEventListener('progress', () => { if (state.user) schedulePush(); });
  engine.gameEvents.addEventListener('attempt', (e) => queueAttempt(e.detail));
  window.addEventListener('online', () => sync().catch(() => {}));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sync().catch(() => {}); });

  const { data } = await sb.auth.getSession();
  if (data.session?.user) await enterUser(data.session.user);

  sb.auth.onAuthStateChange((event, session) => {
    // le chiamate a Supabase vanno fatte fuori dal callback (raccomandazione di supabase-js)
    setTimeout(() => {
      if (event === 'PASSWORD_RECOVERY') { state.recovery = true; emit(); }
      const u = session?.user || null;
      if (u && u.id !== state.user?.id) enterUser(u);
      else if (!u && state.user) leaveUser();
      else emit();
    }, 0);
  });
  return Boolean(state.user);
}

/* l'ospite che crea un account può portarsi dietro i progressi fatti su questo dispositivo */
export function hasGuestProgress() { return !isEmpty(guestProgress()); }
export async function importGuestProgress() {
  const merged = merge(game.getProgress(), guestProgress());
  game.useProgress(userKey(state.user.id), merged);
  store(storage, userKey(state.user.id), merged);
  clearGuestProgress();
  await sync();
}
