// Workstream M, Stage 3 (Research and Calculate), end to end on the local
// stack against fake providers ($0): the research pass on Opus 5.5 with web
// search (caps, blocked sites, code execution for Calculate, a paused turn
// continued), findings kept only when a real source backs them, the
// no-sources retry and plain failure, and the cost logged. Setup as in
// README.md.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL = 'http://127.0.0.1:54321', ANON = Deno.env.get('LOCAL_ANON_KEY')!, SERVICE = Deno.env.get('LOCAL_SERVICE_KEY')!;
const DB = 'supabase_db_localstack', FAKE = 'http://127.0.0.1:54399';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
let failures = 0;
const check = (ok: boolean, what: string, detail?: unknown) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`); };
const sql = async (q: string) => new TextDecoder().decode((await new Deno.Command('docker', { args: ['exec', '-i', DB, 'psql', '-U', 'postgres', '-tAq', '-c', q] }).output()).stdout).trim();
const rows = async (q: string) => JSON.parse(await sql(`select coalesce(json_agg(t), '[]') from (${q}) t`));
const script = (s: unknown) => fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify(s) });
const fakeLog = async () => (await fetch(`${FAKE}/__log`)).json();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const email = `m2b-${tag}@example.test`, password = crypto.randomUUID();
await admin.auth.admin.createUser({ email, password, email_confirm: true });
const F = createClient(URL, ANON, { auth: { persistSession: false } });
const { data: session } = await F.auth.signInWithPassword({ email, password });
const uid = session.user!.id, token = session.session!.access_token;
const fn = async (name: string, body: unknown) => {
  const r = await fetch(`${URL}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
async function waitFor(runId: string, ms = 90_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const [r] = await rows(`select * from task_runs where id='${runId}'`);
    if (r && !['queued', 'running'].includes(r.status)) return r;
    await sleep(500);
  }
  return (await rows(`select * from task_runs where id='${runId}'`))[0];
}

const { data: co } = await F.from('companies').insert({ name: `Coats ${tag}`, description: 'Resells secondhand winter coats', created_by_id: uid }).select().single();
const { data: advs } = await F.from('advisors').insert([
  { library_key: 'chair', role: 'The Chair', name: `Margaret ${tag}` }, { name: `Grace ${tag}`, role: 'Customer Advocate' },
  { name: `Marcus ${tag}`, role: 'Finance Director' }, { name: `Priya ${tag}`, role: 'Product Strategist' },
].map((m, i) => ({ company_id: co.id, created_by_id: uid, type: 'ai', default_provider: i % 2 ? 'openai' : 'anthropic', default_model: i % 2 ? 'gpt-4o' : 'claude-sonnet-5', fallback_provider: i % 2 ? 'anthropic' : 'openai', fallback_model: i % 2 ? 'claude-sonnet-5' : 'gpt-4o', ...m }))).select();
const by = (n: string) => advs!.find((a: any) => a.name.startsWith(n));
const newTask = async (title: string, type: string, who: string) => {
  const { data } = await F.from('tasks').insert({ company_id: co.id, created_by_id: uid, title, assigned_to: by(who).name, advisor_id: by(who).id, task_type: type, status: 'todo', created_by: 'Founder' }).select().single();
  return data;
};

// ---- 1. Research: real sources kept, made-up ones dropped, Vinted skipped.
console.log('\n== research');
const research = await newTask('Research three UK suppliers of secondhand coats, and what they sell for on Vinted', 'research', 'Priya');
await script({
  research: { results: [{ url: 'https://example.org/suppliers', title: 'UK coat suppliers' }, { url: 'https://example.net/reviews', title: 'Supplier reviews' }] },
  fields: {
    findings: [[
      { finding: 'Supplier A sells 50-coat bales', detail: '£180 a bale', source: 1 },
      { finding: 'Supplier A has 4.6 stars from 300 reviews', detail: '', source: 2 },
      { finding: 'Supplier C ships overnight', detail: '', source: 7 },
      { finding: 'Coats sell for £45 on average', detail: '', source: 0 },
    ]],
    legitimacy: [[{ name: 'Supplier A', verdict: 'looks_legitimate', why: 'Trading since 2015, good reviews', source: 2 }]],
    risks: [[{ risk: 'Branded bales can contain counterfeits', what_to_do: 'Inspect labels before listing' }]],
  },
});
const r1 = await fn('taskRun', { action: 'start', task_id: research.id });
const run1 = await waitFor(r1.json?.run?.id);
const res1 = run1?.result || {};
check(run1?.status === 'done', 'the research finishes', run1?.error || run1?.status);
check(res1.findings?.length === 2 && res1.findings.every((f: any) => ['https://example.org/suppliers', 'https://example.net/reviews'].includes(f.source?.url)),
  'only findings backed by a page the search returned are kept', res1.findings);
check(res1.legitimacy?.[0]?.verdict === 'looks_legitimate' && res1.risks?.length === 1, 'the legitimacy and risk checks come through');
check(res1.manual_checks?.some((m: any) => m.site === 'Vinted'), 'Vinted is skipped, with a guide to checking it by hand', res1.manual_checks);
check(res1.written_by?.model === 'claude-opus-5-5' && res1.stats?.searches === 1, 'it was researched on Opus 5.5, and the searches are counted', { w: res1.written_by, s: res1.stats });
const log1 = await fakeLog();
const pass1 = log1.find((l: any) => l.kind === 'research');
const searchTool = pass1?.tools?.find((t: any) => t.type.startsWith('web_search'));
const fetchTool = pass1?.tools?.find((t: any) => t.type.startsWith('web_fetch'));
check(pass1?.model === 'claude-opus-5-5' && searchTool?.max_uses === 5 && fetchTool?.max_uses === 8 && searchTool?.blocked > 0 && !pass1?.format,
  'the research pass: Opus 5.5, 5 searches and 8 pages at most, blocked sites, prose not JSON', pass1);
