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

function buildCompanyContext(company, decisions, projects, pins) {
  let ctx = `Company: ${company.name || 'N/A'}\nIndustry: ${company.industry || 'N/A'}\n`;
  ctx += `Description: ${company.description || company.tagline || 'N/A'}\n`;
  if (company.stage) ctx += `Stage: ${company.stage}\n`;
  if (company.target_customer) ctx += `Target customer: ${company.target_customer}\n`;
  if (company.current_challenges) ctx += `Current challenges: ${company.current_challenges}\n`;
  if (company.immediate_goal) ctx += `Immediate goal: ${company.immediate_goal}\n`;
  if (company.priorities?.length) ctx += `Strategic priorities: ${company.priorities.join(', ')}\n`;
  if (decisions?.length) {
    ctx += `\nRecent decisions:\n`;
    decisions.slice(0, 5).forEach(d => { ctx += `- ${d.question}: ${d.final_recommendation || d.summary || 'N/A'}\n`; });
  }
  if (projects?.length) {
    ctx += `\nActive projects:\n`;
    projects.slice(0, 5).forEach(p => { ctx += `- ${p.name} (${p.status}): ${p.description || ''}\n`; });
  }
  if (pins?.length) {
    ctx += `\nRelevant pins (saved insights):\n`;
    pins.slice(0, 8).forEach(p => { ctx += `- [${p.pin_type || 'Insight'}] ${p.summary || p.selected_text || ''}\n`; });
  }
  return ctx;
}

function buildAdvisorProfiles(advisors) {
  return advisors.map(a => {
    let profile = `### ${a.name} (ID: ${a.id})\n`;
    profile += `Role: ${a.role}\n`;
    if (a.short_bio || a.biography) profile += `Bio: ${a.short_bio || a.biography}\n`;
    if (a.expertise?.length) profile += `Expertise: ${a.expertise.join(', ')}\n`;
    if (a.communication_style) profile += `Communication style: ${a.communication_style}\n`;
    if (a.decision_style) profile += `Decision style: ${a.decision_style}\n`;
    if (a.strengths?.length) profile += `Strengths: ${a.strengths.join(', ')}\n`;
    if (a.blind_spots?.length || a.weaknesses?.length) profile += `Blind spots: ${(a.blind_spots || a.weaknesses || []).join(', ')}\n`;
    if (a.system_instructions) profile += `Instructions: ${a.system_instructions}\n`;
    return profile;
  }).join('\n');
}

