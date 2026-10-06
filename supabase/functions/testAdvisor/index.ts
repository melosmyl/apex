import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callWithFallback, usageTotals, insertUsageLog, CALL_DEADLINE_MS } from '../_shared/llmCall.ts';
import { policyFor } from '../_shared/callPolicy.ts';
import { buildSystemPrompt, buildUserPrompt } from '../_shared/advisorPrompt.ts';
import { ADMIN_TEST_SCHEMA } from '../_shared/answerSchemas.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Main Handler ───────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const startedAt = Date.now();

  try {
    // Client scoped to the caller's own session — used only to check who they are.
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY'),
      { global: { headers: { Authorization: req.headers.get('Authorization') } } }
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    // Service-role client — bypasses RLS, used for all the actual data access below.
    const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403, headers: corsHeaders });

    const { advisor_id, question, company_id } = await req.json();
    if (!advisor_id || !question)
      return Response.json({ error: 'advisor_id and question are required' }, { status: 400, headers: corsHeaders });

    const { data: advisor, error: advErr } = await db.from('advisors').select('*').eq('id', advisor_id).single();
    if (advErr || !advisor) return Response.json({ error: 'Advisor not found' }, { status: 404, headers: corsHeaders });

    let companyContext = '';
    if (company_id) {
      const { data: company } = await db.from('companies').select('*').eq('id', company_id).single();
      if (company) companyContext = `Company: ${company.name}\nIndustry: ${company.industry || 'N/A'}\nDescription: ${company.description || ''}`;
    }

    const { data: limitsList } = await db.from('system_limits').select('*').order('created_at', { ascending: false }).limit(1);
    const limits = limitsList?.[0] || { retry_count: 1 };
    const retryCount = limits.retry_count ?? 1;
    const temp = advisor.temperature ?? 0.7;

    const provider = advisor.default_provider || 'openai';
    const model = advisor.default_model || 'gpt-4o';
    const fbProvider = advisor.fallback_provider;
    const fbModel = advisor.fallback_model;

    // The same prompt and call rules a meeting's Round 1 uses.
    const systemPrompt = buildSystemPrompt(advisor, null, companyContext, null, true);
    const userPrompt = buildUserPrompt(question);

    const { result, attempts, lastError } = await callWithFallback({
      provider, model, fbProvider, fbModel, systemPrompt, userPrompt, outputSchema: ADMIN_TEST_SCHEMA,
      policy: policyFor('admin_test')!, temperature: temp, retryCount,
      deadlineAt: startedAt + CALL_DEADLINE_MS,
    });

    const totals = usageTotals(attempts);
    await insertUsageLog(db, {
      user_id: user.id, company_id: company_id || null, advisor_id,
      provider: result ? result.provider_used : provider, model: result ? result.model_used : model,
      request_type: 'admin_test',
      input_size: totals.input, output_size: totals.output, thinking_size: totals.thinking, estimated_cost: totals.cost,
      latency_ms: result ? result.latency_ms : Date.now() - startedAt,
      status: result ? (result.used_fallback ? 'fallback_used' : 'success') : 'error',
      error_code: !result ? lastError : null,
      attempts,
    });

    if (!result)
      return Response.json({ error: 'This advisor was temporarily unavailable.', detail: lastError }, { status: 503, headers: corsHeaders });

    return Response.json({
      advisor_name: advisor.name,
      provider_used: result.provider_used,
      model_used: result.model_used,
      used_fallback: result.used_fallback,
      latency_ms: result.latency_ms,
      response: result.response,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('test-advisor error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
