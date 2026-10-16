// The results standard (product principles; Workstream M1), shared by the
// meeting's own results page and its public share page: the verdict, the
// next-24-hours actions, the top issues, the decisions only the founder can
// make, and where the room disagreed, with everything else folded away.
//
// Meetings from before M1 have no verdict or issues of their own. They show
// in the same order from the fields they do have, and say so.

export const TASK_TYPE_LABELS = { research: "Research", draft: "Draft", calculate: "Calculate", plan: "Plan" };

// Why an advisor gave no turn, as the server words it
// (_shared/advisorCall.ts PLAIN_UNAVAILABLE_REASONS). Anything else is an
// older record's technical detail, which the founder doesn't see.
const PLAIN_UNAVAILABLE_REASONS = [
  "the AI provider's account was out of credit", "the AI provider refused our key", "the model declined to answer",
  "the AI service was overloaded", "it ran out of time", "the connection to the advisor failed",
  "the answer came back incomplete", "the advisor couldn't be reached",
];
export const plainUnavailableReason = (reason) => (PLAIN_UNAVAILABLE_REASONS.includes(reason) ? reason : null);

export const CALLS = [
  { value: "accept", label: "Accept" },
  { value: "modify", label: "Modify" },
  { value: "reject", label: "Reject" },
];

// Each call's reason box (owner, 16 October 2026: a reason for all three).
export const CALL_REASON = {
  accept: "Why? (optional)",
  modify: "What would you change?",
  reject: "Why not? (optional)",
};

// A Decision Centre record follows the founder's call on the meeting: the
// call is the one record of what was decided. No call: still open.
const CALL_WORDS = /^(Accepted|Modified|Rejected) the board's recommendation/;
export function decisionFromCall(call, notes) {
  const reason = String(notes || "").trim();
  if (call === "accept") return { status: "decided", decision_taken: `Accepted the board's recommendation${reason ? `: ${reason}` : ""}` };
  if (call === "modify") return { status: "decided", decision_taken: `Modified the board's recommendation${reason ? `: ${reason}` : ""}` };
  if (call === "reject") return { status: "decided", decision_taken: `Rejected the board's recommendation${reason ? `: ${reason}` : ""}` };
  return { status: "pending", decision_taken: null };
}

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

// Missing information in the founder's words (owner, 16 October 2026): the
// company record's internal field names never show, including in meetings
// saved before the server cleaned them. The same rules as the server's
// plainMissingInfo (supabase/functions/_shared/resultsStandard.ts).
const FIELD_HOME = { industry: "in your company settings under Industry" };
const PLAIN_FIELD = {
  industry: "industry", business_model: "business model", solo_founder: "whether you work alone", team_size: "team size",
  target_customer: "target customer", primary_market: "main market", available_capital: "capital", available_time: "time",
  existing_assets: "assets", immediate_goal: "immediate goal", confidence_gaps: "confidence gaps", deadlines: "deadlines", country: "country",
};
export function plainMissingInfo(item) {
  let t = String(typeof item === "string" ? item : item?.detail ?? "");
  const home = (key) => (FIELD_HOME[key.toLowerCase()] ? ` (${FIELD_HOME[key.toLowerCase()]})` : "");
  const isKey = (key) => Object.prototype.hasOwnProperty.call(PLAIN_FIELD, key.toLowerCase());
  t = t.replace(/\s*[([]\s*profile[_ ]field\s*[:=]\s*["']?([a-z_]+)["']?\s*[)\]]/gi, (_m, k) => home(k));
  t = t.replace(/\s*\bprofile[_ ]field\s*[:=]\s*["']?([a-z_]+)["']?/gi, (_m, k) => home(k));
  t = t.replace(/\s*[([]\s*["']?([A-Za-z_]+)["']?\s*[)\]]/g, (m, k) => (isKey(k) ? home(k) : m));
  t = t.replace(/\b([A-Za-z]+(?:_[A-Za-z]+)+)\b/g, (m, k) => (isKey(k) ? PLAIN_FIELD[k.toLowerCase()] : m));
  return t.replace(/\s+([.,;:?!])/g, "$1").replace(/([?!])\./g, "$1").replace(/\s{2,}/g, " ").trim();
}

// The change to one Decision Centre record when the call changes: the
// founder's own words there are kept (only text this page wrote is
// replaced), and a reviewed record stays reviewed.
export function decisionPatch(record, call, notes) {
  const own = !!String(record?.decision_taken || "").trim() && !CALL_WORDS.test(record.decision_taken);
  const next = decisionFromCall(call, notes);
  if (call) return { status: record?.status === "reviewed" ? "reviewed" : "decided", ...(own ? {} : { decision_taken: next.decision_taken }) };
  if (own || record?.status === "reviewed") return null;
  return next;
}
