// taskRun — "Do this for me" (Workstream M2a). The advisor who owns a task
// does it in the background and the founder decides what happens next.
//
//   start   {task_id, notes?}  the founder asks for it (again, with notes)
//   accept  {run_id}           the result goes to Knowledge; the task is done
//   discard {run_id}           the result is set aside; the task stays open
//   sweep   (service role)     pg_cron, every minute: picks up runs nobody
//                              started and restarts stalled ones (twice at most)
//
// The work runs after the response (EdgeRuntime.waitUntil), so the founder
// can close the page; the sweep is the safety net. Advisors get no tool that
// could send, post, buy or sign anything: a draft is for the founder to send.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { CALL_DEADLINE_MS, CALLER_SAVE_MARGIN_MS } from '../_shared/callPolicy.ts';
import { TASK_DRAFT_SCHEMA, TASK_PLAN_SCHEMA } from '../_shared/answerSchemas.ts';
import { requireOwnedRow, requireNotAnonymous, checkUserLimit, accessErrorResponse } from '../_shared/access.ts';
import { RUNNABLE_TYPES, TASK_MODEL, companyContext, finishResult, resultAsText, taskPrompt, voiceSamples } from '../_shared/taskRun.ts';

// deno-lint-ignore no-explicit-any
type Any = any;
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// A run nobody picked up within this long is started by the sweep, and a
// running one that hasn't finished within this long is taken as stalled.
// (Matched by the cron job's filter in 20261014100000_m2a_task_runs.sql.)
const QUEUED_GRACE_MS = 30_000;
const STALE_RUN_MS = 4 * 60_000;
const MAX_ATTEMPTS = 3;

const SCHEMAS: Record<string, unknown> = { draft: TASK_DRAFT_SCHEMA, plan: TASK_PLAN_SCHEMA };

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders });

function later(work: Promise<unknown>) {
  const guarded = work.catch((e) => console.error('taskRun background work failed:', (e as Error).message));
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(guarded);
  return guarded;
}

const nowIso = () => new Date().toISOString();

// Takes a run for this worker, atomically: a queued one, or a stalled one
// with attempts left. Two workers can never both hold it.
async function claim(db: Any, runId: string) {
  const staleBefore = new Date(Date.now() - STALE_RUN_MS).toISOString();
  const { data: current } = await db.from('task_runs').select('attempts').eq('id', runId).maybeSingle();
  if (!current || current.attempts >= MAX_ATTEMPTS) return null;
  const { data } = await db.from('task_runs')
    .update({ status: 'running', claimed_at: nowIso(), attempts: current.attempts + 1, updated_at: nowIso() })
    .eq('id', runId).eq('attempts', current.attempts)
    .or(`status.eq.queued,and(status.eq.running,claimed_at.lt.${staleBefore})`)
    .select().maybeSingle();
  return data;
}

async function runCost(db: Any, runId: string) {
  const { data } = await db.from('ai_usage_logs').select('estimated_cost').eq('task_run_id', runId);
  return (data || []).reduce((sum: number, r: Any) => sum + (Number(r.estimated_cost) || 0), 0);
}

// Stores the outcome, and moves the task only if this run still owned it
// and the task is still where the run put it: a task the founder has since
// finished, or a run the sweep already gave up on, stays as it is.
async function finishRun(db: Any, run: Any, patch: Record<string, unknown>, taskStatus: string) {
  const cost = await runCost(db, run.id);
  const { data: stored } = await db.from('task_runs').update({ ...patch, cost_usd: cost, finished_at: nowIso(), updated_at: nowIso() })
    .eq('id', run.id).eq('status', 'running').eq('attempts', run.attempts).select('id');
  if (!stored?.length) return;
  await db.from('tasks').update({ status: taskStatus }).eq('id', run.task_id).eq('status', 'in_progress');
}

