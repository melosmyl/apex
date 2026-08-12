// checkNoteRelevance — Phase D. The founder is composing a question in the
// Boardroom (BoardDebate, phase 'idle'); this checks whether a previously
// captured note is genuinely relevant to what they're typing right now, and
// if so, surfaces it — reusing the exact retrieval mechanism board memory
// already uses (match_notes, a twin of match_decisions), not a second
// system. Never called on a timer or on page load — only in direct
// response to the founder's own typing, debounced client-side.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { embedText } from '../_shared/embeddings.ts';
import { callAssistant, containsAdvice, interjectionBudgetSpent } from '../_shared/assistantCalls.ts';
import { INTERJECTION_FALLBACK_TEXT } from '../_shared/assistantPersona.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INTERJECTION_SCHEMA = {
  type: 'object',
  properties: { interjection_text: { type: 'string', description: 'One short, warm sentence surfacing this note in context — never advice, never your own opinion on the substance.' } },
  required: ['interjection_text'],
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const db = createClient(supabaseUrl, serviceKey);

    const { company_id, draft_text } = await req.json();
    if (!company_id || !draft_text?.trim())
      return Response.json({ matched: false }, { headers: corsHeaders });

    // Checked first and cheaply — a spent budget costs nothing to discover.
    if (await interjectionBudgetSpent(db, user.id))
      return Response.json({ matched: false, reason: 'budget_spent' }, { headers: corsHeaders });

    let matches;
    try {
      const embedding = await embedText(draft_text);
      const { data, error } = await db.rpc('match_notes', {
        p_company_id: company_id,
        p_query_embedding: JSON.stringify(embedding),
        p_match_count: 1,
      });
      if (error) throw new Error(error.message);
      matches = data;
    } catch (e) {
      console.error('match_notes failed:', e.message);
      return Response.json({ matched: false }, { headers: corsHeaders });
    }

    if (!matches?.length) return Response.json({ matched: false }, { headers: corsHeaders });
    const note = matches[0];

    let interjectionText;
    try {
      const result = await callAssistant(supabaseUrl, serviceKey, {
        user_question: `The founder is currently typing a board question: "${draft_text}"\n\nThey previously captured this note: "${note.raw_text}"\n\nWrite one short sentence surfacing the note as potentially relevant right now.`,
        output_schema: INTERJECTION_SCHEMA, request_type: 'assistant_interject', user_id: user.id, company_id,
      });
      const text = result?.interjection_text || INTERJECTION_FALLBACK_TEXT;
      const unsafe = await containsAdvice(supabaseUrl, serviceKey, { text, user_id: user.id, company_id });
      interjectionText = unsafe ? INTERJECTION_FALLBACK_TEXT : text;
    } catch (e) {
      console.error('craftInterjection failed:', e.message);
      interjectionText = INTERJECTION_FALLBACK_TEXT;
    }

    await db.from('notes').update({
      status: 'resurfaced', surfaced_count: (note.surfaced_count || 0) + 1, last_surfaced_at: new Date().toISOString(),
    }).eq('id', note.id);

    // Logged server-side, atomically with the budget check above, rather
    // than trusting the client to log it separately after the fact.
    await db.from('assistant_events').insert({
      user_id: user.id, company_id, event_type: 'interjection_shown', note_id: note.id,
    });

    return Response.json({ matched: true, note_id: note.id, interjection_text: interjectionText }, { headers: corsHeaders });
  } catch (error) {
    console.error('checkNoteRelevance error:', error);
    return Response.json({ matched: false }, { headers: corsHeaders });
  }
});
