/* Riepiloghi per l'area tutor, calcolati dai dati grezzi (membri, progressi, partite).
   Funzioni pure: ricevono i contenuti del gioco come parametro, così si possono testare. */
import { normalize } from './progress.js';

export function itemInfo(content, kind, item) {
  if (kind === 'case') {
    const c = content.CASES.find((x) => String(x.id) === String(item));
    return c ? { title: c.title, label: 'Ep. ' + String(c.id).padStart(2, '0'), steps: c.steps } : { title: 'Caso ' + item, label: 'Ep. ?', steps: [] };
  }
  const e = content.EVENTS.find((x) => x.id === item);
  return e ? { title: e.title, label: 'Fuori turno', steps: e.steps } : { title: 'Evento ' + item, label: 'Fuori turno', steps: [] };
}

export function studentRows({ members, progress, attempts }) {
  const prog = new Map(progress.map((p) => [p.user_id, normalize(p.data)]));
  return members.map((m) => {
    const p = prog.get(m.user_id) || normalize(null);
    const mine = attempts.filter((a) => a.user_id === m.user_id);
    const last = mine.reduce((t, a) => (a.played_at > t ? a.played_at : t), '');
    return {
      id: m.user_id,
      name: m.name,
      joined: m.joined_at,
      xp: p.xp,
      cases: Object.keys(p.best).length,
      stars: Object.values(p.best).reduce((s, v) => s + v, 0),
      events: Object.keys(p.ev).length,
      played: mine.length,
      wins: mine.filter((a) => a.win).length,
      errors: mine.reduce((s, a) => s + a.errors, 0),
      deaths: mine.reduce((s, a) => s + a.deaths, 0),
      last: last || null,
      best: p.best,
      ev: p.ev,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'it'));
}

/* risposte sbagliate più frequenti: stessa domanda e stessa opzione scelta da più studenti */
export function topMistakes(attempts, content, limit = 10) {
  const map = new Map();
  for (const a of attempts) {
    for (const w of a.wrongs || []) {
      const key = [a.kind, a.item, w.step, w.opt ?? w.text].join('|');
      let r = map.get(key);
      if (!r) {
        const info = itemInfo(content, a.kind, a.item);
        const step = info.steps[w.step];
        r = { key, kind: a.kind, item: a.item, label: info.label, title: info.title, tag: w.tag || step?.tag || '', q: step?.q || '', text: w.text, x: w.x, count: 0, students: new Set() };
        map.set(key, r);
      }
      r.count++;
      r.students.add(a.user_id);
    }
  }
  return [...map.values()]
    .map((r) => ({ ...r, students: r.students.size }))
    .sort((a, b) => b.students - a.students || b.count - a.count)
    .slice(0, limit);
}

/* partite di uno studente, dalla più recente, con titolo e domande delle risposte sbagliate */
export function studentAttempts(attempts, userId, content) {
  return attempts
    .filter((a) => a.user_id === userId)
    .sort((a, b) => (a.played_at < b.played_at ? 1 : -1))
    .map((a) => {
      const info = itemInfo(content, a.kind, a.item);
      return {
        ...a,
        label: info.label,
        title: info.title,
        wrongs: (a.wrongs || []).map((w) => ({ ...w, q: info.steps[w.step]?.q || '' })),
      };
    });
}