// The work itself: gather what the advisor needs, ask them, store the result.
async function processRun(db: Any, runId: string) {
  const startedAt = Date.now();
  const run = await claim(db, runId);
  if (!run) return;
  try {
    const { data: task } = await db.from('tasks').select('*').eq('id', run.task_id).maybeSingle();
    const { data: advisor } = await db.from('advisors').select('id, name, company_id, type').eq('id', run.advisor_id).maybeSingle();
    if (!task || !advisor || advisor.company_id !== run.company_id || advisor.type === 'human') {
      await finishRun(db, run, { status: 'failed', error: 'The advisor for this task is no longer on the board.' }, 'todo');
      return;
    }

    const [{ data: company }, { data: knowledge }, { data: meetings }, { data: notes }, meetingRes, previousRes] = await Promise.all([
      db.from('companies').select('*').eq('id', run.company_id).maybeSingle(),
      // The founder's own Knowledge, not the board's earlier drafts and plans.
      db.from('documents').select('title, content').eq('company_id', run.company_id).eq('kind', 'knowledge')
        .or('category.is.null,category.not.in.("Draft","Plan")').order('created_at', { ascending: false }).limit(5),
      db.from('board_meetings').select('question, founder_decision_notes, discussion_transcript')
        .eq('company_id', run.company_id).eq('created_by_id', run.created_by_id).order('created_at', { ascending: false }).limit(5),
      db.from('notes').select('raw_text').eq('company_id', run.company_id).eq('created_by_id', run.created_by_id).order('created_at', { ascending: false }).limit(5),
      task.source_meeting_id
        ? db.from('board_meetings').select('question, board_resolution').eq('id', task.source_meeting_id).eq('company_id', run.company_id).maybeSingle()
        : Promise.resolve({ data: null }),
      run.previous_run_id
        ? db.from('task_runs').select('result').eq('id', run.previous_run_id).eq('task_id', run.task_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const voice = voiceSamples({
      followups: (meetings || []).flatMap((m: Any) => (m.discussion_transcript || []).filter((t: Any) => t.message_type === 'founder_message').map((t: Any) => t.message)),
      notes: (notes || []).map((n: Any) => n.raw_text),
      decisionNotes: (meetings || []).map((m: Any) => m.founder_decision_notes),
      questions: (meetings || []).map((m: Any) => m.question),
    });
    const prompt = taskPrompt({
      type: run.task_type, task, meeting: meetingRes?.data, today: new Date().toISOString().slice(0, 10), voice,
      redo: run.redo_notes && previousRes?.data?.result ? { notes: run.redo_notes, previous: previousRes.data.result } : null,
    });

    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/routeAdvisorRequest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({
        advisor_id: advisor.id, company_id: run.company_id, meeting_id: task.source_meeting_id || null, user_id: run.created_by_id,
        model_override: TASK_MODEL, task_run_id: run.id,
        system_instructions: prompt.system_instructions, company_context: companyContext(company, knowledge || []),
        meeting_context: prompt.meeting_context, user_question: prompt.user_question, previous_responses: [],
        output_schema: SCHEMAS[run.task_type], temperature: 0.6, request_type: `task_${run.task_type}`,
        deadline_at: startedAt + CALL_DEADLINE_MS - CALLER_SAVE_MARGIN_MS,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.response) {
      await finishRun(db, run, { status: 'failed', error: `${advisor.name.split(' ')[0]} couldn't finish this just now. Try again in a moment.` }, 'todo');
      return;
    }
    const result = finishResult(run.task_type, data.response, task);
    await finishRun(db, run, { status: 'done', result, error: null }, 'review');
  } catch (e) {
    console.error('taskRun: run failed', runId, (e as Error).message);
    await finishRun(db, run, { status: 'failed', error: "This couldn't be finished just now. Try again in a moment." }, 'todo').catch(() => {});
  }
}

async function sweep(db: Any) {
  const queuedBefore = new Date(Date.now() - QUEUED_GRACE_MS).toISOString();
  const staleBefore = new Date(Date.now() - STALE_RUN_MS).toISOString();
  const { data: waiting } = await db.from('task_runs').select('id, task_id, attempts, status')
    .or(`and(status.eq.queued,created_at.lt.${queuedBefore}),and(status.eq.running,claimed_at.lt.${staleBefore})`)
    .order('created_at').limit(10);
  const restart: string[] = [];
  for (const r of waiting || []) {
    if (r.attempts >= MAX_ATTEMPTS) {
      // Out of restarts: tell the founder plainly instead of trying forever.
      const { data: gaveUp } = await db.from('task_runs')
        .update({ status: 'failed', error: "This stalled and couldn't be finished. Try again.", finished_at: nowIso(), updated_at: nowIso() })
        .eq('id', r.id).in('status', ['queued', 'running']).select('id');
      if (gaveUp?.length) await db.from('tasks').update({ status: 'todo' }).eq('id', r.task_id).eq('status', 'in_progress');
    } else {
      restart.push(r.id);
    }
  }
  for (const id of restart) later(processRun(db, id));
  return restart.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');

    // The cron job, with the service-role key.
    if (body.action === 'sweep') {
      if (token !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return json({ error: 'Unauthorized' }, 401);
      return json({ restarted: await sweep(db) });
    }

    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);
    requireNotAnonymous(user);

    if (body.action === 'start') {
      const task = await requireOwnedRow(db, 'tasks', body.task_id, user.id);
      if (!RUNNABLE_TYPES.includes(task.task_type)) return json({ error: "This kind of task can't be done for you yet." }, 400);
      if (task.status === 'done') return json({ error: 'This task is already done.' }, 409);
      const { data: advisor } = task.advisor_id
        ? await db.from('advisors').select('id, name, type, company_id').eq('id', task.advisor_id).maybeSingle()
        : { data: null };
      if (!advisor || advisor.type === 'human' || advisor.company_id !== task.company_id)
        return json({ error: 'Give this task to one of your advisors first.' }, 400);
      const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : '';

      const { data: active } = await db.from('task_runs').select('id').eq('task_id', task.id).in('status', ['queued', 'running']).limit(1);
      if (active?.length) return json({ error: `${advisor.name.split(' ')[0]} is already on it.` }, 409);
      // A redo builds on the latest finished attempt.
      const { data: previous } = notes
        ? await db.from('task_runs').select('id').eq('task_id', task.id).in('status', ['done', 'discarded', 'failed']).not('result', 'is', null)
          .order('created_at', { ascending: false }).limit(1)
        : { data: [] };

      await checkUserLimit(db, user.id, 'task_run');
      const { data: run, error: insertErr } = await db.from('task_runs').insert({
        task_id: task.id, company_id: task.company_id, created_by_id: user.id,
        advisor_id: advisor.id, advisor_name: advisor.name, task_type: task.task_type,
        redo_notes: notes || null, previous_run_id: previous?.[0]?.id || null,
      }).select().single();
      if (insertErr) {
        // The one-active-run index: a second click got here first.
        if (insertErr.code === '23505') return json({ error: `${advisor.name.split(' ')[0]} is already on it.` }, 409);
        throw insertErr;
      }
      // An earlier result still waiting for a decision is set aside by the redo.
      await db.from('task_runs').update({ status: 'discarded', updated_at: nowIso() }).eq('task_id', task.id).eq('status', 'done').neq('id', run.id);
      await db.from('tasks').update({ status: 'in_progress' }).eq('id', task.id);
      later(processRun(db, run.id));
      return json({ run });
    }

    if (body.action === 'accept' || body.action === 'discard') {
      const run = await requireOwnedRow(db, 'task_runs', body.run_id, user.id);
      if (body.action === 'discard') {
        const { data: done } = await db.from('task_runs').update({ status: 'discarded', updated_at: nowIso() })
          .eq('id', run.id).in('status', ['done', 'failed']).select().maybeSingle();
        if (!done) return json({ error: 'There is nothing to discard here.' }, 409);
        // Back to open only from Review: a newer run in progress keeps its place.
        await db.from('tasks').update({ status: 'todo' }).eq('id', run.task_id).eq('status', 'review');
        return json({ run: done });
      }

      // Accept: claim the decision first, so a double click saves one document.
      const { data: accepted } = await db.from('task_runs').update({ status: 'accepted', updated_at: nowIso() })
        .eq('id', run.id).eq('status', 'done').select().maybeSingle();
      if (!accepted) return json({ error: 'This result has already been decided.' }, 409);
      const { data: task } = await db.from('tasks').select('id, title, source_meeting_id').eq('id', run.task_id).maybeSingle();
      const { data: doc, error: docErr } = await db.from('documents').insert({
        company_id: run.company_id, created_by_id: user.id, kind: 'knowledge', category: run.task_type === 'plan' ? 'Plan' : 'Draft',
        title: String(run.result?.title || task?.title || 'Untitled').slice(0, 200),
        content: resultAsText(run.task_type, run.result), structured_content: run.result,
        task_id: run.task_id, meeting_id: task?.source_meeting_id || null, created_by_advisor_id: run.advisor_id,
        status: 'approved', approval_status: 'approved', approved_at: nowIso(),
      }).select('id').single();
      if (docErr) {
        // Put the decision back so the founder can try again.
        await db.from('task_runs').update({ status: 'done', updated_at: nowIso() }).eq('id', run.id).eq('status', 'accepted');
        throw docErr;
      }
      await db.from('tasks').update({ status: 'done', document_id: doc.id }).eq('id', run.task_id);
      return json({ run: accepted, document_id: doc.id });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    const denied = accessErrorResponse(error, corsHeaders);
    if (denied) return denied;
    console.error('taskRun error:', error);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
