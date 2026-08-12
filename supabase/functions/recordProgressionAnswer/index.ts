// recordProgressionAnswer — records a founder's conversational answer to an
// assistant_asked progression node ("Have you registered the business?").
// Deliberately does NOT reuse AdvisorResponseCard's MissingInfoItem write
// path (a dynamic profile_field -> Company.update with no server-side
// allowlist) — this writes to one fixed-shape table instead, verified by a
// cheap yes/no classification first (verify-then-ship, same reasoning as
// containsAdvice in _shared/assistantCalls.ts) so a reply like "not yet" or
// "working on it" never gets recorded as complete.
//
// Idempotent and never un-completing: progression_node_completions has a
// unique constraint on node_id, so a second answer after the node is
// already complete is a no-op, never an overwrite.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callAssistant } from '../_shared/assistantCalls.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AFFIRMED_SCHEMA = {
  type: 'object',
  properties: { affirmed: { type: 'boolean', description: 'true only if the reply genuinely confirms the thing is done — false for "not yet", "working on it", "no", or anything ambiguous' } },
  required: ['affirmed'],
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

    const { company_id, node_id, answer_text } = await req.json();
    if (!company_id || !node_id || !(answer_text || '').trim())
      return Response.json({ error: 'company_id, node_id, and answer_text are required' }, { status: 400, headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const db = createClient(supabaseUrl, serviceKey);

    const { data: company } = await db.from('companies').select('id, created_by_id').eq('id', company_id).single();
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404, headers: corsHeaders });
    if (company.created_by_id !== user.id) return Response.json({ error: 'Unauthorized' }, { status: 403, headers: corsHeaders });

    const { data: node } = await db.from('progression_nodes')
      .select('id, company_id, label, unlock_description, derivation_type')
      .eq('id', node_id).single();
    if (!node || node.company_id !== company_id)
      return Response.json({ error: 'Node not found' }, { status: 404, headers: corsHeaders });
    if (node.derivation_type !== 'assistant_asked')
      return Response.json({ error: 'This node is not answered conversationally' }, { status: 400, headers: corsHeaders });

    const { data: existing } = await db.from('progression_node_completions').select('id').eq('node_id', node_id).maybeSingle();
    if (existing) return Response.json({ affirmed: true, already_completed: true }, { headers: corsHeaders });

    let affirmed = false;
    try {
      const result = await callAssistant(supabaseUrl, serviceKey, {
        user_question: `A founder was asked: "${node.label} — ${node.unlock_description}"\n\nThey replied: "${answer_text}"\n\nDoes their reply genuinely confirm this is done?`,
        output_schema: AFFIRMED_SCHEMA,
        request_type: 'progression_answer_check',
        user_id: user.id,
        company_id,
      });
      affirmed = result?.affirmed === true;
    } catch {
      affirmed = false; // Fails closed — an unreadable reply is never recorded as complete.
    }

    if (affirmed) {
      const { error: insertErr } = await db.from('progression_node_completions').insert({
        created_by_id: user.id,
        company_id,
        node_id,
        completion_source: 'assistant_answer',
        assistant_answer_text: answer_text,
      });
      if (insertErr) throw new Error(insertErr.message);
    }

    return Response.json({ affirmed, already_completed: false }, { headers: corsHeaders });
  } catch (error) {
    console.error('recordProgressionAnswer error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
