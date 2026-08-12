// generateProgressionTree — creates a company's Progression Tree right
// after onboarding. Fire-and-forget from the client, same pattern as
// embedNoteInBackground — never blocks the founder reaching their
// dashboard.
//
// Two parts:
//  1. Spine — every company gets the same six hardcoded nodes from
//     progressionSeed.ts, regardless of country. Not LLM-generated at all,
//     sidestepping the flat-schema failure mode entirely (see
//     generateOnboardingPlan's dated comment on 100% failure with nested
//     schemas).
//  2. Branch — UK-only at launch (owner's decision, 2026-08-13). Two small,
//     flat LLM calls per company: one for a handful of topic phrases, then
//     one per topic to expand it into a node. Never one call returning an
//     array of node objects — that would reintroduce the exact shape that
//     failed generateOnboardingPlan. Non-UK companies get a spine-only tree
//     with jurisdiction_supported: false, surfaced honestly in the UI
//     rather than silently degraded.
//
// Idempotent: progression_trees has a unique constraint on company_id, so a
// retry (or a double-fire from the client) just returns the existing tree
// instead of erroring or duplicating nodes.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SPINE_NODES, SPINE_VERSION, getStageMilestones, resolveOfficialSourceUrl, OFFICIAL_SOURCE_LOOKUP } from '../_shared/progressionSeed.ts';
import { callAssistant } from '../_shared/assistantCalls.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPPORTED_JURISDICTIONS = new Set(['United Kingdom']);

// Schema field descriptions must stay short — this whole object gets
// JSON.stringify'd into the system prompt verbatim (routeAdvisorRequest's
// buildSystemPrompt), and a verbose schema previously pushed the cheap-tier
// model into malformed/truncated JSON (100% failure on progression_node_expand
// the first time these descriptions carried full Bad/Good examples). Detailed
// guidance lives in the user_question prose instead, where it belongs.
const BRANCH_TOPICS_SCHEMA = {
  type: 'object',
  properties: {
    branch_topics: {
      type: 'array',
      items: { type: 'string' },
      description: '4 to 8 short phrases (3-8 words each), each a distinct concrete milestone for this business.',
    },
  },
  required: ['branch_topics'],
};

function nodeExpandSchema(country) {
  const knownSources = Object.keys(OFFICIAL_SOURCE_LOOKUP[country] || {});
  return {
    type: 'object',
    properties: {
      label: { type: 'string', description: 'Short phrase, under 8 words, naming the capability this unlocks.' },
      unlock_description: { type: 'string', description: 'One or two sentences, second person, stating the capability itself.' },
      is_regulatory: { type: 'boolean', description: 'true only if this node is itself obtaining one named permit/licence/registration.' },
      official_source_name: { type: 'string', description: `Only if is_regulatory: one of ${JSON.stringify(knownSources)}. Omit otherwise.` },
    },
    required: ['label', 'unlock_description', 'is_regulatory'],
  };
}

