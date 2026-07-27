import { base44 } from "@/api/base44Client";

export const MEETING_MODES = [
  {
    key: "quick_ask",
    label: "Quick Ask",
    icon: "Zap",
    description: "A fast, direct answer from one advisor.",
    minAdvisors: 1,
    maxAdvisors: 1,
    tagline: "For simple questions"
  },
  {
    key: "working_session",
    label: "Working Session",
    icon: "MessagesSquare",
    description: "A live, iterative conversation with up to three advisors.",
    minAdvisors: 1,
    maxAdvisors: 3,
    tagline: "For thinking through a problem"
  },
  {
    key: "board_debate",
    label: "Board Debate",
    icon: "Landmark",
    description: "The rigorous board process for important strategic decisions.",
    minAdvisors: 3,
    maxAdvisors: 10,
    tagline: "For high-stakes decisions"
  },
  {
    key: "task_request",
    label: "Task Request",
    icon: "FileText",
    description: "Ask an advisor to produce a finished deliverable, saved to Documents.",
    minAdvisors: 1,
    maxAdvisors: 1,
    tagline: "For getting work done"
  },
  {
    key: "review",
    label: "Review",
    icon: "ClipboardCheck",
    description: "Get a document, strategy or plan reviewed by your advisors.",
    minAdvisors: 1,
    maxAdvisors: 3,
    tagline: "For stress-testing work"
  },
  {
    key: "live_conversation",
    label: "Live Conversation",
    icon: "Radio",
    description: "Speak naturally with your advisors in a real voice meeting. They respond aloud, remember the conversation, and challenge each other.",
    minAdvisors: 1,
    maxAdvisors: 3,
    tagline: "Talk it through"
  }
];

export function getMode(key) {
  return MEETING_MODES.find((m) => m.key === key);
}

export function buildCompanyContext(company) {
  if (!company) return "";
  const parts = [`Company: ${company.name}`];
  if (company.industry) parts.push(`Industry: ${company.industry}`);
  if (company.description) parts.push(`Description: ${company.description}`);
  if (company.business_model) parts.push(`Business model: ${company.business_model}`);
  if (company.stage) parts.push(`Stage: ${company.stage}`);
  if (company.target_customer) parts.push(`Target customer: ${company.target_customer}`);
  if (company.primary_market) parts.push(`Primary market: ${company.primary_market}`);
  if (company.current_challenges) parts.push(`Current challenges: ${company.current_challenges}`);
  if (company.immediate_goal) parts.push(`Immediate goal: ${company.immediate_goal}`);
  return parts.join("\n");
}

export async function recommendMode(question, advisors) {
  const advisorList = advisors
    .filter((a) => a.type !== "human")
    .map((a) => `- ${a.library_key || a.name}: ${a.role}`)
    .join("\n");

  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `You are analysing a founder's request on Apex, an AI executive board platform.

The founder's request: "${question}"

Available advisors:
${advisorList}

Meeting modes:
- quick_ask: For simple questions needing a fast response. One advisor.
- working_session: For live, iterative conversation. Up to 3 advisors.
- board_debate: For important strategic decisions needing rigorous multi-round debate. 3+ advisors.
- task_request: When the founder needs a completed deliverable (document, report, plan).
- review: When the founder wants feedback on an existing document, strategy or plan.
- live_conversation: When the founder wants to talk through a problem verbally with advisors responding in real-time voice.

Recommend the single most suitable mode and 1–3 relevant advisors. Return the advisor library keys.`,
    response_json_schema: {
      type: "object",
      properties: {
        recommended_mode: { type: "string", enum: ["quick_ask", "working_session", "board_debate", "task_request", "review", "live_conversation"] },
        reason: { type: "string" },
        suggested_advisor_keys: { type: "array", items: { type: "string" } }
      }
    }
  });
  return typeof res === "string" ? JSON.parse(res) : res;
}

export async function runQuickAsk({ company, question, advisor }) {
  const context = buildCompanyContext(company);
  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `${advisor.system_instructions || ""}

--- Company context ---
${context}

--- The founder asks ---
${question}

Provide a direct, practical answer as ${advisor.name} (${advisor.role}). Be concise but complete.`,
    response_json_schema: {
      type: "object",
      properties: {
        answer: { type: "string" },
        reasoning: { type: "string" },
        next_action: { type: "string" }
      }
    }
  });
  return typeof res === "string" ? JSON.parse(res) : res;
}

export async function saveQuickAskMeeting({ companyId, question, advisor, result }) {
  return await base44.entities.BoardMeeting.create({
    company_id: companyId,
    question,
    meeting_mode: "quick_ask",
    participants: [advisor.name],
    status: "complete",
    mode_result: result,
    executive_summary: result.answer
  });
}

