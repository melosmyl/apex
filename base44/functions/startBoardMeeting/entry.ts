import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const CHAIR_OPENING_INSTRUCTIONS = `You are The Chair opening a board meeting.

Introduce the founder's question, set the objective for this meeting, and provide relevant company context.
Address the advisors by name and invite each to share their initial position.
Keep your opening concise (80-150 words). Do NOT give your own opinion — you are the facilitator.`;

const ADVISOR_INITIAL_INSTRUCTIONS_SUFFIX = `\n\nGive your concise initial position (80-150 words). State your overall view and preliminary recommendation. Do not repeat what others have said — add your unique perspective.`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { company_id, question, advisor_ids } = await req.json();
    if (!company_id || !question?.trim() || !advisor_ids?.length)
      return Response.json({ error: 'company_id, question and advisor_ids are required' }, { status: 400 });

    // Load limits
    const limitsList = await base44.asServiceRole.entities.SystemLimits.list('-created_date', 1);
    const limits = limitsList[0] || { max_advisors_per_meeting: 5, min_advisors_per_meeting: 3, max_context_size: 8000 };
    const minAdv = limits.min_advisors_per_meeting || 3;
    const maxAdv = limits.max_advisors_per_meeting || 5;

    if (advisor_ids.length < minAdv || advisor_ids.length > maxAdv)
      return Response.json({ error: `Select between ${minAdv} and ${maxAdv} advisors` }, { status: 400 });

    // Load company + context
    const company = await base44.entities.Company.get(company_id);
    const [documents, decisions, meetings, projects, advisors] = await Promise.all([
      base44.entities.Document.filter({ company_id }, '-created_date', 20),
      base44.entities.Decision.filter({ company_id }, '-created_date', 10),
      base44.entities.BoardMeeting.filter({ company_id }, '-created_date', 5),
      base44.entities.Project.filter({ company_id }, '-created_date', 10),
      base44.entities.Advisor.filter({ company_id }, '-created_date', 100),
    ]);

    const selectedAdvisors = advisors.filter(a => advisor_ids.includes(a.id) && a.type !== 'human');
    if (selectedAdvisors.length < minAdv)
      return Response.json({ error: 'Not enough AI advisors selected' }, { status: 400 });

    // Build context
    const contextPackage = buildContext(company, documents, decisions, meetings, projects, limits.max_context_size || 8000);

    // Find chair advisor (from full advisor list, not just selected)
    let chairAdvisor = advisors.find(a => a.library_key === 'chair' || (a.role || '').toLowerCase().includes('chair'));
    if (!chairAdvisor) chairAdvisor = selectedAdvisors[0];

    // Create meeting with empty transcript
    const meeting = await base44.entities.BoardMeeting.create({
      company_id, question, participants: selectedAdvisors.map(a => a.name),
      status: 'preparing', meeting_phase: 'opening', transcript: [],
      context_snapshot: contextPackage,
      independent_responses: [], challenge_responses: [],
    });

    const transcript = [];
    let seq = 1;

    // ─── Phase 1: Chair Opening ───────────────────────────────
    try {
      const openingResult = await base44.functions.invoke('routeAdvisorRequest', {
        advisor_id: chairAdvisor.id, company_id, meeting_id: meeting.id,
        system_instructions: CHAIR_OPENING_INSTRUCTIONS,
        company_context: contextPackage,
        user_question: question,
        output_schema: {
          type: 'object',
          properties: { message: { type: 'string', description: 'Your opening remarks (80-150 words)' } },
          required: ['message'],
        },
        temperature: 0.5, max_output_length: 500,
        request_type: 'chair_opening',
      });

      transcript.push({
        sequence: seq++, phase: 'opening',
        speaker_name: 'The Chair', advisor_role: 'Chair', speaker_type: 'chair',
        message: openingResult.data?.response?.message || `The Chair opens the meeting. The question before the board is: "${question}". Each advisor is invited to share their initial position.`,
        responds_to: null, stance: null, advisor_id: chairAdvisor.id,
      });
    } catch (e) {
      console.error('Chair opening failed:', e.message);
      transcript.push({
        sequence: seq++, phase: 'opening',
        speaker_name: 'The Chair', advisor_role: 'Chair', speaker_type: 'chair',
        message: `The Chair opens the meeting. The question before the board is: "${question}". I invite each advisor to share their initial position.`,
        responds_to: null, stance: null, advisor_id: chairAdvisor.id,
      });
    }

    await base44.entities.BoardMeeting.update(meeting.id, { transcript, meeting_phase: 'opening' });

    // ─── Phase 2: Initial Positions (sequential) ──────────────
    const positionAdvisors = selectedAdvisors.filter(a => a.id !== chairAdvisor.id);
    for (const advisor of positionAdvisors) {
      const transcriptStr = formatTranscript(transcript);
      try {
        const result = await base44.functions.invoke('routeAdvisorRequest', {
          advisor_id: advisor.id, company_id, meeting_id: meeting.id,
          system_instructions: (advisor.system_instructions || '') + ADVISOR_INITIAL_INSTRUCTIONS_SUFFIX,
          company_context: contextPackage,
          meeting_context: transcriptStr,
          user_question: question,
          output_schema: {
            type: 'object',
            properties: {
              message: { type: 'string', description: 'Your initial position (80-150 words)' },
              responds_to: { type: 'string', description: 'Who you are responding to (usually "The Chair")' },
            },
            required: ['message'],
          },
          temperature: advisor.temperature, max_output_length: 600,
          request_type: 'initial_position',
        });

        transcript.push({
          sequence: seq++, phase: 'initial_positions',
          speaker_name: advisor.name, advisor_role: advisor.role, speaker_type: 'advisor',
          message: result.data?.response?.message || `${advisor.name} was temporarily unavailable.`,
          responds_to: result.data?.response?.responds_to || 'The Chair',
          stance: 'initial', advisor_id: advisor.id,
        });
      } catch (e) {
        console.error(`Advisor ${advisor.name} initial position failed:`, e.message);
        transcript.push({
          sequence: seq++, phase: 'initial_positions',
          speaker_name: advisor.name, advisor_role: advisor.role, speaker_type: 'advisor',
          message: `${advisor.name} was temporarily unavailable for an opening position.`,
          responds_to: 'The Chair', stance: 'initial', advisor_id: advisor.id,
        });
      }

      // Save after each turn
      await base44.entities.BoardMeeting.update(meeting.id, { transcript, meeting_phase: 'initial_positions' });
    }

    // Transition to discussion phase
    await base44.entities.BoardMeeting.update(meeting.id, {
      status: 'discussing', meeting_phase: 'discussion', transcript,
    });

    return Response.json({
      meeting_id: meeting.id, status: 'discussing',
      transcript, meeting_phase: 'discussion',
      advisor_names: selectedAdvisors.map(a => a.name),
    });
  } catch (error) {
    console.error('startBoardMeeting error:', error);
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

function buildContext(company, documents, decisions, meetings, projects, maxSize) {
  let ctx = `Company: ${company.name || 'N/A'}\nIndustry: ${company.industry || 'N/A'}\n`;
  ctx += `Description: ${company.description || company.tagline || 'N/A'}\n`;
  if (company.tagline) ctx += `Tagline: ${company.tagline}\n`;
  if (company.priorities?.length) ctx += `Strategic Priorities: ${company.priorities.join(', ')}\n`;
  if (company.metrics?.length) ctx += `Key Metrics: ${company.metrics.map(m => `${m.label}: ${m.value} (${m.trend})`).join(', ')}\n`;
  if (decisions?.length) {
    ctx += `\nRecent Decisions:\n`;
    decisions.slice(0, 5).forEach(d => { ctx += `- ${d.question}: ${d.final_recommendation || d.summary || 'N/A'}\n`; });
  }
  if (meetings?.length) {
    ctx += `\nPrevious Board Meetings:\n`;
    meetings.slice(0, 3).forEach(m => { ctx += `- Q: ${m.question} → ${m.recommendation || m.executive_summary || 'N/A'}\n`; });
  }
  if (projects?.length) {
    ctx += `\nActive Projects:\n`;
    projects.slice(0, 5).forEach(p => { ctx += `- ${p.name} (${p.status}): ${p.description || ''}\n`; });
  }
  if (documents?.length) {
    ctx += `\nRelevant Documents:\n`;
    documents.slice(0, 10).forEach(d => { ctx += `- ${d.title} (${d.category}): ${(d.content || '').slice(0, 400)}\n`; });
  }
  if (ctx.length > maxSize) ctx = ctx.slice(0, maxSize) + '... [truncated]';
  return ctx;
}