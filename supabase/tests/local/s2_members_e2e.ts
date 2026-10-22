// Workstream S (Teams), S2: members and invitations, on the local stack ($0,
// no model calls). Setup as in README.md; LOCAL_URL and LOCAL_DB_CONTAINER
// override the defaults.
//   LOCAL_ANON_KEY=… LOCAL_SERVICE_KEY=… deno run -A supabase/tests/local/s2_members_e2e.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL = Deno.env.get('LOCAL_URL') || 'http://127.0.0.1:54321';
const ANON = Deno.env.get('LOCAL_ANON_KEY')!, SERVICE = Deno.env.get('LOCAL_SERVICE_KEY')!;
const DB = Deno.env.get('LOCAL_DB_CONTAINER') || 'supabase_db_localstack';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
let failures = 0;
const check = (ok: boolean, what: string, detail?: unknown) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`); };
const created: string[] = [];
// SQL as the database owner; returns { out, err }.
const sql = async (q: string) => {
  const o = await new Deno.Command('docker', { args: ['exec', '-i', DB, 'psql', '-U', 'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', q] }).output();
  return { out: new TextDecoder().decode(o.stdout).trim(), err: new TextDecoder().decode(o.stderr).trim() };
};
async function person(name: string, display?: string) {
  const email = `s2-${name}-${tag}@example.test`, password = crypto.randomUUID();
  const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: display ? { full_name: display } : {} });
  created.push(data.user!.id);
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password });
  return { id: data.user!.id, client, email };
}
const members = async (co: string) => (await admin.from('company_members').select('user_id, role').eq('company_id', co).order('role')).data ?? [];
const hash = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');

try {
  // Every company has exactly one owner, its founder
  const orphans = await sql(`select count(*) from public.companies c where not exists (select 1 from public.company_members m where m.company_id = c.id and m.user_id = c.created_by_id and m.role = 'owner')`);
  check(orphans.out === '0', 'every existing company has its founder as owner', orphans);

  // New companies get their creator as owner, from the browser as now
  const olive = await person('olive', 'Olive Owner');
  const { data: co } = await olive.client.from('companies').insert({ name: `Olive Co ${tag}`, created_by_id: olive.id }).select().single();
  check(JSON.stringify(await members(co.id)) === JSON.stringify([{ user_id: olive.id, role: 'owner' }]), 'a new company gets its creator as owner');
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: a } = await anon.auth.signInAnonymously();
  created.push(a!.user!.id);
  const { data: anonCo } = await anon.from('companies').insert({ name: `Free ${tag}`, created_by_id: a!.user!.id }).select().single();
  check((await members(anonCo.id))[0]?.role === 'owner', "…and so does a free-meeting visitor's company");

  // Nothing about members or invitations can be read or changed directly yet
  const peek = await olive.client.from('company_members').select('*');
  const write = await olive.client.from('company_members').insert({ company_id: co.id, user_id: olive.id, role: 'manager' });
  const inv = await olive.client.from('company_invitations').select('*');
  check((!!peek.error || (peek.data ?? []).length === 0) && !!write.error && (!!inv.error || (inv.data ?? []).length === 0),
    'members and invitations are closed to direct reads and writes', { peek: peek.error?.code, write: write.error?.code, inv: inv.error?.code });

  // Role checks answer only about yourself
  const outsider = await person('outsider');
  let r = await olive.client.rpc('company_role', { p_company: co.id });
  const r2 = await olive.client.rpc('has_company_role', { p_company: co.id, p_roles: ['owner', 'manager'] });
  const r3 = await outsider.client.rpc('is_company_member', { p_company: co.id });
  const r4 = await outsider.client.rpc('company_role', { p_company: co.id });
  check(r.data === 'owner' && r2.data === true && r3.data === false && r4.data === null, 'the role checks answer for the signed-in person', { r: r.data, r2: r2.data, r3: r3.data, r4: r4.data });
  const signedOut = createClient(URL, ANON, { auth: { persistSession: false } });
  r = await signedOut.rpc('is_company_member', { p_company: co.id });
  check(!!r.error, "signed out, they can't be called", r.error);

  // One owner; never none; handing over in one go works
  const mia = await person('mia', 'Mia Member');
  await admin.from('company_members').insert({ company_id: co.id, user_id: mia.id, role: 'member', invited_by: olive.id });
  const second = await admin.from('company_members').insert({ company_id: anonCo.id, user_id: mia.id, role: 'owner' });
  check(!!second.error, 'a company has at most one owner', second.error);
  const anonGuest = await admin.from('company_members').insert({ company_id: co.id, user_id: a!.user!.id, role: 'member' });
  check(!!anonGuest.error, "an anonymous visitor can't be made a member of a company", anonGuest.error);
  const anonOwner = await sql(`begin; update public.company_members set role = 'manager' where company_id = '${co.id}' and user_id = '${olive.id}'; insert into public.company_members (company_id, user_id, role) values ('${co.id}', '${a!.user!.id}', 'owner'); commit;`);
  check(/Only people with an account/.test(anonOwner.err) && (await members(co.id)).find((m: any) => m.user_id === olive.id)?.role === 'owner',
    "…nor the owner of someone else's company", anonOwner.err);
  const moved = await sql(`update public.company_members set company_id = '${anonCo.id}' where company_id = '${co.id}' and user_id = '${mia.id}'`);
  const swapped = await sql(`update public.company_members set user_id = '${outsider.id}' where company_id = '${co.id}' and role = 'owner'`);
  check(/can't be moved/.test(moved.err) && /can't be moved/.test(swapped.err), "a membership can't be moved to another company or person", { moved: moved.err, swapped: swapped.err });
  const wipe = await sql(`set role service_role; truncate public.company_members;`);
  check(/permission denied/.test(wipe.err), 'the members list can\'t be wiped wholesale, even by the server', wipe.err);
  const noOwner = await sql(`delete from public.company_members where company_id = '${co.id}' and role = 'owner'`);
  check(/must keep an owner/.test(noOwner.err) && (await members(co.id)).some((m: any) => m.role === 'owner'), 'a company always keeps an owner', noOwner.err);
  const handover = await sql(`begin; update public.company_members set role = 'manager' where company_id = '${co.id}' and user_id = '${olive.id}'; update public.company_members set role = 'owner' where company_id = '${co.id}' and user_id = '${mia.id}'; commit;`);
  const afterHandover = await members(co.id);
  check(!handover.err && afterHandover.find((m: any) => m.user_id === mia.id)?.role === 'owner' && afterHandover.find((m: any) => m.user_id === olive.id)?.role === 'manager',
    'ownership can be handed over in one go', { err: handover.err, afterHandover });
  await sql(`begin; update public.company_members set role = 'member' where company_id = '${co.id}' and user_id = '${mia.id}'; update public.company_members set role = 'owner' where company_id = '${co.id}' and user_id = '${olive.id}'; commit;`);

  // Invitations
  const base = { company_id: co.id, invited_by: olive.id };
  let i = await admin.from('company_invitations').insert({ ...base, email: `guest-${tag}@example.test`, role: 'member', token_hash: hash() }).select('expires_at, created_at').single();
  const days = i.data ? (new Date(i.data.expires_at).getTime() - new Date(i.data.created_at).getTime()) / 86_400_000 : 0;
  check(!i.error && Math.round(days) === 7, 'an invitation lasts 7 days', i.error ?? days);
  const dup = await admin.from('company_invitations').insert({ ...base, email: `guest-${tag}@example.test`, role: 'manager', token_hash: hash() });
  check(!!dup.error, 'one open invitation per person per company', dup.error);
  await admin.from('company_invitations').update({ cancelled_at: new Date().toISOString() }).eq('company_id', co.id).eq('email', `guest-${tag}@example.test`);
  const again = await admin.from('company_invitations').insert({ ...base, email: `guest-${tag}@example.test`, role: 'manager', token_hash: hash() });
  check(!again.error, '…and a new one can be sent once the old one is cancelled', again.error);
  const bad = await Promise.all([
    admin.from('company_invitations').insert({ ...base, email: `boss-${tag}@example.test`, role: 'owner', token_hash: hash() }),
    admin.from('company_invitations').insert({ ...base, email: `Upper-${tag}@Example.test`, role: 'member', token_hash: hash() }),
    admin.from('company_invitations').insert({ ...base, email: 'not-an-email', role: 'member', token_hash: hash() }),
    admin.from('company_invitations').insert({ ...base, email: `raw-${tag}@example.test`, role: 'member', token_hash: 'secret-token' }),
    admin.from('company_invitations').insert({ ...base, email: `half-${tag}@example.test`, role: 'member', token_hash: hash(), accepted_at: new Date().toISOString() }),
  ]);
  check(bad.every((b) => !!b.error), "nobody is invited as owner; emails are stored clean; only a hash of the link's secret is kept; acceptance records who",
    bad.map((b) => b.error?.code ?? 'ok'));

  // Invitations: an email goes with the account; old invitations are cleared nightly
  const invitee = await person('invitee');
  await admin.from('company_invitations').insert([
    { ...base, email: invitee.email.toLowerCase(), role: 'member', token_hash: hash(), accepted_at: new Date().toISOString(), accepted_by: invitee.id },
    { company_id: anonCo.id, invited_by: a!.user!.id, email: invitee.email.toLowerCase(), role: 'member', token_hash: hash() },
  ]);
  await admin.auth.admin.deleteUser(invitee.id);
  const kept = await admin.from('company_invitations').select('id').eq('email', invitee.email.toLowerCase());
  check((kept.data ?? []).length === 0, "deleting an account removes their email from invitations (accepted, or still addressed to them)", kept.data);
  const { data: old } = await admin.from('company_invitations').insert({ ...base, email: `old-${tag}@example.test`, role: 'member', token_hash: hash(),
    created_at: new Date(Date.now() - 60 * 86_400_000).toISOString(), expires_at: new Date(Date.now() - 53 * 86_400_000).toISOString() }).select('id').single();
  const job = await sql(`select command from cron.job where jobname = 'purge-old-invitations'`);
  await sql(job.out);
  check(!!job.out && ((await admin.from('company_invitations').select('id').eq('id', old!.id)).data ?? []).length === 0
    && ((await admin.from('company_invitations').select('id').eq('company_id', co.id).eq('email', `guest-${tag}@example.test`)).data ?? []).length === 2,
    'the nightly job clears invitations 30 days after they end, and keeps recent ones', job);

  // Account deletion goes by ownership
  const { data: task } = await admin.from('tasks').insert({ company_id: co.id, created_by_id: mia.id, title: `Mia's task ${tag}` }).select('id').single();
  await admin.auth.admin.deleteUser(mia.id);
  const leftTask = await admin.from('tasks').select('id').eq('id', task!.id);
  check((leftTask.data ?? []).length === 1 && (await members(co.id)).every((m: any) => m.user_id !== mia.id),
    "a member's account deleted: they leave the company, their work stays");
  check((await sql(`select display_name from public.former_members where user_id = '${mia.id}'`)).out === 'Mia Member', '…and their name is kept for it');

  const sam = await person('sam');
  await admin.from('company_members').insert({ company_id: co.id, user_id: sam.id, role: 'manager' });
  const blocked = await admin.auth.admin.deleteUser(olive.id);
  check(!!blocked.error && (await admin.from('companies').select('id').eq('id', co.id)).data?.length === 1,
    "an owner's account can't be deleted while others are in their company", blocked.error?.message);
  await admin.from('company_members').delete().eq('company_id', co.id).eq('user_id', sam.id);
  await admin.auth.admin.deleteUser(olive.id);
  check((await admin.from('companies').select('id').eq('id', co.id)).data?.length === 0 && (await admin.from('tasks').select('id').eq('id', task!.id)).data?.length === 0,
    "once they're alone, deleting the owner deletes their company and everything in it, as today");
  check((await sql(`select count(*) from public.former_members where user_id = '${mia.id}'`)).out === '0', "…and the left member's name goes with it");

  await admin.auth.admin.deleteUser(a!.user!.id);
  check((await admin.from('companies').select('id').eq('id', anonCo.id)).data?.length === 0, "a free-meeting visitor's company goes with them, as today");

  // Who founded a company can't be changed
  const pat = await person('pat');
  const { data: patCo } = await pat.client.from('companies').insert({ name: `Pat Co ${tag}`, created_by_id: pat.id }).select().single();
  await pat.client.from('companies').update({ created_by_id: outsider.id, name: `Pat Co renamed ${tag}` }).eq('id', patCo.id);
  const { data: patNow } = await admin.from('companies').select('created_by_id, name').eq('id', patCo.id).single();
  check(patNow?.created_by_id === pat.id && patNow?.name === `Pat Co renamed ${tag}`, "who founded a company can't be changed (other edits still work)", patNow);

  // A founder who handed over: their work stays in the company they no longer own
  const fay = await person('fay', 'Fay Founder');
  const nick = await person('nick', 'Nick New');
  const { data: fayCo } = await fay.client.from('companies').insert({ name: `Fay Co ${tag}`, created_by_id: fay.id }).select().single();
  await fay.client.from('pins').insert({ company_id: fayCo.id, created_by_id: fay.id, source_type: 'task', selected_text: `Fay's pin ${tag}` });
  await admin.from('company_members').insert({ company_id: fayCo.id, user_id: nick.id, role: 'member' });
  await sql(`begin; update public.company_members set role = 'manager' where company_id = '${fayCo.id}' and user_id = '${fay.id}'; update public.company_members set role = 'owner' where company_id = '${fayCo.id}' and user_id = '${nick.id}'; commit;`);
  const fayDel = await admin.auth.admin.deleteUser(fay.id);
  check(!fayDel.error && (await admin.from('companies').select('id').eq('id', fayCo.id)).data?.length === 1
    && (await admin.from('pins').select('id').eq('company_id', fayCo.id)).data?.length === 1
    && (await sql(`select display_name from public.former_members where user_id = '${fay.id}'`)).out === 'Fay Founder',
    'a founder who handed over can leave: the company, their work and their name stay', fayDel.error);
} finally {
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => {});
  await sql(`delete from public.companies where name like '%${tag}'`);
  await sql(`delete from public.former_members where user_id in (${created.map((id) => `'${id}'`).join(',') || "'00000000-0000-0000-0000-000000000000'"})`);
}

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
