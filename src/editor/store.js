/* Dati dell'editor su Supabase: bozze, versioni, redazione. Le regole di chi può fare cosa
   stanno nel database (supabase/migrations/20261028090000_editor.sql): qui ci sono solo le chiamate. */
import { sb } from '../account/session.js';

const check = ({ data, error }) => { if (error) throw error; return data; };
const DRAFT_COLS = 'id, case_id, chapter, title, data, status, author_id, created_at, updated_at, updated_by, review_note';

export const CHAPTER_INDEX = 'indice'; // bozza unica con l'elenco completo dei capitoli

/* ---- bozze dei casi ---- */
export async function listDrafts() {
  return check(await sb.from('case_drafts').select(DRAFT_COLS).order('updated_at', { ascending: false }));
}
export async function getDraft(id) {
  return check(await sb.from('case_drafts').select(DRAFT_COLS).eq('id', id).maybeSingle());
}
export async function createDraft({ case_id = null, chapter = null, title, data }) {
  return check(await sb.from('case_drafts').insert({ case_id, chapter, title: title || 'Caso senza titolo', data }).select(DRAFT_COLS).single());
}
export async function saveDraft(id, { chapter, title, data }) {
  return check(await sb.from('case_drafts').update({ chapter, title: title || 'Caso senza titolo', data }).eq('id', id).select('updated_at').single());
}
export async function deleteDraft(id) { check(await sb.from('case_drafts').delete().eq('id', id)); }

/* ---- ciclo di revisione (valgono per bozze di casi e di capitoli) ---- */
export async function submitDraft(id) { check(await sb.rpc('submit_draft', { p_id: id })); }
export async function reviewDraft(id, approve, note) { check(await sb.rpc('review_draft', { p_id: id, p_approve: approve, p_note: note || null })); }
export async function saveVersion(id, note) { return check(await sb.rpc('save_version', { p_draft_id: id, p_note: note || null })); }

export async function listVersions(draftId, table = 'case_versions') {
  return check(await sb.from(table).select('id, data, saved_at, saved_by, note').eq('draft_id', draftId).order('saved_at', { ascending: false }).limit(100));
}

/* ---- bozza dell'elenco dei capitoli ---- */
export async function getChaptersDraft() {
  const rows = check(await sb.from('chapter_drafts').select(DRAFT_COLS.replace('case_id, ', '')).eq('chapter', CHAPTER_INDEX)
    .in('status', ['bozza', 'in-revisione', 'approvato']).order('updated_at', { ascending: false }).limit(1));
  return rows[0] || null;
}
export async function createChaptersDraft(data) {
  return check(await sb.from('chapter_drafts').insert({ chapter: CHAPTER_INDEX, title: 'Elenco dei capitoli', data }).select(DRAFT_COLS.replace('case_id, ', '')).single());
}
export async function saveChaptersDraft(id, data) {
  return check(await sb.from('chapter_drafts').update({ data }).eq('id', id).select('updated_at').single());
}

/* ---- redazione (solo amministratori) ---- */
export async function listEditors() { return check(await sb.rpc('list_editors')) || []; }
export async function addEditor(email, role) { return (check(await sb.rpc('add_editor', { p_email: email.trim(), p_role: role })) || [])[0]; }
export async function removeEditor(userId) { check(await sb.rpc('remove_editor', { p_user: userId })); }
