import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { normalize, merge, isEmpty, sameProgress, load, store, readQueue, writeQueue, attemptRow, GUEST_KEY, userKey } from '../src/account/progress.js';
import { studentRows, topMistakes, studentAttempts } from '../src/account/report.js';
import { CASES, EVENTS } from '../src/data/index.js';

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};

describe('progressi', () => {
  it('normalize ripulisce dati mancanti o rovinati', () => {
    expect(normalize(null)).toEqual({ best: {}, ev: {}, xp: 0 });
    expect(normalize({ best: { 1: 5, 2: '2', 3: 0, 4: 'x' }, xp: -10, costume: false }))
      .toEqual({ best: { 1: 3, 2: 2 }, ev: {}, xp: 0, costume: false });
  });

  it('merge tiene le stelle migliori e i punti più alti, senza sommarli', () => {
    const pc = { best: { 1: 3, 2: 1 }, ev: { e1: 2 }, xp: 900 };
    const phone = { best: { 2: 3, 5: 2 }, ev: { e2: 1 }, xp: 700, costume: false };
    expect(merge(pc, phone)).toEqual({ best: { 1: 3, 2: 3, 5: 2 }, ev: { e1: 2, e2: 1 }, xp: 900, costume: false });
  });

  it('merge è idempotente: rifonderlo non cambia nulla', () => {
    const a = { best: { 1: 2 }, xp: 300 }, b = { best: { 1: 3, 4: 1 }, xp: 200 };
    const once = merge(a, b);
    expect(merge(once, b)).toEqual(once);
    expect(merge(once, once)).toEqual(once);
  });

  it('isEmpty e sameProgress', () => {
    expect(isEmpty({})).toBe(true);
    expect(isEmpty({ xp: 10 })).toBe(false);
    expect(sameProgress({ best: { 1: 2, 2: 1 }, xp: 5 }, { xp: 5, best: { 2: 1, 1: 2 } })).toBe(true);
    expect(sameProgress({ best: { 1: 2 } }, { best: { 1: 3 } })).toBe(false);
  });

  it('ogni giocatore ha il suo salvataggio locale, l\'ospite usa quello originale', () => {
    const s = memStorage();
    store(s, userKey('a'), { best: { 1: 3 }, xp: 10 });
    store(s, GUEST_KEY, { best: { 2: 1 }, xp: 5 });
    expect(load(s, userKey('a')).best).toEqual({ 1: 3 });
    expect(load(s, userKey('b'))).toEqual(normalize(null));
    expect(GUEST_KEY).toBe('turno-notte'); // chi giocava prima degli account non perde i progressi
    s.setItem(userKey('c'), '{rotto');
    expect(load(s, userKey('c'))).toEqual(normalize(null));
  });

  it('la coda delle partite sopravvive e si svuota', () => {
    const s = memStorage();
    writeQueue(s, 'u', [{ id: 1 }, { id: 2 }]);
    expect(readQueue(s, 'u')).toHaveLength(2);
    writeQueue(s, 'u', []);
    expect(s.m.size).toBe(0);
    s.setItem('turno-coda:u', 'non json');
    expect(readQueue(s, 'u')).toEqual([]);
  });

  it('attemptRow: una partita persa vale zero stelle', () => {
    const r = attemptRow({ kind: 'case', item: 3, win: false, stars: 2, errors: 3, deaths: 1, wrongs: [] }, 'id-1');
    expect(r).toMatchObject({ id: 'id-1', kind: 'case', item: '3', win: false, stars: 0, errors: 3, deaths: 1 });
  });
});

