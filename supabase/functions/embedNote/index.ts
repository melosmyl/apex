// embedNote — stores a vector embedding for one note so it can be resurfaced
// by relevance later. Called after a note is captured. Also runs in backfill
// mode, exact twin of embedDecision pointed at notes instead of decisions.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { embedText, noteEmbeddingText } from '../_shared/embeddings.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BACKFILL_LIMIT = 100;

async function embedOne(db, note) {
  const text = noteEmbeddingText(note);
  if (!text) return { id: note.id, skipped: 'no text to embed' };

  const vector = await embedText(text);
  const { error } = await db.from('notes').update({ embedding: vector }).eq('id', note.id);
  if (error) throw new Error(error.message);
  return { id: note.id, embedded: true };
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
    const { note_id, backfill_company_id } = await req.json();

    if (backfill_company_id) {
      const { data: pending } = await db.from('notes')
        .select('id, raw_text, tags')
        .eq('company_id', backfill_company_id)
        .is('embedding', null)
        .limit(BACKFILL_LIMIT);

      const results = [];
      for (const note of pending || []) {
        try {
          results.push(await embedOne(db, note));
        } catch (e) {
          results.push({ id: note.id, error: e.message });
        }
      }
      return Response.json({ backfilled: results.length, results }, { headers: corsHeaders });
    }

    if (!note_id)
      return Response.json({ error: 'note_id or backfill_company_id is required' }, { status: 400, headers: corsHeaders });

    const { data: note } = await db.from('notes')
      .select('id, raw_text, tags')
      .eq('id', note_id).single();
    if (!note)
      return Response.json({ error: 'Note not found' }, { status: 404, headers: corsHeaders });

    return Response.json(await embedOne(db, note), { headers: corsHeaders });
  } catch (error) {
    console.error('embedNote error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
