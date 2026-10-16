// The answer shapes the meeting calls ask for. They live together so the
// unit tests can check each one against both providers' structured-output
// rules (outputSchema.ts), and every field is required: "none" is an empty
// list or an empty string, so OpenAI's strict mode and Anthropic's limits on
// optional fields both hold without changing what the model is asked.
// x-core lists the fields that were required before Phase 1b: when a schema
// has to be pasted rather than enforced, only those are insisted on.

// The founder never gave us these — onboarding is deliberately short now.
// Rather than a form, the board recovers them in conversation, only when
// they'd actually change the answer. See startBoardMeeting's buildContext.
export const PROFILE_GAPS = [
  { key: 'industry', label: 'what industry they\'re in' },
  { key: 'business_model', label: 'how the business makes money' },
  { key: 'solo_founder', label: 'whether they\'re building alone or with a team' },
  { key: 'team_size', label: 'how big the team is' },
  { key: 'target_customer', label: 'who the target customer is' },
  { key: 'primary_market', label: 'the primary market or geography' },
  { key: 'available_capital', label: 'what capital is available' },
  { key: 'available_time', label: 'how much time they can commit' },
  { key: 'existing_assets', label: 'what they already have (prototype, customers, IP)' },
  { key: 'immediate_goal', label: 'their most immediate goal' },
  { key: 'confidence_gaps', label: 'where they lack confidence' },
  { key: 'deadlines', label: 'any important deadlines' },
  { key: 'country', label: 'which country they\'re registering the business in' },
];
export const PROFILE_FIELD_KEYS = PROFILE_GAPS.map((g) => g.key);
export const NO_PROFILE_FIELD = 'none';

// Round 1: each debater's independent answer.
export const INDEPENDENT_SCHEMA = {
  type: 'object',
  properties: {
    position: { type: 'string', description: 'Your overall position on the question' },
    recommendation: { type: 'string', description: 'Your specific recommendation' },
    key_arguments: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' }, description: "Conditions your advice depends on, as conditions to check. Never a fact about the business that isn't in the record or the founder's words: ask that in missing_information instead. Empty if none" },
    risks: { type: 'array', items: { type: 'string' }, description: 'Empty if none' },
    missing_information: {
      type: 'array',
      description: 'Empty if nothing is missing',
      items: {
        type: 'object',
        properties: {
          detail: { type: 'string', description: 'The gap, phrased as a direct question to the founder' },
          profile_field: {
            type: 'string', enum: [...PROFILE_FIELD_KEYS, NO_PROFILE_FIELD],
            description: `The exact profile_field key from the "Not yet on file" list above if this gap is one of those, otherwise "${NO_PROFILE_FIELD}"`,
          },
        },
        required: ['detail', 'profile_field'],
      },
    },
    suggested_actions: { type: 'array', items: { type: 'string' }, description: 'Empty if none' },
    confidence_score: { type: 'number', description: '0-100' },
  },
  required: ['position', 'recommendation', 'key_arguments', 'assumptions', 'risks', 'missing_information', 'suggested_actions', 'confidence_score'],
  'x-core': ['position', 'recommendation', 'key_arguments', 'confidence_score'],
};

// Round 1 with the turn shape on (owner's switch, Workstream I): every
// position carries its reason, and what would change the advisor's mind.
const { position: R1_POSITION, ...R1_REST } = INDEPENDENT_SCHEMA.properties;
export const INDEPENDENT_SCHEMA_SHAPED = {
  ...INDEPENDENT_SCHEMA,
  properties: {
    position: R1_POSITION,
    because: { type: 'string', description: "One sentence: the main reason for your position, naming something specific to this company or question, taken from the record or the founder's words (a number, a person, a place, or a fact the founder gave), never one you've supposed" },
    would_change_my_mind: { type: 'string', description: 'One fact that could be checked and would change your mind' },
    ...R1_REST,
  },
  required: [...INDEPENDENT_SCHEMA.required, 'because', 'would_change_my_mind'],
};

