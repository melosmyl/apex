import { createClient } from 'jsr:@supabase/supabase-js@2';
import { loadModelRegistry, loadAdvisorDefault, resolveApprovedModels } from '../_shared/modelRegistry.ts';
import { callWithFallback, usageTotals, insertUsageLog, CALL_DEADLINE_MS } from '../_shared/llmCall.ts';
import { policyFor, legacyPolicy } from '../_shared/callPolicy.ts';
import { buildSystemPrompt, buildUserPrompt } from '../_shared/advisorPrompt.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// The cheap/fast tier for routine, non-strategic calls (e.g. document-spec
// generation) — never used for board debate or chair synthesis, where
// reasoning quality is the entire product. Configurable via
// ai_model_configurations (purpose='cheap_tier', is_active=true); falls back
// to a hardcoded default so this never breaks if that table is edited to empty.
const DEFAULT_CHEAP_TIER = { provider: 'openai', model: 'gpt-4o-mini' };

async function resolveCheapTier(db) {
  try {
    const { data } = await db.from('ai_model_configurations')
      .select('provider, model_name')
      .eq('purpose', 'cheap_tier').eq('is_active', true)
      .order('created_at', { ascending: false }).limit(1);
    if (data?.length) return { provider: data[0].provider, model: data[0].model_name };
  } catch { /* table may be empty — use the default */ }
  return DEFAULT_CHEAP_TIER;
}

// Output limits for the calls callPolicy.ts leaves as they were (documents
// and the small assistant calls); meeting calls take theirs from the policy.
const MAX_OUTPUT_DEFAULT = 4000;
const MAX_OUTPUT_BY_REQUEST_TYPE = { deliverable_spec: 16000 };

function clamp(n, min, max, fallback) {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const startedAt = Date.now();

  try {
    // Internal-only: this function is called by other backend functions using
    // the service role key as their bearer token, never directly by the frontend.
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (token !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    const { advisor_id, advisor_override, company_id, meeting_id, system_instructions, company_context, meeting_context,
      user_question, previous_responses, output_schema, temperature, max_output_length, request_type, user_id, model_tier, anonymous,
      deadline_at } = await req.json();

    if ((!advisor_id && !advisor_override) || !user_question)
      return Response.json({ error: 'advisor_id (or advisor_override) and user_question are required' }, { status: 400, headers: corsHeaders });

    let advisor;
    if (advisor_id) {
      const { data, error: advErr } = await db.from('advisors').select('*').eq('id', advisor_id).single();
      if (advErr || !data) return Response.json({ error: 'Advisor not found' }, { status: 404, headers: corsHeaders });
      advisor = data;
    } else {
      // No real advisor row exists yet — used only for pre-company calls like onboarding,
      // where the caller supplies a fixed persona inline instead of a DB-backed advisor.
      advisor = {
        name: advisor_override.name, role: advisor_override.role,
        system_instructions: advisor_override.system_instructions, biography: advisor_override.biography,
        decision_style: advisor_override.decision_style, communication_style: advisor_override.communication_style,
        strengths: advisor_override.strengths || [],
        blind_spots: advisor_override.blind_spots || advisor_override.weaknesses || [],
        default_provider: advisor_override.default_provider || 'openai',
        default_model: advisor_override.default_model || 'gpt-4o',
        fallback_provider: advisor_override.fallback_provider,
        fallback_model: advisor_override.fallback_model,
        temperature: advisor_override.temperature,
        maximum_output_length: advisor_override.maximum_output_length,
      };
    }

    const { data: limitsList } = await db.from('system_limits').select('*').order('created_at', { ascending: false }).limit(1);
    const limits = limitsList?.[0] || { retry_count: 1, request_timeout_ms: 60000, max_output_length: 2000 };
    const timeoutMs = limits.request_timeout_ms || 60000;
    const retryCount = limits.retry_count ?? 1;
    // Founders can edit their advisor rows directly, so the model, length and
    // temperature on a row are requests, not instructions: only approved
    // models run, and length and temperature are capped here. Meeting calls
    // ignore the row's length: the policy sets it per provider.
    const temp = clamp(Number(temperature ?? advisor.temperature ?? 0.7), 0, 1, 0.7);
    const policy = policyFor(request_type) ?? legacyPolicy(
      clamp(Number(max_output_length ?? advisor.maximum_output_length ?? limits.max_output_length ?? 2000),
        100, MAX_OUTPUT_BY_REQUEST_TYPE[request_type] ?? MAX_OUTPUT_DEFAULT, 2000),
      timeoutMs);

    const [registry, advisorDefault] = await Promise.all([loadModelRegistry(db), loadAdvisorDefault(db, advisor.library_key)]);
    const { primary, fallback, substitution } = resolveApprovedModels(registry,
      { provider: advisor.default_provider || 'openai', model: advisor.default_model || 'gpt-4o' },
      { provider: advisor.fallback_provider, model: advisor.fallback_model },
      advisorDefault);
    let provider = primary.provider;
    let model = primary.model;
    let fbProvider = fallback?.provider;
    let fbModel = fallback?.model;

    if (model_tier === 'cheap') {
      const cheap = await resolveCheapTier(db);
      // If the cheap tier fails outright, fall back to this advisor's own
      // strong model rather than leaving the call with no fallback at all.
      fbProvider = provider;
      fbModel = model;
      provider = cheap.provider;
      model = cheap.model;
    }

    const systemPrompt = buildSystemPrompt(advisor, system_instructions, company_context, meeting_context);
    const userPrompt = buildUserPrompt(user_question, previous_responses);

    // The caller's own deadline, if earlier: it needs time to save the answer.
    const deadlineAt = Math.min(startedAt + CALL_DEADLINE_MS,
      typeof deadline_at === 'number' && Number.isFinite(deadline_at) ? deadline_at : Infinity);

    const { result, attempts, lastError } = await callWithFallback({
      provider, model, fbProvider, fbModel, systemPrompt, userPrompt, outputSchema: output_schema || null,
      policy, temperature: temp, retryCount, deadlineAt,
    });

    // Tokens and cost cover every attempt (failed ones were billed too);
    // latency is the winning attempt's, or the whole call's when none won.
    const totals = usageTotals(attempts);
    await insertUsageLog(db, {
      user_id: user_id || null, company_id: company_id || null, meeting_id: meeting_id || null, advisor_id: advisor_id || null,
      provider: result ? result.provider_used : provider, model: result ? result.model_used : model,
      request_type: request_type || 'unknown',
      input_size: totals.input, output_size: totals.output, thinking_size: totals.thinking, estimated_cost: totals.cost,
      latency_ms: result ? result.latency_ms : Date.now() - startedAt,
      status: result ? (result.used_fallback ? 'fallback_used' : 'success') : 'error',
      error_code: !result ? lastError : null,
      attempts,
      model_substitution: substitution,
      // Tagged by the caller, which knows the session: the free-meeting
      // ceiling sums these rows (free_meeting_spend_today).
      anonymous: anonymous === true,
    });

    // The real reason travels back too, so callers can record why an
    // advisor was lost instead of only that they were.
    if (!result)
      return Response.json({ error: 'This advisor was temporarily unavailable.', reason: lastError }, { status: 503, headers: corsHeaders });

    return Response.json(result, { headers: corsHeaders });
  } catch (error) {
    console.error('routeAdvisorRequest error:', error);
    return Response.json({ error: 'This advisor was temporarily unavailable.' }, { status: 500, headers: corsHeaders });
  }
});
