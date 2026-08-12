import { createClient } from 'jsr:@supabase/supabase-js@2';
import { embedText } from '../_shared/embeddings.ts';
import { loadOpenCommitments, OVERDUE_AFTER_DAYS } from '../_shared/commitments.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// The founder never gave us these — onboarding is deliberately short now.
// Rather than a form, the board recovers them in conversation, only when
// they'd actually change the answer. See buildContext's gap block below.
const PROFILE_GAPS = [
  { key: 'industry', label: 'what industry they\'re in' },
  { key: 'business_model', label: 'how the business makes money' },
  { key: 'solo_founder', label: 'whether they\'re building alone or with a team' },
  { key: 'team_size', label: 'how big the team is' },
  { key: 'target_customer', label: 'who the target customer is' },
  { key: 'primary_market', label: 'the primary market or geography' },
  { key: 'available_capital', label: 'what capital is available' },
  { key: 'available_time', label: 'how much time they can commit' },
  { key: 'existing_assets', label: 'what they already have (prototype, customers, IP)' },
  { key: 'immediate_goal', label: 'their most immediate goal' },
  { key: 'confidence_gaps', label: 'where they lack confidence' },
  { key: 'deadlines', label: 'any important deadlines' },
  { key: 'country', label: 'which country they\'re registering the business in' },
];

// The founder's Progression Tree, summarised for the board — completed
// items plus the next few not-yet ones, by order_index. Reuses the same
// "mention if relevant, don't force it in" instruction pattern as the
// commitments block above, since most questions won't touch it.
async function loadProgressionSummary(db, companyId) {
  const { data: tree } = await db.from('progression_trees').select('id').eq('company_id', companyId).maybeSingle();
  if (!tree) return null;
  const { data: nodes } = await db.from('progression_nodes').select('id, label').eq('tree_id', tree.id).order('order_index');
  if (!nodes?.length) return null;
  const { data: completions } = await db.from('progression_node_completions').select('node_id').eq('company_id', companyId);
  const doneIds = new Set((completions || []).map(c => c.node_id));
  return {
    completed: nodes.filter(n => doneIds.has(n.id)).map(n => n.label),
    next: nodes.filter(n => !doneIds.has(n.id)).slice(0, 3).map(n => n.label),
  };
}

