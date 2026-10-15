// The minimum shape of an advisor's turn in a discussion round (Workstream I,
// owner's decisions 15 October 2026): a position and its reason, who the
// advisor is answering and how, the one thing they add, a change of mind
// only with who moved them and why, 120 words at most. The answer form does
// most of the enforcing; cheap checks after each turn only flag (asking a
// failed turn again comes later), and the Chair is told which turns failed.
// deno-lint-ignore-file no-explicit-any

export const TURN_WORDS = 120;
// A turn is flagged as long past this (the cap itself is a rule in the prompt:
// the answer form can't count words).
export const LONG_TURN_WORDS = 150;
const ECHO_SIMILARITY = 0.8;

const STANCES = ['disagree', 'build', 'question', 'agree'];

// The answer form for one meeting: "who I'm answering" and "who moved me"
// can only name someone actually in it (the founder too), or nobody.
export function discussionSchema(names: string[]) {
  const people = [...new Set([...names.map((n) => String(n || '').trim()).filter((n) => n && n !== 'Founder'), 'Founder', ''])];
  return {
    type: 'object',
    properties: {
      position: { type: 'string', description: 'Your answer to the founder\'s question now, in one sentence.' },
      because: { type: 'string', description: 'One sentence: your main reason, naming something specific to this company or question (a number, a person, a place, or a fact the founder gave).' },
      answering_who: { type: 'string', enum: people, description: 'The one person whose point you are answering: another advisor, or "Founder". Never yourself. Empty only if nobody has spoken yet.' },
      answering_point: { type: 'string', description: 'Their point, in their words, in at most 15 words.' },
      stance: { type: 'string', enum: STANCES, description: 'What you do with their point: disagree, build on it, question it, or agree.' },
      adds: { type: 'string', description: 'The one thing you add that nobody in this meeting has said yet, in one sentence. Empty only if you agree and have nothing to add.' },
      message: { type: 'string', description: `Your turn as you would say it in the room: ${TURN_WORDS} words at most, plain sentences, no numbered lists (a list is allowed only in the final round).` },
      changed_opinion: { type: 'boolean', description: 'Whether your position has changed from your Round 1 position.' },
      new_position: { type: 'string', description: 'If you changed, your new position. Empty if unchanged.' },
      moved_by: { type: 'string', enum: people, description: 'If you changed, who moved you. Empty if unchanged.' },
      change_because: { type: 'string', description: 'If you changed, the new fact or reasoning that changed your mind. "The founder decided" is not a reason. Empty if unchanged.' },
      founder_answer: { type: 'string', description: 'If the founder spoke since the last round: your answer to what they said or asked, first and plainly. Empty otherwise.' },
      treated_as: { type: 'string', enum: ['fact', 'view', ''], description: 'If the founder spoke: whether you took what they said as a fact about their business or as their view. Empty otherwise.' },
      against_me: { type: 'string', description: 'Final round only: the strongest argument against your position, and why you still hold it. Empty in other rounds.' },
      would_change_my_mind: { type: 'string', description: 'Final round only: one fact that could be checked and would change your mind. Empty in other rounds.' },
      new_risks: { type: 'array', items: { type: 'string' }, description: 'Risks nobody has mentioned yet. Empty if none.' },
      confidence_score: { type: 'number', description: 'Your current confidence in your position, 0-100' },
      answerable: { type: 'boolean', description: 'false if the question genuinely cannot be answered well without missing information. true otherwise.' },
    },
    required: ['position', 'because', 'answering_who', 'answering_point', 'stance', 'adds', 'message', 'changed_opinion', 'new_position',
      'moved_by', 'change_because', 'founder_answer', 'treated_as', 'against_me', 'would_change_my_mind', 'new_risks', 'confidence_score', 'answerable'],
    // What a pasted (not enforced) answer must have: the enums are left out,
    // a model that names "Sofia" for "Sofia Marchetti" shouldn't cost a retry.
    'x-core': ['position', 'because', 'message', 'confidence_score'],
  };
}

