import { describe, it, expect } from 'vitest';
import { planExport, prune, fileOf } from '../src/content/export.js';
import { CASE_FILES, CHAPTERS } from '../src/data/index.js';
import { duplicateCase } from '../src/editor/model.js';

const current = () => new Map(CASE_FILES.map((c) => [fileOf(c), c]));
const clone = (o) => JSON.parse(JSON.stringify(o));

describe('pubblicazione dei casi approvati', () => {
  it('un caso nuovo diventa un file e va nel capitolo scelto', () => {
    const free = Math.max(...CASE_FILES.map((c) => c.id)) + 1;
    const c = duplicateCase(CASE_FILES[0], free);
    const before = CHAPTERS.find((ch) => ch.id === 'c2').cases.slice();
    const p = planExport({ drafts: [{ title: c.title, case_id: null, chapter: 'c2', data: c }], chapterDraft: null, files: current(), chapters: CHAPTERS });
    expect(p.problems).toEqual([]);
    expect(p.files.has(fileOf(c))).toBe(true);
    expect(p.files.size).toBe(CASE_FILES.length + 1);
    expect(p.chapters.find((ch) => ch.id === 'c2').cases).toEqual([...before, free]);
    expect(CHAPTERS.find((ch) => ch.id === 'c2').cases).toEqual(before); // l'originale non viene toccato
  });

  it('la modifica di un caso lo sostituisce anche se cambia nome breve', () => {
    const c = clone(CASE_FILES[2]);
    c.title = 'Ossigeno, ma con misura'; c.slug = 'ossigeno-con-misura';
    const p = planExport({ drafts: [{ title: c.title, case_id: 3, chapter: 'c1', data: c }], chapterDraft: null, files: current(), chapters: CHAPTERS });
    expect(p.problems).toEqual([]);
    expect(p.files.size).toBe(CASE_FILES.length);
    expect(p.files.has('003-ossigeno-con-misura.json')).toBe(true);
    expect(p.files.has(fileOf(CASE_FILES[2]))).toBe(false);
    expect(p.summary[0]).toMatch(/^Modificato/);
  });

  it('blocca casi con errori, numeri già usati e capitoli inesistenti', () => {
    const bad = clone(CASE_FILES[0]); bad.id = 20; bad.slug = 'x'; bad.steps[0].opts.forEach((o) => delete o.ok);
    const clash = duplicateCase(CASE_FILES[1], 5);
    const lost = duplicateCase(CASE_FILES[1], 21);
    const p = planExport({ drafts: [
      { title: 'Errato', case_id: null, chapter: 'c2', data: bad },
      { title: 'Doppione', case_id: null, chapter: 'c2', data: clash },
      { title: 'Senza capitolo', case_id: null, chapter: 'c99', data: lost },
    ], chapterDraft: null, files: current(), chapters: CHAPTERS });
    expect(p.problems.some((x) => x.includes('Errato') && x.includes('nessuna risposta giusta'))).toBe(true);
    expect(p.problems.some((x) => x.includes('Doppione') && x.includes('già usato'))).toBe(true);
    expect(p.problems.some((x) => x.includes('Senza capitolo') && x.includes('non esiste'))).toBe(true);
  });

  it('una proposta di capitoli approvata sostituisce l\'elenco e viene controllata', () => {
    const ch = clone(CHAPTERS); ch[1].status = 'aperto'; ch[1].cases = [12]; ch[0].cases = ch[0].cases.filter((id) => id !== 12);
    const ok = planExport({ drafts: [], chapterDraft: { data: { chapters: ch } }, files: current(), chapters: CHAPTERS });
    expect(ok.problems).toEqual([]);
    expect(ok.chapters[1].cases).toEqual([12]);
    const wrong = clone(ch); wrong[2].cases = [12];
    expect(planExport({ drafts: [], chapterDraft: { data: { chapters: wrong } }, files: current(), chapters: CHAPTERS }).problems.length).toBeGreaterThan(0);
  });

  it('prune toglie i gruppi vuoti lasciati dall\'editor', () => {
    expect(prune({ s: { vit: {}, pat: { skin: 'pale' } }, a: [1, {}], b: '' })).toEqual({ s: { pat: { skin: 'pale' } }, a: [1, {}], b: '' });
  });
});