describe('area tutor', () => {
  const content = { CASES, EVENTS };
  const c3 = CASES.find((c) => c.id === 3);
  const members = [{ user_id: 'b', name: 'Bruno', joined_at: '2026-10-01' }, { user_id: 'a', name: 'Anna', joined_at: '2026-10-02' }];
  const progress = [{ user_id: 'a', data: { best: { 1: 3, 3: 2 }, ev: { e1: 1 }, xp: 1200 } }];
  const attempts = [
    { user_id: 'a', kind: 'case', item: '3', win: true, stars: 2, errors: 1, deaths: 0, played_at: '2026-10-20T10:00:00Z', wrongs: [{ step: 1, tag: 'Decisione', opt: 2, text: 'Occhialini a 6 L/min', x: 1 }] },
    { user_id: 'b', kind: 'case', item: '3', win: false, stars: 0, errors: 3, deaths: 1, played_at: '2026-10-21T10:00:00Z', wrongs: [{ step: 1, tag: 'Decisione', opt: 2, text: 'Occhialini a 6 L/min', x: 1 }, { step: 2, tag: 'Decisione', opt: 0, text: 'Altro', x: 2 }] },
    { user_id: 'b', kind: 'event', item: 'e1', win: true, stars: 3, errors: 0, deaths: 0, played_at: '2026-10-22T10:00:00Z', wrongs: [] },
  ];

  it('riepilogo per studente, in ordine alfabetico, anche senza progressi salvati', () => {
    const rows = studentRows({ members, progress, attempts });
    expect(rows.map((r) => r.name)).toEqual(['Anna', 'Bruno']);
    expect(rows[0]).toMatchObject({ xp: 1200, cases: 2, stars: 5, events: 1, played: 1, errors: 1 });
    expect(rows[1]).toMatchObject({ xp: 0, cases: 0, played: 2, wins: 1, errors: 3, deaths: 1, last: '2026-10-22T10:00:00Z' });
  });

  it('errori più frequenti: prima quelli fatti da più studenti, con la domanda del caso', () => {
    const top = topMistakes(attempts, content);
    expect(top[0]).toMatchObject({ item: '3', text: 'Occhialini a 6 L/min', students: 2, count: 2, title: c3.title });
    expect(top[0].q).toBe(c3.steps[1].q);
    expect(top).toHaveLength(2);
  });

  it('partite di uno studente dalla più recente', () => {
    const list = studentAttempts(attempts, 'b', content);
    expect(list.map((a) => a.kind)).toEqual(['event', 'case']);
    expect(list[1].wrongs[0].q).toBe(c3.steps[1].q);
    expect(list[0].title).toBe(EVENTS.find((e) => e.id === 'e1').title);
  });
});

describe("redazione dell'editor", () => {
  // session.js senza Supabase configurato: nessun client, nessuna chiamata di rete
  let session;
  beforeAll(async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubGlobal('location', { hash: '', origin: 'http://localhost' });
    vi.stubGlobal('navigator', { onLine: true });
    session = await import('../src/account/session.js');
  });
  afterAll(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('senza configurazione gli account restano spenti e nessuno ha un ruolo', () => {
    expect(session.enabled).toBe(false);
    expect(session.sb).toBe(null);
    expect(session.state.role).toBe(null);
  });

  it('roleFrom accetta solo admin e autore', () => {
    expect(session.roleFrom({ role: 'admin' })).toBe('admin');
    expect(session.roleFrom({ role: 'autore' })).toBe('autore');
    expect(session.roleFrom({ role: 'Admin' })).toBe(null);
    expect(session.roleFrom({ role: 'tutor' })).toBe(null);
    expect(session.roleFrom(null)).toBe(null);
    expect(session.roleFrom(undefined)).toBe(null);
  });

  it('gli errori del database diventano messaggi in italiano', () => {
    const { explain } = session;
    expect(explain({ message: 'Utente non trovato' })).toMatch(/registrarsi/);
    expect(explain({ message: 'Serve almeno un amministratore' })).toMatch(/almeno un amministratore/);
    expect(explain({ message: 'Riservato agli amministratori' })).toBe('Operazione riservata agli amministratori.');
    expect(explain({ message: 'Riservato alla redazione' })).toBe('Operazione riservata ad autori e amministratori.');
    expect(explain({ message: 'Per rimandare una bozza serve una nota' })).toMatch(/scrivi una nota/);
    expect(explain({ message: 'La bozza non è in revisione' })).toMatch(/non è in revisione/);
    expect(explain({ message: 'Solo una bozza può essere inviata in revisione' })).toMatch(/già stata inviata/);
    expect(explain({ message: 'Puoi inviare solo le tue bozze' })).toMatch(/scritto tu/);
    expect(explain({ message: 'Puoi salvare versioni solo delle tue bozze' })).toMatch(/scritto tu/);
    expect(explain({ message: 'Bozza non trovata' })).toMatch(/eliminata/);
    expect(explain({ message: 'new row for relation "case_drafts" violates check constraint "case_drafts_title_check"' })).toMatch(/titolo/);
    expect(explain({ message: 'new row violates row-level security policy for table "case_drafts"' })).toBe('Non hai i permessi per questa operazione.');
    expect(explain({ message: 'permission denied for table editors' })).toBe('Non hai i permessi per questa operazione.');
    // i messaggi che c'erano già non cambiano
    expect(explain({ message: 'Codice non valido' })).toMatch(/Codice gruppo/);
    expect(explain({ message: 'Invalid login credentials' })).toBe('Email o password non corretti.');
  });
});
