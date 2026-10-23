// Knowledge, read by what matters (owner, 23 October 2026, Stage 1): a long
// business plan pasted into Knowledge reaches a meeting by the parts that
// bear on its question, not its opening; an edit is read fresh; what's
// archived, and another founder's, never is; a "Do this for me" task reads
// the founder's own passages; and when matching fails, everything is read by
// its opening as before. Local stack, fake providers ($0). Setup as in
// README.md.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL = 'http://127.0.0.1:54321', ANON = Deno.env.get('LOCAL_ANON_KEY')!, SERVICE = Deno.env.get('LOCAL_SERVICE_KEY')!;
const FAKE = 'http://127.0.0.1:54399';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
let failures = 0;
const check = (ok: boolean, what: string, detail?: unknown) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const script = (body: unknown) => fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify(body) });
const fakeLog = async () => (await (await fetch(`${FAKE}/__log`)).json());

async function founder(label: string) {
  const email = `knowledge-${label}-${tag}@example.test`, password = crypto.randomUUID();
  await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data } = await client.auth.signInWithPassword({ email, password });
  const fn = async (name: string, body: unknown) => {
    const r = await fetch(`${URL}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session!.access_token}`, apikey: ANON }, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  return { client, uid: data.user!.id, fn };
}
const A = await founder('a'), B = await founder('b');
const { data: co } = await A.client.from('companies').insert({ name: `Knowledge ${tag}`, created_by_id: A.uid, description: "Children's dinner sets" }).select().single();
const { data: coB } = await B.client.from('companies').insert({ name: `Other ${tag}`, created_by_id: B.uid }).select().single();
const { data: advs } = await A.client.from('advisors').insert([
  { library_key: 'chair', role: 'The Chair', name: `Margaret ${tag}` },
  { name: `Grace ${tag}`, role: 'Customer Advocate' },
  { name: `Marcus ${tag}`, role: 'Finance Director' },
  { name: `Priya ${tag}`, role: 'Product Strategist' },
].map((m) => ({ company_id: co.id, created_by_id: A.uid, type: 'ai', default_provider: 'openai', default_model: 'gpt-4o', fallback_provider: 'openai', fallback_model: 'gpt-4o', ...m }))).select();
const debaters = advs!.filter((a: any) => a.library_key !== 'chair').map((a: any) => a.id);
const marcus = advs!.find((a: any) => a.name.startsWith('Marcus'));

// A business plan of about 13,000 characters, one section per topic, each
// in its own words. Pricing is deep inside, far past the old 400 characters.
const section = (mark: string, words: string) => `${mark}\n\n${Array.from({ length: 18 }, () => words).join(' ')}`;
const TOPICS: [string, string][] = [
  ['DELIVERY-SECTION', 'Couriers deliver parcels; delivery takes two days by Royal Mail tracked courier.'],
  ['WAREHOUSE-SECTION', 'The garage stores boxes on shelving until the warehouse lease starts.'],
  ['HIRING-SECTION', 'Hiring a part time packer next spring, paid hourly, interviewed locally.'],
  ['MARKETING-SECTION', 'Instagram reels and mothers groups spread word of mouth about the brand.'],
  ['SUPPLIER-SECTION', 'The Stoke workshop glazes and fires stoneware in batches of fifty.'],
  ['LEGAL-SECTION', 'Product safety testing for children needs a UKCA mark and a lead test.'],
  ['FUNDING-SECTION', 'Savings fund the first year; no investors or loans are planned yet.'],
  ['PRICING-SECTION', 'Price each dinner set at sixty five pounds; the price covers margin after fees and charge.'],
  ['GIFTING-SECTION', 'Grandparents buy gift boxes at Christmas with ribbon and a handwritten card.'],
  ['TIMELINE-SECTION', 'Launch in March after the photographs, the website and the first batch.'],
];
const plan = TOPICS.map(([m, w]) => section(m, w)).join('\n\n');
const { data: docs } = await A.client.from('documents').insert([
  { company_id: co.id, created_by_id: A.uid, kind: 'knowledge', category: 'Business Plan', title: 'Business plan', content: plan },
  { company_id: co.id, created_by_id: A.uid, kind: 'knowledge', category: 'Operations', title: 'Kiln notes', content: 'KILN-NOTE: the kiln is serviced every spring.' },
  { company_id: co.id, created_by_id: A.uid, kind: 'knowledge', category: 'Financials', title: 'Old price list', status: 'archived',
    content: 'ARCHIVED-PRICE: price each dinner set at thirty pounds, charge less than margin.' },
  { company_id: co.id, created_by_id: A.uid, kind: 'knowledge', category: 'Calculation', title: 'Money left per set', created_by_advisor_id: marcus.id,
    content: 'BOARD-PRICE: at sixty five pounds the price leaves forty one pounds margin per dinner set after fees.' },
]).select();
const planDoc = docs!.find((d: any) => d.title === 'Business plan');
await B.client.from('documents').insert({ company_id: coB.id, created_by_id: B.uid, kind: 'knowledge', category: 'Business Plan', title: 'Their plan',
  content: 'OTHER-FOUNDER-PRICE: price each dinner set at sixty five pounds, charge margin.' });