// The rules of the turn, in the prompt.
export function turnRules({ isLastRound, founderSpoke }: { isLastRound: boolean; founderSpoke: boolean }) {
  let t = `YOUR TURN HAS A SHAPE. Fill in every part:\n`;
  t += `- position: your answer now, in one sentence. because: one sentence naming something specific to this company or question. Advice that would fit any business is not a reason.\n`;
  t += `- answering_who and answering_point: the one person whose point you are answering, and their point in a few words. Answer the sharpest disagreement, or the founder if they spoke. Never yourself.\n`;
  t += `- stance: disagree, build, question or agree. If you agree, say why in your own reason, not theirs; if you agree and add nothing, leave "adds" empty and keep the turn short.\n`;
  t += `- adds: the one thing nobody has said yet. Do not repeat a point already made in this meeting.\n`;
  t += `- message: what you say in the room, ${TURN_WORDS} words at most, in plain sentences. ${isLastRound ? 'A short list is allowed in this final round.' : 'No numbered or bulleted lists.'}\n`;
  t += `- If your position changed: moved_by (who) and change_because (the new fact or reasoning). A change with no reason is counted as your old position.\n`;
  if (founderSpoke) t += `- The founder spoke: founder_answer answers them first, and treated_as says whether you took it as a fact about their business or as their view.\n`;
  if (isLastRound) t += `- Final round: against_me is the strongest argument against your position and why you still hold it; would_change_my_mind is one fact that could be checked.\n`;
  return t + '\n';
}

// The fields every reader of a transcript already uses, worked out from the
// shaped answer, plus the shaped fields themselves (capped: transcripts can be
// edited from the browser).
export function shapedEntry(resp: any, { speaker, isLastRound, founderSpoke = false, cap = 2000 }: { speaker: string; isLastRound: boolean; founderSpoke?: boolean; cap?: number }) {
  const s = (v: unknown, n = cap) => String(v ?? '').trim().slice(0, n);
  const who = s(resp.answering_who, 100);
  const stance = STANCES.includes(resp.stance) ? resp.stance : '';
  const changed = !!resp.changed_opinion;
  const adds = s(resp.adds);
  const messageType = isLastRound ? 'final_statement' : changed ? 'opinion_changed'
    : stance === 'disagree' ? 'challenge' : stance === 'question' ? 'question' : stance === 'agree' ? 'support' : 'new_information';
  return {
    message: s(resp.message, 4000), message_type: messageType,
    reply_to_advisor: who && who !== speaker ? who : null,
    agrees_with: stance === 'agree' && !adds && who && who !== speaker && who !== 'Founder' ? who : null,
    changed_opinion: changed, new_position: changed ? s(resp.new_position) || null : null,
    position: s(resp.position), because: s(resp.because), answering_point: s(resp.answering_point, 300),
    stance, adds, moved_by: changed ? s(resp.moved_by, 100) || null : null, change_because: changed ? s(resp.change_because) : '',
    // Kept only where they belong, whatever the model filled in.
    founder_answer: founderSpoke ? s(resp.founder_answer) : '',
    treated_as: founderSpoke && ['fact', 'view'].includes(resp.treated_as) ? resp.treated_as : '',
    against_me: isLastRound ? s(resp.against_me) : '', would_change_my_mind: isLastRound ? s(resp.would_change_my_mind) : '',
  };
}

// ---- The checks: flags only, no model calls.
const STOP = new Set(('the a an and or but of to in on for with at by from is are was were be been it its this that these those your you we our they their them i my me ' +
  'as if then than so not no do does did can could should would will may might must have has had more most less very just also about into over under up out what which who when where why how all any each ' +
  'business company plan market customers customer product products sales revenue risk risks money cost costs time first next month months week weeks year ' +
  // The headings of the company record itself.
  'founder founders facts fact stated told missing again vague specifically document documents meeting meetings board advisor advisors knowledge previous decision decisions').split(' '));
// Advice that fits any business: a reason made only of these isn't specific.
const STOCK = ['validate demand', 'test the market', 'ensure compliance', 'secure suppliers', 'manage cash flow', 'do your research', 'understand your customer', 'build a brand', 'start small', 'mitigate risk'];

const words = (t: string) => (t.toLowerCase().match(/[\p{L}\p{N}£$€][\p{L}\p{N}£$€,.'’-]*/gu) || []).map((w) => w.replace(/[.,'’-]+$/, ''));
// A number that is a quantity (money, a count, a share), not "Round 2".
const QUANTITY = /[£$€]\s?\d|\d\s?(%|k\b|m\b)|\b\d[\d,.]*\s+(?!round)\p{L}{2,}|\b\d{2,}/iu;

