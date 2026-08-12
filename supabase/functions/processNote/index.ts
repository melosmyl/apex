// processNote — Phase B. Fire-and-forget enrichment run right after a note
// is captured: tagging (for organisation) and classification (is this a
// small note, or something strategic-sized that belongs in front of the
// board?). Deliberately two small, flat-schema calls rather than one
// larger one — the schema-nesting failure mode confirmed elsewhere in this
// codebase (generateOnboardingPlan) is about required array-of-object
// nesting, not raw field count, and both schemas here stay flat.
//
// Everything runs on the cheap model tier (model_tier: 'cheap') — capture,
// tagging and routing are Haiku-class work, never a flagship model.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ROUTING_FALLBACK_TEXT } from '../_shared/assistantPersona.ts';
import { callAssistant, containsAdvice } from '../_shared/assistantCalls.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TAG_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string' },
    subcategory: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    importance: { type: 'string', enum: ['normal', 'important', 'critical'] },
  },
  required: ['category', 'subcategory', 'tags', 'importance'],
};

const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    signal_size: { type: 'string', enum: ['note', 'strategic'], description: '"strategic" only if this is the kind of question a board would debate, not an ordinary to-do or reminder' },
    confidence: { type: 'number', description: '0-100' },
    board_prompt_text: { type: 'string', description: 'A short, warm invitation to put this specific thought to the board — e.g. "That sounds like a pricing question — want to put it to the board?" Must be an invitation only, never your own opinion on the substance. Empty string if signal_size is "note".' },
  },
  required: ['signal_size', 'confidence', 'board_prompt_text'],
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

    const { note_id } = await req.json();
    if (!note_id) return Response.json({ error: 'note_id is required' }, { status: 400, headers: corsHeaders });

    const { data: note } = await db.from('notes').select('*').eq('id', note_id).single();
    if (!note) return Response.json({ error: 'Note not found' }, { status: 404, headers: corsHeaders });
    if (note.created_by_id !== user.id) return Response.json({ error: 'Unauthorized' }, { status: 403, headers: corsHeaders });

    const [tagResult, classifyResult] = await Promise.all([
      callAssistant(supabaseUrl, serviceKey, {
        user_question: `Tag this captured note for organisation:\n"${note.raw_text}"`,
        output_schema: TAG_SCHEMA, request_type: 'assistant_tag', user_id: user.id, company_id: note.company_id,
      }).catch((e) => { console.error('tagNote failed:', e.message); return null; }),
      callAssistant(supabaseUrl, serviceKey, {
        user_question: `Decide whether this captured note is small (an ordinary to-do or reminder) or strategic (the kind of question a board would debate):\n"${note.raw_text}"`,
        output_schema: CLASSIFY_SCHEMA, request_type: 'assistant_classify', user_id: user.id, company_id: note.company_id,
      }).catch((e) => { console.error('classifyNote failed:', e.message); return null; }),
    ]);

    const updates = {};
    if (tagResult) {
      updates.category = tagResult.category || null;
      updates.subcategory = tagResult.subcategory || null;
      updates.tags = tagResult.tags || [];
      updates.importance = ['normal', 'important', 'critical'].includes(tagResult.importance) ? tagResult.importance : 'normal';
    }

    if (classifyResult) {
      const isStrategic = classifyResult.signal_size === 'strategic';
      updates.signal_size = isStrategic ? 'strategic' : 'note';
      updates.classification_confidence = typeof classifyResult.confidence === 'number' ? classifyResult.confidence : null;
      if (isStrategic) {
        const promptText = classifyResult.board_prompt_text || ROUTING_FALLBACK_TEXT;
        const unsafe = await containsAdvice(supabaseUrl, serviceKey, { text: promptText, user_id: user.id, company_id: note.company_id });
        updates.board_prompt_text = unsafe ? ROUTING_FALLBACK_TEXT : promptText;
      } else {
        updates.board_prompt_text = null;
      }
    }

    if (Object.keys(updates).length) {
      await db.from('notes').update(updates).eq('id', note_id);
    }

    return Response.json({ note_id, updated: Object.keys(updates) }, { headers: corsHeaders });
  } catch (error) {
    console.error('processNote error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
