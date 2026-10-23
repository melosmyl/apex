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
import { TASK_CALCULATE_SCHEMA, TASK_DRAFT_SCHEMA, TASK_PLAN_SCHEMA, TASK_RESEARCH_SCHEMA } from '../_shared/answerSchemas.ts';
import { buildSystemPrompt } from '../_shared/advisorPrompt.ts';
import { insertUsageLog } from '../_shared/llmCall.ts';
import { CAPS, RESEARCH_MODEL, citedSources, runResearchPass, skippedSitesIn } from '../_shared/webResearch.ts';
import { requireOwnedRow, requireNotAnonymous, checkUserLimit, accessErrorResponse } from '../_shared/access.ts';
import { TASK_LIMITS, indexPendingKnowledge, relevantPassages } from '../_shared/knowledgePassages.ts';
import { RESEARCH_TYPES, RUNNABLE_TYPES, STRUCTURE_INSTRUCTIONS, TASK_MODEL, companyContext, finishResearch, finishResult, resultAsText, taskPrompt, voiceSamples } from '../_shared/taskRun.ts';

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

const SCHEMAS: Record<string, unknown> = { draft: TASK_DRAFT_SCHEMA, plan: TASK_PLAN_SCHEMA, research: TASK_RESEARCH_SCHEMA, calculate: TASK_CALCULATE_SCHEMA };

// Research and Calculate fit inside the stale-run threshold (4 minutes):
// the research pass by 150s (a no-sources retry only if the first came back
// quickly), the structuring call by 225s.
const RESEARCH_BUDGET_MS = 150_000;
const RETRY_IF_BEFORE_MS = 90_000;
const RETRY_BUDGET_MS = 175_000;
const STRUCTURE_BY_MS = 225_000;

// The board's own work in Knowledge: kept out of what a task run is told,
// which is the founder's own material.
const BOARD_CATEGORIES = ['Draft', 'Plan', 'Research', 'Calculation'];

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
    const { data: advisor } = await db.from('advisors').select('*').eq('id', run.advisor_id).maybeSingle();
    if (!task || !advisor || advisor.company_id !== run.company_id || advisor.type === 'human') {
      await finishRun(db, run, { status: 'failed', error: 'The advisor for this task is no longer on the board.' }, 'todo');
      return;
    }

    // Their Knowledge, read by the parts that bear on the task (owner, 23
    // October 2026): what changed since it was last read is indexed first,
    // for a few seconds at most; if nothing matches, every item is read by
    // its opening, as before.
    try { await indexPendingKnowledge(db, run.company_id, null); } catch (e) { console.error('Indexing Knowledge failed:', (e as Error).message); }
    const passagesFor = relevantPassages(db, run.company_id, null, `${task.title || ''}\n${task.description || ''}`.trim(), TASK_LIMITS, { founderOnly: true })
      .catch((e) => { console.error('Reading Knowledge by passage failed; read by opening instead:', (e as Error).message); return null; });
    const [{ data: company }, { data: knowledge }, { data: meetings }, { data: notes }, meetingRes, previousRes, passages] = await Promise.all([
      db.from('companies').select('*').eq('id', run.company_id).maybeSingle(),
      db.from('documents').select('id, title, content, category, status').eq('company_id', run.company_id).eq('kind', 'knowledge')
        .or(`category.is.null,category.not.in.(${BOARD_CATEGORIES.map((c) => `"${c}"`).join(',')})`).order('created_at', { ascending: false }).limit(30),
      db.from('board_meetings').select('question, founder_decision_notes, discussion_transcript')
        .eq('company_id', run.company_id).eq('created_by_id', run.created_by_id).order('created_at', { ascending: false }).limit(5),
      db.from('notes').select('raw_text').eq('company_id', run.company_id).eq('created_by_id', run.created_by_id).order('created_at', { ascending: false }).limit(5),
      task.source_meeting_id
        ? db.from('board_meetings').select('question, board_resolution, founder_answers').eq('id', task.source_meeting_id).eq('company_id', run.company_id).maybeSingle()
        : Promise.resolve({ data: null }),
      run.previous_run_id
        ? db.from('task_runs').select('result').eq('id', run.previous_run_id).eq('task_id', run.task_id).maybeSingle()
        : Promise.resolve({ data: null }),
      passagesFor,
    ]);

    // The founder's own Knowledge: not the board's earlier drafts and plans
    // (filtered above), and nothing archived or replaced. The status check is
    // done here: many rows have no status, which a second "or" can't say.
    const ownKnowledge = (knowledge || [])
      .filter((d: Any) => !BOARD_CATEGORIES.includes(d.category) && !['archived', 'superseded'].includes(d.status))
      .slice(0, 5);

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

    if (RESEARCH_TYPES.includes(run.task_type)) {
      await researchTask(db, { run, task, advisor, context: companyContext(company, ownKnowledge, passages), prompt, startedAt });
      return;
    }

    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/routeAdvisorRequest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({
        advisor_id: advisor.id, company_id: run.company_id, meeting_id: task.source_meeting_id || null, user_id: run.created_by_id,
        model_override: TASK_MODEL, task_run_id: run.id,
        system_instructions: prompt.system_instructions, company_context: companyContext(company, ownKnowledge, passages),
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
    const result: Any = finishResult(run.task_type, data.response, task);
    // Who actually wrote it: shown to the founder when it wasn't the model
    // set for this task (a fallback, or a model swapped out by the registry).
    result.written_by = {
      provider: data.provider_used || null, model: data.model_used || null, intended: TASK_MODEL.model,
      fallback: !!data.model_used && data.model_used !== TASK_MODEL.model,
    };
    await finishRun(db, run, { status: 'done', result, error: null }, 'review');
  } catch (e) {
    console.error('taskRun: run failed', runId, (e as Error).message);
    await finishRun(db, run, { status: 'failed', error: "This couldn't be finished just now. Try again in a moment." }, 'todo').catch(() => {});
  }
}

