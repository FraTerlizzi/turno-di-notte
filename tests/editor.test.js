import { describe, it, expect } from 'vitest';
import { newCase, duplicateCase, nextCaseId, parsePath, getAt, setAt, move, diffCases, permissions, slugify, fileName, emptyStep } from '../src/editor/model.js';
import { validateCase } from '../src/content/validate.js';
import { compileCase } from '../src/content/compile.js';
import { CASE_FILES } from '../src/data/index.js';

describe('modello dell\'editor', () => {
  it('un caso nuovo è già un file valido nella struttura: mancano solo i testi', () => {
    const c = newCase(13);
    const errs = validateCase(c).filter((p) => p.level === 'error');
    // nessun errore di struttura (valori fuori intervallo, campi sconosciuti, monitor incompleto): solo testi da scrivere
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.filter((p) => /sconosciut|fuori dall|non valid|esattamente|si genera da sola|giusta non può/.test(p.msg))).toEqual([]);
    // si può provare in anteprima anche incompleto: senza priorità ABCDE si parte dalla tappa 1
    expect(() => compileCase(c)).not.toThrow();
    expect(compileCase(c).steps[0].tag).toBe('Valutazione');
    c.abcde.first = 'B';
    expect(compileCase(c).steps[0].tag).toBe('ABCDE');
  });

  it('un caso esistente duplicato resta valido, con numero e nome nuovi', () => {
    const d = duplicateCase(CASE_FILES[0], 99);
    expect(d.id).toBe(99);
    expect(d.title).toMatch(/\(copia\)$/);
    expect(validateCase(d).filter((p) => p.level === 'error')).toEqual([]);
    expect(CASE_FILES[0].id).toBe(1); // l'originale non cambia
  });

  it('il numero di un caso nuovo tiene conto anche delle bozze', () => {
    expect(nextCaseId([{ id: 1 }, { id: 12 }], [])).toBe(13);
    expect(nextCaseId([{ id: 12 }], [{ data: { id: 15 } }, { case_id: 3, data: {} }])).toBe(16);
    expect(nextCaseId([], [])).toBe(1);
  });

  it('legge e scrive i campi per percorso', () => {
    expect(parsePath('steps[2].opts[0].fb')).toEqual(['steps', 2, 'opts', 0, 'fb']);
    expect(parsePath('scheda[1][0]')).toEqual(['scheda', 1, 0]);
    const o = { steps: [{ opts: [{ t: 'a' }] }] };
    expect(getAt(o, 'steps[0].opts[0].t')).toBe('a');
    setAt(o, 'steps[0].opts[0].s.vit.hr', 120);
    expect(o.steps[0].opts[0].s).toEqual({ vit: { hr: 120 } });
    setAt(o, 'steps[0].opts[0].s.vit.hr', undefined);
    expect(o.steps[0].opts[0].s.vit).toEqual({});
    setAt(o, 'src[0]', 'fonte');
    expect(o.src).toEqual(['fonte']);
  });

  it('sposta gli elementi senza uscire dai bordi', () => {
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(move([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(move([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });

  it('descrive cosa è cambiato tra due versioni', () => {
    const a = JSON.parse(JSON.stringify(CASE_FILES[2]));
    const b = JSON.parse(JSON.stringify(a));
    b.title = 'Altro';
    b.steps[1].q = 'Nuova domanda';
    b.steps.push(emptyStep());
    expect(diffCases(a, b)).toEqual(['titolo', `tappe: da ${a.steps.length} a ${b.steps.length}`, 'tappa 2']);
    expect(diffCases(a, a)).toEqual([]);
  });

  it('permessi: l\'autore modifica solo le sue bozze non ancora inviate', () => {
    const d = { author_id: 'u1', status: 'bozza' };
    expect(permissions(d, { uid: 'u1', role: 'autore' })).toMatchObject({ edit: true, submit: true, review: false, remove: false });
    expect(permissions(d, { uid: 'u2', role: 'autore' })).toMatchObject({ edit: false, submit: false });
    expect(permissions({ ...d, status: 'in-revisione' }, { uid: 'u1', role: 'autore' })).toMatchObject({ edit: false, submit: false });
    expect(permissions({ ...d, status: 'in-revisione' }, { uid: 'u9', role: 'admin' })).toMatchObject({ edit: true, review: true, remove: true });
  });

  it('nomi di file', () => {
    expect(slugify('L\'alito che sa di frutta!')).toBe('l-alito-che-sa-di-frutta');
    expect(slugify('')).toBe('caso');
    expect(fileName({ id: 7, slug: 'abc' })).toBe('007-abc.json');
  });
});