// The Chair's short opening.
export const CHAIR_OPENING_SCHEMA = {
  type: 'object',
  properties: { opening_statement: { type: 'string' } },
  required: ['opening_statement'],
};

// A debater's turn in a discussion round.
export const DISCUSSION_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string', description: 'Your contribution to the board discussion. Be specific, critical, and substantive. Speak naturally as you would in a real board room.' },
    message_type: { type: 'string', enum: ['question', 'challenge', 'defense', 'rebuttal', 'support', 'new_information', 'risk_identified', 'opinion_changed', 'final_statement'], description: 'The primary nature of your contribution' },
    reply_to_advisor: { type: 'string', description: 'Name of the advisor you are primarily responding to. An empty string if addressing the board generally.' },
    changed_opinion: { type: 'boolean', description: 'Whether this discussion has changed your position from your initial independent response' },
    new_position: { type: 'string', description: 'If you changed your opinion, state your new position. An empty string if unchanged.' },
    new_risks: { type: 'array', items: { type: 'string' }, description: 'Any new risks or blind spots you have identified that have not been mentioned yet. Empty if none.' },
    confidence_score: { type: 'number', description: 'Your current confidence in your recommendation, 0-100' },
    answerable: { type: 'boolean', default: true, description: 'false if the question genuinely cannot be answered well without missing information — see HONEST UNCERTAINTY. true otherwise (the default).' },
    agrees_with: { type: 'string', description: 'Name of another advisor whose position you now fully agree with and have nothing to add to. An empty string if you have your own distinct view — do not fill this in just to seem cooperative.' },
  },
  required: ['message', 'message_type', 'reply_to_advisor', 'changed_opinion', 'new_position', 'new_risks', 'confidence_score', 'answerable', 'agrees_with'],
  'x-core': ['message', 'message_type', 'confidence_score'],
};

// A debater's answer to the founder's follow-up.
export const FOLLOWUP_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string', description: 'Your response to the founder. Address their message directly, provide additional insights, and if appropriate, revise your recommendation.' },
    message_type: {
      type: 'string',
      enum: ['question', 'challenge', 'defense', 'rebuttal', 'support', 'new_information', 'risk_identified', 'opinion_changed', 'final_statement'],
      description: 'The primary nature of your response',
    },
    reply_to_advisor: { type: 'string', description: 'Set to "Founder" since you are responding to the founder.' },
    changed_opinion: { type: 'boolean', description: 'Whether the founder\'s input has changed your position' },
    new_position: { type: 'string', description: 'If you changed your opinion, state your new position. An empty string if unchanged.' },
    new_risks: { type: 'array', items: { type: 'string' }, description: 'Any new risks or blind spots identified from the founder\'s input. Empty if none.' },
    confidence_score: { type: 'number', description: 'Your current confidence, 0-100' },
  },
  required: ['message', 'message_type', 'reply_to_advisor', 'changed_opinion', 'new_position', 'new_risks', 'confidence_score'],
  'x-core': ['message', 'message_type', 'confidence_score'],
};

const stringList = (description?: string) => ({ type: 'array', items: { type: 'string' }, ...(description ? { description } : {}) });

// The results standard's actions and issues (Workstream M1): the actions
// become tasks the owning advisor can do for the founder in Stage 2.
const PRIORITY_ACTIONS = {
  type: 'array',
  description: 'Exactly the things to do in the next 24 hours, ranked: at most 3, small, concrete and doable. These become the tasks created from this meeting.',
  items: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The action itself: who to contact, what to write, which number to find. Never a category of work.' },
      assigned_to: { type: 'string', description: 'The advisor in this meeting best placed to do it for the founder, or "Founder" when only the founder can (a call, a signature, a decision).' },
      task_type: { type: 'string', enum: ['research', 'draft', 'calculate', 'plan', 'founder'], description: 'research: find and check facts, with sources. draft: write an email, message, listing or document for the founder to edit and send. calculate: work out numbers. plan: a dated step-by-step checklist. founder: only the founder can do it.' },
      brief: { type: 'string', description: 'What the advisor needs to do it: one to three sentences with the specifics from this meeting. Empty for founder actions.' },
      done_when: { type: 'string', description: 'How the founder will know it is done, in a few words.' },
      why_first: { type: 'string', description: 'Why this has to happen in the next 24 hours, before more time or money goes into the question.' },
    },
    required: ['title', 'assigned_to', 'task_type', 'brief', 'done_when', 'why_first'],
  },
};

