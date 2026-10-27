// Controlli di coerenza sui contenuti: un errore qui è un caso clinico che in gioco si blocca o si comporta male.
// I controlli sui casi e sui capitoli sono gli stessi che l'editor mostra dal vivo (src/content/validate.js).
import { describe, it, expect } from 'vitest';
import { CASES, CASE_FILES, CHAPTERS, GL, EVENTS, SKINS } from '../src/data/index.js';
import { validateCase, validateCollection, errorsOnly, describePath } from '../src/content/validate.js';
import { compileCase, hudValue } from '../src/content/compile.js';

const show = (list) => list.map((p) => `${describePath(p.path)}: ${p.msg}`);
const withOpts = (steps) => steps.filter((s) => Array.isArray(s.opts));

describe('file dei casi', () => {
  it.each(CASE_FILES.map((c) => [c.id, c]))('caso %i: nessun errore', (_, c) => {
    expect(show(errorsOnly(validateCase(c)))).toEqual([]);
  });

  it('numeri e nomi brevi unici, capitoli coerenti', () => {
    expect(show(errorsOnly(validateCollection(CASE_FILES, CHAPTERS)))).toEqual([]);
  });

  it('il nome del file corrisponde a numero e nome breve del caso', () => {
    const files = Object.keys(import.meta.glob('../content/cases/*.json')).map((k) => k.split('/').pop()).sort();
    const expected = [...CASE_FILES].sort((a, b) => a.id - b.id).map((c) => `${String(c.id).padStart(3, '0')}-${c.slug}.json`);
    expect(files).toEqual(expected);
  });
});

describe('casi compilati per il motore', () => {
  it('ogni caso parte dalla tappa ABCDE con una sola lettera giusta', () => {
    for (const c of CASES) {
      expect(c.steps[0].tag, `caso ${c.id}`).toBe('ABCDE');
      expect(c.steps[0].opts.filter((o) => o.ok)).toHaveLength(1);
    }
  });

  it('l\'animazione d\'apertura passa dalla prima tappa alla tappa ABCDE', () => {
    for (const f of CASE_FILES) {
      const c = compileCase(f);
      if (f.steps[0].seq) {
        expect(c.steps[0].seq).toEqual(f.steps[0].seq);
        expect(c.steps[1].seq).toBeUndefined();
      }
      expect(f.steps[0].seq === undefined || f.steps[0].seq.length > 0).toBe(true); // il file non viene modificato
    }
  });

  it('ogni domanda ha almeno una risposta giusta e un feedback per ogni opzione', () => {
    for (const c of CASES) for (const s of withOpts(c.steps)) {
      expect(s.opts.some((o) => o.ok), `caso ${c.id} "${s.tag}"`).toBe(true);
      for (const o of s.opts) expect(o.fb, `caso ${c.id} "${s.tag}": "${o.t}"`).toBeTruthy();
    }
  });

  it('valori extra del monitor', () => {
    const st = { vit: { sys: 120, dia: 60, hr: 80 }, pat: {}, phys: { co2: 0.4, occlusion: 0.25 } };
    expect(hudValue({ source: 'calc.map' }, st)).toBe(80);
    expect(hudValue({ source: 'vit.hr' }, st)).toBe(80);
    expect(hudValue({ source: 'phys.co2', scale: 100 }, st)).toBeCloseTo(40);
    expect(hudValue({ source: 'phys.occlusion', scale: 100, invert: true }, st)).toBeCloseTo(75);
    expect(hudValue({ source: 'phys.glu', scale: 100 }, st)).toBeNull();
    expect(hudValue({ source: 'phys.glu' }, st)).toBeUndefined();
  });
});

describe('controlli dell\'editor', () => {
  const base = () => JSON.parse(JSON.stringify(CASE_FILES[0]));

  it('segnalano gli errori tipici di un caso scritto a mano', () => {
    const c = base();
    c.steps[1].opts.forEach((o) => { delete o.ok; });
    c.steps[2].opts[0].fb = '';
    c.abcde.first = 'E';
    c.abcde.bad = 'B';
    c.hud.pop();
    c.base.vit.spo2 = 140;
    const msgs = validateCase(c).filter((p) => p.level === 'error').map((p) => p.msg);
    expect(msgs).toContain('nessuna risposta giusta');
    expect(msgs).toContain('feedback mancante');
    expect(msgs).toContain('la lettera prioritaria deve essere tra quelle alterate');
    expect(msgs).toContain('servono esattamente due valori extra per il monitor');
    expect(msgs.some((m) => m.startsWith('Saturazione fuori'))).toBe(true);
  });

  it('non accettano la tappa ABCDE scritta a mano né un decesso senza evento critico', () => {
    const c = base();
    c.steps.unshift({ ...compileCase(c).steps[0] });
    const o = c.steps[2].opts.find((x) => !x.ok);
    o.dead = 1; o.x = 1;
    const msgs = errorsOnly(validateCase(c)).map((p) => p.msg);
    expect(msgs).toContain('la tappa ABCDE si genera da sola: non va scritta tra le tappe');
    expect(msgs).toContain('il decesso richiede gravità "evento critico"');
  });

  it('i capitoli non possono contenere casi inesistenti o ripetuti', () => {
    const ch = JSON.parse(JSON.stringify(CHAPTERS));
    ch[1].cases = [1, 99];
    const msgs = errorsOnly(validateCollection(CASE_FILES, ch)).map((p) => p.msg);
    expect(msgs).toContain('il caso 99 non esiste');
    expect(msgs.some((m) => m.startsWith('il caso 1 è già nel capitolo'))).toBe(true);
  });
});

describe('glossario', () => {
  const keys = GL.map((e) => e[0]);

  it('ha chiavi uniche', () => {
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
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
    for (const [k, , , patterns] of GL) for (const p of patterns) {
      const src = p[0] === '!' ? p.slice(1) : p;
      expect(() => new RegExp(src, 'iu'), `${k}: ${p}`).not.toThrow();
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

describe('costumi', () => {
  it('sono validi', () => {
    for (const s of SKINS) {
      expect(s.name).toBeTruthy();
      expect(s.base).toMatch(/^#[0-9a-f]{6}$/i);
      expect(typeof s.extra).toBe('function');
    }
  });
});