function buildContext(company, documents, decisions, meetings, projects, commitments, progression, maxSize) {
  let ctx = `Company: ${company.name || 'N/A'}\nIndustry: ${company.industry || 'N/A'}\n`;
  ctx += `Description: ${company.description || company.tagline || 'N/A'}\n`;
  if (company.tagline) ctx += `Tagline: ${company.tagline}\n`;
  if (company.priorities?.length) ctx += `Strategic Priorities: ${company.priorities.join(', ')}\n`;
  if (company.metrics?.length) ctx += `Key Metrics: ${company.metrics.map(m => `${m.label}: ${m.value} (${m.trend})`).join(', ')}\n`;
  const gaps = PROFILE_GAPS.filter(g => !company[g.key]);
  if (gaps.length) {
    ctx += `\nNot yet on file about this company (onboarding is short by design — the board fills these in over time):\n`;
    gaps.forEach(g => { ctx += `- ${g.label} [profile_field: "${g.key}"]\n`; });
    ctx += `If knowing one of these would materially change your answer, ask the founder directly in your response and report it in missing_information with the exact profile_field key. Don't force one in if it isn't actually relevant to this question — most won't be.\n`;
  }
  if (progression?.completed?.length || progression?.next?.length) {
    ctx += `\nProgress on the founder's path (their Progression Tree):\n`;
    if (progression.completed.length) ctx += `Already unlocked: ${progression.completed.join(', ')}\n`;
    if (progression.next.length) ctx += `Next up: ${progression.next.join(', ')}\n`;
    ctx += `Reference it explicitly if directly relevant to this question — e.g. this question depends on something not yet unlocked, or the answer should build on something they just achieved. Don't force it in if it isn't relevant — most questions won't touch it.\n`;
  }
  if (decisions?.length) {
    ctx += `\nPast decisions related to this question (most relevant first):\n`;
    decisions.slice(0, 5).forEach(d => {
      const when = d.created_at ? new Date(d.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'date unknown';
      ctx += `- [${when}] ${d.question}: ${d.final_recommendation || d.summary || 'N/A'}\n`;
    });
    ctx += `MEMORY PRINCIPLE — this is mandatory, not optional:\n`;
    ctx += `- You MUST state explicitly whether your recommendation is consistent with these past decisions or departs from them.\n`;
    ctx += `- If it departs, say so directly, name the decision, and explain what has changed to justify reversing it. A board that quietly contradicts its own past decisions is worse than useless.\n`;
    ctx += `- If it is consistent, say which decision it builds on.\n`;
    ctx += `- If none of them genuinely bear on this question, say that explicitly rather than staying silent.\n`;
  }
  if (meetings?.length) {
    ctx += `\nPrevious Board Meetings:\n`;
    meetings.slice(0, 3).forEach(m => { ctx += `- Q: ${m.question} -> ${m.recommendation || m.executive_summary || 'N/A'}\n`; });
  }
  if (projects?.length) {
    ctx += `\nActive Projects:\n`;
    projects.slice(0, 5).forEach(p => { ctx += `- ${p.name} (${p.status}): ${p.description || ''}\n`; });
  }
  if (commitments?.length) {
    ctx += `\nOutstanding commitments the founder made after previous board meetings:\n`;
    commitments.forEach(c => {
      const overdue = c.days_open >= OVERDUE_AFTER_DAYS ? ' [OVERDUE]' : '';
      ctx += `- "${c.title}" — agreed ${c.days_open} day${c.days_open === 1 ? '' : 's'} ago after the meeting on "${c.meeting_question}", still not done${overdue}\n`;
    });
    ctx += `Raise these only where they bear on the question — an overdue commitment may be worth asking about directly, a recent one usually is not.\n`;
  }
  if (documents?.length) {
    ctx += `\nRelevant Documents:\n`;
    documents.slice(0, 10).forEach(d => { ctx += `- ${d.title} (${d.category}): ${(d.content || '').slice(0, 400)}\n`; });
  }
  if (ctx.length > maxSize) ctx = ctx.slice(0, maxSize) + '... [truncated]';
  return ctx;
}

// Board memory: find past decisions related to the question being asked, rather
// than merely the most recent ones. Falls back to recency when the question
// cannot be embedded or nothing clears the similarity floor, so a board meeting
// never fails because memory is unavailable.
async function recallRelatedDecisions(db, companyId, question) {
  let recencyFallback = [];
  try {
    const { data } = await db.from('decisions').select('*')
      .eq('company_id', companyId).order('created_at', { ascending: false }).limit(10);
    recencyFallback = data || [];
  } catch { /* fall through with an empty list */ }

  try {
    const embedding = await embedText(question);
    const { data: matches, error } = await db.rpc('match_decisions', {
      p_company_id: companyId,
      p_query_embedding: JSON.stringify(embedding),
      p_match_count: 5,
    });
    if (error) throw new Error(error.message);
    if (matches?.length) return { decisions: matches, retrieval: 'relevance' };
  } catch (e) {
    console.error('Relevance recall failed, falling back to recency:', e.message);
  }
  return { decisions: recencyFallback, retrieval: 'recency' };
}

// Tasks the founder actually finished since the last meeting — the raw
// material for the Chair's opening. Distinct from open commitments (which are
// what's still outstanding); this is what moved.
async function loadRecentlyCompletedTasks(db, companyId, sinceIso) {
  if (!sinceIso) return [];
  const { data } = await db.from('tasks')
    .select('title, source_meeting_id, updated_at')
    .eq('company_id', companyId).eq('status', 'done')
    .gt('updated_at', sinceIso)
    .order('updated_at', { ascending: false }).limit(20);
  return data || [];
}

// Deterministic, non-LLM fallback — used only if the model's own phrasing
// fails to verify below. Always names the work, whether or not the model's
// wording checks out; this is the retention mechanic, so it must never
// silently disappear the way an unverified overdue-chase used to.
function templatedCompletedRecap(completedTasks) {
  const titles = completedTasks.map((t) => `"${t.title}"`).join(', ');
  return `Since we last met, the board saw progress on: ${titles}.`;
}

// The Chair opens with what has changed since the last meeting: work
// finished, and how the founder responded to the last resolution. This used
// to also chase overdue commitments directly — that's moved to the
// Assistant (Phase E, prepareAccountabilityChases), which can raise it
// proactively between meetings rather than only when a new one starts, and
// avoids two voices nagging about the same thing. This opening now stays
// pure recap and acknowledgment — the continuity differentiator made
// visible ("the board remembers"), never a chase.
async function buildChairOpening({ supabaseUrl, serviceKey, db, chairAdvisor, company, companyId, userId, meetingId, newQuestion, previousMeeting }) {
  if (!previousMeeting) return null; // first meeting ever — nothing to open with
  const completedTasks = await loadRecentlyCompletedTasks(db, companyId, previousMeeting.created_at);

  let prompt = `You are opening this board meeting for ${company.name}, before the founder's actual question is addressed.\n\n`;
  prompt += `IMPORTANT: today's question is "${newQuestion}" — do NOT discuss, answer, or reference it. That is the rest of the board's job, not yours here. Your only job is a brief status check on what has happened since the last meeting.\n\n`;
  prompt += `Last meeting's question was: "${previousMeeting.question}" (already resolved — do not re-litigate it, only reference what came after it).\n`;
  if (previousMeeting.founder_decision && previousMeeting.founder_decision !== 'undecided') {
    prompt += `The founder's response to that resolution: ${previousMeeting.founder_decision}${previousMeeting.founder_decision_notes ? ` — "${previousMeeting.founder_decision_notes}"` : ''}\n`;
  }
  if (completedTasks.length) {
    prompt += `\nCompleted since then:\n`;
    completedTasks.forEach(t => { prompt += `- ${t.title}\n`; });
    prompt += `\nThis is mandatory, not optional: your opening_statement text must literally contain each completed item's exact title in quotes — this is the board demonstrating it remembers and noticed, not a vague "good progress." A generic "you've been busy" is NOT acceptable — name every item above.\n`;
  } else {
    prompt += `\nNothing has been marked done since then — a short, honest "quiet since we last met" is fine. Do not invent progress that didn't happen.\n`;
  }
  prompt += `\nKeep the whole thing to 2-4 sentences, your own voice as Chair, no filler, and no mention of today's actual question. Never chase, never ask about outstanding or overdue items — that is handled elsewhere now; this is acknowledgment only.`;

  const schema = {
    type: 'object',
    properties: { opening_statement: { type: 'string' } },
    required: ['opening_statement'],
  };

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/routeAdvisorRequest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        advisor_id: chairAdvisor.id, company_id: companyId, meeting_id: meetingId, user_id: userId,
        system_instructions: chairAdvisor.system_instructions, company_context: null, meeting_context: null,
        user_question: prompt, previous_responses: [], output_schema: schema,
        temperature: 0.4, max_output_length: 500, request_type: 'chair_opening',
      }),
    });
    const data = await res.json();
    const stated = res.ok ? (data.response?.opening_statement || null) : null;

    // If the model claims it named the completed items but didn't actually
    // include their titles verbatim, don't ship a statement that only
    // pretends to be specific — fall back to a deterministic recap built
    // directly from the known titles rather than losing the acknowledgment
    // entirely (unlike the old overdue-chase, which could safely discard to
    // null since chasing was optional — recap is the retention mechanic).
    if (completedTasks.length) {
      const namedAll = !!stated && completedTasks.every(t => stated.includes(t.title));
      if (!namedAll) {
        console.error('Chair opening fell back to templated recap: model did not name every completed item verbatim.');
        return templatedCompletedRecap(completedTasks);
      }
    }
    return stated;
  } catch (e) {
    console.error('Chair opening failed, falling back to templated recap if there is work to name:', e.message);
    return completedTasks.length ? templatedCompletedRecap(completedTasks) : null;
  }
}