const TOP_ISSUES = {
  type: 'array',
  description: 'The top issues with the founder\'s current plan, most serious first: at most 5.',
  items: {
    type: 'object',
    properties: {
      problem: { type: 'string', description: 'The problem, in one line.' },
      why_it_matters: { type: 'string', description: 'What it costs the founder if ignored, in one line.' },
      fix: { type: 'string', description: 'The concrete fix, in one line.' },
    },
    required: ['problem', 'why_it_matters', 'fix'],
  },
};

// The Chair's resolution.
export const RESOLUTION_SCHEMA = {
  type: 'object',
  properties: {
    executive_summary: { type: 'string' },
    decision_question: { type: 'string' },
    recommended_direction: { type: 'string' },
    reasoning: { type: 'string' },
    areas_of_agreement: stringList('Empty if none'),
    areas_of_disagreement: stringList('Empty if none'),
    main_risks: stringList(),
    minority_opinion: { type: 'string', description: 'An empty string if there is no minority opinion worth preserving' },
    assumptions: stringList('What this decision rests on: the conditions that must hold for it to be right.'),
    missing_information: stringList('In plain words, as a question to the founder. Never an internal field name. Empty if none.'),
    what_would_change_minds: stringList("Only from the advisors' stated \"would change my mind\" lines: concrete facts that could be checked and would reverse the board's decision. Empty if those lines give nothing concrete, or there are none."),
    recommended_experiment: { type: 'string', description: 'An empty string if no experiment is worth running' },
    verdict: { type: 'string', description: "The room's answer to the question in one plain sentence." },
    priority_actions: PRIORITY_ACTIONS,
    top_issues: TOP_ISSUES,
    founder_questions: stringList('Decisions only the founder can make, each a short question answerable yes or no. At most 4. Empty if none.'),
    disagreements: stringList('Where the room genuinely disagreed and it was not settled: at most 3, one line each naming who disagreed about what. Empty if the room agreed.'),
    overall_confidence_score: { type: 'number', description: 'A whole number from 0 to 100, never a 0-1 fraction' },
    confidence_reason: { type: 'string', description: 'One line: why the confidence is what it is.' },
    discussion_evaluation: {
      type: 'object',
      properties: {
        strongest_arguments: stringList(),
        disproven_arguments: stringList('Empty if none'),
        uncertain_assumptions: stringList('Empty if none'),
        most_persuasive_advisor: { type: 'string' },
        consensus_assessment: { type: 'string' },
        opinions_changed: stringList('Empty if none'),
        missing_evidence: stringList('Empty if none'),
      },
      required: ['strongest_arguments', 'disproven_arguments', 'uncertain_assumptions', 'most_persuasive_advisor',
        'consensus_assessment', 'opinions_changed', 'missing_evidence'],
    },
  },
  required: ['executive_summary', 'decision_question', 'recommended_direction', 'reasoning', 'areas_of_agreement',
    'areas_of_disagreement', 'main_risks', 'minority_opinion', 'assumptions', 'missing_information', 'what_would_change_minds', 'recommended_experiment',
    'verdict', 'priority_actions', 'top_issues', 'founder_questions', 'disagreements',
    'overall_confidence_score', 'confidence_reason', 'discussion_evaluation'],
  'x-core': ['executive_summary', 'recommended_direction', 'reasoning', 'overall_confidence_score'],
};

