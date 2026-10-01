// cleanupExpiredAnonymousUsers — Phase 4.1. An anonymous free-meeting
// visitor who never converts (no email confirmed within 30 days) gets their
// company, advisors, meeting and the anonymous auth user itself deleted.
// Same 30-day window governs how long someone can return to their result
// via the ordinary /board flow before it's gone — 4.2's share link, if they
// made one, is unaffected (the meeting row it points to is what's deleted;
// a share link to an already-expired meeting was already "not available").
//
// Internal-only, meant to run on a schedule (see project notes for how this
// is triggered) — not reachable by any user session, same convention as
// routeAdvisorRequest.
//
// Uses the Admin API for the actual user deletion rather than a raw SQL
// delete against auth.users — GoTrue owns that table's internal bookkeeping
// (sessions, refresh tokens, identities) and the Admin API is the supported
// way to remove a user without leaving any of that orphaned.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPIRY_DAYS = 30;

// Removes an expired anonymous visitor's files and rows. Returns a reason
// if anything failed, so the caller leaves the account for the next run.
// deno-lint-ignore no-explicit-any
async function purgeAnonymousUser(db: any, userId: string): Promise<string | null> {
  const { data: companies, error: listErr } = await db.from('companies').select('id').eq('created_by_id', userId);
  if (listErr) return `listing companies: ${listErr.message}`;

  for (const { id } of companies || []) {
    // Generated documents live under '<company_id>/' in the documents bucket.
    const { data: files, error: filesErr } = await db.storage.from('documents').list(id, { limit: 1000 });
    if (filesErr) return `listing files: ${filesErr.message}`;
    if (files?.length) {
      const { error: rmErr } = await db.storage.from('documents').remove(files.map((f: { name: string }) => `${id}/${f.name}`));
      if (rmErr) return `removing files: ${rmErr.message}`;
    }
  }

  for (const table of ['board_meetings', 'advisors', 'companies']) {
    const { error } = await db.from(table).delete().eq('created_by_id', userId);
    if (error) return `deleting ${table}: ${error.message}`;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (token !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const cutoff = new Date(Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    let checked = 0;
    let deleted = 0;
    let page = 1;
    const perPage = 200;

    while (true) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      const users = data?.users || [];
      if (!users.length) break;

      for (const u of users) {
        checked++;
        if (!u.is_anonymous) continue;
        if (new Date(u.created_at) > cutoff) continue;

        // Explicit, and every step checked: when a delete failed silently
        // before, the account delete behind it failed too and the visitor's
        // data stayed. Child rows (notes, reminders, progression, events)
        // cascade from the company and the account (security Part C).
        const failed = await purgeAnonymousUser(db, u.id);
        if (failed) {
          console.error(`Skipped anonymous user ${u.id}: ${failed}`);
          continue;
        }
        const { error: delErr } = await db.auth.admin.deleteUser(u.id);
        if (!delErr) deleted++;
        else console.error(`Failed to delete anonymous user ${u.id}:`, delErr.message);
      }

      if (users.length < perPage) break;
      page++;
    }

    return Response.json({ checked, deleted }, { headers: corsHeaders });
  } catch (error) {
    console.error('cleanupExpiredAnonymousUsers error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
