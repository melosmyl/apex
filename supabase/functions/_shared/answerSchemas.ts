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
    assumptions: { type: 'array', items: { type: 'string' }, description: 'Empty if none' },
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
    assumptions: stringList(),
    missing_information: stringList('Empty if none'),
    recommended_experiment: { type: 'string', description: 'An empty string if no experiment is worth running' },
    priority_frame: { type: 'string', description: 'One sentence naming the explicit criterion: what has to happen before spending more time or money on this question. Not a generic "these are worth doing."' },
    priority_actions: {
      type: 'array',
      description: 'At most 3 items — the ranked things to do before spending more time or money on this, not every next-step anyone mentioned. These become the real tasks created from this meeting.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          assigned_to: { type: 'string', description: 'The advisor who raised it, or "Founder"' },
          why_first: { type: 'string', description: 'Why this specific item has to happen before spending more time or money, per priority_frame.' },
        },
        required: ['title', 'assigned_to', 'why_first'],
      },
    },
    overall_confidence_score: { type: 'number', description: 'A whole number from 0 to 100, never a 0-1 fraction' },
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
    'areas_of_disagreement', 'main_risks', 'minority_opinion', 'assumptions', 'missing_information', 'recommended_experiment',
    'priority_frame', 'priority_actions', 'overall_confidence_score', 'discussion_evaluation'],
  'x-core': ['executive_summary', 'recommended_direction', 'reasoning', 'overall_confidence_score'],
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