const { data: fresh } = await admin.from('documents').select('passages_indexed_at').eq('id', planDoc.id).single();
check(fresh?.passages_indexed_at === null, 'a new Knowledge item is waiting to be read by passage');

async function meeting(question: string) {
  const id = crypto.randomUUID();
  const r = await A.fn('startBoardMeeting', { company_id: co.id, question, advisor_ids: debaters, meeting_id: id, server_driven: true });
  let m: any;
  for (let i = 0; i < 300; i++) { m = (await admin.from('board_meetings').select('status, context_package').eq('id', id).maybeSingle()).data; if (m && ['complete', 'failed'].includes(m.status) || r.status >= 400) break; await sleep(400); }
  return { status: m?.status ?? r.json, rec: String(m?.context_package || '') };
}
const section_ = (rec: string) => {
  const start = rec.indexOf("From the founder's Knowledge, the parts that bear on");
  return start < 0 ? '' : rec.slice(start, rec.indexOf('\nDocuments (', start) > 0 ? rec.indexOf('\nDocuments (', start) : undefined);
};

// 1. A pricing question reads the pricing section, deep in the plan.
await script({});
const priced = await meeting(`What price should we charge for each dinner set, forty five or sixty five pounds? ${tag}`);
check(priced.status === 'complete', 'the pricing meeting completes', priced.status);
const pricedParts = section_(priced.rec);
check(pricedParts.includes('Price each dinner set at sixty five pounds'), "the plan's pricing section, past the opening, is in the record", pricedParts.slice(0, 400));
check(!pricedParts.includes('Couriers deliver parcels'), '…chosen for the question, not for coming first: the opening (delivery) is not', pricedParts.slice(0, 600));
check(pricedParts.includes("the board's work] Money left per set (Calculation)") && pricedParts.includes('BOARD-PRICE'), "the board's accepted work counts, labelled as the board's", pricedParts.slice(0, 600));
check(!priced.rec.includes('ARCHIVED-PRICE'), 'an archived item is never read');
check(!priced.rec.includes('OTHER-FOUNDER-PRICE'), "another founder's Knowledge is never read");
check(pricedParts.length > 0 && pricedParts.length < 6000 + 1500, 'the parts stay within about 6,000 characters', pricedParts.length);
check(/Business plan \(Business Plan\) \[the parts that bear on this question are given above\]/.test(priced.rec), 'the plan is listed by its title, not its opening', priced.rec.slice(priced.rec.indexOf('Documents ('), priced.rec.indexOf('Documents (') + 400));
const { data: indexed } = await admin.from('documents').select('passages_indexed_at, updated_at').eq('id', planDoc.id).single();
const { count: passageCount } = await admin.from('knowledge_passages').select('id', { count: 'exact', head: true }).eq('document_id', planDoc.id);
check(!!indexed?.passages_indexed_at && (passageCount || 0) >= 10, 'the plan is now read by passage', { indexed, passageCount });
check(/Kiln notes \(Operations\): KILN-NOTE/.test(priced.rec), 'an item with nothing on the question keeps its opening in the listing, as before');
const { data: hashes } = await admin.from('knowledge_passages').select('content_hash').eq('document_id', planDoc.id);
const { data: planNow } = await admin.from('documents').select('passages_hash').eq('id', planDoc.id).single();
check(!!planNow?.passages_hash && (hashes || []).every((h: any) => h.content_hash === planNow.passages_hash), 'every stored passage is of the words as they are now');
check(indexed?.updated_at === planDoc.updated_at, 'reading it by passage is not an edit: its "last updated" time stays', [indexed?.updated_at, planDoc.updated_at]);

// 2. A delivery question reads the delivery section, not pricing.
await script({ marks: ['The garage stores boxes'] });
const delivered = await meeting(`How should couriers deliver parcels, and how long should delivery take? ${tag}`);
const deliveredParts = section_(delivered.rec);
check(deliveredParts.includes('Couriers deliver parcels') && !deliveredParts.includes('Price each dinner set'), 'a delivery question reads delivery, not pricing', deliveredParts.slice(0, 300));
const reembedded = (await fakeLog()).filter((l: any) => l.kind === 'embedding' && l.marked?.length);
check(reembedded.length === 0, 'an unchanged plan is not indexed again', reembedded.length);

// 3. An edit is read fresh, with the "last updated" time moving as an edit should.
await A.client.from('documents').update({ content: plan.replaceAll('sixty five pounds', 'seventy pounds REPRICED') }).eq('id', planDoc.id);
const { data: edited } = await admin.from('documents').select('passages_indexed_at, updated_at').eq('id', planDoc.id).single();
check(edited?.passages_indexed_at === null && edited?.updated_at !== planDoc.updated_at, 'an edit marks the item to be read again', edited);
await script({});
const repriced = await meeting(`What price should we charge for each dinner set now? ${tag}`);
check(section_(repriced.rec).includes('seventy pounds REPRICED') && !section_(repriced.rec).includes('Price each dinner set at sixty five pounds'), 'the next meeting reads the new words, not the old');
const { data: after } = await admin.from('knowledge_passages').select('content_hash').eq('document_id', planDoc.id);
check((after || []).length > 0 && new Set((after || []).map((h: any) => h.content_hash)).size === 1 && after![0].content_hash !== planNow?.passages_hash, 'and the old passages are gone', after?.length);

