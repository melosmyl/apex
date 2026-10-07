// generateOnboardingPlan — the very first LLM call a founder ever triggers,
// right after the (now 4-question) onboarding form. Runs as the Chair
// persona via routeAdvisorRequest's advisor_override, since no company or
// advisor row exists yet at this point. Every new board starts with the same
// six advisors: the client (src/lib/onboarding.js) builds that board itself
// and keeps only the personal reasons written here, falling back to plain
// ones if this call fails — this function's only job is to make the plan
// genuinely personal when it can.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { PRODUCT_NAME } from '../_shared/branding.ts';
import { checkUserLimit, accessErrorResponse, TEXT_LIMITS } from '../_shared/access.ts';
import { CALL_DEADLINE_MS, CALLER_SAVE_MARGIN_MS } from '../_shared/callPolicy.ts';
import { ONBOARDING_SCHEMA } from '../_shared/answerSchemas.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Every new board starts with the same six (owner's decision, B3; the same
// list as STARTING_BOARD_KEYS in src/lib/companyJourney.js). The model only
// writes a personal reason for each; the client builds the board itself.
const STARTING_BOARD = `chair: Margaret Ashworth, The Chair — runs every meeting and writes the resolution
visionary: Amara Vance, Visionary — strategy, fundraising, category creation
marketing_director: Priya Nair, Marketing Director — marketing, growth, positioning
product_strategist: Tomas Berg, Product Strategist — product, UX strategy, roadmapping
ai_expert: Dr. Aris Chen, AI Strategist — artificial intelligence, machine learning, data strategy
customer_advocate: Grace Bennett, Customer Advocate — customer success, support, loyalty`;

function buildPrompt(answers: Record<string, unknown>) {
  const answersText = Object.entries(answers || {})
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
    .join('\n');

  return `You are an expert startup coach helping a founder set up their AI executive board on ${PRODUCT_NAME}.

Here is what the founder has shared — it may be brief, since onboarding is deliberately short. Work with what's here rather than assuming more detail than was given:
${answersText}

Every new board starts with these six advisors:
${STARTING_BOARD}

Based on the founder's situation, generate a personalised onboarding plan:
1. In recommended_advisors, list exactly these six, with these keys, names and roles, in this order. For each, write one warm, specific sentence on why they'll be useful to this founder — tie it to what the founder shared.
2. Suggest exactly 3 strategic questions for their first board meetings.
3. Suggest 3–5 concrete first tasks. Assign each to the most relevant of the six advisors' roles or "Founder".
4. Give ONE clear primary action labelled as the start_here_action — the single most important thing to do first.
5. Write a warm 2-3 sentence executive briefing that makes the founder feel understood and supported.
6. Classify the company type in a short label.
7. Choose the recommended_journey that best fits their current stage.

Be specific and personal where the founder gave you something specific to work with. Where they didn't, stay general rather than inventing detail they never gave you — never fabricate facts about their business. Never use placeholder text.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const startedAt = Date.now();

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } }
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const { answers, attempt_id } = await req.json();
    if (!answers || typeof answers !== 'object') return Response.json({ error: 'answers is required' }, { status: 400, headers: corsHeaders });
    // Everything in answers is pasted into the prompt, so bound it.
    const entries = Object.entries(answers);
    const totalLength = entries.reduce((n, [k, v]) => n + k.length + String(v ?? '').length, 0);
    if (entries.length > 20 || entries.some(([k, v]) => k.length > 40 || String(v ?? '').length > TEXT_LIMITS.onboarding_answer) || totalLength > TEXT_LIMITS.onboarding_total)
      return Response.json({ error: 'Those answers are too long.' }, { status: 400, headers: corsHeaders });

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // Counted before the model call (not from the usage log, which is only
    // written afterwards), so parallel requests can't all slip under it.
    await checkUserLimit(db, user.id, user.is_anonymous ? 'onboarding_plan_anon' : 'onboarding_plan');
    // A free-meeting visitor gets a plan only with the attempt the gate issued
    // to this session, so plan spend can't run ahead of the gate's checks.
    if (user.is_anonymous) {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data: attempt } = attempt_id
        ? await db.from('free_meeting_attempts').select('id').eq('id', attempt_id).eq('user_id', user.id)
          .is('blocked_reason', null).eq('completed', false).gte('started_at', since).maybeSingle()
        : { data: null };
      if (!attempt) return Response.json({ error: 'The free meeting needs to be started from the free meeting page.' }, { status: 403, headers: corsHeaders });
    }

    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/routeAdvisorRequest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({
        advisor_override: {
          name: 'Margaret Ashworth',
          role: 'The Chair',
          system_instructions: 'You are Margaret Ashworth, a veteran board chair. Right now you are not chairing a debate — you are meeting a brand-new founder for the first time and introducing their board. Be warm, precise and genuinely personal to what they told you.',
          decision_style: 'Balanced, synthesising, evidence-weighing',
          communication_style: 'Warm, clear, precise',
          strengths: ['Synthesis', 'Reading a founder\'s real situation quickly'],
          // gpt-4o is primary here, not the usual anthropic-first default.
          // Confirmed deliberate, not an outage artefact: on 2026-08-09, after
          // Anthropic billing was restored and re-verified working (flat
          // schema: 3/4 success), claude-sonnet-5 still failed this exact
          // full onboarding schema 4/4 with "Invalid response format" — a
          // real schema-complexity limit (2 required nested array-of-object
          // fields), not billing. Revisit if the schema is ever simplified.
          default_provider: 'openai', default_model: 'gpt-4o',
          fallback_provider: 'anthropic', fallback_model: 'claude-sonnet-5',
          temperature: 0.7,
        },
        user_id: user.id,
        anonymous: !!user.is_anonymous,
        user_question: buildPrompt(answers),
        previous_responses: [],
        output_schema: ONBOARDING_SCHEMA,
        temperature: 0.7,
        request_type: 'onboarding_plan',
        deadline_at: startedAt + CALL_DEADLINE_MS - CALLER_SAVE_MARGIN_MS,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.response) {
      return Response.json({ error: data.error || 'Could not generate a plan right now.' }, { status: 503, headers: corsHeaders });
    }

    return Response.json(data.response, { headers: corsHeaders });
  } catch (error) {
    const denied = accessErrorResponse(error, corsHeaders);
    if (denied) return denied;
    console.error('generateOnboardingPlan error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
