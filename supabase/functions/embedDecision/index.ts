// embedDecision — stores a vector embedding for one decision so future board
// questions can retrieve it by relevance. Called after a decision is created.
// Also runs in backfill mode to embed decisions that have no vector yet.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { embedText, decisionEmbeddingText } from '../_shared/embeddings.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BACKFILL_LIMIT = 100;

async function embedOne(db, decision) {
  const text = decisionEmbeddingText(decision);
  if (!text) return { id: decision.id, skipped: 'no text to embed' };

  const vector = await embedText(text);
  const { error } = await db.from('decisions').update({ embedding: vector }).eq('id', decision.id);
  if (error) throw new Error(error.message);
  return { id: decision.id, embedded: true };
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

    const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { decision_id, backfill_company_id } = await req.json();

    if (backfill_company_id) {
      const { data: pending } = await db.from('decisions')
        .select('id, question, final_recommendation, decision_taken, summary')
        .eq('company_id', backfill_company_id)
        .is('embedding', null)
        .limit(BACKFILL_LIMIT);

      const results = [];
      for (const decision of pending || []) {
        try {
          results.push(await embedOne(db, decision));
        } catch (e) {
          results.push({ id: decision.id, error: e.message });
        }
      }
      return Response.json({ backfilled: results.length, results }, { headers: corsHeaders });
    }

    if (!decision_id)
      return Response.json({ error: 'decision_id or backfill_company_id is required' }, { status: 400, headers: corsHeaders });

    const { data: decision } = await db.from('decisions')
      .select('id, question, final_recommendation, decision_taken, summary')
      .eq('id', decision_id).single();
    if (!decision)
      return Response.json({ error: 'Decision not found' }, { status: 404, headers: corsHeaders });

    return Response.json(await embedOne(db, decision), { headers: corsHeaders });
  } catch (error) {
    console.error('embedDecision error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
