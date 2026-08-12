// evaluateProgressionTree — checks a company's db_fact progression nodes
// against real activity and records any newly-true ones. Run on dashboard
// load, cheap (a handful of count queries, no LLM call).
//
// The five facts here are BuildStateWidget's five tests, verbatim (that
// widget was removed at cutover — see the Progression Tree plan for its
// original source) — the underlying tests weren't reinvented, only
// reframed as unlocks.
//
// Idempotent and structurally never-un-completing: completions are only
// ever inserted, never updated or deleted, so a node that was true on a
// past run and would evaluate false now (e.g. a decision later deleted)
// stays completed. Re-running this after nothing changed is a no-op.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FACT_EVALUATORS = {
  async board_assembled(db, companyId) {
    const { data } = await db.from('advisors').select('id, type').eq('company_id', companyId);
    return (data || []).filter((a) => a.type !== 'human').length >= 3;
  },
  async first_debate(db, companyId) {
    const { count } = await db.from('board_meetings').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('status', 'complete');
    return (count || 0) >= 1;
  },
  async first_decision(db, companyId) {
    const { count } = await db.from('decisions').select('id', { count: 'exact', head: true }).eq('company_id', companyId);
    return (count || 0) >= 1;
  },
  async first_document(db, companyId) {
    const { count } = await db.from('documents').select('id', { count: 'exact', head: true }).eq('company_id', companyId);
    return (count || 0) >= 1;
  },
  async first_commitment_closed(db, companyId) {
    const { count } = await db.from('tasks').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('status', 'done').not('source_meeting_id', 'is', null);
    return (count || 0) >= 1;
  },
};

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

    const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    const { data: company } = await db.from('companies').select('id, created_by_id').eq('id', company_id).single();
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404, headers: corsHeaders });
    if (company.created_by_id !== user.id) return Response.json({ error: 'Unauthorized' }, { status: 403, headers: corsHeaders });

    const { data: tree } = await db.from('progression_trees').select('id').eq('company_id', company_id).maybeSingle();
    if (!tree) return Response.json({ evaluated: 0, newly_completed: [] }, { headers: corsHeaders });

    const { data: nodes } = await db.from('progression_nodes')
      .select('id, derivation_rule')
      .eq('tree_id', tree.id).eq('derivation_type', 'db_fact');

    const { data: existingCompletions } = await db.from('progression_node_completions')
      .select('node_id').in('node_id', (nodes || []).map((n) => n.id));
    const alreadyCompleted = new Set((existingCompletions || []).map((c) => c.node_id));

    const toInsert = [];
    for (const node of nodes || []) {
      if (alreadyCompleted.has(node.id)) continue;
      const fact = node.derivation_rule?.fact;
      const evaluator = FACT_EVALUATORS[fact];
      if (!evaluator) continue;
      if (await evaluator(db, company_id)) {
        toInsert.push({
          created_by_id: user.id,
          company_id,
          node_id: node.id,
          completion_source: 'db_fact',
        });
      }
    }

    if (toInsert.length) {
      const { error: insertErr } = await db.from('progression_node_completions').insert(toInsert);
      if (insertErr) throw new Error(insertErr.message);
    }

    return Response.json({ evaluated: (nodes || []).length, newly_completed: toInsert.map((c) => c.node_id) }, { headers: corsHeaders });
  } catch (error) {
    console.error('evaluateProgressionTree error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