// Research and Calculate (Stage 3): the advisor researches on Opus 5.5 with
// web search and page reading (and code, for Calculate), then the findings
// are put into shape on Sonnet 5.5, keeping only what the pages the search
// actually returned support. A result with no sources is sent back once,
// then fails plainly.
async function researchTask(db: Any, { run, task, advisor, context, prompt, startedAt }: Any) {
  const first = String(advisor.name || '').split(' ')[0] || 'Your advisor';
  const skipped = skippedSitesIn(task.title, task.description, run.redo_notes);
  const system = buildSystemPrompt(advisor, prompt.system_instructions, context, prompt.meeting_context, false, false);
  const ask = `${prompt.user_question}\n\nThe task: ${task.title}${task.description ? `\nBrief: ${task.description}` : ''}`;

  const log = (pass: Any) => insertUsageLog(db, {
    user_id: run.created_by_id, company_id: run.company_id, meeting_id: task.source_meeting_id || null, advisor_id: advisor.id,
    provider: RESEARCH_MODEL.provider, model: RESEARCH_MODEL.model, request_type: `task_${run.task_type}`,
    input_size: pass.inputTokens + pass.cacheWriteTokens + pass.cacheReadTokens, output_size: pass.outputTokens, estimated_cost: pass.costUsd,
    latency_ms: pass.ms, status: pass.error ? 'error' : 'success', error_code: pass.error,
    attempts: [{ searches: pass.searches, pages_read: pass.pagesRead, continuations: pass.continuations, stop_reason: pass.stopReason, sources: pass.sources.length, code_used: pass.codeUsed,
      input_tokens: pass.inputTokens, cache_write_tokens: pass.cacheWriteTokens, cache_read_tokens: pass.cacheReadTokens }],
    task_run_id: run.id,
  });

  let pass = await runResearchPass({ system, user: ask, type: run.task_type, endBy: startedAt + RESEARCH_BUDGET_MS });
  await log(pass);
  const firstPass = pass;
  // A retry only helps if there are searches left to make.
  if (run.task_type === 'research' && !pass.error && !citedSources(pass.sources).length && Date.now() - startedAt < RETRY_IF_BEFORE_MS && pass.searches < CAPS.research.searches) {
    // The retry shares the task's caps with the first pass.
    pass = await runResearchPass({
      system, type: run.task_type, endBy: startedAt + RETRY_BUDGET_MS, used: { searches: pass.searches, pages: pass.pagesRead },
      user: `${ask}\n\nSearch the web for this, and base every finding on pages you find: a finding without a source can't be shown to the founder.`,
    });
    await log(pass);
  }
  if (!pass.report) {
    await finishRun(db, run, { status: 'failed', error: `${first} couldn't finish this research just now. Try again in a moment.` }, 'todo');
    return;
  }
  const sources = citedSources(pass.sources);
  if (run.task_type === 'research' && !sources.length) {
    await finishRun(db, run, { status: 'failed', error: `${first} couldn't find sources to back this up, so there's nothing to show. Try again, or add detail to the task.` }, 'todo');
    return;
  }

  const numbered = sources.map((src: Any, i: number) => `[${i + 1}] ${src.title} (${src.url})${src.quote ? `: "${src.quote}"` : ''}`).join('\n');
  // What the founder has said, for checking "your figure" claims.
  const founderText = [context, task.title, task.description, run.redo_notes].filter(Boolean).join('\n');
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/routeAdvisorRequest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify({
      advisor_id: advisor.id, company_id: run.company_id, meeting_id: task.source_meeting_id || null, user_id: run.created_by_id,
      model_override: TASK_MODEL, task_run_id: run.id,
      // The research and the pages it quotes go in the message, not in the
      // system prompt: web text is material to shape, not instructions.
      system_instructions: STRUCTURE_INSTRUCTIONS, company_context: null,
      meeting_context: `THE TASK: ${task.title}${run.task_type === 'calculate' ? `\n\nTHE FOUNDER'S OWN MATERIAL (the only source of their figures):\n${founderText.slice(0, 6000)}` : ''}`,
      user_question: `Put this research into the requested shape.\n\nTHE RESEARCH:\n${pass.report.slice(0, 18000)}\n\nSOURCES (the only pages you may cite, by number):\n${numbered || '(none)'}`,
      previous_responses: [],
      output_schema: SCHEMAS[run.task_type], temperature: 0.2, request_type: 'task_structure',
      deadline_at: startedAt + STRUCTURE_BY_MS,
    }),
    // Never past the sweep's threshold, whatever the call does.
    signal: AbortSignal.timeout(Math.max(5_000, startedAt + STRUCTURE_BY_MS + 5_000 - Date.now())),
  }).catch(() => null);
  if (!res) {
    await finishRun(db, run, { status: 'failed', error: `${first} couldn't finish this just now. Try again in a moment.` }, 'todo');
    return;
  }
  const data = await res.json().catch(() => null);
  const result: Any = res.ok && data?.response
    ? finishResearch(run.task_type, data.response, sources, {
      codeUsed: pass.codeUsed, skipped, incomplete: pass.incomplete, founderText,
      // Both passes count, when there was a retry.
      searches: pass.searches + (pass === firstPass ? 0 : firstPass.searches), pages: pass.pagesRead + (pass === firstPass ? 0 : firstPass.pagesRead),
    }, task)
    : null;
  if (!result) {
    await finishRun(db, run, { status: 'failed', error: run.task_type === 'research'
      ? `${first} couldn't back the findings with sources, so there's nothing to show. Try again in a moment.`
      : `${first} couldn't finish the workings just now. Try again in a moment.` }, 'todo');
    return;
  }
  // Researched on Opus 5.5; put into shape by Sonnet 5.5, or by the
  // advisor's backup model if that call fell back (shown to the founder).
  result.written_by = {
    provider: RESEARCH_MODEL.provider, model: RESEARCH_MODEL.model, intended: RESEARCH_MODEL.model, fallback: false,
    structured_by: data.model_used || null, structured_fallback: !!data.model_used && data.model_used !== TASK_MODEL.model,
  };
  await finishRun(db, run, { status: 'done', result, error: null }, 'review');
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
        company_id: run.company_id, created_by_id: user.id, kind: 'knowledge', category: ({ plan: 'Plan', research: 'Research', calculate: 'Calculation' } as Record<string, string>)[run.task_type] || 'Draft',
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
      // The accepted document is the task's result now: a summary or "sent
      // back" note left by the retired generator goes.
      await db.from('tasks').update({ status: 'done', document_id: doc.id, deliverable: null, delegated_back: false, blocker: null }).eq('id', run.task_id);
      // A task redone after it was accepted: the new version replaces the old
      // one in Knowledge, which is kept but no longer read.
      await db.from('documents').update({ status: 'superseded', is_latest_version: false })
        .eq('task_id', run.task_id).eq('kind', 'knowledge').in('category', BOARD_CATEGORIES).neq('id', doc.id)
        .or('status.is.null,status.not.in.(archived,superseded)');
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
