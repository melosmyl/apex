// Workstream K3, end to end on the local stack against fake providers ($0):
// an advisor's book, hobby and place are offered until they've used one, the
// Chair gets hers in the opening only, and the mug is never sent.
// Setup as in README.md; needs the K3 migration applied locally.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getAdvisorByKey, characterFields, ADVISOR_PROVIDER_CONFIG } from '../../../src/lib/advisorLibrary.js';
const URL = 'http://127.0.0.1:54321', ANON = Deno.env.get('LOCAL_ANON_KEY')!, SERVICE = Deno.env.get('LOCAL_SERVICE_KEY')!;
const FAKE = 'http://127.0.0.1:54399';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
let failures = 0;
const check = (ok: boolean, what: string, detail?: unknown) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`); };

const email = `k3-${tag}@example.test`, password = crypto.randomUUID();
await admin.auth.admin.createUser({ email, password, email_confirm: true });
const F = createClient(URL, ANON, { auth: { persistSession: false } });
const { data: session } = await F.auth.signInWithPassword({ email, password });
const uid = session.user!.id, token = session.session!.access_token;
const fn = async (name: string, body: unknown) => {
  const r = await fetch(`${URL}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};

// A board copied from the library the way the app does it (buildAdvisorRecord).
const { data: co } = await F.from('companies').insert({ name: `k3 ${tag}`, created_by_id: uid }).select().single();
const keys = ['chair', 'visionary', 'marketing_director', 'product_strategist'];
const { data: advs } = await F.from('advisors').insert(keys.map((k, i) => {
  const lib: any = getAdvisorByKey(k), cfg: any = (ADVISOR_PROVIDER_CONFIG as any)[k];
  return { company_id: co.id, created_by_id: uid, library_key: k, name: lib.name, role: lib.role, type: 'ai', biography: lib.biography,
    system_instructions: cfg.system_instructions, ...characterFields(lib),
    default_provider: i % 2 ? 'openai' : 'anthropic', default_model: i % 2 ? 'gpt-4o' : 'claude-sonnet-5',
    fallback_provider: i % 2 ? 'anthropic' : 'openai', fallback_model: i % 2 ? 'claude-sonnet-5' : 'gpt-4o' };
})).select();
check(advs?.length === 4 && advs.every((a: any) => a.book && a.mug && a.personal_detail_terms.length), 'board copies carry the K3 fields');

await fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify({ mentionBy: ['Amara Vance'] }) });
const s = await fn('startBoardMeeting', { company_id: co.id, question: 'How do we get our first ten customers?', advisor_ids: advs!.map((a: any) => a.id) });
check(s.status === 200, 'meeting starts', s.json);
const r1 = s.json?.independent_responses?.find((r: any) => r.advisor_name === 'Amara Vance');
check(/Invisible Cities/.test(r1?.position || ''), 'Amara mentions her book in Round 1 (scripted)', r1?.position);
const d = await fn('runBoardDiscussion', { meeting_id: s.json?.meeting_id });
check(d.status === 200, 'discussion runs', d.json);
const r = await fn('runChairSynthesis', { meeting_id: s.json?.meeting_id });
check(r.json?.status === 'complete', 'resolution written');

const wire: any[] = await (await fetch(`${FAKE}/__log`)).json();
const by = (who: string) => wire.filter((w) => w.who === who);
const amara = by('Amara Vance'), priya = by('Priya Nair'), margaret = by('Margaret Ashworth');
check(amara.length >= 2 && amara[0].offered && amara.slice(1).every((w) => !w.offered), "Amara's details are offered in Round 1, then never again", amara.map((w) => w.offered));
check(priya.length >= 2 && priya.every((w) => w.offered), 'Priya, who never used hers, keeps the offer every round', priya.map((w) => w.offered));
check(margaret.length === 2 && margaret[0].offered && !margaret[1].offered, 'the Chair gets hers in the opening only, not the resolution', margaret.map((w) => w.offered));

// The mug is never in any prompt.
check(wire.length > 0 && wire.every((w) => !w.mugQuote), 'no mug lettering reached the providers', wire.filter((w) => w.mugQuote).map((w) => w.who));

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
