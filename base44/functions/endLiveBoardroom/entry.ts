import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

async function callOpenAI(systemPrompt, userPrompt, temperature, maxTokens) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`OpenAI error: ${data.error?.message || res.status}`);
    return data.choices[0].message.content;
  } finally { clearTimeout(timeout); }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { session_id, company_id } = await req.json();
    if (!session_id) return Response.json({ error: 'session_id is required' }, { status: 400 });

    const session = await base44.entities.VoiceMeetingSession.get(session_id);
    if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

    const messages = await base44.entities.MeetingMessage.filter(
      { session_id }, 'sequence_number', 200
    );

    if (!messages.length)
      return Response.json({ error: 'No messages found in this session' }, { status: 400 });

    const transcript = messages.map(m => {
      const speaker = m.speaker_type === 'founder' ? 'Founder' : m.speaker_name;
      const interrupted = m.was_interrupted ? ' [interrupted]' : '';
      return `${speaker}${interrupted}: ${m.message_text}`;
    }).join('\n');

    const startedAt = new Date(session.started_at || Date.now()).getTime();
    const endedAt = new Date(session.ended_at || Date.now()).getTime();
    const durationMinutes = Math.round((endedAt - startedAt) / 60000);
    const messageCount = messages.filter(m => m.speaker_type === 'ai_advisor').length;
    const estimatedTimeSaved = Math.max(durationMinutes, messageCount * 15);

    const systemPrompt = `You are an executive board secretary. Generate a comprehensive meeting summary from the voice board meeting transcript. The summary should capture key insights, recommendations, and action items.

You must respond with ONLY valid JSON.`;

    const userPrompt = `=== MEETING TRANSCRIPT ===
${transcript}

=== MEETING TOPIC ===
${session.meeting_topic || 'N/A'}

Generate a comprehensive meeting summary. Return JSON with this structure:
{
  "executive_summary": "2-3 paragraph summary of the discussion",
  "main_recommendations": ["list of key recommendations from the advisors"],
  "areas_of_agreement": ["points where advisors agreed"],
  "areas_of_disagreement": ["points where advisors disagreed"],
  "important_risks": ["risks identified during the discussion"],
  "open_questions": ["unresolved questions"],
  "decisions_made": ["any decisions reached"],
  "tasks_and_owners": [{"title": "task title", "assigned_to": "advisor name or founder"}],
  "suggested_pins": [{"pin_type": "Insight|Risk|Recommendation|Action|Decision", "selected_text": "the key text", "summary": "brief summary"}],
  "recommended_next_meeting": "what the board should discuss next",
  "estimated_time_saved_minutes": ${estimatedTimeSaved}
}`;

    const raw = await callOpenAI(systemPrompt, userPrompt, 0.4, 3000);

    let summary;
    try { summary = JSON.parse(raw); }
    catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) summary = JSON.parse(match[0]);
      else throw new Error('Failed to parse summary response');
    }

    // Save summary to session
    await base44.entities.VoiceMeetingSession.update(session_id, {
      status: 'ended',
      ended_at: new Date().toISOString(),
      transcript_status: 'complete',
      summary,
    });

    // Update linked BoardMeeting if exists
    if (session.meeting_id) {
      await base44.entities.BoardMeeting.update(session.meeting_id, {
        status: 'complete',
        executive_summary: summary.executive_summary,
        meeting_mode: 'live_conversation',
        participants: [...new Set(messages.filter(m => m.speaker_type === 'ai_advisor').map(m => m.speaker_name))],
      });
    }

    return Response.json({
      session_id,
      transcript: messages.map(m => ({
        speaker_type: m.speaker_type,
        speaker_name: m.speaker_name,
        message_text: m.message_text,
        response_type: m.response_type,
        was_interrupted: m.was_interrupted,
        sequence_number: m.sequence_number,
        started_at: m.started_at,
      })),
      summary,
      duration_minutes: durationMinutes,
    });
  } catch (error) {
    console.error('endLiveBoardroom error:', error);
    return Response.json({ error: error.message || 'Failed to generate meeting summary.' }, { status: 500 });
  }
});