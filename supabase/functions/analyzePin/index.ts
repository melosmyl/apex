// analyzePin: fills in a new pin's details (title, summary, category,
// themes, tags, type, importance, related pins) from the text the founder
// pinned. The founder can change any of it before saving. Cheap tier: this
// is filing, not board reasoning.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireOwnedCompany, requireNotAnonymous, checkUserLimit, accessErrorResponse } from '../_shared/access.ts';
import { EXISTING_SHOWN, PIN_ANALYSIS_SCHEMA, PIN_SORTER, normalisePinAnalysis, pinPrompt } from '../_shared/pinAnalysis.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);
    const db = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { company_id, selected_text, surrounding_context, source_type, source_title } = body || {};
    if (typeof selected_text !== 'string' || !selected_text.trim()) return json({ error: 'selected_text is required' }, 400);

    try {
      requireNotAnonymous(user);
      await requireOwnedCompany(db, company_id, user.id);
      await checkUserLimit(db, user.id, 'pin_analysis');
    } catch (e) {
      const res = accessErrorResponse(e, corsHeaders);
      if (res) return res;
      throw e;
    }

    const { data: existing, error: pinsErr } = await db.from('pins')
      .select('id, pin_title, summary, themes, category')
      .eq('company_id', company_id).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(EXISTING_SHOWN);
    if (pinsErr) throw new Error(pinsErr.message);

    const res = await fetch(`${supabaseUrl}/functions/v1/routeAdvisorRequest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        advisor_override: PIN_SORTER, company_id, user_id: user.id,
        user_question: pinPrompt({ selected_text, surrounding_context, source_type, source_title }, existing || []),
        previous_responses: [], output_schema: PIN_ANALYSIS_SCHEMA,
        model_tier: 'cheap', temperature: 0.2, max_output_length: 1000, request_type: 'pin_analysis',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.response) throw new Error(data?.reason || data?.error || `routeAdvisorRequest failed (${res.status})`);

    return json(normalisePinAnalysis(data.response, selected_text, (existing || []).map((p: any) => p.id)));
  } catch (error) {
    console.error('analyzePin error:', (error as Error).message);
    return json({ error: 'Could not fill in the pin.' }, 500);
  }
});