async function generateBranchNodes({ supabaseUrl, serviceKey, user, company, startOrderIndex }) {
  const milestones = getStageMilestones(company.stage);
  const context = [
    `Business: ${company.description || 'not described'}`,
    `Industry: ${company.industry || 'unspecified'}`,
    `Country: ${company.country}`,
    `Stage: ${company.stage || 'idea_validation'} — typical milestones at this stage: ${milestones.join('; ')}`,
    company.current_challenges ? `What's keeping the founder up at night: ${company.current_challenges}` : null,
  ].filter(Boolean).join('\n');

  const spineLabels = SPINE_NODES.map((n) => `"${n.label}"`).join(', ');
  const topicsResult = await callAssistant(supabaseUrl, serviceKey, {
    user_question: `Generate short topic phrases for a founder's progression tree — each one a specific, concrete milestone this business needs to reach next.\n\nThe tree already has six universal nodes covering: assembling an advisory board, running a debate, recording a decision, producing a document, closing a commitment, and legally registering the business (exact labels already on the tree: ${spineLabels}). Don't duplicate or reword any of these.\n\nEach topic must be about a different aspect of the business — pick from: product, target customers, premises, suppliers, marketing, one specific regulatory requirement. List each aspect at most once, even if it feels important enough to repeat.\n\n${context}\n\nReturn only the topics, nothing else.`,
    output_schema: BRANCH_TOPICS_SCHEMA,
    request_type: 'progression_branch_topics',
    user_id: user.id,
    company_id: company.id,
  });

  const topics = (topicsResult?.branch_topics || []).slice(0, 8);
  const schema = nodeExpandSchema(company.country);

  // Each topic's expansion is independent — run them concurrently rather
  // than sequentially. With up to 8 topics, a sequential for-loop could
  // take 8x a single call's latency, which is long enough that a founder
  // can land on the dashboard before generation finishes.
  const settled = await Promise.allSettled(topics.map((topic) =>
    callAssistant(supabaseUrl, serviceKey, {
      user_question: `Expand this progression tree topic into one node for a founder's map.\n\nTopic: "${topic}"\n\n${context}\n\nLabel: a short outcome phrase, not a task — "A business that can legally invoice clients", not "Complete Company Registration".\n\nDescription: one or two sentences stating the capability itself, completing "now you can...". Not why it matters, not what the founder did to get it — "You can now brew and sell your own recipes" not "This allows the brewery to create distinctive beers that appeal to customers." Speak directly to the founder — "you"/"your business" — never "we"/"our"/"us".\n\nis_regulatory: true only if this node IS obtaining one specific named permit, licence, or registration. Signing a lease isn't regulatory even for licensed premises. Interior layout and branding aren't regulatory even for a customer-facing venue. If completing this node doesn't itself grant a permit/licence/registration, false.`,
      output_schema: schema,
      request_type: 'progression_node_expand',
      user_id: user.id,
      company_id: company.id,
    })
  ));

  const nodes = [];
  settled.forEach((result, i) => {
    if (result.status !== 'fulfilled') {
      console.error('progression branch node expand failed:', topics[i], result.reason?.message);
      return;
    }
    const node = result.value;
    if (!node?.label || !node?.unlock_description) return;
    const sourceName = node.is_regulatory ? node.official_source_name : null;
    nodes.push({
      created_by_id: user.id,
      company_id: company.id,
      source: 'branch',
      spine_key: null,
      order_index: startOrderIndex + nodes.length,
      label: node.label,
      unlock_description: node.unlock_description,
      official_source_name: sourceName || null,
      official_source_url: sourceName ? resolveOfficialSourceUrl(company.country, sourceName) : null,
      derivation_type: 'assistant_asked',
      derivation_rule: null,
    });
  });
  return nodes;
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

    const { company_id } = await req.json();
    if (!company_id) return Response.json({ error: 'company_id is required' }, { status: 400, headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const db = createClient(supabaseUrl, serviceKey);

    const { data: company } = await db.from('companies')
      .select('id, created_by_id, country, description, industry, stage, current_challenges')
      .eq('id', company_id).single();
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404, headers: corsHeaders });
    if (company.created_by_id !== user.id) return Response.json({ error: 'Unauthorized' }, { status: 403, headers: corsHeaders });

    const { data: existing } = await db.from('progression_trees').select('id').eq('company_id', company_id).maybeSingle();
    if (existing) {
      const { data: nodes } = await db.from('progression_nodes').select('*').eq('tree_id', existing.id).order('order_index');
      return Response.json({ tree_id: existing.id, nodes, already_existed: true }, { headers: corsHeaders });
    }

    const jurisdictionSupported = SUPPORTED_JURISDICTIONS.has(company.country);

    const { data: tree, error: treeErr } = await db.from('progression_trees').insert({
      created_by_id: user.id,
      company_id,
      spine_version: SPINE_VERSION,
      generation_status: 'complete',
      jurisdiction_supported: jurisdictionSupported,
    }).select().single();
    if (treeErr) throw new Error(treeErr.message);

    const spineRows = SPINE_NODES.map((n) => ({
      created_by_id: user.id,
      company_id,
      tree_id: tree.id,
      source: 'spine',
      spine_key: n.spine_key,
      order_index: n.order_index,
      label: n.label,
      unlock_description: n.unlock_description,
      official_source_url: null,
      official_source_name: null,
      derivation_type: n.derivation_type,
      derivation_rule: n.derivation_rule,
    }));

    let branchRows = [];
    if (jurisdictionSupported) {
      try {
        branchRows = await generateBranchNodes({ supabaseUrl, serviceKey, user, company, startOrderIndex: SPINE_NODES.length });
      } catch (e) {
        console.error('progression branch generation failed, shipping spine-only:', e.message);
      }
    }

    const allRows = [...spineRows, ...branchRows].map((r) => ({ ...r, tree_id: tree.id }));
    const { data: insertedNodes, error: nodesErr } = await db.from('progression_nodes').insert(allRows).select();
    if (nodesErr) throw new Error(nodesErr.message);

    return Response.json({ tree_id: tree.id, nodes: insertedNodes, already_existed: false }, { headers: corsHeaders });
  } catch (error) {
    console.error('generateProgressionTree error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
