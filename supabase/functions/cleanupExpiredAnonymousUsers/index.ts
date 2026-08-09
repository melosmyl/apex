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

        // Deliberately explicit rather than relying on FK cascade — this is
        // the one place that's supposed to remove this data, so it should
        // say so, not assume.
        await db.from('board_meetings').delete().eq('created_by_id', u.id);
        await db.from('advisors').delete().eq('created_by_id', u.id);
        await db.from('companies').delete().eq('created_by_id', u.id);

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
