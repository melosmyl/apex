// recordProgressionCountryRequest — the demand-signal mechanism for the
// "prioritise my country" prompt shown on an unsupported-jurisdiction tree
// (owner's decision, 2026-08-13). Sets jurisdiction_request_clicked_at once;
// idempotent — a second click is a no-op rather than bumping the timestamp,
// since the point is knowing a founder asked at all, not when they last
// clicked.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { data: tree } = await db.from('progression_trees').select('id, jurisdiction_request_clicked_at').eq('company_id', company_id).maybeSingle();
    if (!tree) return Response.json({ error: 'No progression tree for this company' }, { status: 404, headers: corsHeaders });

    if (tree.jurisdiction_request_clicked_at) {
      return Response.json({ recorded: true, already: true }, { headers: corsHeaders });
    }

    const { error: updateErr } = await db.from('progression_trees')
      .update({ jurisdiction_request_clicked_at: new Date().toISOString() })
      .eq('id', tree.id);
    if (updateErr) throw new Error(updateErr.message);

    return Response.json({ recorded: true, already: false }, { headers: corsHeaders });
  } catch (error) {
    console.error('recordProgressionCountryRequest error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
