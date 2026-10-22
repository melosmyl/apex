// shortenTaskTitles: writes the short titles a company's task cards are
// waiting for (Workstream T). A task whose wording is longer than seven words
// is marked as waiting when it's made (database trigger); the task board and
// the Dashboard call this when they show one. Up to ten at a time, in one
// cheap-tier call. A task the model skips or answers badly is marked done
// without one, so its card keeps the full wording instead of asking again;
// when the call itself fails, each task in it counts a failed try, and after
// three it stops waiting (so a batch that always fails can't keep spending,
// or keep the tasks behind it waiting).
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireOwnedCompany, requireNotAnonymous, checkUserLimit, accessErrorResponse } from '../_shared/access.ts';
import { BATCH, MAX_ATTEMPTS, SHORT_TITLE_SCHEMA, TITLE_WRITER, matchShortTitles, shortTitlePrompt } from '../_shared/shortTitle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);
    const db = createClient(supabaseUrl, serviceKey);

    const { company_id } = await req.json().catch(() => ({}));
    try {
      requireNotAnonymous(user);
      await requireOwnedCompany(db, company_id, user.id);
    } catch (e) {
      const res = accessErrorResponse(e, corsHeaders);
      if (res) return res;
      throw e;
    }

    const { data: waiting, error: readErr } = await db.from('tasks')
      .select('id, title, short_title_attempts')
      .eq('company_id', company_id).eq('short_title_pending', true)
      .order('created_at', { ascending: false }).limit(BATCH);
    if (readErr) throw new Error(readErr.message);
    // Nothing waiting: nothing to spend, and nothing counted against the limit.
    if (!waiting?.length) return json({ titles: [] });

    try {
      await checkUserLimit(db, user.id, 'task_short_title');
    } catch (e) {
      const res = accessErrorResponse(e, corsHeaders);
      if (res) return res;
      throw e;
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/routeAdvisorRequest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        advisor_override: TITLE_WRITER, company_id, user_id: user.id,
        user_question: shortTitlePrompt(waiting), previous_responses: [], output_schema: SHORT_TITLE_SCHEMA,
        model_tier: 'cheap', temperature: 0.2, max_output_length: 1000, request_type: 'task_short_title',
      }),
    });
    const data = await res.json().catch(() => ({}));
    const matched = res.ok && data?.response ? matchShortTitles(waiting, data.response) : null;
    // No usable answer: a failed try for each task; they wait for the next
    // visit, until their third.
    if (!matched) {
      for (const task of waiting) {
        const tries = (task.short_title_attempts || 0) + 1;
        const { error } = await db.from('tasks')
          .update({ short_title_attempts: tries, short_title_pending: tries < MAX_ATTEMPTS })
          .eq('id', task.id).eq('short_title_pending', true).eq('title', task.title);
        if (error) throw new Error(error.message);
      }
      throw new Error(data?.reason || data?.error || `no usable answer (${res.status})`);
    }

    const titles: { id: string; short_title: string | null }[] = [];
    for (const task of waiting) {
      const short_title = matched.get(task.id) ?? null;
      // Only if the wording hasn't changed since it was read: new wording is
      // waiting for its own short title.
      const { data: saved, error } = await db.from('tasks')
        .update({ short_title, short_title_pending: false })
        .eq('id', task.id).eq('short_title_pending', true).eq('title', task.title)
        .select('id');
      if (error) throw new Error(error.message);
      if (saved?.length) titles.push({ id: task.id, short_title });
    }
    return json({ titles });
  } catch (error) {
    console.error('shortenTaskTitles error:', (error as Error).message);
    return json({ error: 'Could not write the short titles.' }, 500);
  }
});
