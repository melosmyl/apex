// myData: a founder's own data (owner, 22 October 2026, D3).
// - export: a copy of everything, one zip: data.json plus the stored files.
// - delete_company: a company, its rows and its stored files.
// - delete_account: everything, at once, after the founder types the
//   phrase. The cost records we keep for our own accounts stay, without the
//   person: their user id is cleared first.
// Signed-in founders only, and only ever their own rows.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';
import JSZip from 'npm:jszip@3.10.1';
import { AccessError, accessErrorResponse, checkUserLimit, requireNotAnonymous } from '../_shared/access.ts';
import { BACKUP_DAYS, FILES_BUCKET, OWN_TABLES, allRows, companyFiles, confirmed, forCopy, othersIn, removeCompanyFiles, theirCompanies } from '../_shared/myData.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function exportAll(db: any, user: any) {
  const zip = new JSZip();
  const data: Record<string, unknown> = {};
  for (const { table, owner, columns } of OWN_TABLES) data[table] = (await allRows(db, table, owner, user.id, columns)).map(forCopy);
  const companies = (data.companies as any[]) || [];
  const files: string[] = [];
  for (const c of companies) {
    for (const path of await companyFiles(db, c.id)) {
      const { data: blob, error } = await db.storage.from(FILES_BUCKET).download(path);
      if (error || !blob) throw new Error(`reading a stored file: ${error?.message || 'no data'}`);
      zip.file(`files/${path}`, new Uint8Array(await blob.arrayBuffer()), { compression: 'STORE' });
      files.push(`files/${path}`);
    }
  }
  zip.file('data.json', JSON.stringify({
    about: 'Everything Just Ask The Room holds about your account, as of the date below. Each section is one kind of record; stored files are in the files folder, by company.',
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email, created_at: user.created_at },
    files,
    ...data,
  }, null, 2));
  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

async function deleteCompany(db: any, user: any, companyId: string) {
  if (!companyId) throw new AccessError(400, 'company_id is required');
  if (!(await theirCompanies(db, user.id)).includes(companyId)) throw new AccessError(403, 'Only the owner can delete a company.');
  // Files first: if that fails, nothing is gone and the founder can retry.
  const files = await removeCompanyFiles(db, companyId);
  const { error } = await db.from('companies').delete().eq('id', companyId);
  if (error) throw new Error(`deleting the company: ${error.message}`);
  return { deleted: true, files };
}

// Rows the database doesn't follow from the sign-in: the cost records stay
// for our accounts without the person; rate records go. Safe to repeat.
async function forgetPerson(db: any, userId: string) {
  const { error: logErr } = await db.from('ai_usage_logs').update({ user_id: null }).eq('user_id', userId);
  if (logErr) throw new Error(`clearing the cost records' owner: ${logErr.message}`);
  const { error: genErr } = await db.from('deliverable_generation_logs').update({ user_id: null }).eq('user_id', userId);
  if (genErr) throw new Error(`clearing the generation records' owner: ${genErr.message}`);
  const { error: rateErr } = await db.from('user_rate_events').delete().eq('user_id', userId);
  if (rateErr) throw new Error(`deleting rate records: ${rateErr.message}`);
}

async function deleteAccount(db: any, user: any) {
  // Their companies, as the database sees them (Teams S2). If anyone else is
  // in one, nothing is deleted: they hand it over or delete it first.
  const companies = await theirCompanies(db, user.id);
  if (await othersIn(db, companies, user.id))
    throw new AccessError(409, 'You own a company other people are in. Hand it over to one of them, or delete that company first; then you can delete your account.');
  let files = 0;
  for (const id of companies) files += await removeCompanyFiles(db, id);
  await forgetPerson(db, user.id);
  // A free meeting's record holds a hashed network address: deleted with the
  // account, before the sign-in would cut its link to them.
  const { error: freeErr } = await db.from('free_meeting_attempts').delete().eq('user_id', user.id);
  if (freeErr) throw new Error(`deleting free-meeting records: ${freeErr.message}`);
  // The sign-in last: deleting it deletes every row the account owns.
  const { error: userErr } = await db.auth.admin.deleteUser(user.id);
  if (userErr) throw new Error(`deleting the sign-in: ${userErr.message}`);
  // Again, for anything a meeting still running wrote in the meantime. The
  // account is gone by now, so a failure here is logged, not reported as a
  // failed deletion (a retry couldn't sign in any more).
  try { await forgetPerson(db, user.id); } catch (e) { console.error('myData: second clean-up after deleting the account failed:', (e as Error).message); }
  return { deleted: true, companies: companies.length, files, backup_days: BACKUP_DAYS };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    requireNotAnonymous(user);
    const { action, company_id, confirm } = await req.json().catch(() => ({}));

    if (action === 'export') {
      await checkUserLimit(db, user.id, 'data_export');
      const bytes = await exportAll(db, user);
      const day = new Date().toISOString().slice(0, 10);
      return new Response(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), { headers: { ...corsHeaders, 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="just-ask-the-room-${day}.zip"` } });
    }
    if (action === 'delete_company') return Response.json(await deleteCompany(db, user, company_id), { headers: corsHeaders });
    if (action === 'delete_account') {
      if (!confirmed(confirm)) throw new AccessError(400, 'Type "delete my account" to confirm.');
      return Response.json(await deleteAccount(db, user), { headers: corsHeaders });
    }
    return Response.json({ error: 'Unknown action' }, { status: 400, headers: corsHeaders });
  } catch (e) {
    const denied = accessErrorResponse(e, corsHeaders);
    if (denied) return denied;
    console.error('myData error:', (e as Error).message);
    return Response.json({ error: 'Something went wrong. Try again in a moment; anything already removed stays removed, and the rest is still there.' }, { status: 500, headers: corsHeaders });
  }
});
