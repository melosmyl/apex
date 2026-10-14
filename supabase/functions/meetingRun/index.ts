// meetingRun (Workstream P0): moves a server-run meeting from one step to
// the next. The steps themselves are the meeting functions as before
// (startBoardMeeting's Round 1, runBoardDiscussion one round at a time,
// runChairSynthesis); this only decides which comes next and starts it.
//
//   advance  (service role)   a step that just ended hands over here
//   continue (the founder)    after typing human advisors' views, or skipping
//   retry    (the founder)    a meeting that failed: try the resolution again
//   sweep    (service role)   pg_cron, every minute: meetings nobody moved on
//                             and steps that stalled
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireOwnedRow, accessErrorResponse, checkUserLimit } from '../_shared/access.ts';
import { GAVE_UP, IDLE_GRACE_MS, MAX_STEP_ATTEMPTS, MAX_SWEEPS, STEP_FUNCTION, STEP_STALE_MS, callAsServer, isServiceCall, later, needsSweep, nextStep } from '../_shared/meetingDriver.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders });
const ACTIVE = ['preparing', 'independent_complete', 'discussing', 'discussion_complete', 'synthesizing'];

const giveUp = (db: any, m: any, reason: string) =>
  db.from('board_meetings').update({ status: 'failed', failure_reason: reason, step_claimed_at: null })
    .eq('id', m.id).eq('status', m.status).eq('step_attempts', m.step_attempts);

// A step that refuses the meeting outright (400, 403) won't do better next
// time: the meeting stops, with the step's own plain reason. Anything else
// (someone else has the step, a gateway or deploy hiccup, a server fault)
// is left for the sweep to try again, within its limits.
async function refused(db: any, m: any, res: Response) {
  if (res.status !== 400 && res.status !== 403) { await res.body?.cancel(); return; }
  const body = await res.json().catch(() => ({}));
  await giveUp(db, m, typeof body?.error === 'string' && body.error.length < 200 ? body.error : GAVE_UP);
}

// Starts what the meeting needs next. A step that has already been tried
// MAX_STEP_ATTEMPTS times, or a meeting the sweep keeps having to pick up,
// isn't tried again: the meeting is marked failed with a plain reason.
async function advance(db: any, meetingId: string, { retry = false, swept = false } = {}) {
  const { data: m } = await db.from('board_meetings').select('*').eq('id', meetingId).maybeSingle();
  const step = nextStep(m, Date.now(), retry);
  if (!step) return null;
  if (retry) {
    await db.from('board_meetings').update({ step_attempts: 0, sweep_count: 0, failure_reason: null }).eq('id', m.id).eq('status', 'failed');
    m.step_attempts = 0;
  } else if (m.step_attempts >= MAX_STEP_ATTEMPTS || (swept && m.sweep_count >= MAX_SWEEPS)) {
    await giveUp(db, m, GAVE_UP);
    return 'gave_up';
  }
  if (swept) await db.from('board_meetings').update({ sweep_count: (m.sweep_count || 0) + 1 }).eq('id', m.id).eq('status', m.status).eq('sweep_count', m.sweep_count || 0);
  later(callAsServer(STEP_FUNCTION[step], { meeting_id: m.id, ...(step === 'round1' ? { action: 'round1' } : {}) })
    .then((res) => refused(db, m, res)), `meeting ${step}`);
  return step;
}

// The cron job's filter (and needsSweep), as a query: only meetings that
// need picking up, oldest first, so a backlog can't hide one.
async function sweep(db: any) {
  const now = Date.now();
  const since = new Date(now - 24 * 60 * 60_000).toISOString();
  const stale = new Date(now - STEP_STALE_MS).toISOString();
  const idle = new Date(now - IDLE_GRACE_MS).toISOString();
  const { data } = await db.from('board_meetings').select('*')
    .eq('driver', 'server').in('status', ACTIVE).gte('created_at', since)
    .or([
      `and(status.eq.preparing,step_claimed_at.lt.${stale})`,
      `and(status.eq.independent_complete,awaiting_human_input.eq.false,updated_at.lt.${idle})`,
      `and(status.eq.discussing,step_claimed_at.is.null,updated_at.lt.${idle})`,
      `and(status.eq.discussing,step_claimed_at.lt.${stale})`,
      `and(status.eq.discussion_complete,updated_at.lt.${idle})`,
      `and(status.eq.synthesizing,updated_at.lt.${stale})`,
    ].join(','))
    .order('updated_at', { ascending: true }).limit(50);
  const moved: Record<string, string | null> = {};
  for (const m of (data || []).filter((m: any) => needsSweep(m, now))) moved[m.id] = await advance(db, m.id, { swept: true });
  return moved;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const db = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const { action, meeting_id } = body || {};

    if (isServiceCall(req)) {
      if (action === 'sweep') return json({ moved: await sweep(db) });
      if (action === 'advance' && meeting_id) return json({ step: await advance(db, meeting_id) });
      return json({ error: 'Unknown action' }, 400);
    }

    const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);
    if (!meeting_id) return json({ error: 'meeting_id is required' }, 400);
    const meeting = await requireOwnedRow(db, 'board_meetings', meeting_id, user.id, 'id, driver, status, awaiting_human_input, created_by_id, company_id');
    if (meeting.driver !== 'server') return json({ error: 'This meeting is run by the page, not the server.' }, 409);

    if (action === 'continue') {
      // Only the founder ends the wait for human advisors' views.
      await db.from('board_meetings').update({ awaiting_human_input: false })
        .eq('id', meeting.id).eq('awaiting_human_input', true);
      return json({ step: await advance(db, meeting.id) });
    }
    if (action === 'retry') {
      // Each try is a paid resolution: it counts like any meeting step.
      await checkUserLimit(db, user.id, 'meeting_step');
      const step = await advance(db, meeting.id, { retry: true });
      if (!step) return json({ error: "This meeting can't be picked up again. Please ask the question again." }, 409);
      return json({ step });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    const denied = accessErrorResponse(error, corsHeaders);
    if (denied) return denied;
    console.error('meetingRun error:', (error as Error).message);
    return json({ error: 'Something went wrong moving the meeting on.' }, 500);
  }
});
