// The results standard (product principles; Workstream M1): every meeting
// ends with a one-sentence verdict, three things to do in the next 24 hours,
// the top five issues, the decisions only the founder can make, and where the
// room disagreed. The Chair writes these as their own fields; this module
// tidies what comes back and catches advice too vague to act on.
import { matchAdvisorByName, matchAdvisorByRole } from './advisorResolution.ts';

// deno-lint-ignore no-explicit-any
type Any = any;

export const TASK_TYPES = ['research', 'draft', 'calculate', 'plan'] as const;
export const FOUNDER_LABEL = 'Founder';

export const LIMITS = { actions: 3, issues: 5, questions: 4, disagreements: 3 };

// Advice that names a category of work instead of the work itself. Phrases
// that are vague wherever they appear...
const VAGUE_PHRASES = [
  /\bvalidate (the |your )?(demand|idea|concept|market|assumptions?|hypothes[ie]s)\b/i,
  /\bexplore (the |your )?(options|opportunities|possibilities|alternatives|market)\b/i,
  /\b(conduct|do|carry out|undertake|perform) (some |more |further |thorough )?(market |customer |competitor |user )?(research|discovery|analysis|due diligence)\b/i,
  /\b(refine|clarify|define|revisit|rethink|sharpen) (the |your )?(strategy|positioning|value proposition|messaging|vision|approach|offer(ing)?)\b/i,
  /\b(build|raise|increase|grow) (brand )?awareness\b/i,
  /\bgather (more |some )?(feedback|data|insights?|information)\b/i,
  /\b(think about|reflect on|keep in mind|look into)\b/i,
  /\bconsider (your|the|whether|how|if)\b/i,
  /\bleverage (your|the|social|existing)\b/i,
];
// ...and verbs that are vague when they open a short line with nothing
// concrete in it (no number, no name, no quoted wording).
const WEAK_OPENERS = /^(consider|explore|research|investigate|assess|evaluate|review|analy[sz]e|validate|refine|clarify|define|revisit|rethink|optimi[sz]e|improve|focus on|work on|develop|establish|ensure|understand|monitor|engage|strengthen|enhance|prioriti[sz]e)\b/i;

function hasAnchor(text: string): boolean {
  if (/\d/.test(text)) return true;
  if (/["“”‘]\S/.test(text)) return true;
  // A capitalised word after the first: a person, a company, a place.
  return text.trim().split(/\s+/).slice(1).some((w) => /^[A-Z]/.test(w));
}

// Vague when it names a category of work and nothing concrete to anchor it:
// "Validate demand" is vague; "Validate demand with a £50 ad to 2,000
// people" is a plan.
export function isVague(text: string | null | undefined): boolean {
  const t = String(text || '').trim();
  if (!t || hasAnchor(t)) return false;
  if (VAGUE_PHRASES.some((p) => p.test(t))) return true;
  return WEAK_OPENERS.test(t) && t.split(/\s+/).length <= 6;
}

// Positions (0-based) of the actions and fixes that need rewording.
export function vagueIndexes(resolution: Any) {
  const at = (list: Any[], field: string) => (list || []).flatMap((x: Any, i: number) => (isVague(x?.[field]) ? [i] : []));
  return { actions: at(resolution?.priority_actions, 'title'), issues: at(resolution?.top_issues, 'fix') };
}

// Which actions and fixes need rewriting, as plain references the repair
// prompt can name.
export function vagueParts(resolution: Any): string[] {
  const { actions, issues } = vagueIndexes(resolution);
  return [
    ...actions.map((i) => `action ${i + 1}: "${String(resolution.priority_actions[i].title).slice(0, 200)}"`),
    ...issues.map((i) => `issue ${i + 1}'s fix: "${String(resolution.top_issues[i].fix).slice(0, 200)}"`),
  ];
}

const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Caps every list (structured output doesn't enforce "at most"), drops empty
// entries, and resolves each action's owner to a real advisor on this board,
// or the founder. Work only the founder can do (a call, a signature) has no
// task type: there's nothing for an advisor to do for them.
export function normalizeResults(resolution: Any, advisors: Any[]) {
  const r = resolution || {};
  r.verdict = str(r.verdict, 600);
  r.confidence_reason = str(r.confidence_reason, 600);

  r.priority_actions = (Array.isArray(r.priority_actions) ? r.priority_actions : [])
    .filter((a: Any) => str(a?.title))
    .slice(0, LIMITS.actions)
    .map((a: Any) => {
      const raw = str(a.assigned_to, 200);
      // An advisor named by name owns it, even one whose role has "Founder"
      // in it. Otherwise the founder's own work stays theirs, however it's
      // worded ("You", "the founder", type founder), and a label that names
      // nobody on the board is never guessed at: a task with the wrong
      // advisor is worse than one the founder owns.
      const forFounder = !raw || a.task_type === 'founder';
      const byName = forFounder ? null : matchAdvisorByName(raw, advisors);
      const advisor = byName || (forFounder || /\b(founder|you|yourself)\b/i.test(raw) ? null : matchAdvisorByRole(raw, advisors));
      const type = TASK_TYPES.includes(a.task_type) && advisor ? a.task_type : null;
      return {
        title: str(a.title, 300),
        assigned_to: advisor?.name || FOUNDER_LABEL,
        advisor_id: advisor?.id || null,
        task_type: type,
        brief: str(a.brief, 1500),
        done_when: str(a.done_when, 300),
        why_first: str(a.why_first, 600),
      };
    });

  r.top_issues = (Array.isArray(r.top_issues) ? r.top_issues : [])
    .filter((x: Any) => str(x?.problem))
    .slice(0, LIMITS.issues)
    .map((x: Any) => ({ problem: str(x.problem, 400), why_it_matters: str(x.why_it_matters, 600), fix: str(x.fix, 600) }));

  r.founder_questions = (Array.isArray(r.founder_questions) ? r.founder_questions : [])
    .map((q: unknown) => str(q, 300)).filter(Boolean).slice(0, LIMITS.questions);

  r.disagreements = (Array.isArray(r.disagreements) ? r.disagreements : [])
    .map((d: unknown) => str(d, 600)).filter(Boolean).slice(0, LIMITS.disagreements);

  return r;
}

// Puts the reworded items back by their number, and only where something
// was flagged as vague: a repair rewrites wording, it doesn't reassign work
// or touch items nobody asked about. The owner and type always stay as
// resolved; anything the repair left out or left empty keeps its wording.
export function mergeRepair(resolution: Any, repair: Any, flagged = vagueIndexes(resolution)) {
  const byNumber = (list: unknown) => new Map((Array.isArray(list) ? list : [])
    .filter((x: Any) => Number.isInteger(Number(x?.number))).map((x: Any) => [Number(x.number) - 1, x]));
  const actions = byNumber(repair?.actions);
  resolution.priority_actions = (resolution.priority_actions || []).map((a: Any, i: number) => {
    const fixed: Any = flagged.actions.includes(i) ? actions.get(i) : null;
    if (!fixed || !str(fixed.title)) return a;
    return { ...a, title: str(fixed.title, 300), brief: str(fixed.brief, 1500) || a.brief, done_when: str(fixed.done_when, 300) || a.done_when };
  });
  const issues = byNumber(repair?.fixes);
  resolution.top_issues = (resolution.top_issues || []).map((x: Any, i: number) => {
    const fixed: Any = flagged.issues.includes(i) ? issues.get(i) : null;
    return fixed && str(fixed.fix) ? { ...x, fix: str(fixed.fix, 600) } : x;
  });
  return resolution;
}
