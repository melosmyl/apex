// Embeddings on the local stack go to the fake provider ($0), not OpenAI:
// a note is embedded, and a related question finds it again. Setup as in
// README.md.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL = 'http://127.0.0.1:54321', ANON = Deno.env.get('LOCAL_ANON_KEY')!, SERVICE = Deno.env.get('LOCAL_SERVICE_KEY')!;
const FAKE = 'http://127.0.0.1:54399';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
let failures = 0;
const check = (ok: boolean, what: string, detail?: unknown) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`); };

const email = `embed-${tag}@example.test`, password = crypto.randomUUID();
await admin.auth.admin.createUser({ email, password, email_confirm: true });
const F = createClient(URL, ANON, { auth: { persistSession: false } });
const { data: s } = await F.auth.signInWithPassword({ email, password });
const uid = s.user!.id, token = s.session!.access_token;
const fn = async (name: string, body: unknown) => {
  const r = await fetch(`${URL}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};

const { data: co } = await F.from('companies').insert({ name: `petit ${tag}`, created_by_id: uid }).select().single();
const PRICE = `Charity shops might stock the dinner sets at forty five pounds ${tag}`;
const { data: notes } = await F.from('notes').insert([
  { company_id: co.id, raw_text: PRICE },
  { company_id: co.id, raw_text: `Remember to renew the van insurance in March ${tag}` },
]).select();

await fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify({ marks: [PRICE] }) });
for (const n of notes!) {
  const r = await fn('embedNote', { note_id: n.id });
  check(r.status === 200, `the note is embedded (${n.raw_text.slice(0, 24)}…)`, r);
}
const log = (await (await fetch(`${FAKE}/__log`)).json()).filter((l: any) => l.kind === 'embedding');
check(log.length === 2 && log.every((l: any) => l.model === 'text-embedding-3-small'), 'both went to the fake provider, not OpenAI', log);
const { data: stored } = await admin.from('notes').select('id, embedding').in('id', notes!.map((n: any) => n.id));
check(stored?.every((n: any) => n.embedding), 'and each note has its embedding stored', stored?.map((n: any) => !!n.embedding));

const r = await fn('checkNoteRelevance', { company_id: co.id, draft_text: `Should the dinner sets go into charity shops ${tag}?` });
check(r.json?.matched === true && r.json?.note_id === notes![0].id, 'a related question finds the right note again', r.json);

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