// The Chair's second pass when an action or fix came back too vague to act
// on: just those items, reworded, each named by its number.
export const RESULTS_REPAIR_SCHEMA = {
  type: 'object',
  properties: {
    actions: {
      type: 'array',
      description: 'Only the actions you were asked to reword, each with its number.',
      items: {
        type: 'object',
        properties: {
          number: { type: 'integer', description: 'The action number you were given.' },
          title: { type: 'string' },
          brief: { type: 'string' },
          done_when: { type: 'string' },
        },
        required: ['number', 'title', 'brief', 'done_when'],
      },
    },
    fixes: {
      type: 'array',
      description: 'Only the fixes you were asked to reword, each with its issue number.',
      items: {
        type: 'object',
        properties: { number: { type: 'integer', description: 'The issue number you were given.' }, fix: { type: 'string' } },
        required: ['number', 'fix'],
      },
    },
  },
  required: ['actions', 'fixes'],
};

// An advisor acknowledging a finished task.
export const TASK_ACK_SCHEMA = { type: 'object', properties: { acknowledgment: { type: 'string' } }, required: ['acknowledgment'] };

// The founder's first plan, from the onboarding answers.
export const ONBOARDING_SCHEMA = {
  type: 'object',
  properties: {
    company_type: { type: 'string', description: "A short label for the type of company, e.g. 'DTC Consumer Brand' or 'B2B SaaS Startup' — infer this from whatever the founder shared, even if limited" },
    recommended_journey: {
      type: 'string',
      enum: ['idea_validation', 'pre_launch', 'early_revenue', 'growth', 'fundraising', 'product_launch', 'market_expansion', 'turnaround'],
    },
    executive_briefing: { type: 'string', description: 'A warm, concise 2-3 sentence personalised briefing for the founder' },
    recommended_advisors: {
      type: 'array',
      description: 'The six starting advisors listed in the prompt, in order, each with a personal reason',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'One of the six keys listed in the prompt' },
          name: { type: 'string' },
          role: { type: 'string' },
          reason: { type: 'string', description: 'One sentence explaining why this advisor is recommended for this specific founder' },
        },
        required: ['key', 'name', 'role', 'reason'],
      },
    },
    suggested_meetings: {
      type: 'array',
      description: 'Exactly 3 strategic questions the founder should bring to their board',
      items: { type: 'string' },
    },
    suggested_tasks: {
      type: 'array',
      description: '3 to 5 concrete first tasks',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          assigned_to: { type: 'string', description: "The advisor role or 'Founder'" },
        },
        required: ['title', 'assigned_to'],
      },
    },
    start_here_action: { type: 'string', description: 'One clear, specific primary action the founder should take first' },
  },
  required: ['company_type', 'recommended_journey', 'executive_briefing', 'recommended_advisors', 'suggested_meetings', 'suggested_tasks', 'start_here_action'],
};

// The admin "Test advisor" button's answer.
export const ADMIN_TEST_SCHEMA = {
  type: 'object',
  properties: {
    position: { type: 'string' },
    recommendation: { type: 'string' },
    key_arguments: { type: 'array', items: { type: 'string' } },
    confidence_score: { type: 'number', description: '0-100' },
  },
  required: ['position', 'recommendation', 'key_arguments', 'confidence_score'],
  'x-core': ['position', 'recommendation', 'confidence_score'],
};

// "Do this for me" (M2a). Draft: something the founder edits and sends
// themselves; nothing is ever sent for them.
export const TASK_DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'A short name for the piece, e.g. "Message to the two charity shops".' },
    kind: { type: 'string', enum: ['email', 'message', 'listing', 'post', 'document', 'other'] },
    subject: { type: 'string', description: 'The email subject line. Empty unless it is an email.' },
    body: { type: 'string', description: "The full text, ready for the founder to edit and send, in the founder's own voice. Plain text with line breaks. Anything you don't know goes in [square brackets], e.g. [price]." },
    placeholders: stringList('Each [square bracket] in the text and what to fill in. Empty if none.'),
    check_before_sending: stringList('At most 3 things the founder should check before sending. Empty if none.'),
    professional_check: { type: 'boolean', description: 'True for a contract, NDA, terms, lease, company paperwork, or anything with legal or tax consequences.' },
  },
  required: ['title', 'kind', 'subject', 'body', 'placeholders', 'check_before_sending', 'professional_check'],
};

