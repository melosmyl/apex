import { base44 } from "@/api/base44Client";

// Generates a multi-advisor board debate + conclusion via InvokeLLM.
export async function convene({ company, advisors, question, knowledge = [] }) {
  const roster = advisors.map((a) =>
    `- ${a.name} (${a.role}). Decision style: ${a.decision_style}. Communication: ${a.communication_style}. Strengths: ${(a.strengths || []).join(", ")}. Personality: ${(a.personality_traits || []).join(", ")}.`
  ).join("\n");

  const knowledgeText = knowledge.length
    ? "\nCompany knowledge base:\n" + knowledge.map((k) => `- ${k.title} (${k.category}): ${(k.content || "").slice(0, 400)}`).join("\n")
    : "";

  const prompt = `You are simulating a real executive board meeting for a company.

Company: ${company.name}
Industry: ${company.industry || "N/A"}
About: ${company.description || company.tagline || "N/A"}
${knowledgeText}

The founder asks the board: "${question}"

The board members are:
${roster}

Simulate a genuine, substantive boardroom discussion. Each advisor must speak IN CHARACTER, reflecting their distinct role, decision style, personality and expertise. They should challenge each other's assumptions, respectfully disagree, ask pointed questions, and support arguments with concrete reasoning. Avoid instant consensus — surface real tension before converging.

Produce 8-14 discussion turns (advisors may speak more than once). Each turn: the advisor's exact name, their role, a "stance" (one of: "supports", "challenges", "questions", "neutral"), and a substantive message (2-4 sentences).

Then produce the meeting conclusion: an executive summary, a clear recommendation, a confidence score (0-100), key risks, the strongest minority/dissenting opinion, 2-3 alternative strategies, concrete next steps, and 2-4 assigned tasks (each with a title and the advisor best suited to own it, by name).`;

  const schema = {
    type: "object",
    properties: {
      discussion: {
        type: "array",
        items: {
          type: "object",
          properties: {
            advisor: { type: "string" },
            role: { type: "string" },
            stance: { type: "string" },
            message: { type: "string" },
          },
        },
      },
      executive_summary: { type: "string" },
      recommendation: { type: "string" },
      confidence_score: { type: "number" },
      risks: { type: "array", items: { type: "string" } },
      minority_opinion: { type: "string" },
      alternative_strategies: { type: "array", items: { type: "string" } },
      next_steps: { type: "array", items: { type: "string" } },
      assigned_tasks: {
        type: "array",
        items: { type: "object", properties: { title: { type: "string" }, assigned_to: { type: "string" } } },
      },
    },
    required: ["discussion", "executive_summary", "recommendation", "confidence_score"],
  };

  return base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: schema });
}