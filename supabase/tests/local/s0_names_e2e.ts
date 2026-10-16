// Workstream S (Teams), S0: display names, on the local stack ($0, no model
// calls). Setup as in README.md; LOCAL_URL and LOCAL_DB_CONTAINER override
// the defaults when the stack runs elsewhere.
//   LOCAL_ANON_KEY=… LOCAL_SERVICE_KEY=… deno run -A supabase/tests/local/s0_names_e2e.ts
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
const sql = async (q: string) => {
  const out = await new Deno.Command('docker', { args: ['exec', '-i', DB, 'psql', '-U', 'postgres', '-Atqc', q] }).output();
  return new TextDecoder().decode(out.stdout).trim();
};
async function person(name: string, meta: Record<string, unknown> = {}) {
  const email = `s0-${name}-${tag}@example.test`, password = crypto.randomUUID();
  const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta });
  created.push(data.user!.id);
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password });
  return { id: data.user!.id, client };
}
const nameOf = async (id: string) => (await admin.from('profiles').select('display_name').eq('id', id).single()).data?.display_name ?? null;

try {
  // From Google (the full_name Google gives), tidied; nothing otherwise
  const google = await person('google', { full_name: '  Ada \t  Lovelace \n', name: 'ignored' });
  check(await nameOf(google.id) === 'Ada Lovelace', "a Google sign-up gets Google's name, tidied", await nameOf(google.id));
  const plain = await person('plain');
  check(await nameOf(plain.id) === null, 'an email sign-up starts with no name (asked when it first matters)');
  const onlyName = await person('only', { name: 'Grace Hopper' });
  check(await nameOf(onlyName.id) === 'Grace Hopper', "…or the 'name' Google gives when there's no full name");
  const long = await person('long', { full_name: 'a'.repeat(79) + ' Smith' });
  check(await nameOf(long.id) === 'a'.repeat(79), 'a long name cut at a space still signs up, without a trailing space', await nameOf(long.id));
  const odd = await person('odd', { full_name: { x: 1 }, name: 'Grace' });
  check(await nameOf(odd.id) === 'Grace', "a full_name that isn't text is ignored for the plain name", await nameOf(odd.id));

  // Reading your own, through the profile function the app already uses
  const { data: mine } = await google.client.rpc('get_my_profile');
  check(mine?.display_name === 'Ada Lovelace' && mine?.role === 'user', 'the app reads the name with the rest of the profile', mine);

  // Setting your own
  let r = await plain.client.rpc('set_my_display_name', { p_name: '  Sam \n Hartley  ' });
  check(!r.error && r.data?.display_name === 'Sam Hartley' && await nameOf(plain.id) === 'Sam Hartley', 'you can set your own name, tidied', r.error ?? r.data);
  r = await plain.client.rpc('set_my_display_name', { p_name: '   ' });
  check(r.error?.code === '22023' && await nameOf(plain.id) === 'Sam Hartley', "an empty name is refused, and the old one kept", r.error);
  r = await plain.client.rpc('set_my_display_name', { p_name: 'x'.repeat(200) });
  check(!r.error && (await nameOf(plain.id))?.length === 80, 'a very long name is cut to 80 characters', r.error);
  r = await plain.client.rpc('set_my_display_name', { p_name: 'x'.repeat(79) + ' y' });
  check(!r.error && await nameOf(plain.id) === 'x'.repeat(79), '…never leaving a space at the end', r.error);
  r = await plain.client.rpc('set_my_display_name', { p_name: '\u200B\u2060' });
  check(r.error?.code === '22023', 'a name of only invisible characters counts as empty', r.error);
  r = await plain.client.rpc('set_my_display_name', { p_name: 'Sam\u202E Hartley' });
  check(!r.error && await nameOf(plain.id) === 'Sam Hartley', 'characters that flip text direction are removed', await nameOf(plain.id));

  // Nothing else can be written
  const direct = await plain.client.from('profiles').update({ display_name: 'Direct', role: 'admin' }).eq('id', plain.id).select();
  check(!!direct.error || (direct.data ?? []).length === 0, 'profiles still take no direct writes (not the name, not the role)', direct);
  const { data: role } = await admin.from('profiles').select('role').eq('id', plain.id).single();
  check(role?.role === 'user', '…and the role is untouched');
  const others = await plain.client.from('profiles').select('id, display_name').eq('id', google.id);
  check((others.data ?? []).length === 0, "you can't read someone else's profile");
  const asAnonKey = createClient(URL, ANON, { auth: { persistSession: false } });
  r = await asAnonKey.rpc('set_my_display_name', { p_name: 'Nobody' });
  check(!!r.error, 'signed out, the name function is refused', r.error);

  // Anonymous free-meeting visitors: no name, and can't set one
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: a, error: ae } = await anon.auth.signInAnonymously();
  if (a?.user) created.push(a.user.id);
  check(!ae && await nameOf(a!.user!.id) === null, 'an anonymous visitor has no name', ae);
  r = await anon.rpc('set_my_display_name', { p_name: 'Visitor' });
  check(r.error?.code === '42501' && await nameOf(a!.user!.id) === null, "…and can't set one", r.error);
  // A visitor who keeps their board: their account becomes a real one while
  // this session's token still says anonymous. The account is what counts.
  await admin.auth.admin.updateUserById(a!.user!.id, { email: `s0-kept-${tag}@example.test`, email_confirm: true });
  const { data: kept } = await admin.auth.admin.getUserById(a!.user!.id);
  r = await anon.rpc('set_my_display_name', { p_name: 'Kept Board' });
  check(kept?.user?.is_anonymous === false && !r.error && await nameOf(a!.user!.id) === 'Kept Board',
    'after keeping the board, they can set a name straight away, even on the old session', { anonymous: kept?.user?.is_anonymous, error: r.error });

  // The one-off fill for existing Google users (the migration's own statement, re-run)
  await admin.from('profiles').update({ display_name: null } as any).eq('id', google.id);
  await sql(`update public.profiles p set display_name = public.clean_display_name(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')) from auth.users u where u.id = p.id and p.display_name is null and not coalesce(u.is_anonymous, false) and public.clean_display_name(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')) is not null and p.id = '${google.id}'`);
  check(await nameOf(google.id) === 'Ada Lovelace' && await nameOf(plain.id) !== null, "existing Google users get their name once; names people set aren't touched");
  const fn = await sql(`select array_to_string(proacl, ',') from pg_proc where proname = 'clean_display_name'`);
  check(!/anon|authenticated/.test(fn), "the tidying helper isn't callable from outside", fn);
} finally {
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => {});
}

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
