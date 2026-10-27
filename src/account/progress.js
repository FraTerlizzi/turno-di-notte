/* Progressi: forma dei dati, fusione tra dispositivi e salvataggio locale per giocatore.
   Nessuna dipendenza dal DOM o dalla rete, così si può testare. */

export const GUEST_KEY = 'turno-notte';
export const userKey = (uid) => `turno-notte:${uid}`;

export function normalize(p) {
  const src = p && typeof p === 'object' ? p : {};
  const out = { ...src, best: {}, ev: {}, xp: 0 };
  for (const k of ['best', 'ev']) {
    const m = src[k] && typeof src[k] === 'object' ? src[k] : {};
    for (const [id, v] of Object.entries(m)) {
      const n = Math.max(0, Math.min(3, Math.floor(Number(v) || 0)));
      if (n) out[k][id] = n;
    }
  }
  out.xp = Math.max(0, Math.floor(Number(src.xp) || 0));
  return out;
}

/* Le stelle migliori vincono sempre; i punti esperienza non si sommano (sarebbero contati due volte
   se lo stesso progresso arriva da due parti) ma si tiene il valore più alto. Le preferenze
   (es. costumi) vengono dalla copia più recente. */
export function merge(a, b, { preferB = true } = {}) {
  const A = normalize(a), B = normalize(b);
  const out = preferB ? { ...A, ...B } : { ...B, ...A };
  for (const k of ['best', 'ev']) {
    out[k] = { ...A[k] };
    for (const [id, v] of Object.entries(B[k])) out[k][id] = Math.max(out[k][id] || 0, v);
  }
  out.xp = Math.max(A.xp, B.xp);
  return out;
}

export function isEmpty(p) {
  const n = normalize(p);
  return n.xp === 0 && !Object.keys(n.best).length && !Object.keys(n.ev).length;
}

export function sameProgress(a, b) {
  return JSON.stringify(sortKeys(normalize(a))) === JSON.stringify(sortKeys(normalize(b)));
}
function sortKeys(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return o;
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])]));
}

/* ---- archivio locale: ogni giocatore ha la sua chiave, l'ospite usa quella originale del gioco ---- */

export function load(storage, key) {
  try {
    const s = storage.getItem(key);
    return s ? normalize(JSON.parse(s)) : normalize(null);
  } catch {
    return normalize(null);
  }
}

export function store(storage, key, p) {
  try { storage.setItem(key, JSON.stringify(p)); } catch { /* spazio pieno o storage bloccato */ }
}

/* ---- coda delle partite da inviare: sopravvive a chiusura dell'app e assenza di rete ---- */

export const queueKey = (uid) => `turno-coda:${uid}`;
const QUEUE_MAX = 200;

export function readQueue(storage, uid) {
  try {
    const q = JSON.parse(storage.getItem(queueKey(uid)) || '[]');
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
}

export function writeQueue(storage, uid, q) {
  try {
    if (q.length) storage.setItem(queueKey(uid), JSON.stringify(q.slice(-QUEUE_MAX)));
    else storage.removeItem(queueKey(uid));
  } catch { /* come sopra */ }
}

/* riga per la tabella attempts a partire dall'esito che il motore comunica a fine partita */
export function attemptRow(detail, id) {
  return {
    id,
    kind: detail.kind,
    item: String(detail.item),
    win: !!detail.win,
    stars: detail.win ? detail.stars : 0,
    errors: detail.errors,
    deaths: detail.deaths,
    wrongs: detail.wrongs || [],
    played_at: detail.at || new Date().toISOString(),
  };
}
