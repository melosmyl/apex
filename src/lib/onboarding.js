import { base44 } from "@/api/base44Client";
import { ADVISOR_LIBRARY } from "@/lib/advisorLibrary";
import { buildAdvisorRecord, recommendAdvisorsHeuristic, getJourney } from "@/lib/companyJourney";

const VALID_KEYS = ADVISOR_LIBRARY.map((a) => a.key);

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    company_type: { type: "string", description: "A short label for the type of company, e.g. 'DTC Consumer Brand' or 'B2B SaaS Startup'" },
    recommended_journey: {
      type: "string",
      enum: ["idea_validation", "pre_launch", "early_revenue", "growth", "fundraising", "product_launch", "market_expansion", "turnaround"]
    },
    executive_briefing: { type: "string", description: "A warm, concise 2-3 sentence personalised briefing for the founder" },
    recommended_advisors: {
      type: "array",
      description: "4 to 6 advisors from the provided library, including the chair",
      items: {
        type: "object",
        properties: {
          key: { type: "string", description: "Must be one of the valid advisor keys provided" },
          name: { type: "string" },
          role: { type: "string" },
          reason: { type: "string", description: "One sentence explaining why this advisor is recommended for this specific founder" }
        }
      }
    },
    suggested_meetings: {
      type: "array",
      description: "Exactly 3 strategic questions the founder should bring to their board",
      items: { type: "string" }
    },
    suggested_tasks: {
      type: "array",
      description: "3 to 5 concrete first tasks",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          assigned_to: { type: "string", description: "The advisor role or 'Founder'" }
        }
      }
    },
    start_here_action: { type: "string", description: "One clear, specific primary action the founder should take first" }
  }
};

function buildPrompt(answers) {
  const advisorList = ADVISOR_LIBRARY.map((a) => `- ${a.key}: ${a.name}, ${a.role} — ${a.expertise.join(", ")}`).join("\n");
  const answersText = Object.entries(answers)
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
    .join("\n");

  return `You are an expert startup coach helping a founder set up their AI executive board on Apex.

Here is what the founder has shared:
${answersText}

Available advisors (use ONLY these keys):
${advisorList}

Based on the founder's situation, generate a personalised onboarding plan:
1. Recommend 4–6 advisors (always include "chair" — Margaret Ashworth synthesises the board). Pick advisors whose expertise directly addresses the founder's stage, challenges and confidence gaps.
2. Write a warm, specific reason for each recommendation — tie it to what the founder shared.
3. Suggest exactly 3 strategic questions for their first board meetings.
4. Suggest 3–5 concrete first tasks. Assign each to the most relevant advisor role or "Founder".
5. Give ONE clear primary action labelled as the start_here_action — the single most important thing to do first.
6. Write a warm 2-3 sentence executive briefing that makes the founder feel understood and supported.
7. Classify the company type in a short label.
8. Choose the recommended_journey that best fits their current stage.

Be specific and personal. Never generic. Never use placeholder text.`;
}

export async function generateOnboardingPlan(answers) {
  try {
    const res = await base44.integrations.Core.InvokeLLM({
      prompt: buildPrompt(answers),
      response_json_schema: RESPONSE_SCHEMA,
      model: "claude-sonnet-5"
    });

    const plan = typeof res === "string" ? JSON.parse(res) : res;

    // Validate advisor keys — filter out invalid ones
    if (plan.recommended_advisors) {
      plan.recommended_advisors = plan.recommended_advisors.filter((a) => VALID_KEYS.includes(a.key));
    }

    // Fallback to heuristic if LLM returned too few advisors
    if (!plan.recommended_advisors || plan.recommended_advisors.length < 3) {
      const heuristic = recommendAdvisorsHeuristic(answers.stage || "idea_validation", answers.advisor_involvement);
      plan.recommended_advisors = heuristic;
      plan._used_fallback = true;
    }

    // Ensure chair is included
    if (!plan.recommended_advisors.some((a) => a.key === "chair")) {
      const chair = ADVISOR_LIBRARY.find((a) => a.key === "chair");
      plan.recommended_advisors.push({
        key: "chair",
        name: chair.name,
        role: chair.role,
        reason: "Every board needs a Chair to synthesise the discussion into a clear recommendation."
      });
    }

    return plan;
  } catch (e) {
    console.warn("Onboarding LLM failed, using heuristic:", e);
    const heuristic = recommendAdvisorsHeuristic(answers.stage || "idea_validation", answers.advisor_involvement);
    return {
      company_type: answers.industry ? `${answers.industry} ${answers.business_model || "business"}` : "New venture",
      recommended_journey: answers.stage || "idea_validation",
      executive_briefing: `Welcome aboard. Based on what you've shared, we've assembled a board to help you with ${answers.immediate_goal || "your next steps"}. Your advisors are ready when you are.`,
      recommended_advisors: heuristic,
      suggested_meetings: [
        "What is the single biggest assumption we need to validate first?",
        "What should our priorities be for the next 90 days?",
        "What is the fastest path to our first milestone?"
      ],
      suggested_tasks: [
        { title: "Complete your company profile in Settings", assigned_to: "Founder" },
        { title: "Review your recommended board and adjust as needed", assigned_to: "Founder" },
        { title: "Prepare context for your first board meeting", assigned_to: "Founder" }
      ],
      start_here_action: "Convene your first board meeting with your recommended advisors",
      _used_fallback: true
    };
  }
}

export async function createCompanyFromOnboarding(answers, plan) {
  // 1. Create the company
  const company = await base44.entities.Company.create({
    name: answers.name,
    industry: answers.industry,
    description: answers.description,
    tagline: plan.executive_briefing ? plan.executive_briefing.split(".")[0] + "." : "",
    business_model: answers.business_model,
    stage: answers.stage,
    recommended_journey: plan.recommended_journey || answers.stage,
    solo_founder: answers.solo_founder,
    team_size: answers.team_size,
    target_customer: answers.target_customer,
    primary_market: answers.primary_market,
    available_capital: answers.available_capital,
    available_time: answers.available_time,
    existing_assets: answers.existing_assets,
    current_challenges: answers.current_challenges,
    immediate_goal: answers.immediate_goal,
    confidence_gaps: answers.confidence_gaps,
    advisor_involvement: answers.advisor_involvement,
    deadlines: answers.deadlines,
    company_type: plan.company_type,
    onboarding_complete: true,
    onboarding_plan: plan,
    next_milestone: getJourney(plan.recommended_journey || answers.stage).milestones[0],
    priorities: plan.suggested_tasks?.slice(0, 3).map((t) => t.title) || [],
    metrics: [],
    advisor_ids: []
  });

  // 2. Create the recommended advisors
  const advisorKeys = plan.recommended_advisors.map((a) => a.key);
  const advisorRecords = advisorKeys
    .map((key) => buildAdvisorRecord(key, company.id))
    .filter(Boolean);

  let createdAdvisors = [];
  if (advisorRecords.length) {
    createdAdvisors = await base44.entities.Advisor.bulkCreate(advisorRecords);
  }

  // Link advisor IDs back to company
  const advisorIds = createdAdvisors.map((a) => a.id);
  await base44.entities.Company.update(company.id, { advisor_ids: advisorIds });

  // 3. Create suggested tasks
  const tasks = (plan.suggested_tasks || []).map((t) => ({
    company_id: company.id,
    title: t.title,
    assigned_to: t.assigned_to || "Founder",
    status: "todo"
  }));

  if (tasks.length) {
    await base44.entities.Task.bulkCreate(tasks);
  }

  return { company, advisors: createdAdvisors };
}