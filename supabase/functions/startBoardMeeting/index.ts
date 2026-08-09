import { createClient } from 'jsr:@supabase/supabase-js@2';
import { embedText } from '../_shared/embeddings.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function buildContext(company, documents, decisions, meetings, projects, maxSize) {
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
    ctx += `You may refer to these directly if they bear on the question.\n`;
  }
  if (meetings?.length) {
    ctx += `\nPrevious Board Meetings:\n`;
    meetings.slice(0, 3).forEach(m => { ctx += `- Q: ${m.question} -> ${m.recommendation || m.executive_summary || 'N/A'}\n`; });
  }
  if (projects?.length) {
    ctx += `\nActive Projects:\n`;
    projects.slice(0, 5).forEach(p => { ctx += `- ${p.name} (${p.status}): ${p.description || ''}\n`; });
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

    const [{ data: documents }, { data: meetings }, { data: projects }, { data: advisors }, recalled] = await Promise.all([
      db.from('documents').select('*').eq('company_id', company_id).order('created_at', { ascending: false }).limit(20),
      db.from('board_meetings').select('*').eq('company_id', company_id).order('created_at', { ascending: false }).limit(5),
      db.from('projects').select('*').eq('company_id', company_id).order('created_at', { ascending: false }).limit(10),
      db.from('advisors').select('*').eq('company_id', company_id).limit(100),
      recallRelatedDecisions(db, company_id, question),
    ]);
    const decisions = recalled.decisions;

    const selectedAdvisors = (advisors || []).filter(a => advisor_ids.includes(a.id) && a.type !== 'human');
    if (selectedAdvisors.length < minAdv)
      return Response.json({ error: 'Not enough AI advisors selected' }, { status: 400, headers: corsHeaders });

    const contextPackage = buildContext(company, documents, decisions, meetings, projects, limits.max_context_size || 8000);

    const { data: meeting, error: createErr } = await db.from('board_meetings').insert({
      company_id, created_by_id: user.id, question, participants: selectedAdvisors.map(a => a.name),
      status: 'preparing', independent_responses: [], challenge_responses: [],
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

    const independentResults = await Promise.all(selectedAdvisors.map(advisor =>
      callAdvisor(supabaseUrl, serviceKey, {
        advisor_id: advisor.id, company_id, meeting_id: meeting.id, user_id: user.id,
        system_instructions: advisor.system_instructions, company_context: contextPackage,
        user_question: question, previous_responses: [], output_schema: independentSchema,
        temperature: advisor.temperature, max_output_length: advisor.maximum_output_length,
        request_type: 'independent',
      }).then(data => ({ advisor, data })).catch(err => ({ advisor, error: err.message }))
    ));

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
    }).eq('id', meeting.id);

    return Response.json({
      meeting_id: meeting.id, status: 'independent_complete',
      independent_responses: independentResponses,
      advisor_names: selectedAdvisors.map(a => a.name),
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('startBoardMeeting error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
