import { base44 } from "@/api/base44Client";
import { DOCUMENT_TYPES } from "@/lib/documents";

// Generates a structured deliverable when an advisor completes a delegated task.
// Returns { outcome: "completed", deliverable: {...structured} } or { outcome: "delegated", blocker }.
export async function executeTask({ advisor, task, company, context }) {
  const contextStr = context ? `\nRelevant company context:\n${context}\n` : "";

  const prompt = `You are ${advisor.name}, the ${advisor.role} on the executive board of ${company.name}.
Company: ${company.industry || "N/A"} — ${company.description || company.tagline || "N/A"}${contextStr}

Your decision style: ${advisor.decision_style}
Your communication style: ${advisor.communication_style}
Your expertise: ${(advisor.expertise || []).join(", ")}

A task has been delegated to you:
Title: ${task.title}
Detail: ${task.description || "(no further detail provided)"}

Autonomously complete this task in character. Produce a real, structured deliverable that is specific and useful to ${company.name}. 

Choose the most appropriate document type from this list: ${DOCUMENT_TYPES.join(", ")}.

Your deliverable must include:
- A concise executive summary
- A substantive main content section (use markdown headings, bullet points and tables where appropriate)
- Assumptions you made
- Sources or references (only cite real sources you actually used; never fabricate)
- Risks or limitations
- Recommended next actions

If this task genuinely requires the founder's direct human action — signing a legal document, authorising a payment, making a founder-level judgement call, or attending something in person — do not pretend. Delegate it back honestly with a clear explanation.

If you did not use live internet research, state clearly in assumptions that the report is based only on company knowledge and information supplied.

Return JSON.`;

  const schema = {
    type: "object",
    properties: {
      outcome: { type: "string", enum: ["completed", "delegated"] },
      document_type: { type: "string", description: "The most appropriate document type from the list provided" },
      topic: { type: "string", description: "The specific topic or subject of this deliverable (2-6 words)" },
      executive_summary: { type: "string" },
      main_content: { type: "string", description: "Full body of the deliverable in markdown" },
      assumptions: { type: "array", items: { type: "string" } },
      source_references: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
      recommended_next_actions: { type: "array", items: { type: "string" } },
      blocker: { type: "string", description: "What the founder must do and why the advisor cannot. Empty if completed." },
    },
    required: ["outcome"],
  };

  const res = await base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: schema });
  return res;
}