export async function runTaskRequest({ company, taskTitle, taskDescription, advisor }) {
  const context = buildCompanyContext(company);
  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `${advisor.system_instructions || ""}

--- Company context ---
${context}

--- Task ---
${taskTitle}

${taskDescription}

Produce a complete, professional deliverable as ${advisor.name} (${advisor.role}). Write in markdown. Be thorough and specific — this is a finished piece of work the founder can use.`,
    response_json_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The full deliverable in markdown" },
        summary: { type: "string", description: "A brief one-line summary of what was produced" }
      }
    }
  });
  return typeof res === "string" ? JSON.parse(res) : res;
}

export async function saveTaskDeliverable({ companyId, taskTitle, advisor, result }) {
  const doc = await base44.entities.Document.create({
    company_id: companyId,
    title: taskTitle,
    content: result.content,
    content_format: "Markdown",
    document_type: "Other",
    status: "draft",
    created_by_advisor_id: advisor.id,
    kind: "document"
  });

  const task = await base44.entities.Task.create({
    company_id: companyId,
    title: taskTitle,
    assigned_to: advisor.name,
    status: "done",
    document_id: doc.id,
    deliverable: result.summary
  });

  const meeting = await base44.entities.BoardMeeting.create({
    company_id: companyId,
    question: taskTitle,
    meeting_mode: "task_request",
    participants: [advisor.name],
    status: "complete",
    mode_result: { document_id: doc.id, summary: result.summary }
  });

  return { doc, task, meeting };
}

export async function runReview({ company, documentTitle, documentContent, advisor }) {
  const context = buildCompanyContext(company);
  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `${advisor.system_instructions || ""}

--- Company context ---
${context}

--- Document for review ---
Title: ${documentTitle}

Content:
${documentContent}

Review this as ${advisor.name} (${advisor.role}). Provide an overall critique, then specific strengths, weaknesses, risks, missing information, and recommended changes.`,
    response_json_schema: {
      type: "object",
      properties: {
        critique: { type: "string" },
        strengths: { type: "array", "items": { "type": "string" } },
        weaknesses: { type: "array", "items": { "type": "string" } },
        risks: { type: "array", "items": { "type": "string" } },
        missing_information: { type: "array", "items": { "type": "string" } },
        recommended_changes: { type: "array", "items": { "type": "string" } }
      }
    }
  });
  return typeof res === "string" ? JSON.parse(res) : res;
}

export async function saveReviewMeeting({ companyId, documentTitle, advisor, result }) {
  return await base44.entities.BoardMeeting.create({
    company_id: companyId,
    question: `Review: ${documentTitle}`,
    meeting_mode: "review",
    participants: [advisor.name],
    status: "complete",
    mode_result: result
  });
}

export async function runWorkingSessionMessage({ company, message, advisor, history }) {
  const context = buildCompanyContext(company);
  const historyText = history
    .map((m) => `${m.role === "founder" ? "Founder" : m.advisor_name}: ${m.message}`)
    .join("\n");

  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `${advisor.system_instructions || ""}

--- Company context ---
${context}

--- Conversation so far ---
${historyText || "(Just starting)"}

--- Founder's latest message ---
${message}

Respond as ${advisor.name} (${advisor.role}). Be conversational and natural — this is a live working session, not a formal memo. If another advisor has spoken, you can agree, disagree, or build on their point. Keep it concise unless asked for detail.`
  });
  return typeof res === "string" ? res : res.answer || String(res);
}

export async function runWorkingSessionSummary({ company, messages, advisorNames }) {
  const context = buildCompanyContext(company);
  const transcript = messages
    .map((m) => `${m.role === "founder" ? "Founder" : m.advisor_name}: ${m.message}`)
    .join("\n");

  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `Summarise this working session between a founder and their advisors (${advisorNames.join(", ")}).

Company context:
${context}

Transcript:
${transcript}

Generate a concise summary with key insights, areas of agreement and disagreement, unresolved questions, and recommended actions.`,
    response_json_schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        key_insights: { type: "array", "items": { "type": "string" } },
        areas_of_agreement: { type: "array", "items": { "type": "string" } },
        areas_of_disagreement: { type: "array", "items": { "type": "string" } },
        unresolved_questions: { type: "array", "items": { "type": "string" } },
        recommended_actions: { type: "array", "items": { "type": "string" } }
      }
    }
  });
  return typeof res === "string" ? JSON.parse(res) : res;
}

export async function saveWorkingSessionMeeting({ companyId, advisorNames, messages, summary, question }) {
  return await base44.entities.BoardMeeting.create({
    company_id: companyId,
    question: question || "Working session",
    meeting_mode: "working_session",
    participants: advisorNames,
    status: "complete",
    mode_result: { messages, summary }
  });
}