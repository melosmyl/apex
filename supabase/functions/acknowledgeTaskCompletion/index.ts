// acknowledgeTaskCompletion — when a founder finishes a task that came from a
// board meeting commitment, the advisor who's most tied to it responds by
// name, in their own voice, referencing the specific task and why it
// mattered. Shown inline on the task card immediately after completion.
//
// Deliberately only fires for tasks with source_meeting_id — a real
// commitment, not any task. Matches the principle already applied to task
// creation: acknowledgment follows what the founder actually committed to.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resolveAdvisor } from '../_shared/advisorResolution.ts';

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

    const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { task_id } = await req.json();
    if (!task_id) return Response.json({ error: 'task_id is required' }, { status: 400, headers: corsHeaders });

    const { data: task } = await db.from('tasks').select('*').eq('id', task_id).single();
    if (!task) return Response.json({ error: 'Task not found' }, { status: 404, headers: corsHeaders });
    if (!task.source_meeting_id)
      return Response.json({ error: 'This task has no source meeting — nothing to acknowledge on behalf of.' }, { status: 400, headers: corsHeaders });

    const { data: meeting } = await db.from('board_meetings').select('question, participants').eq('id', task.source_meeting_id).single();
    const { data: advisors } = await db.from('advisors').select('*').eq('company_id', task.company_id).neq('type', 'human');
    if (!advisors?.length) return Response.json({ error: 'No advisors available to speak' }, { status: 400, headers: corsHeaders });

    const speaker = resolveAdvisor(task.assigned_to, advisors, meeting?.participants);
    if (!speaker) return Response.json({ error: 'Could not resolve an advisor to speak' }, { status: 400, headers: corsHeaders });

    let prompt = `The founder just marked this task as done: "${task.title}"\n`;
    if (meeting?.question) prompt += `It came out of the board meeting where you discussed: "${meeting.question}"\n`;
    prompt += `\nRespond briefly (1-2 sentences, occasionally 3 if it earns it) in your own voice, acknowledging that this is now done. Reference the specific task by what it actually was, and say why it mattered — what it unblocks, what it was standing in the way of, or what happens next now that it's done. Do not use generic praise like "great job" or "nice work" with no substance behind it — if you can't say something specific, say something short and factual instead ("Good — that clears the way for X.").`;

    const schema = { type: 'object', properties: { acknowledgment: { type: 'string' } }, required: ['acknowledgment'] };

    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/routeAdvisorRequest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({
        advisor_id: speaker.id, company_id: task.company_id, meeting_id: task.source_meeting_id, user_id: user.id,
        system_instructions: speaker.system_instructions, company_context: null, meeting_context: null,
        user_question: prompt, previous_responses: [], output_schema: schema,
        temperature: 0.6, max_output_length: 300, request_type: 'task_acknowledgment',
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.response?.acknowledgment) {
      return Response.json({ error: data.error || 'The advisor could not respond right now.' }, { status: 503, headers: corsHeaders });
    }

    const acknowledgment = data.response.acknowledgment;
    const now = new Date().toISOString();
    await db.from('tasks').update({
      advisor_acknowledgment: acknowledgment,
      advisor_acknowledgment_by: speaker.name,
      advisor_acknowledgment_at: now,
    }).eq('id', task_id);

    return Response.json({
      advisor_acknowledgment: acknowledgment,
      advisor_acknowledgment_by: speaker.name,
      advisor_acknowledgment_at: now,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('acknowledgeTaskCompletion error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