// 4. A "Do this for me" task reads the founder's own passages, not the board's work.
const { data: task } = await admin.from('tasks').insert({ company_id: co.id, created_by_id: A.uid, title: 'Draft a price list for each dinner set', description: 'With the price per set and the margin',
  task_type: 'draft', advisor_id: marcus.id, status: 'todo' }).select().single();
await script({ marks: ['Price each dinner set at', 'Couriers deliver parcels', 'BOARD-PRICE', 'OTHER-FOUNDER-PRICE', 'ARCHIVED-PRICE', 'the parts that bear on this task'],
  fields: { body: ['Price list: £70 a set.'], placeholders: [[]] } });
const started = await A.fn('taskRun', { action: 'start', task_id: task.id });
let run: any;
for (let i = 0; i < 120; i++) { run = (await admin.from('task_runs').select('status').eq('task_id', task.id).order('created_at', { ascending: false }).limit(1).maybeSingle()).data; if (run && !['queued', 'running'].includes(run.status)) break; await sleep(500); }
check(started.status === 200 && run?.status === 'done', 'the task runs', [started, run]);
const taskCall = (await fakeLog()).find((l: any) => l.marked?.includes('the parts that bear on this task'));
check(!!taskCall && taskCall.marked.includes('Price each dinner set at') && !taskCall.marked.includes('Couriers deliver parcels'), "the task reads the plan's pricing section", taskCall?.marked);
check(!!taskCall && !taskCall.marked.includes('BOARD-PRICE') && !taskCall.marked.includes('ARCHIVED-PRICE') && !taskCall.marked.includes('OTHER-FOUNDER-PRICE'),
  "…and not the board's own work, an archived item or another founder's", taskCall?.marked);

// 4b. Two readers at once, with an edit between them: a slow reader of the
// old words finishes last, and nothing of its passages is kept.
{
  const vec = JSON.stringify(Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0)));
  const { data: d } = await A.client.from('documents').insert({ company_id: co.id, created_by_id: A.uid, kind: 'knowledge', category: 'Other', title: 'Race', content: 'Old words.' }).select().single();
  const pending = async () => ((await admin.rpc('knowledge_to_index', { p_company_id: co.id, p_owner_id: A.uid, p_limit: 100 })).data || []).find((r: any) => r.id === d.id);
  const slow = await pending();
  await A.client.from('documents').update({ content: 'New words.' }).eq('id', d.id);
  const quick = await pending();
  const put = (hash: string, text: string) => admin.from('knowledge_passages').upsert([{ document_id: d.id, company_id: co.id, content_hash: hash, passage_index: 0, text, embedding: vec }], { onConflict: 'document_id,content_hash,passage_index', ignoreDuplicates: true });
  await put(quick.content_hash, 'New words.');
  const quickDone = (await admin.rpc('finish_knowledge_passages', { p_document_id: d.id, p_hash: quick.content_hash, p_count: 1 })).data;
  await put(slow.content_hash, 'Old words.');
  const slowDone = (await admin.rpc('finish_knowledge_passages', { p_document_id: d.id, p_hash: slow.content_hash, p_count: 1 })).data;
  const { data: kept } = await admin.from('knowledge_passages').select('text').eq('document_id', d.id);
  check(quickDone === true && slowDone === false && kept?.length === 1 && kept[0].text === 'New words.', 'a slow reader of old words finishing last leaves only the new passages', { quickDone, slowDone, kept });
  // A short count (a reader cut off midway) is never marked done.
  await A.client.from('documents').update({ content: 'Newer words.' }).eq('id', d.id);
  const cut = await pending();
  check((await admin.rpc('finish_knowledge_passages', { p_document_id: d.id, p_hash: cut.content_hash, p_count: 2 })).data === false, 'an item missing passages is never marked done');
  await admin.from('documents').update({ status: 'archived' }).eq('id', d.id);
}

// 5. Matching unavailable: every item by its opening, as before, and the meeting goes on.
await A.client.from('documents').update({ title: 'Business plan v2' }).eq('id', planDoc.id);
await script({ failEmbeddings: true });
const down = await meeting(`What price should we charge per set if embeddings are down? ${tag}`);
check(down.status === 'complete', 'with matching down the meeting still completes', down.status);
check(!section_(down.rec) && down.rec.includes('Business plan v2 (Business Plan): DELIVERY-SECTION'), 'and the plan is read by its opening, as before', down.rec.slice(down.rec.indexOf('Documents ('), down.rec.indexOf('Documents (') + 300));
const { data: stillWaiting } = await admin.from('documents').select('passages_indexed_at').eq('id', planDoc.id).single();
check(stillWaiting?.passages_indexed_at === null, 'the renamed plan stays waiting, to be read next time');
await script({});

// Tidy up.
for (const u of [A.uid, B.uid]) await admin.auth.admin.deleteUser(u);
console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