// The distinctive words of what the founder and the company record gave the
// board: a specific reason names at least one of them, or a number.
export function recordWords(...texts: string[]) {
  const out = new Set<string>();
  for (const t of texts) for (const w of words(t || '')) if (w.length >= 4 && !STOP.has(w)) out.add(w);
  return out;
}

const vector = (t: string) => {
  const v = new Map<string, number>();
  for (const w of words(t)) if (!STOP.has(w)) v.set(w, (v.get(w) || 0) + 1);
  return v;
};
export function similarity(a: string, b: string) {
  const x = vector(a), y = vector(b);
  let dot = 0, nx = 0, ny = 0;
  for (const [w, c] of x) { nx += c * c; dot += c * (y.get(w) || 0); }
  for (const c of y.values()) ny += c * c;
  return nx && ny ? dot / Math.sqrt(nx * ny) : 0;
}

export const wordCount = (t: string) => (String(t || '').match(/\S+/g) || []).length;
const listItems = (t: string) => (String(t || '').match(/(^|\n)\s*(\d+[.)]|[-•*])\s+\S/g) || []).length;

// What's wrong with a shaped turn, if anything. `others` are the round's
// other turns, `record` the distinctive words from the company and founder.
// `sameRound` are the round's other turns (written at the same time, so a
// near-copy is the same point reached twice, flagged on both); `earlier` are
// turns from earlier rounds (a near-copy there is a repeat).
export function turnFlags(entry: any, { sameRound = [], earlier = [], record, isLastRound }: { sameRound?: any[]; earlier?: any[]; record: Set<string>; isLastRound: boolean }) {
  const flags: string[] = [];
  const because = String(entry.because || '').toLowerCase().replace(/\bround\s+\d+/g, ' ');
  // Stock advice doesn't count towards being specific, even next to a
  // company word it happens to share.
  const rest = STOCK.reduce((t, p) => t.split(p).join(' '), because);
  const specific = QUANTITY.test(rest) || words(rest).some((w) => record.has(w));
  if (!because || !specific) flags.push('generic_reason');
  if (entry.stance === 'agree' && !entry.adds) flags.push('bare_agreement');
  const who = String(entry.reply_to_advisor || '');
  if (!who) flags.push('answers_no_one');
  if (entry.changed_opinion && (!entry.moved_by || !entry.change_because
    || /founder\s+(has\s+)?(decided|insists|wants|prefers)|founder'?s decision/i.test(entry.change_because))) flags.push('change_without_reason');
  const same = sameRound.find((o) => o !== entry && o.advisor_name !== entry.advisor_name && o.message && similarity(o.message, entry.message) >= ECHO_SIMILARITY);
  if (same) flags.push(`same_point:${same.advisor_name}`);
  const repeat = earlier.find((o) => o.message && o.message_type !== 'founder_message' && similarity(o.message, entry.message) >= ECHO_SIMILARITY);
  if (repeat) flags.push(`repeats:${repeat.advisor_name}`);
  if (wordCount(entry.message) > LONG_TURN_WORDS) flags.push('long');
  if (!isLastRound && listItems(entry.message) >= 3) flags.push('checklist');
  return flags;
}

// The tags the Chair sees on a turn that failed a check.
// (A bare agreement already shows as [AGREES WITH …].)
export function chairTags(flags: unknown) {
  const f = Array.isArray(flags) ? flags.map(String) : [];
  const tags: string[] = [];
  if (f.includes('generic_reason')) tags.push('[NO SPECIFIC REASON]');
  if (f.includes('change_without_reason')) tags.push('[CHANGE WITHOUT A REASON — counts as their earlier position]');
  const same = f.find((x) => x.startsWith('same_point:'));
  if (same) tags.push(`[SAME POINT AS ${same.slice(11)} — count once]`);
  const repeat = f.find((x) => x.startsWith('repeats:'));
  if (repeat) tags.push(`[REPEATS ${repeat.slice(8)}'S EARLIER POINT]`);
  return tags;
}
