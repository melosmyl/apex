// Your data (owner, 22 October 2026, D3): a copy of everything, deleting a
// company (its stored files too) and deleting the account at once after a
// typed phrase, keeping the cost records without the person. Two founders,
// so neither can reach the other's data. Local stack only; no AI calls.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
import JSZip from 'npm:jszip@3.10.1';
const URL = 'http://127.0.0.1:54321', ANON = Deno.env.get('LOCAL_ANON_KEY')!, SERVICE = Deno.env.get('LOCAL_SERVICE_KEY')!;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
let failures = 0;
const check = (ok: boolean, what: string, detail?: unknown) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`); };

if (!(await admin.storage.getBucket('documents')).data) await admin.storage.createBucket('documents', { public: false });

async function founder(name: string) {
  const email = `mydata-${name}-${tag}@example.test`, password = crypto.randomUUID();
  const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const F = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: s } = await F.auth.signInWithPassword({ email, password });
  const { data: co } = await F.from('companies').insert({ name: `${name} co ${tag}`, created_by_id: u.user!.id }).select().single();
  const { data: co2 } = await F.from('companies').insert({ name: `${name} second ${tag}`, created_by_id: u.user!.id }).select().single();
  for (const c of [co, co2]) {
    await F.from('documents').insert({ company_id: c.id, created_by_id: u.user!.id, title: `${name} notes`, content: 'Secret plan', kind: 'document' });
    await admin.storage.from('documents').upload(`${c.id}/${Date.now()}_plan.txt`, new TextEncoder().encode(`${name}'s file`), { contentType: 'text/plain' });
  }
  await admin.from('ai_usage_logs').insert({ user_id: u.user!.id, company_id: co.id, provider: 'anthropic', model: 'claude-sonnet-5-5', request_type: 'independent', input_size: 1, output_size: 1, estimated_cost: 0.01, latency_ms: 1, status: 'success' });
  await admin.from('user_rate_events').insert({ user_id: u.user!.id, action: 'board_meeting' });
  const fm = await admin.from('free_meeting_attempts').insert({ user_id: u.user!.id, ip_hash: `test-${name}-${tag}` });
  if (fm.error) console.log('free meeting row:', fm.error.message);
  return { id: u.user!.id, token: s.session!.access_token, co, co2 };
}
const call = async (token: string, body: unknown) => {
  const r = await fetch(`${URL}/functions/v1/myData`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON }, body: JSON.stringify(body) });
  return r;
};
const files = async (companyId: string) => ((await admin.storage.from('documents').list(companyId)).data || []).filter((f: any) => f.id !== null).length;

const a = await founder('alice'), b = await founder('bob');

// 1. A copy of everything, and only Alice's.
const ex = await call(a.token, { action: 'export' });
check(ex.status === 200 && ex.headers.get('Content-Type') === 'application/zip' && /attachment; filename="just-ask-the-room-\d{4}-\d{2}-\d{2}\.zip"/.test(ex.headers.get('Content-Disposition') || ''), 'the copy downloads as one zip', [ex.status, ex.headers.get('Content-Type')]);
const zip = await JSZip.loadAsync(new Uint8Array(await ex.arrayBuffer()));
const data = JSON.parse(await zip.file('data.json')!.async('string'));
const names = Object.keys(zip.files).filter((n) => n.startsWith('files/') && !zip.files[n].dir);
check(data.companies?.length === 2 && data.companies.every((c: any) => c.created_by_id === a.id) && data.documents?.length === 2 && data.ai_usage_logs?.length === 1,
  'data.json has her companies, documents and cost records', [data.companies?.length, data.documents?.length, data.ai_usage_logs?.length]);
check(names.length === 2 && (await zip.file(names[0])!.async('string')) === "alice's file", 'and her stored files, readable', names);
check(!JSON.stringify(data).includes('bob') && data.account?.id === a.id, "nothing of Bob's");
check(Object.values(data).every((v: any) => !Array.isArray(v) || v.every((r: any) => typeof r !== 'object' || !('embedding' in r))), 'search indexes are left out');
check(data.ai_usage_logs?.[0]?.model === 'claude-sonnet-5-5' && !('estimated_cost' in data.ai_usage_logs[0]) && !('attempts' in data.ai_usage_logs[0]) && data.free_meeting_attempts?.length === 1 && !('ip_hash' in data.free_meeting_attempts[0]),
  'her usage and free-meeting records are in, without our cost figures or the hashed address', [data.ai_usage_logs?.[0], data.free_meeting_attempts?.[0]]);

