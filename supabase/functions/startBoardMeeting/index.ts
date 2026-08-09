import { createClient } from 'jsr:@supabase/supabase-js@2';
import { embedText } from '../_shared/embeddings.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function buildContext(company, documents, decisions, meetings, projects, commitments, maxSize) {
  let ctx = `Company: ${company.name || 'N/A'}\nIndustry: ${company.industry || 'N/A'}\n`;
  ctx += `Description: ${company.description || company.tagline || 'N/A'}\n`;
  if (company.tagline) ctx += `Tagline: ${company.tagline}\n`;
  if (company.priorities?.length) ctx += `Strategic Priorities: ${company.priorities.join(', ')}\n`;
  if (company.metrics?.length) ctx += `Key Metrics: ${company.metrics.map(m => `${m.label}: ${m.value} (${m.trend})`).join(', ')}\n`;
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
    ctx += `Raise these only where they bear on the question — an overdue commitment may be worth asking about directly, a recent one usually is not. This meeting's own opening already covers outstanding commitments as a status check; you do not need to force one in here if it does not fit.\n`;
  }
  if (documents?.length) {
    ctx += `\nRelevant Documents:\n`;
    documents.slice(0, 10).forEach(d => { ctx += `- ${d.title} (${d.category}): ${(d.content || '').slice(0, 400)}\n`; });
  }
  if (ctx.length > maxSize) ctx = ctx.slice(0, maxSize) + '... [truncated]';
  return ctx;
}

// A commitment is a task the founder explicitly took on after a board meeting.
// Advisors get the full list with an age on each, rather than a hard cutoff, so
// they can judge for themselves when something is worth raising.
const OVERDUE_AFTER_DAYS = 14;

async function loadOpenCommitments(db, companyId) {
  const { data, error } = await db.from('tasks')
    .select('title, status, created_at, board_meetings!inner(question)')
    .eq('company_id', companyId)
    .not('source_meeting_id', 'is', null)
    .neq('status', 'done')
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) {
    console.error('Could not load open commitments:', error.message);
    return [];
  }
  const now = Date.now();
  return (data || []).map(t => ({
    title: t.title,
    status: t.status,
    days_open: Math.max(0, Math.floor((now - new Date(t.created_at).getTime()) / 86400000)),
    meeting_question: t.board_meetings?.question || 'a previous meeting',
  }));
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

// The Chair opens with what has changed since the last meeting: work
// finished, how the founder responded to the last resolution, and — this is
// the one place accountability follow-up is reliable — outstanding
// commitments. Unlike the per-advisor context (competing against whatever the
// founder actually asked this time), this is the Chair's own dedicated
// moment, so a mandatory, direct ask about overdue items has somewhere to
// live instead of losing out to the day's actual question.
async function buildChairOpening({ supabaseUrl, serviceKey, db, chairAdvisor, company, companyId, userId, meetingId, newQuestion, previousMeeting, commitments }) {
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
  } else {
    prompt += `\nNothing has been marked done since then.\n`;
  }
  const overdue = (commitments || []).filter(c => c.days_open >= OVERDUE_AFTER_DAYS);
  const notYetOverdue = (commitments || []).filter(c => c.days_open < OVERDUE_AFTER_DAYS);
  if (overdue.length) {
    prompt += `\nStill outstanding and overdue:\n`;
    overdue.forEach(c => { prompt += `- "${c.title}" — ${c.days_open} days, from the meeting on "${c.meeting_question}"\n`; });
    prompt += `\nThis is mandatory, not optional: your opening_statement text must literally contain each overdue item's exact title in quotes, immediately followed by a direct question about it. Curious, not accusatory — "What happened with '${overdue[0].title}' — did priorities shift, or did it just not get done?" is the right shape. A vague "I'd like to follow up on outstanding items" is NOT acceptable — name it.\n`;
    prompt += `List every overdue title you named in overdue_items_named — it must exactly match commitments_raised.length === the number of overdue items above.\n`;
  }
  if (notYetOverdue.length) {
    prompt += `\nAlso still open, not yet overdue (mention only if it fits naturally, no need to chase):\n`;
    notYetOverdue.forEach(c => { prompt += `- "${c.title}" — ${c.days_open} days\n`; });
  }
  if (!completedTasks.length && !overdue.length && !notYetOverdue.length) {
    prompt += `\nThere is nothing notable to report since last time — a short, honest "quiet since we last met" is fine.\n`;
  }
  prompt += `\nKeep the whole thing to 2-4 sentences, your own voice as Chair, no filler, and no mention of today's actual question.`;

  const schema = {
    type: 'object',
    properties: {
      opening_statement: { type: 'string' },
      overdue_items_named: { type: 'array', items: { type: 'string' }, description: 'Exact titles of every overdue commitment named in opening_statement — must match the overdue list exactly, empty array if none were overdue.' },
    },
    required: ['opening_statement', 'overdue_items_named'],
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
    if (!res.ok || !data.response) return null;
    // If the model claims it named the overdue items but didn't actually
    // include their titles verbatim, don't ship a statement that only
    // pretends to be specific — better to surface nothing than a vague one.
    const stated = data.response.opening_statement || null;
    if (overdue.length && stated) {
      const namedAll = overdue.every(c => stated.includes(c.title));
      if (!namedAll) {
        console.error('Chair opening dropped: claimed to name overdue items but did not include their exact titles.');
        return null;
      }
    }
    return stated;
  } catch (e) {
    console.error('Chair opening failed (non-fatal):', e.message);
    return null;
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

    const [{ data: documents }, { data: meetings }, { data: projects }, { data: advisors }, recalled, commitments] = await Promise.all([
      db.from('documents').select('*').eq('company_id', company_id).order('created_at', { ascending: false }).limit(20),
      db.from('board_meetings').select('*').eq('company_id', company_id).order('created_at', { ascending: false }).limit(5),
      db.from('projects').select('*').eq('company_id', company_id).order('created_at', { ascending: false }).limit(10),
      db.from('advisors').select('*').eq('company_id', company_id).limit(100),
      recallRelatedDecisions(db, company_id, question),
      loadOpenCommitments(db, company_id),
    ]);
    const decisions = recalled.decisions;

    const selectedAdvisors = (advisors || []).filter(a => advisor_ids.includes(a.id) && a.type !== 'human');
    if (selectedAdvisors.length < minAdv)
      return Response.json({ error: 'Not enough AI advisors selected' }, { status: 400, headers: corsHeaders });

    const contextPackage = buildContext(company, documents, decisions, meetings, projects, commitments, limits.max_context_size || 8000);

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
        missing_information: { type: 'array', items: { type: 'string' } },
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
        meetingId: meeting.id, newQuestion: question, previousMeeting, commitments,
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