// Plan: a dated, step-by-step checklist, with a helper where it's useful.
export const TASK_PLAN_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'A short name for the plan.' },
    summary: { type: 'string', description: 'One sentence: what the plan gets done and by when.' },
    steps: {
      type: 'array',
      description: 'Between 3 and 10 steps, in order.',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'The day to do it, as YYYY-MM-DD, starting from today.' },
          step: { type: 'string', description: 'The step itself, small and concrete.' },
          detail: { type: 'string', description: 'One line of how, or empty.' },
        },
        required: ['date', 'step', 'detail'],
      },
    },
    helper: {
      type: 'object',
      description: 'One ready-made thing that makes the plan easier, such as a call script or an email. Kind none if nothing would help.',
      properties: {
        kind: { type: 'string', enum: ['call_script', 'email', 'message', 'checklist', 'none'] },
        title: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['kind', 'title', 'body'],
    },
    professional_check: { type: 'boolean', description: 'True if any step has legal or tax consequences (a contract, company paperwork, tax).' },
  },
  required: ['title', 'summary', 'steps', 'helper', 'professional_check'],
};

// Research and Calculate (Stage 3): the advisor's web research, put into
// shape. Every finding, figure and check names its source by number from
// the list of pages the search actually returned; the server drops any
// that don't.
const SOURCE_REF = { type: 'integer', description: 'The number of the source in the list you were given. 0 if none.' };

export const TASK_RESEARCH_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'A short name for the research.' },
    summary: { type: 'string', description: 'Two or three sentences: what was found, in plain English.' },
    findings: {
      type: 'array',
      description: 'The findings as rows of a table, most useful first. Only things a source supports.',
      items: {
        type: 'object',
        properties: {
          finding: { type: 'string', description: 'The fact, in one line.' },
          detail: { type: 'string', description: 'A little more: a price, a condition, a date. Empty if none.' },
          source: SOURCE_REF,
        },
        required: ['finding', 'detail', 'source'],
      },
    },
    legitimacy: {
      type: 'array',
      description: 'For each business, supplier or offer the research names: does it look real and trustworthy?',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          verdict: { type: 'string', enum: ['looks_legitimate', 'unclear', 'warning_signs'] },
          why: { type: 'string', description: 'What the verdict rests on, in one line.' },
          source: SOURCE_REF,
        },
        required: ['name', 'verdict', 'why', 'source'],
      },
    },
    risks: {
      type: 'array',
      description: 'Risks a good advisor would flag (counterfeits, scams, regulated or illegal activity, legal or tax issues), each with what to do. Empty if none.',
      items: {
        type: 'object',
        properties: { risk: { type: 'string' }, what_to_do: { type: 'string' } },
        required: ['risk', 'what_to_do'],
      },
    },
    unsure: stringList("What the research couldn't establish, in plain words. Empty if nothing."),
    professional_check: { type: 'boolean', description: 'True if anything here has legal or tax consequences.' },
  },
  required: ['title', 'summary', 'findings', 'legitimacy', 'risks', 'unsure', 'professional_check'],
};

export const TASK_CALCULATE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'A short name for the calculation.' },
    answer: { type: 'string', description: 'The result in one plain sentence, with the number.' },
    workings: {
      type: 'array',
      description: 'The steps, in order, each explained in plain English with its result.',
      items: {
        type: 'object',
        properties: { step: { type: 'string' }, result: { type: 'string' } },
        required: ['step', 'result'],
      },
    },
    inputs: {
      type: 'array',
      description: 'Every figure the calculation used, and where it came from.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          value: { type: 'string' },
          source: SOURCE_REF,
          from_founder: { type: 'boolean', description: 'True if the founder or their company record gave this figure.' },
        },
        required: ['name', 'value', 'source', 'from_founder'],
      },
    },
    unsure: stringList("What the calculation couldn't pin down. Empty if nothing."),
    professional_check: { type: 'boolean', description: 'True if this bears on tax, legal or financial commitments.' },
  },
  required: ['title', 'answer', 'workings', 'inputs', 'unsure', 'professional_check'],
};