const costs = await rows(`select request_type, model, estimated_cost from ai_usage_logs where task_run_id='${run1?.id}' order by created_at`);
check(costs.length === 2 && costs[0].request_type === 'task_research' && Number(costs[0].estimated_cost) >= 0.01 && costs[1].request_type === 'task_structure' && costs[1].model === 'claude-sonnet-5-5',
  "each step's cost is logged against the run, the search fee included", costs);
check(Number(run1?.cost_usd) > 0.01, 'the run carries the total cost', run1?.cost_usd);

// ---- 2. Calculate: code runs the numbers, figures say where they came from.
console.log('\n== calculate');
const calc = await newTask('Work out my margin on a £45 coat after fees and postage', 'calculate', 'Marcus');
await script({
  fields: {
    answer: ['You keep about £33 a coat.'],
    workings: [[{ step: 'Sale price minus 10% fees', result: '£40.50' }, { step: 'Minus £7.50 postage', result: '£33' }]],
    inputs: [[
      { name: 'Sale price', value: '£45', source: 0, from_founder: true },
      { name: 'Postage', value: '£7.50', source: 1, from_founder: false },
      { name: 'Fees', value: '10%', source: 0, from_founder: false },
    ]],
  },
});
const r2 = await fn('taskRun', { action: 'start', task_id: calc.id });
const run2 = await waitFor(r2.json?.run?.id);
const res2 = run2?.result || {};
check(run2?.status === 'done' && res2.answer === 'You keep about £33 a coat.' && res2.workings?.length === 2, 'the calculation finishes with its workings', run2?.error || res2);
check(res2.code_used === true, 'the arithmetic was run as code, from the result blocks');
const [price, postage, fees] = res2.inputs || [];
check(price?.from_founder && postage?.source?.url && fees?.assumed === true, "the founder's figure, a sourced figure, and an unsourced one marked as assumed", res2.inputs);
const pass2 = (await fakeLog()).find((l: any) => l.kind === 'research');
check(pass2?.tools?.some((t: any) => t.type.startsWith('code_execution')) && pass2.tools.find((t: any) => t.type.startsWith('web_search'))?.max_uses === 3
  && pass2.tools.find((t: any) => t.type.startsWith('web_fetch'))?.max_uses === 6 && pass2.tools.every((t: any) => !t.callers || t.callers.includes('direct')),
  'Calculate gets code execution, 3 searches and 6 pages, web tools called directly', pass2?.tools);

// ---- 3. A paused research turn is continued, not abandoned.
console.log('\n== paused turn');
const paused = await newTask('Research coat wholesalers in Leeds', 'research', 'Priya');
await script({ research: { pause: 1 }, fields: { findings: [[{ finding: 'A Leeds wholesaler exists', detail: '', source: 1 }]] } });
const r3 = await fn('taskRun', { action: 'start', task_id: paused.id });
const run3 = await waitFor(r3.json?.run?.id);
const pauseLog = (await fakeLog()).filter((l: any) => l.kind === 'research');
const turns = pauseLog.map((l: any) => l.turns);
check(run3?.status === 'done' && JSON.stringify(turns) === '[1,2]', 'the paused turn is sent back and finished', { status: run3?.status, turns, error: run3?.error });
const capsAfter = pauseLog[1]?.tools?.filter((t: any) => t.type.startsWith('web_')).map((t: any) => t.max_uses);
check(JSON.stringify(capsAfter) === '[4,7]', 'the continued turn only gets what is left of the 5 searches and 8 pages', capsAfter);

// ---- 4. No sources: sent back once, then a plain failure.
console.log('\n== no sources');
const empty = await newTask('Research the market for vintage scarves', 'research', 'Priya');
await script({ anthropic: ['nosources', 'nosources'] });
const r4 = await fn('taskRun', { action: 'start', task_id: empty.id });
const run4 = await waitFor(r4.json?.run?.id);
const passes4 = (await fakeLog()).filter((l: any) => l.kind === 'research').length;
check(run4?.status === 'failed' && /couldn't find sources/.test(run4.error || '') && passes4 === 2, 'a result without sources is sent back once, then fails plainly', { status: run4?.status, error: run4?.error, passes4 });
const [taskAfter] = await rows(`select status from tasks where id='${empty.id}'`);
check(taskAfter.status === 'todo', 'and the task stays open');

// ---- 5. Every finding unsourced after structuring: fails, nothing invented shown.
console.log('\n== unsourced findings');
const shaky = await newTask('Research coat prices in Bristol', 'research', 'Priya');
await script({ fields: { findings: [[{ finding: 'Coats sell for £60', detail: '', source: 9 }]] } });
const r5 = await fn('taskRun', { action: 'start', task_id: shaky.id });
const run5 = await waitFor(r5.json?.run?.id);
check(run5?.status === 'failed' && /back the findings with sources/.test(run5.error || ''), 'findings no real source backs are never shown', run5?.error);

// ---- 6. Accepted research goes to Knowledge as Research.
console.log('\n== accept');
const acc = await fn('taskRun', { action: 'accept', run_id: run1?.id });
const [doc] = await rows(`select category, content from documents where id='${acc.json?.document_id}'`);
check(acc.status === 200 && doc?.category === 'Research' && doc.content.includes('https://example.org/suppliers'), 'accepted research is saved to Knowledge with its sources', doc);

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