function formatConversationHistory(history) {
  if (!history?.length) return '(The meeting is just beginning.)';
  return history.map(msg => {
    const speaker = msg.speaker_type === 'founder' ? 'Founder' : msg.speaker_name;
    const interrupted = msg.was_interrupted ? ' [INTERRUPTED]' : '';
    const responseType = msg.response_type ? ` [${msg.response_type}]` : '';
    return `${speaker}${responseType}${interrupted}: ${msg.message_text}`;
  }).join('\n');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      session_id, company_id, founder_message, selected_advisor_ids,
      meeting_topic, conversation_history, meeting_settings,
      director_target_id, advisor_exchange_mode, exchange_turn,
    } = await req.json();

    if (!session_id || !company_id || !founder_message)
      return Response.json({ error: 'session_id, company_id and founder_message are required' }, { status: 400 });

    // Load context
    const [company, decisions, projects, pins, advisors] = await Promise.all([
      base44.entities.Company.get(company_id),
      base44.entities.Decision.filter({ company_id }, '-created_date', 5),
      base44.entities.Project.filter({ company_id }, '-created_date', 5),
      base44.entities.Pin.filter({ company_id }, '-created_date', 8),
      base44.entities.Advisor.filter({ company_id }, '-created_date', 100),
    ]);

    const selectedAdvisors = advisors.filter(a => selected_advisor_ids?.includes(a.id) && a.type !== 'human');
    if (!selectedAdvisors.length)
      return Response.json({ error: 'No AI advisors selected' }, { status: 400 });

    const companyContext = buildCompanyContext(company, decisions, projects, pins);
    const advisorProfiles = buildAdvisorProfiles(selectedAdvisors);
    const historyText = formatConversationHistory(conversation_history);

    const settings = meeting_settings || {};
    const allowNaturalJoining = settings.allow_natural_joining !== false;

    // Build system prompt
    let systemPrompt = `You are the facilitator of a live voice board meeting. Your job is to determine who should speak next and then generate that advisor's spoken response.

=== COMPANY CONTEXT ===
${companyContext}

=== MEETING TOPIC ===
${meeting_topic}

=== ADVISOR PROFILES ===
${advisorProfiles}

=== YOUR ROLE AS FACILITATOR ===
You decide which advisor should speak next based on:
- Who has the most relevant expertise for the founder's question
- Whether an advisor has a material disagreement that should be heard
- Whether clarification is needed from the founder
- Whether one advisor should challenge another's point
- Whether the conversation should return to the founder

Do NOT have every advisor respond to every statement. Select the single most relevant voice. Only suggest another advisor if their perspective adds genuine value.

When generating the advisor's response, you MUST:
- Speak in that advisor's voice, personality and expertise
- Reference other advisors by name where appropriate (they are in the same meeting)
- NOT introduce yourself or repeat your role
- Keep responses conversational and natural (30-90 seconds spoken, roughly 75-225 words)
- Be specific and substantive — no filler, no platitudes
- Challenge assumptions, identify risks, offer alternatives
- If you disagree with another advisor, say so directly and explain why
- If the founder asked you a direct question, answer it
- If the founder directed another advisor to respond, let that advisor respond and you may add a brief follow-up

You must respond with ONLY valid JSON.`;

    // Build user prompt
    let userPrompt = `=== CONVERSATION SO FAR ===
${historyText}

=== FOUNDER'S LATEST MESSAGE ===
${founder_message}

`;

    if (director_target_id) {
      const target = selectedAdvisors.find(a => a.id === director_target_id);
      if (target) {
        userPrompt += `The founder has directed ${target.name} to respond. Generate ${target.name}'s response.\n`;
      }
    } else if (advisor_exchange_mode) {
      userPrompt += `The founder has asked the advisors to discuss this among themselves. This is exchange turn ${exchange_turn || 1} of a maximum 3. Generate the next advisor's contribution. After 3 turns, suggest returning to the founder.\n`;
    } else if (allowNaturalJoining) {
      userPrompt += `Advisors may join naturally if they have a material disagreement, significant risk, or directly relevant expertise.\n`;
    } else {
      userPrompt += `Advisors should only respond when directly invited.\n`;
    }

    userPrompt += `\nSelect the best advisor to respond now and generate their spoken response. Return JSON with this structure:
{
  "next_speaker_id": "the advisor ID",
  "next_speaker_name": "the advisor name",
  "response_text": "the advisor's spoken response",
  "response_type": "one of: direct_answer, clarifying_question, challenge, agreement, alternative_view, synthesis, request_for_evidence, return_to_founder",
  "another_advisor_should_respond": false,
  "suggested_follow_up_speaker_id": null,
  "reason_for_speaker_selection": "brief reason",
  "meeting_state": "one of: ongoing, return_to_founder, exchange_complete"
}`;

    const temperature = advisor_exchange_mode ? 0.7 : 0.6;
    const raw = await callOpenAI(systemPrompt, userPrompt, temperature, 1500);

    let result;
    try { result = JSON.parse(raw); }
    catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) result = JSON.parse(match[0]);
      else throw new Error('Failed to parse orchestrator response');
    }

    // Save founder message
    const session = await base44.entities.VoiceMeetingSession.get(session_id);
    const seq = (session.meeting_settings?.last_sequence || 0) + 1;

    await base44.entities.MeetingMessage.create({
      session_id, company_id, meeting_id: session.meeting_id,
      speaker_type: 'founder', speaker_id: user.id, speaker_name: user.full_name || user.email || 'Founder',
      message_text: founder_message, sequence_number: seq,
      started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      was_spoken: true, was_interrupted: false,
    });

    // Save advisor response
    const advisorSeq = seq + 1;
    await base44.entities.MeetingMessage.create({
      session_id, company_id, meeting_id: session.meeting_id,
      speaker_type: 'ai_advisor', speaker_id: result.next_speaker_id, speaker_name: result.next_speaker_name,
      message_text: result.response_text, sequence_number: advisorSeq,
      response_type: result.response_type,
      started_at: new Date().toISOString(),
      was_spoken: true, was_interrupted: false,
    });

    // Update session
    await base44.entities.VoiceMeetingSession.update(session_id, {
      current_speaker_id: result.next_speaker_id,
      meeting_settings: { ...session.meeting_settings, last_sequence: advisorSeq },
    });

    return Response.json({
      ...result,
      session_id,
      sequence_number: advisorSeq,
    });
  } catch (error) {
    console.error('runLiveBoardroomTurn error:', error);
    return Response.json({ error: error.message || 'The board could not process your message.' }, { status: 500 });
  }
});