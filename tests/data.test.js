// Controlli di coerenza sui contenuti: un errore qui è un caso clinico che in gioco si blocca o si comporta male.
import { describe, it, expect } from 'vitest';
import { CASES, ROAD, GL, PHY, ABCDE, EVENTS, SKINS, GOWN, HAIR } from '../src/data/index.js';

const DIFFS = ['Base', 'Media', 'Difficile'];
const withOpts = (steps) => steps.filter((s) => Array.isArray(s.opts));

describe('casi clinici', () => {
  it('hanno id unici e consecutivi da 1', () => {
    expect(CASES.map((c) => c.id)).toEqual(CASES.map((_, i) => i + 1));
  });

  it.each(CASES.map((c) => [c.id, c]))('caso %i: campi principali', (_, c) => {
    expect(c.title).toBeTruthy();
    expect(c.area).toBeTruthy();
    expect(c.pt).toBeTruthy();
    expect(DIFFS).toContain(c.diff);
    expect(c.steps.length).toBeGreaterThan(0);
    expect(c.src?.length).toBeGreaterThan(0);
  });

  it.each(CASES.map((c) => [c.id, c]))('caso %i: ogni domanda ha almeno una risposta giusta e un feedback per ogni opzione', (_, c) => {
    for (const s of withOpts(c.steps)) {
      expect(s.opts.some((o) => o.ok), `tappa "${s.tag}": nessuna opzione giusta`).toBe(true);
      for (const o of s.opts) {
        expect(o.t, `tappa "${s.tag}": opzione senza testo`).toBeTruthy();
        expect(o.fb, `tappa "${s.tag}": "${o.t}" senza feedback`).toBeTruthy();
      }
    }
  });

  it('ogni domanda ha al massimo 5 opzioni (lettere A-E)', () => {
    for (const c of CASES) for (const s of withOpts(c.steps)) expect(s.opts.length, `caso ${c.id} "${s.tag}"`).toBeLessThanOrEqual(5);
  });
});

describe('ABCDE', () => {
  it('ogni caso parte dalla tappa ABCDE con una sola lettera giusta', () => {
    for (const c of CASES) {
      if (!ABCDE[c.id]) continue;
      const s0 = c.steps[0];
      expect(s0.tag, `caso ${c.id}`).toBe('ABCDE');
      expect(s0.opts.filter((o) => o.ok)).toHaveLength(1);
    }
  });

  it('la lettera prioritaria è tra quelle alterate', () => {
    for (const [id, ab] of Object.entries(ABCDE)) {
      expect('ABCDE', `caso ${id}`).toContain(ab.first);
      expect(ab.bad, `caso ${id}`).toContain(ab.first);
      for (const L of 'ABCDE') expect(ab[L], `caso ${id}, lettera ${L}`).toBeTruthy();
    }
  });

  it('esiste per tutti e soli i casi presenti', () => {
    expect(Object.keys(ABCDE).map(Number).sort((a, b) => a - b)).toEqual(CASES.map((c) => c.id));
  });
});

describe('fisiologia al volo', () => {
  it('riferisce solo casi esistenti e non supera il numero di tappe', () => {
    for (const [id, arr] of Object.entries(PHY)) {
      const c = CASES.find((x) => x.id === Number(id));
      expect(c, `PHY ${id} senza caso`).toBeTruthy();
      const original = c.steps.filter((s) => s.tag !== 'ABCDE').length;
      expect(arr.length, `caso ${id}`).toBeLessThanOrEqual(original);
      for (const p of arr) if (p) expect(p).toHaveLength(2);
    }
  });
});

describe('glossario', () => {
  const keys = GL.map((e) => e[0]);

  it('ha chiavi uniche', () => {
    const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dup).toEqual([]);
  });

  it('ogni voce ha nome, tipo, modelli e contenuto', () => {
    for (const [k, n, t, p, c] of GL) {
      expect(n, k).toBeTruthy();
      expect(t, k).toBeTruthy();
      expect(p.length, k).toBeGreaterThan(0);
      expect(Object.keys(c).length, k).toBeGreaterThan(0);
    }
  });

  it('i modelli di testo sono espressioni regolari valide', () => {
    for (const [k, , , patterns] of GL) {
      for (const p of patterns) {
        const src = p[0] === '!' ? p.slice(1) : p;
        expect(() => new RegExp(src, 'iu'), `${k}: ${p}`).not.toThrow();
      }
    }
  });

  it('le voci correlate esistono', () => {
    const broken = [];
    for (const [k, , , , , rel] of GL) for (const r of rel || []) if (!keys.includes(r)) broken.push(`${k} → ${r}`);
    expect(broken).toEqual([]);
  });
});

describe('eventi fuori turno', () => {
  it('hanno id unici', () => {
    const ids = EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(EVENTS.map((e) => [e.id, e]))('evento %s: ogni domanda ha una risposta giusta', (_, e) => {
    expect(e.title).toBeTruthy();
    expect(e.steps.length).toBeGreaterThan(0);
    for (const s of withOpts(e.steps)) {
      expect(s.opts.some((o) => o.ok), `tappa "${s.tag}"`).toBe(true);
      for (const o of s.opts) expect(o.fb, `tappa "${s.tag}": "${o.t}"`).toBeTruthy();
    }
  });
});

describe('mappa e aspetto', () => {
  it('le stagioni future partono dopo l\'ultimo caso e arrivano a 100 senza buchi', () => {
    let next = CASES.length + 1;
    for (const [, , from, to] of ROAD) {
      expect(from).toBe(next);
      expect(to).toBeGreaterThanOrEqual(from);
      next = to + 1;
    }
    expect(next - 1).toBe(100);
  });

  it('ci sono colori di camice e capelli per ogni caso e costumi validi', () => {
    expect(GOWN.length).toBeGreaterThanOrEqual(CASES.length);
    expect(HAIR.length).toBeGreaterThanOrEqual(CASES.length);
    for (const s of SKINS) {
      expect(s.name).toBeTruthy();
      expect(s.base).toMatch(/^#[0-9a-f]{6}$/i);
      expect(typeof s.extra).toBe('function');
    }
  });
});
