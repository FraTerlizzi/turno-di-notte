// Porta i casi approvati nell'editor nei file del progetto (content/), pronti per una Pull Request.
// Gira nella workflow "Pubblica i casi approvati" (.github/workflows/publish-content.yml), ma si può
// lanciare anche a mano:  SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/export-approved.mjs
//
// Usa la chiave secret di Supabase (salta le regole di accesso): non va mai messa nel codice o nel browser,
// solo tra i secrets di GitHub o in una variabile d'ambiente del proprio computer.
import { readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { planExport } from '../src/content/export.js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!URL || !KEY) { console.error('Servono SUPABASE_URL e SUPABASE_SECRET_KEY.'); process.exit(2); }
const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const check = ({ data, error }) => { if (error) throw error; return data; };

const DIR = 'content/cases';
const write = (path, obj) => writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
const report = (text) => writeFileSync('publish-report.md', text);

const drafts = check(await sb.from('case_drafts').select('id, case_id, chapter, title, data, updated_at').eq('status', 'approvato').order('updated_at'));
const chapterDraft = check(await sb.from('chapter_drafts').select('id, data, updated_at').eq('chapter', 'indice').eq('status', 'approvato')
  .order('updated_at', { ascending: false }).limit(1))[0] || null;

if (!drafts.length && !chapterDraft) { console.log('Niente da pubblicare: nessuna bozza approvata.'); process.exit(0); }

const current = new Map(readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => [f, JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))]));
const chapters = JSON.parse(readFileSync('content/chapters.json', 'utf8'));
const plan = planExport({ drafts, chapterDraft, files: current, chapters });

if (plan.problems.length) {
  const text = plan.problems.map((p) => `- ${p}`).join('\n');
  console.error('Pubblicazione bloccata:\n' + text);
  report(`### Pubblicazione bloccata\n\n${text}\n\nCorreggi le bozze nell'editor (un amministratore può rimandarle all'autore) e riavvia la pubblicazione.\n`);
  process.exit(1);
}

for (const f of current.keys()) if (!plan.files.has(f)) unlinkSync(`${DIR}/${f}`);
for (const [f, c] of plan.files) write(`${DIR}/${f}`, c);
write('content/chapters.json', plan.chapters);
// bozze incluse: dopo l'unione della PR la workflow le segna come "pubblicato"
write('content/published-drafts.json', {
  exported_at: new Date().toISOString(),
  cases: drafts.map((d) => ({ id: d.id, updated_at: d.updated_at })),
  chapters: chapterDraft ? [{ id: chapterDraft.id, updated_at: chapterDraft.updated_at }] : [],
});
report(`### Contenuti da pubblicare\n\n${plan.summary.map((s) => `- ${s}`).join('\n')}\n\nControlli automatici superati. Unendo questa Pull Request il sito si aggiorna e le bozze passano a "pubblicato".\n`);
console.log(plan.summary.join('\n'));
