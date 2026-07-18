import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const CHAIR_MODERATION_INSTRUCTIONS = `You are The Chair moderating a live board meeting discussion.

Based on the full transcript so far, decide:
1. next_speaker — the name of the advisor who should speak next, or "conclude" if enough debate has occurred
2. instruction — a brief direction for that advisor (what to address, who to respond to, what to challenge)
3. phase — the current phase: "discussion", "challenge", or "rebuttal"

Guidelines for choosing the next speaker:
- Ensure ALL advisors participate — invite quieter ones who haven't spoken recently
- If the founder asked a question, direct an advisor to answer it directly
- Move through phases naturally: start with "discussion", shift to "challenge" when advisors should test assumptions, then "rebuttal" for refinement
- After approximately 12-20 total advisor messages in the transcript, say "conclude"
- If the discussion is circular, repetitive, or all key points have been made, say "conclude"
- Do NOT give your own opinion on the topic — you are the facilitator only

Return ONLY the JSON object.`;

const ADVISOR_DISCUSSION_INSTRUCTIONS_SUFFIX = `

You are now in the LIVE DISCUSSION phase of a board meeting. The full transcript so far is provided.

Your contribution MUST:
- Respond directly to specific points made by other advisors or the founder — address them BY NAME
- Add something NEW — NEVER simply restate your original position
- Be concise (80-180 words)
- Naturally agree, disagree, build on, question, challenge, or refine based on what others have said
- If the Chair gave you an instruction, follow it
- If someone asked you a question, answer it directly
- If you've been persuaded by another advisor, acknowledge it and refine your position

Speak naturally, as if in a real boardroom. This is a conversation, not a report.`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { meeting_id, user_message, addressed_to } = await req.json();
    if (!meeting_id) return Response.json({ error: 'meeting_id is required' }, { status: 400 });

    const meeting = await base44.entities.BoardMeeting.get(meeting_id);
    if (!meeting) return Response.json({ error: 'Meeting not found' }, { status: 404 });

    const transcript = meeting.transcript || [];
    let seq = (transcript[transcript.length - 1]?.sequence || 0) + 1;

    const advisors = await base44.entities.Advisor.filter({ company_id: meeting.company_id }, '-created_date', 100);
    const selectedAdvisors = advisors.filter(a => meeting.participants?.includes(a.name) && a.type !== 'human');

    let chairAdvisor = advisors.find(a => a.library_key === 'chair' || (a.role || '').toLowerCase().includes('chair'));
    if (!chairAdvisor) chairAdvisor = selectedAdvisors[0];

    // If user message, inject it into the transcript first
    if (user_message?.trim()) {
      transcript.push({
        sequence: seq++, phase: meeting.meeting_phase || 'discussion',
        speaker_name: user.full_name || 'Founder', advisor_role: 'Founder', speaker_type: 'founder',
        message: user_message.trim(), responds_to: addressed_to || 'The board', stance: 'question',
      });
      await base44.entities.BoardMeeting.update(meeting.id, { transcript });
    }

    const transcriptStr = formatTranscript(transcript);
    const contextSnapshot = meeting.context_snapshot || '';

    // ─── Chair decides next speaker ────────────────────────────
    let decision;
    try {
      const chairResult = await base44.functions.invoke('routeAdvisorRequest', {
        advisor_id: chairAdvisor.id, company_id: meeting.company_id, meeting_id: meeting.id,
        system_instructions: CHAIR_MODERATION_INSTRUCTIONS,
        company_context: contextSnapshot,
        meeting_context: transcriptStr,
        user_question: meeting.question,
        output_schema: {
          type: 'object',
          properties: {
            next_speaker: { type: 'string', description: 'Advisor name, or "conclude"' },
            instruction: { type: 'string', description: 'Brief direction for the next speaker' },
            phase: { type: 'string', enum: ['discussion', 'challenge', 'rebuttal'] },
          },
          required: ['next_speaker', 'instruction'],
        },
        temperature: 0.4, max_output_length: 300,
        request_type: 'chair_moderation',
      });
      decision = chairResult.data?.response;
    } catch (e) {
      console.error('Chair moderation failed:', e.message);
      decision = { next_speaker: 'conclude', instruction: '', phase: 'discussion' };
    }

    // Check if Chair says to conclude
    if (!decision || decision.next_speaker?.toLowerCase() === 'conclude') {
      await base44.entities.BoardMeeting.update(meeting.id, { meeting_phase: 'resolution' });
      return Response.json({
        meeting_id: meeting.id, status: 'ready_for_resolution',
        transcript, phase: 'resolution',
      });
    }

    // Find the advisor the Chair selected
    const nextAdvisor = selectedAdvisors.find(a =>
      a.name.toLowerCase() === decision.next_speaker.toLowerCase() ||
      a.name.toLowerCase().includes(decision.next_speaker.toLowerCase()) ||
      decision.next_speaker.toLowerCase().includes(a.name.toLowerCase())
    ) || selectedAdvisors.find(a => a.id !== chairAdvisor.id) || selectedAdvisors[0];

    if (!nextAdvisor) {
      await base44.entities.BoardMeeting.update(meeting.id, { meeting_phase: 'resolution' });
      return Response.json({
        meeting_id: meeting.id, status: 'ready_for_resolution',
        transcript, phase: 'resolution',
      });
    }

    // ─── Selected advisor responds with full transcript ───────
    const advisorMeetingContext = transcriptStr + '\n\nChair\'s instruction: ' + (decision.instruction || 'Continue the discussion.');

    let advisorResponse;
    try {
      const result = await base44.functions.invoke('routeAdvisorRequest', {
        advisor_id: nextAdvisor.id, company_id: meeting.company_id, meeting_id: meeting.id,
        system_instructions: (nextAdvisor.system_instructions || '') + ADVISOR_DISCUSSION_INSTRUCTIONS_SUFFIX,
        company_context: contextSnapshot,
        meeting_context: advisorMeetingContext,
        user_question: meeting.question,
        output_schema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Your contribution (80-180 words)' },
            responds_to: { type: 'string', description: 'Name of the person you are responding to, or null' },
            stance: { type: 'string', enum: ['agree', 'disagree', 'build', 'question', 'answer', 'challenge', 'risk', 'refine'] },
          },
          required: ['message'],
        },
        temperature: nextAdvisor.temperature, max_output_length: 800,
        request_type: 'discussion',
      });
      advisorResponse = result.data?.response;
    } catch (e) {
      console.error(`Advisor ${nextAdvisor.name} discussion failed:`, e.message);
      advisorResponse = { message: `${nextAdvisor.name} was temporarily unavailable.`, responds_to: null, stance: null };
    }

    transcript.push({
      sequence: seq++, phase: decision.phase || 'discussion',
      speaker_name: nextAdvisor.name, advisor_role: nextAdvisor.role, speaker_type: 'advisor',
      message: advisorResponse?.message || `${nextAdvisor.name} was temporarily unavailable.`,
      responds_to: advisorResponse?.responds_to || null,
      stance: advisorResponse?.stance || null,
      advisor_id: nextAdvisor.id,
    });

    await base44.entities.BoardMeeting.update(meeting.id, {
      transcript, meeting_phase: decision.phase || 'discussion',
    });

    return Response.json({
      meeting_id: meeting.id, status: 'discussing',
      transcript, phase: decision.phase || 'discussion',
      next_speaker: nextAdvisor.name,
    });
  } catch (error) {
    console.error('runChallengeRound error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function formatTranscript(transcript) {
  return transcript.map(t => {
    const speaker = t.speaker_type === 'chair' ? 'The Chair' :
                    t.speaker_type === 'founder' ? `Founder (${t.speaker_name})` :
                    `${t.speaker_name} (${t.advisor_role})`;
    const response = t.responds_to ? ` [responding to ${t.responds_to}]` : '';
    return `[${t.phase}] ${speaker}${response}: ${t.message}`;
  }).join('\n\n');
}