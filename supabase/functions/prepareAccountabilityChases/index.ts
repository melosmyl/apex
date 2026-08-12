// prepareAccountabilityChases — Phase E. Cron-triggered, daily. The
// Assistant now owns proactive accountability chasing (moved off the
// Chair's opening statement — see the startBoardMeeting diff shipped
// alongside this). Generates chase text per genuinely overdue commitment,
// verified with the same literal-substring check buildChairOpening used to
// use for this exact purpose — the one place that original verifier
// transfers unchanged, since a task's exact title is a known fixed string
// (contrast with checkAdviceBoundary elsewhere, which needs a semantic
// check because there's no fixed string to test against).
//
// Internal-only, same convention as routeAdvisorRequest/
// cleanupExpiredAnonymousUsers: the caller authenticates with the
// service-role key itself, never a user JWT.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { loadOpenCommitments, OVERDUE_AFTER_DAYS } from '../_shared/commitments.ts';
import { callAssistant } from '../_shared/assistantCalls.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CHASE_SCHEMA = {
  type: 'object',
  properties: { chase_text: { type: 'string', description: 'One curious, never-accusatory question about this specific overdue commitment — must include its exact title in quotes, e.g. \'You committed to "the pricing page" — where did that land?\'' } },
  required: ['chase_text'],
};

const ALREADY_CHASED_WITHIN_DAYS = 7;

function fallbackChase(title) {
  return `You committed to "${title}" — where did that land?`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (token !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, serviceKey);

    const { data: companies } = await db.from('companies').select('id, created_by_id').limit(500);

    let checked = 0;
    let prepared = 0;

    for (const company of companies || []) {
      const commitments = await loadOpenCommitments(db, company.id);
      const overdue = commitments.filter((c) => c.days_open >= OVERDUE_AFTER_DAYS);

      for (const commitment of overdue) {
        checked++;
        const since = new Date(Date.now() - ALREADY_CHASED_WITHIN_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentChase } = await db.from('assistant_chases')
          .select('id').eq('task_id', commitment.id).gt('generated_at', since).limit(1);
        if (recentChase?.length) continue; // already asked about this one this week

        let chaseText;
        try {
          const result = await callAssistant(supabaseUrl, serviceKey, {
            user_question: `The founder committed to this after a board meeting on "${commitment.meeting_question}": "${commitment.title}". It's been ${commitment.days_open} days and it's still not done. Write one curious, never-accusatory question asking about it, naming it by its exact title in quotes.`,
            output_schema: CHASE_SCHEMA, request_type: 'assistant_chase', user_id: company.created_by_id, company_id: company.id,
          });
          const stated = result?.chase_text || '';
          chaseText = stated.includes(commitment.title) ? stated : fallbackChase(commitment.title);
        } catch (e) {
          console.error('Chase generation failed, using fallback:', e.message);
          chaseText = fallbackChase(commitment.title);
        }

        await db.from('assistant_chases').insert({
          company_id: company.id, task_id: commitment.id, created_by_id: company.created_by_id, chase_text: chaseText,
        });
        prepared++;
      }
    }

    return Response.json({ companies_checked: companies?.length || 0, commitments_checked: checked, chases_prepared: prepared }, { headers: corsHeaders });
  } catch (error) {
    console.error('prepareAccountabilityChases error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