// 2. Deleting a company takes its stored files too; nobody else's.
const other = await call(a.token, { action: 'delete_company', company_id: b.co.id });
check(other.status === 403 && (await files(b.co.id)) === 1, "Alice can't delete Bob's company", other.status);
const dc = await call(a.token, { action: 'delete_company', company_id: a.co2.id });
const dcBody = await dc.json();
const { data: gone } = await admin.from('companies').select('id').eq('id', a.co2.id);
const { data: goneDocs } = await admin.from('documents').select('id').eq('company_id', a.co2.id);
check(dc.status === 200 && dcBody.files === 1 && (await files(a.co2.id)) === 0 && !gone?.length && !goneDocs?.length,
  'deleting her second company deletes its rows and its stored file', dcBody);
check((await files(a.co.id)) === 1, 'her other company keeps its file');

// 2b. Teams: with Bob in Alice's company, he can't delete it, and her
// account can't be deleted until she hands it over: nothing goes meanwhile.
await admin.from('company_members').insert({ company_id: a.co.id, user_id: b.id, role: 'member' });
const asMember = await call(b.token, { action: 'delete_company', company_id: a.co.id });
check(asMember.status === 403 && (await files(a.co.id)) === 1, "a member can't delete the owner's company", asMember.status);
const refused = await call(a.token, { action: 'delete_account', confirm: 'delete my account' });
const refusedBody = await refused.json();
check(refused.status === 409 && /hand it over/i.test(refusedBody.error) && (await files(a.co.id)) === 1 && !!(await admin.auth.admin.getUserById(a.id)).data.user,
  'owning a company someone else is in: refused, in plain words, with nothing deleted', refusedBody);
const ex2 = JSON.parse(await (await JSZip.loadAsync(new Uint8Array(await (await call(b.token, { action: 'export' })).arrayBuffer()))).file('data.json')!.async('string'));
check(ex2.company_members?.some((m: any) => m.company_id === a.co.id && m.role === 'member'), "Bob's copy includes his membership");
await admin.from('company_members').delete().eq('company_id', a.co.id).eq('user_id', b.id);

// 3. Deleting the account: the phrase first.
const wrong = await call(a.token, { action: 'delete_account', confirm: 'delete' });
check(wrong.status === 400 && (await admin.auth.admin.getUserById(a.id)).data.user !== null, 'without the typed phrase nothing is deleted', wrong.status);
const da = await call(a.token, { action: 'delete_account', confirm: '  Delete My Account ' });
const daBody = await da.json();
check(da.status === 200 && daBody.backup_days === 7, 'with the phrase the account is deleted, saying how long backups keep a copy', daBody);
check(!(await admin.auth.admin.getUserById(a.id)).data.user, 'her sign-in is gone');
const { data: left } = await admin.from('companies').select('id').eq('created_by_id', a.id);
const { data: leftDocs } = await admin.from('documents').select('id').eq('created_by_id', a.id);
check(!left?.length && !leftDocs?.length && (await files(a.co.id)) === 0, 'her companies, documents and stored files are gone');
const { data: cost } = await admin.from('ai_usage_logs').select('user_id, estimated_cost').eq('company_id', a.co.id);
const { data: costAnon } = await admin.from('ai_usage_logs').select('user_id, company_id, estimated_cost').is('user_id', null).eq('model', 'claude-sonnet-5-5').eq('estimated_cost', 0.01);
check(!(cost || []).length && (costAnon || []).some((r: any) => r.user_id === null), 'the cost record stays, with nothing linking it to her', { cost, n: costAnon?.length });
const { data: rates } = await admin.from('user_rate_events').select('id').eq('user_id', a.id);
check(!rates?.length, 'her rate records are gone');
const { data: fms } = await admin.from('free_meeting_attempts').select('id').eq('ip_hash', `test-alice-${tag}`);
check(!fms?.length, 'her free-meeting record, with its hashed address, is gone');
check((await files(b.co.id)) === 1 && !!(await admin.auth.admin.getUserById(b.id)).data.user, "Bob's account and files are untouched");

// 4. A visitor without an account can't use any of it.
const { data: anon } = await createClient(URL, ANON, { auth: { persistSession: false } }).auth.signInAnonymously();
const an = await call(anon.session!.access_token, { action: 'export' });
check(an.status === 403, 'a free-meeting visitor gets nothing', an.status);
const none = await call('not-a-token', { action: 'export' });
check(none.status === 401, 'nobody signed in gets nothing', none.status);

// Tidy up.
for (const c of [b.co, b.co2]) await admin.storage.from('documents').remove(((await admin.storage.from('documents').list(c.id)).data || []).map((f: any) => `${c.id}/${f.name}`));
await admin.from('ai_usage_logs').delete().is('user_id', null).eq('model', 'claude-sonnet-5-5').eq('estimated_cost', 0.01);
await admin.from('ai_usage_logs').delete().eq('user_id', b.id);
await admin.from('free_meeting_attempts').delete().eq('ip_hash', `test-bob-${tag}`);
await admin.auth.admin.deleteUser(b.id);
await admin.auth.admin.deleteUser(anon.user!.id);
console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
