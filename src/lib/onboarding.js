import { base44, supabase } from "@/api/base44Client";
import { ADVISOR_LIBRARY } from "@/lib/advisorLibrary";
import { buildAdvisorRecord, recommendAdvisorsHeuristic, getJourney } from "@/lib/companyJourney";

const VALID_KEYS = ADVISOR_LIBRARY.map((a) => a.key);

export async function generateOnboardingPlan(answers) {
  try {
    const { data: plan } = await base44.functions.invoke("generateOnboardingPlan", { answers });

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

function resolveAssignee(roleOrName, advisors) {
  if (!roleOrName || roleOrName === "Founder") return "Founder";
  const byName = advisors.find((a) => a.name === roleOrName);
  if (byName) return byName.name;
  const byRole = advisors.find((a) => (a.role || "").toLowerCase() === roleOrName.toLowerCase());
  return byRole ? byRole.name : "Founder";
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

  // 3. Create suggested tasks — the plan assigns tasks by role ("Legal
  // Advisor"), but TaskCard resolves an assignee by matching the advisor's
  // actual name, so resolve here or the task can never be executed or
  // completed by anyone. Falls back to the founder rather than leaving an
  // unresolvable role string, since that would be a permanently stuck task.
  //
  // Skipped entirely for anonymous free-meeting visitors — RLS blocks task
  // creation for them outright (see anonymous_users_no_tasks), and task
  // creation isn't part of what the free meeting promises anyway.
  const { data: { user } } = await supabase.auth.getUser();
  const tasks = user?.is_anonymous ? [] : (plan.suggested_tasks || []).map((t) => ({
    company_id: company.id,
    title: t.title,
    assigned_to: resolveAssignee(t.assigned_to, createdAdvisors),
    status: "todo"
  }));

  if (tasks.length) {
    await base44.entities.Task.bulkCreate(tasks);
  }

  return { company, advisors: createdAdvisors };
}