import { base44 } from "@/api/base44Client";

// Simulates an advisor autonomously executing a delegated task.
// Returns { outcome: "completed", deliverable } or { outcome: "delegated", blocker }.
export async function executeTask({ advisor, task, company }) {
  const prompt = `You are ${advisor.name}, the ${advisor.role} on the executive board of ${company.name}.
Company context: ${company.industry || "N/A"} — ${company.description || company.tagline || "N/A"}

Your decision style: ${advisor.decision_style}
Your communication style: ${advisor.communication_style}
Your expertise: ${(advisor.expertise || []).join(", ")}

A task has been delegated to you:
Title: ${task.title}
Detail: ${task.description || "(no further detail provided)"}

Autonomously complete this task in character — produce the real deliverable the task calls for (a memo, analysis, draft, plan, recommendation, or response), specific and useful to ${company.name}. Be substantive.

However, if this task genuinely CANNOT be completed by an advisor and requires the founder's direct human action — for example signing a legal document, authorising a payment, making a founder-level judgement call, or attending something in person — do not pretend. Delegate it back honestly with a clear explanation of what the founder must do and why you cannot.

Return JSON.`;

  const schema = {
    type: "object",
    properties: {
      outcome: { type: "string", enum: ["completed", "delegated"] },
      deliverable: { type: "string", description: "The completed work. Empty if delegated back." },
      blocker: { type: "string", description: "What the founder must do and why the advisor cannot. Empty if completed." },
    },
    required: ["outcome"],
  };

  const res = await base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: schema });
  return res;
}