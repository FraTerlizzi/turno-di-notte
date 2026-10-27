/* Dalle bozze approvate ai nuovi contenuti del progetto. Pura: la usa scripts/export-approved.mjs
   (che legge Supabase e scrive i file) e la provano i test. */
import { validateCase, validateCollection, describePath } from './validate.js';

export const fileOf = (c) => `${String(c.id).padStart(3, '0')}-${c.slug}.json`;

/* toglie i gruppi rimasti vuoti nell'editor (es. {vit:{}}) per avere file puliti */
export function prune(o) {
  if (Array.isArray(o)) return o.map(prune);
  if (!o || typeof o !== 'object') return o;
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    const p = prune(v);
    if (p && typeof p === 'object' && !Array.isArray(p) && !Object.keys(p).length) continue;
    out[k] = p;
  }
  return out;
}

/* drafts: bozze di casi approvate; chapterDraft: proposta di capitoli approvata (o null);
   files: Map nome file → caso; chapters: elenco attuale. Restituisce i nuovi contenuti o i problemi. */
export function planExport({ drafts, chapterDraft, files: current, chapters: currentChapters }) {
  const files = new Map(current);
  let chapters = JSON.parse(JSON.stringify(currentChapters));
  const summary = [];
  const problems = [];

  for (const d of drafts) {
    const c = prune(d.data);
    const errs = validateCase(c).filter((p) => p.level === 'error');
    if (errs.length) { problems.push(`**${d.title}**: ${errs.map((p) => `${describePath(p.path)}: ${p.msg}`).join('; ')}`); continue; }
    const old = [...files].find(([, v]) => v.id === c.id);
    if (d.case_id == null && old) { problems.push(`**${d.title}**: il numero ${c.id} è già usato da "${old[1].title}". Cambia numero nella bozza.`); continue; }
    if (d.case_id != null && d.case_id !== c.id) { problems.push(`**${d.title}**: la bozza modifica il caso ${d.case_id} ma il file ha il numero ${c.id}.`); continue; }
    if (old) files.delete(old[0]);
    files.set(fileOf(c), c);
    summary.push(`${old ? 'Modificato' : 'Nuovo'}: **${String(c.id).padStart(3, '0')} · ${c.title}** (${c.area}, ${c.diff})`);
    // un caso nuovo va nel capitolo scelto nell'editor, se non è già in un capitolo e non arriva un elenco nuovo
    if (!chapterDraft && d.chapter && !chapters.some((ch) => ch.cases.includes(c.id))) {
      const ch = chapters.find((x) => x.id === d.chapter);
      if (ch) { ch.cases.push(c.id); summary.push(`↳ aggiunto al capitolo "${ch.title}"`); }
      else problems.push(`**${d.title}**: il capitolo "${d.chapter}" non esiste.`);
    }
  }

  if (chapterDraft) {
    chapters = JSON.parse(JSON.stringify(chapterDraft.data.chapters));
    summary.push('Elenco dei capitoli aggiornato dalla proposta approvata');
  }

  for (const p of validateCollection([...files.values()], chapters).filter((x) => x.level === 'error')) problems.push(`Contenuti: ${p.msg}`);
  return { files, chapters, summary, problems };
}
