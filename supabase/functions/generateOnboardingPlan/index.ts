// generateOnboardingPlan — the very first LLM call a founder ever triggers,
// right after the (now 4-question) onboarding form. Runs as the Chair
// persona via routeAdvisorRequest's advisor_override, since no company or
// advisor row exists yet at this point. The client (src/lib/onboarding.js)
// validates recommended advisor keys against the authoritative ADVISOR_LIBRARY
// and falls back to a heuristic plan if this call fails outright — this
// function's only job is to produce a genuinely personalised plan when it can.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { PRODUCT_NAME } from '../_shared/branding.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Compact mirror of src/lib/advisorLibrary.js (key, name, role, expertise only)
// — enough for the LLM to pick sensible keys. The client re-validates every
// returned key against the real library afterward, so drift here is self-healing.
const ADVISOR_OPTIONS = `visionary: Amara Vance, Visionary — Strategy, Fundraising, Category creation
operator: Daniel Okoye, Operator — Operations, Scaling, Hiring
creative_director: Sofia Marchetti, Creative Director — Brand, Design, Creative direction
marketing_director: Priya Nair, Marketing Director — Marketing, Growth, Positioning
cfo: Marcus Chen, Chief Financial Officer — Finance, Fundraising, Unit economics
investor: Eleanor Whitfield, Investor — Venture, Markets, Strategy
product_strategist: Tomas Berg, Product Strategist — Product, UX strategy, Roadmapping
customer_advocate: Grace Bennett, Customer Advocate — Customer success, Support, Loyalty
legal_advisor: Julian Rhodes, Legal Advisor — Legal, Compliance, Contracts
scientist: Dr. Lena Fisher, Scientist — R&D, Data, Innovation
supply_chain: Rafael Duarte, Supply Chain Expert — Supply chain, Manufacturing, Logistics
people_culture: Naomi Clarke, People & Culture Director — People, Culture, Organisation design
innovation_director: Kai Nakamura, Innovation Director — Innovation, New ventures, Emerging tech
risk_analyst: Helena Vogt, Risk Analyst — Risk, Strategy, Analysis
capital_allocator: Warren Bishop, Capital Allocator — Value investing, Capital allocation, Mergers & acquisitions
ai_expert: Dr. Aris Chen, AI Strategist — Artificial intelligence, Machine learning, Data strategy
elon_musk: Elon Musk, Founder & Technologist — Engineering, Manufacturing, Frontier technology
warren_buffett: Warren Buffett, Value Investor — Value investing, Capital allocation, Insurance & float
jeff_bezos: Jeff Bezos, Founder & Builder — E-commerce, Cloud computing, Logistics, Space
rick_rubin: Rick Rubin, Creative Producer — Creative direction, Artistic vision, Taste
contrarian: Victor Hale, Contrarian — Critical thinking, Risk assessment, Strategy`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    company_type: { type: 'string', description: "A short label for the type of company, e.g. 'DTC Consumer Brand' or 'B2B SaaS Startup' — infer this from whatever the founder shared, even if limited" },
    recommended_journey: {
      type: 'string',
      enum: ['idea_validation', 'pre_launch', 'early_revenue', 'growth', 'fundraising', 'product_launch', 'market_expansion', 'turnaround'],
    },
    executive_briefing: { type: 'string', description: 'A warm, concise 2-3 sentence personalised briefing for the founder' },
    recommended_advisors: {
      type: 'array',
      description: '4 to 6 advisors from the provided library, including the chair',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Must be one of the valid advisor keys provided' },
          name: { type: 'string' },
          role: { type: 'string' },
          reason: { type: 'string', description: 'One sentence explaining why this advisor is recommended for this specific founder' },
        },
      },
    },
    suggested_meetings: {
      type: 'array',
      description: 'Exactly 3 strategic questions the founder should bring to their board',
      items: { type: 'string' },
    },
    suggested_tasks: {
      type: 'array',
      description: '3 to 5 concrete first tasks',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          assigned_to: { type: 'string', description: "The advisor role or 'Founder'" },
        },
      },
    },
    start_here_action: { type: 'string', description: 'One clear, specific primary action the founder should take first' },
  },
  required: ['company_type', 'recommended_journey', 'executive_briefing', 'recommended_advisors', 'suggested_meetings', 'suggested_tasks', 'start_here_action'],
};

function buildPrompt(answers: Record<string, unknown>) {
  const answersText = Object.entries(answers || {})
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
    .join('\n');

  return `You are an expert startup coach helping a founder set up their AI executive board on ${PRODUCT_NAME}.

Here is what the founder has shared — it may be brief, since onboarding is deliberately short. Work with what's here rather than assuming more detail than was given:
${answersText}

Available advisors (use ONLY these keys):
${ADVISOR_OPTIONS}

Based on the founder's situation, generate a personalised onboarding plan:
1. Recommend 4–6 advisors (always include "chair" — Margaret Ashworth synthesises the board). Pick advisors whose expertise directly addresses the founder's stage and challenge.
2. Write a warm, specific reason for each recommendation — tie it to what the founder shared.
3. Suggest exactly 3 strategic questions for their first board meetings.
4. Suggest 3–5 concrete first tasks. Assign each to the most relevant advisor role or "Founder".
5. Give ONE clear primary action labelled as the start_here_action — the single most important thing to do first.
6. Write a warm 2-3 sentence executive briefing that makes the founder feel understood and supported.
7. Classify the company type in a short label.
8. Choose the recommended_journey that best fits their current stage.

Be specific and personal where the founder gave you something specific to work with. Where they didn't, stay general rather than inventing detail they never gave you — never fabricate facts about their business. Never use placeholder text.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } }
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const { answers } = await req.json();
    if (!answers) return Response.json({ error: 'answers is required' }, { status: 400, headers: corsHeaders });

    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/routeAdvisorRequest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({
        advisor_override: {
          name: 'Margaret Ashworth',
          role: 'The Chair',
          system_instructions: 'You are Margaret Ashworth, a veteran board chair. Right now you are not chairing a debate — you are meeting a brand-new founder for the first time and assembling their board. Be warm, precise and genuinely personal to what they told you.',
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
          temperature: 0.7, maximum_output_length: 3000,
        },
        user_id: user.id,
        user_question: buildPrompt(answers),
        previous_responses: [],
        output_schema: RESPONSE_SCHEMA,
        temperature: 0.7,
        max_output_length: 3000,
        request_type: 'onboarding_plan',
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.response) {
      return Response.json({ error: data.error || 'Could not generate a plan right now.' }, { status: 503, headers: corsHeaders });
    }

    return Response.json(data.response, { headers: corsHeaders });
  } catch (error) {
    console.error('generateOnboardingPlan error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
