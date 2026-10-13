// The results standard (product principles; Workstream M1), shared by the
// meeting's own results page and its public share page: the verdict, the
// next-24-hours actions, the top issues, the decisions only the founder can
// make, and where the room disagreed, with everything else folded away.
//
// Meetings from before M1 have no verdict or issues of their own. They show
// in the same order from the fields they do have, and say so.

export const TASK_TYPE_LABELS = { research: "Research", draft: "Draft", calculate: "Calculate", plan: "Plan" };

export const CALLS = [
  { value: "accept", label: "Accept" },
  { value: "modify", label: "Modify" },
  { value: "reject", label: "Reject" },
];

export const ANSWERS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "not_sure", label: "Not sure" },
];

const text = (v) => (typeof v === "string" ? v : v?.detail || v?.text || "");

export function resultSections(r = {}) {
  const legacy = !r.verdict;
  // A new meeting shows only what the Chair wrote for each section: an
  // empty list means none (the room agreed, nothing to flag), never a
  // stand-in from older fields.
  const issues = legacy
    ? (r.main_risks || []).map((x) => ({ problem: text(x), why_it_matters: "", fix: "" })).filter((x) => x.problem).slice(0, 5)
    : (r.top_issues || []).filter((x) => x?.problem);
  const disagreements = legacy ? r.areas_of_disagreement : r.disagreements;
  return {
    legacy,
    verdict: r.verdict || r.recommended_direction || r.executive_summary || "",
    actions: (r.priority_actions || []).filter((a) => a?.title),
    issues,
    questions: legacy ? [] : (r.founder_questions || []).filter(Boolean),
    disagreements: (disagreements || []).map(text).filter(Boolean).slice(0, 3),
  };
}

// "Do these 3 things", "Do these 2 things", "Do this".
export function actionsHeading(count) {
  if (count === 1) return "Do this in the next 24 hours";
  return `Do these ${count} things in the next 24 hours`;
}
