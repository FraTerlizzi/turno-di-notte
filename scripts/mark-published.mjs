// Dopo l'unione della Pull Request dei contenuti: segna come "pubblicato" le bozze incluse
// (content/published-drafts.json), se nel frattempo nessuno le ha modificate.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!URL || !KEY) { console.error('Servono SUPABASE_URL e SUPABASE_SECRET_KEY.'); process.exit(2); }
const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const list = JSON.parse(readFileSync('content/published-drafts.json', 'utf8'));
for (const [table, rows] of [['case_drafts', list.cases || []], ['chapter_drafts', list.chapters || []]]) {
  for (const r of rows) {
    const { data, error } = await sb.from(table).update({ status: 'pubblicato' })
      .eq('id', r.id).eq('status', 'approvato').eq('updated_at', r.updated_at).select('id');
    if (error) { console.error(table, r.id, error.message); process.exitCode = 1; continue; }
    console.log(`${table} ${r.id}: ${data.length ? 'pubblicato' : 'cambiato dopo l\'esportazione, lasciato com\'è'}`);
  }
}
