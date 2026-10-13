// Pin auto-fill (analyzePin) on the local stack against fake providers ($0):
// the cheap tier fills in the pin, only real pins are linked, and only the
// company's owner can use it. Setup as in README.md.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL = 'http://127.0.0.1:54321', ANON = Deno.env.get('LOCAL_ANON_KEY')!, SERVICE = Deno.env.get('LOCAL_SERVICE_KEY')!;
const FAKE = 'http://127.0.0.1:54399';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
let failures = 0;
const check = (ok: boolean, what: string, detail?: unknown) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`); };

const signUp = async (who: string) => {
  const email = `${who}-${tag}@example.test`, password = crypto.randomUUID();
  await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data } = await c.auth.signInWithPassword({ email, password });
  return { c, uid: data.user!.id, token: data.session!.access_token };
};
const call = async (token: string, body: unknown) => {
  const r = await fetch(`${URL}/functions/v1/analyzePin`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};

const owner = await signUp('pins');
const { data: co } = await owner.c.from('companies').insert({ name: `petit ${tag}`, created_by_id: owner.uid }).select().single();
const OLD = `Old pin about pricing ${tag}`;
const { data: old } = await owner.c.from('pins').insert({ company_id: co.id, source_type: 'board_resolution', selected_text: 'Charge £45', pin_title: OLD, themes: ['Premium Positioning'], category: 'Finance' }).select().single();
const SELECTED = `Test the £45 price at three markets first ${tag}`;
// Another founder's pin, which must never reach this company's prompt.
const other = await signUp('other');
const { data: otherCo } = await other.c.from('companies').insert({ name: `other ${tag}`, created_by_id: other.uid }).select().single();
const FOREIGN = `Someone else's pin ${tag}`;
const { data: foreign } = await other.c.from('pins').insert({ company_id: otherCo.id, source_type: 'board_resolution', selected_text: 'x', pin_title: FOREIGN }).select().single();
check(!!foreign?.id, "another founder's pin exists to test against", foreign);

console.log('== the founder pins some text');
await fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify({
  marks: [SELECTED, OLD, FOREIGN],
  fields: { pin_title: ['Test the price at markets'], related_pin_ids: [[old.id, 'an-invented-id']], category: ['finance'] },
}) });
const r = await call(owner.token, { company_id: co.id, selected_text: SELECTED, surrounding_context: 'The board agreed.', source_type: 'board_resolution', source_title: 'Pricing' });
const log = await (await fetch(`${FAKE}/__log`)).json();
check(r.status === 200 && r.json?.pin_title === 'Test the price at markets', 'the pin is filled in', r);
check(r.json?.category === 'Finance' && typeof r.json?.summary === 'string' && Array.isArray(r.json?.themes), 'with an allowed category, a summary and themes', r.json);
check(JSON.stringify(r.json?.related_pin_ids) === JSON.stringify([old.id]), 'only a pin that exists is linked', r.json?.related_pin_ids);
check(log.length === 1 && log[0].marked.includes(SELECTED) && log[0].marked.includes(OLD), 'one model call, given the text and the existing pins', log.map((l: any) => [l.model, l.marked]));
check(!log[0]?.marked.includes(FOREIGN), "another company's pins are never sent", log[0]?.marked);
check(log[0]?.format === 'json_schema' && log[0]?.strict === true, 'the answer shape is enforced by the provider', [log[0]?.format, log[0]?.strict]);
const { data: cheap } = await admin.from('ai_model_configurations').select('model_name').eq('purpose', 'cheap_tier').eq('is_active', true).order('created_at', { ascending: false }).limit(1);
const cheapModel = cheap?.[0]?.model_name || 'gpt-4o-mini';
check(log[0]?.model === cheapModel, `it runs on the cheap tier (${cheapModel})`, log[0]?.model);
const { data: usage } = await admin.from('ai_usage_logs').select('request_type, company_id, user_id, status').eq('company_id', co.id).eq('request_type', 'pin_analysis');
check(usage?.length === 1 && usage[0].user_id === owner.uid && usage[0].status === 'success', 'the cost is logged against the founder', usage);

console.log('\n== the founder saves it');
// As PinDialog sends it: the form fields, the linked pins and the confidence.
const { related_pin_ids, category_confidence, ...form } = r.json;
const { error: saveErr } = await owner.c.from('pins').insert({ company_id: co.id, source_type: 'board_resolution', selected_text: SELECTED, ...form, status: 'active', created_by: 'Founder', related_pin_ids, category_confidence });
check(!saveErr, 'the filled-in pin saves', saveErr);

console.log('\n== who can use it');
const r2 = await call(other.token, { company_id: co.id, selected_text: 'hello' });
check(r2.status === 403 || r2.status === 404, "another user can't use it on this company (or see its pins)", r2);
// Visitors without an account are refused by requireNotAnonymous, as in
// taskRun (anonymous sign-in is off on the local stack).
const r4 = await call(owner.token, { company_id: co.id, selected_text: '   ' });
check(r4.status === 400, 'an empty selection is refused', r4);
const r6 = await call(owner.token, { selected_text: 'hello' });
check(r6.status === 400, 'so is a missing company', r6);

console.log('\n== the model fails');
await fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify({ openai: Array(8).fill('overload529'), anthropic: Array(8).fill('overload529') }) });
const r5 = await call(owner.token, { company_id: co.id, selected_text: SELECTED });
check(r5.status === 500 && r5.json?.error === 'Could not fill in the pin.', 'a plain error, so the founder fills it in by hand', r5);
await fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify({}) });

await admin.from('user_rate_events').insert(Array.from({ length: 120 }, () => ({ user_id: owner.uid, action: 'pin_analysis' })));
const r7 = await call(owner.token, { company_id: co.id, selected_text: 'hello' });
check(r7.status === 429, 'heavy use is limited', r7);

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