async function callAdvisor(supabaseUrl, serviceKey, payload) {
  const res = await fetch(`${supabaseUrl}/functions/v1/routeAdvisorRequest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `routeAdvisorRequest failed (${res.status})`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY'),
      { global: { headers: { Authorization: req.headers.get('Authorization') } } }
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const db = createClient(supabaseUrl, serviceKey);

    const { company_id, question, advisor_ids } = await req.json();
    if (!company_id || !question?.trim() || !advisor_ids?.length)
      return Response.json({ error: 'company_id, question and advisor_ids are required' }, { status: 400, headers: corsHeaders });

    const { data: limitsList } = await db.from('system_limits').select('*').order('created_at', { ascending: false }).limit(1);
    const limits = limitsList?.[0] || { max_advisors_per_meeting: 5, min_advisors_per_meeting: 3, max_context_size: 8000 };
    const minAdv = limits.min_advisors_per_meeting || 3;

    if (advisor_ids.length < minAdv)
      return Response.json({ error: `Select at least ${minAdv} advisors` }, { status: 400, headers: corsHeaders });

    const { data: company } = await db.from('companies').select('*').eq('id', company_id).single();
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404, headers: corsHeaders });

    const [{ data: documents }, { data: meetings }, { data: projects }, { data: advisors }, recalled, commitments, progression] = await Promise.all([
      db.from('documents').select('*').eq('company_id', company_id).order('created_at', { ascending: false }).limit(20),
      db.from('board_meetings').select('*').eq('company_id', company_id).order('created_at', { ascending: false }).limit(5),
      db.from('projects').select('*').eq('company_id', company_id).order('created_at', { ascending: false }).limit(10),
      db.from('advisors').select('*').eq('company_id', company_id).limit(100),
      recallRelatedDecisions(db, company_id, question),
      loadOpenCommitments(db, company_id),
      loadProgressionSummary(db, company_id),
    ]);
    const decisions = recalled.decisions;

    const selectedAdvisors = (advisors || []).filter(a => advisor_ids.includes(a.id) && a.type !== 'human');
    if (selectedAdvisors.length < minAdv)
      return Response.json({ error: 'Not enough AI advisors selected' }, { status: 400, headers: corsHeaders });

    const contextPackage = buildContext(company, documents, decisions, meetings, projects, commitments, progression, limits.max_context_size || 8000);

    // What the board is drawing on, recorded so the founder can see it later.
    const memoryContext = {
      retrieval: recalled.retrieval,
      recalled_decisions: (decisions || []).slice(0, 5).map(d => ({
        id: d.id,
        question: d.question,
        decided_at: d.created_at,
        similarity: d.similarity ?? null,
      })),
      open_commitments: (commitments || []).map(c => ({
        title: c.title,
        days_open: c.days_open,
        overdue: c.days_open >= OVERDUE_AFTER_DAYS,
        meeting_question: c.meeting_question,
      })),
    };

    const { data: meeting, error: createErr } = await db.from('board_meetings').insert({
      company_id, created_by_id: user.id, question, participants: selectedAdvisors.map(a => a.name),
      status: 'preparing', independent_responses: [], challenge_responses: [],
      memory_context: memoryContext,
    }).select().single();
    if (createErr) throw createErr;

    const independentSchema = {
      type: 'object',
      properties: {
        position: { type: 'string', description: 'Your overall position on the question' },
        recommendation: { type: 'string', description: 'Your specific recommendation' },
        key_arguments: { type: 'array', items: { type: 'string' } },
        assumptions: { type: 'array', items: { type: 'string' } },
        risks: { type: 'array', items: { type: 'string' } },
        missing_information: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              detail: { type: 'string', description: 'The gap, phrased as a direct question to the founder' },
              profile_field: { type: 'string', description: 'The exact profile_field key from the "Not yet on file" list above, only if this gap is one of those — omit entirely otherwise' },
            },
            required: ['detail'],
          },
        },
        suggested_actions: { type: 'array', items: { type: 'string' } },
        confidence_score: { type: 'number', description: '0-100' },
      },
      required: ['position', 'recommendation', 'key_arguments', 'confidence_score'],
    };

    // The company's standing Chair persona, regardless of whether they were
    // specifically selected for this debate — matches how runChairSynthesis
    // resolves the Chair for the final resolution.
    let chairAdvisor = (advisors || []).find(a => a.library_key === 'chair' || (a.role || '').toLowerCase().includes('chair'));
    if (!chairAdvisor) chairAdvisor = selectedAdvisors[0];
    const previousMeeting = meetings?.[0] || null;

    const [independentResults, chairOpening] = await Promise.all([
      Promise.all(selectedAdvisors.map(advisor =>
        callAdvisor(supabaseUrl, serviceKey, {
          advisor_id: advisor.id, company_id, meeting_id: meeting.id, user_id: user.id,
          system_instructions: advisor.system_instructions, company_context: contextPackage,
          user_question: question, previous_responses: [], output_schema: independentSchema,
          temperature: advisor.temperature, max_output_length: advisor.maximum_output_length,
          request_type: 'independent',
        }).then(data => ({ advisor, data })).catch(err => ({ advisor, error: err.message }))
      )),
      buildChairOpening({
        supabaseUrl, serviceKey, db, chairAdvisor, company, companyId: company_id, userId: user.id,
        meetingId: meeting.id, newQuestion: question, previousMeeting,
      }),
    ]);

    const independentResponses = independentResults.map(r => {
      const d = r.data;
      if (r.error || !d?.response) {
        return {
          advisor_id: r.advisor.id, advisor_name: r.advisor.name, role: r.advisor.role,
          provider_used: d?.provider_used || null, model_used: d?.model_used || null, used_fallback: d?.used_fallback || false,
          position: 'This advisor was temporarily unavailable.', recommendation: 'No recommendation available.',
          key_arguments: [], assumptions: [], risks: [], missing_information: [], suggested_actions: [], confidence_score: 0,
          unavailable: true,
        };
      }
      const resp = d.response;
      return {
        advisor_id: r.advisor.id, advisor_name: r.advisor.name, role: r.advisor.role,
        provider_used: d.provider_used, model_used: d.model_used, used_fallback: d.used_fallback,
        position: resp.position || '', recommendation: resp.recommendation || '',
        key_arguments: resp.key_arguments || [], assumptions: resp.assumptions || [],
        risks: resp.risks || [], missing_information: resp.missing_information || [],
        suggested_actions: resp.suggested_actions || [], confidence_score: resp.confidence_score || 0,
      };
    });

    await db.from('board_meetings').update({
      status: 'independent_complete', independent_responses: independentResponses,
      chair_opening: chairOpening,
    }).eq('id', meeting.id);

    return Response.json({
      meeting_id: meeting.id, status: 'independent_complete',
      independent_responses: independentResponses,
      advisor_names: selectedAdvisors.map(a => a.name),
      memory_context: memoryContext,
      chair_opening: chairOpening,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('startBoardMeeting error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
