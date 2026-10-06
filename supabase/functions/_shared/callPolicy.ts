// The rules for every kind of model call, in one table: the thinking
// setting, the effort, the output limit per provider, whether the answer
// shape is enforced natively, and how much time is kept back for the
// fallback model. Plus what each Claude model accepts, and what each model
// really costs. No imports, so callers can read the time limits without
// pulling in the provider SDKs.

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type ThinkingChoice = 'adaptive' | 'off';

export type CallPolicy = {
  maxTokens: { anthropic: number; openai: number };
  thinking: ThinkingChoice;
  effort: Effort;
  // The exact answer shape enforced by the provider (OpenAI strict
  // json_schema, Anthropic output_config.format) instead of pasted into the
  // prompt.
  nativeFormat: boolean;
  // Time the primary model leaves unused so the fallback still has a chance.
  fallbackReserveMs: number;
  // A cap on any single attempt; unset means "the time that's left".
  attemptTimeoutMs?: number;
};

// Supabase answers a request for at most 150s. Model calls stop by 140s, so
// the usage row is always written; a caller passes its own, earlier, deadline
// (deadline_at) so it still has time to save what came back.
export const CALL_DEADLINE_MS = 140_000;
export const CALLER_SAVE_MARGIN_MS = 6_000;

// A debater's answer: Round 1, every discussion round, founder follow-ups.
// Adaptive thinking is today's behaviour (Sonnet 5 thinks when `thinking` is
// omitted), now stated; Stage 4's comparison decides per advisor.
const DEBATER: CallPolicy = {
  maxTokens: { anthropic: 16_000, openai: 8_000 },
  thinking: 'adaptive', effort: 'high', nativeFormat: true, fallbackReserveMs: 20_000,
};

const POLICIES: Record<string, CallPolicy> = {
  independent: DEBATER,
  founder_followup: DEBATER,
  // The admin "Test advisor" button tests what a meeting would run.
  admin_test: DEBATER,
  chair_opening: {
    maxTokens: { anthropic: 8_000, openai: 4_000 },
    thinking: 'adaptive', effort: 'high', nativeFormat: true, fallbackReserveMs: 20_000,
  },
  chair_synthesis: {
    maxTokens: { anthropic: 64_000, openai: 16_000 },
    thinking: 'adaptive', effort: 'high', nativeFormat: true, fallbackReserveMs: 45_000,
  },
  task_acknowledgment: {
    maxTokens: { anthropic: 4_000, openai: 1_000 },
    thinking: 'adaptive', effort: 'high', nativeFormat: true, fallbackReserveMs: 15_000,
  },
  onboarding_plan: {
    maxTokens: { anthropic: 8_000, openai: 8_000 },
    thinking: 'adaptive', effort: 'high', nativeFormat: true, fallbackReserveMs: 40_000,
  },
};

// The policy for a request type, or null for the calls 1b leaves as they are
// (documents and the small assistant calls).
export function policyFor(requestType: string | null | undefined): CallPolicy | null {
  if (!requestType) return null;
  if (/^discussion_round_\d+$/.test(requestType)) return DEBATER;
  return POLICIES[requestType] ?? null;
}

// Calls without a policy keep their pasted schema and the output limit they
// asked for; their Claude calls now state the thinking setting they were
// already getting by default.
export function legacyPolicy(maxTokens: number, attemptTimeoutMs: number): CallPolicy {
  return {
    maxTokens: { anthropic: maxTokens, openai: maxTokens },
    thinking: 'adaptive', effort: 'high', nativeFormat: false, fallbackReserveMs: 0, attemptTimeoutMs,
  };
}

// ---------------------------------------------------------------------
// What each Claude model accepts. Without this, a comparison run on a
// model with different rules fails with a 400 instead of answering.
// ---------------------------------------------------------------------
type ClaudeCaps = {
  adaptive: boolean; // accepts thinking: {type: 'adaptive'}
  effort: boolean; // accepts output_config.effort
  off: 'disabled' | 'between_tools' | null; // its "thinking off" setting, if it has one
  maxOutput: number;
  structured?: false; // no native structured outputs (output_config.format)
};

const CLAUDE: Record<string, ClaudeCaps> = {
  'claude-sonnet-5': { adaptive: true, effort: true, off: 'disabled', maxOutput: 128_000 },
  'claude-sonnet-5-5': { adaptive: true, effort: true, off: 'between_tools', maxOutput: 128_000 },
  'claude-opus-5-5': { adaptive: true, effort: true, off: null, maxOutput: 128_000 },
  'claude-opus-5': { adaptive: true, effort: true, off: 'disabled', maxOutput: 128_000 },
  'claude-fable-5-1': { adaptive: true, effort: true, off: null, maxOutput: 128_000 },
  'claude-fable-5': { adaptive: true, effort: true, off: null, maxOutput: 128_000 },
  'claude-opus-4-8': { adaptive: true, effort: true, off: 'disabled', maxOutput: 128_000 },
  'claude-opus-4-7': { adaptive: true, effort: true, off: 'disabled', maxOutput: 128_000, structured: false },
  'claude-opus-4-6': { adaptive: true, effort: true, off: 'disabled', maxOutput: 128_000, structured: false },
  'claude-sonnet-4-6': { adaptive: true, effort: true, off: 'disabled', maxOutput: 64_000, structured: false },
  'claude-haiku-4-5': { adaptive: false, effort: false, off: null, maxOutput: 64_000 },
};
// A Claude model not listed yet: the current family's rules.
const CLAUDE_UNKNOWN: ClaudeCaps = { adaptive: true, effort: true, off: null, maxOutput: 64_000 };

const OPENAI_MAX_OUTPUT: Record<string, number> = { 'gpt-4o': 16_384, 'gpt-4o-mini': 16_384 };

// Whether the model accepts output_config.format; others get the schema pasted.
export function claudeStructuredOutputs(model: string): boolean {
  return (CLAUDE[model] ?? CLAUDE_UNKNOWN).structured !== false;
}

export function maxOutputFor(provider: string, model: string, wanted: number): number {
  const ceiling = provider === 'anthropic' ? (CLAUDE[model] ?? CLAUDE_UNKNOWN).maxOutput : (OPENAI_MAX_OUTPUT[model] ?? 16_384);
  return Math.max(1, Math.min(wanted, ceiling));
}

const EFFORT_ORDER: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

// One step down, for retrying an answer that was cut off; null at the bottom.
export function lowerEffort(effort: Effort): Effort | null {
  const i = EFFORT_ORDER.indexOf(effort);
  return i > 0 ? EFFORT_ORDER[i - 1] : null;
}

export type ClaudeSettings = {
  thinking?: { type: 'adaptive' } | { type: 'disabled' } | { type: 'between_tools' };
  effort?: Effort;
  label: string; // what was actually sent, for the attempt log
};

// The thinking and effort fields a Claude request sends for a choice.
// Sonnet 5.5's "off" is between_tools; Opus 5.5 and Fable 5.1 always think,
// so "off" becomes adaptive at low effort there; both off settings are
// refused above effort high.
export function claudeSettings(model: string, choice: ThinkingChoice, effort: Effort): ClaudeSettings {
  const caps = CLAUDE[model] ?? CLAUDE_UNKNOWN;
  if (!caps.adaptive) return { label: 'none' };
  if (choice === 'off') {
    if (caps.off) {
      const capped = EFFORT_ORDER.indexOf(effort) > EFFORT_ORDER.indexOf('high') ? 'high' : effort;
      return { thinking: { type: caps.off }, effort: caps.effort ? capped : undefined, label: caps.off };
    }
    return { thinking: { type: 'adaptive' }, effort: caps.effort ? 'low' : undefined, label: 'adaptive (no off setting)' };
  }
  return { thinking: { type: 'adaptive' }, effort: caps.effort ? effort : undefined, label: 'adaptive' };
}

// ---------------------------------------------------------------------
// Real prices, in dollars per token (input, output; thinking is billed as
// output). The free-meeting ceiling sums these, so they must be the real
// numbers, not round-ups.
// ---------------------------------------------------------------------
const M = 1_000_000;
const RATES: Record<string, { input: number; output: number }> = {
  'openai:gpt-4o': { input: 2.5 / M, output: 10 / M },
  'openai:gpt-4o-mini': { input: 0.15 / M, output: 0.6 / M },
  'anthropic:claude-sonnet-5': { input: 2 / M, output: 10 / M },
  'anthropic:claude-sonnet-5-5': { input: 2 / M, output: 10 / M },
  'anthropic:claude-opus-5-5': { input: 4 / M, output: 20 / M },
  'anthropic:claude-opus-5': { input: 5 / M, output: 25 / M },
  'anthropic:claude-fable-5-1': { input: 10 / M, output: 50 / M },
  'anthropic:claude-fable-5': { input: 10 / M, output: 50 / M },
  'anthropic:claude-opus-4-8': { input: 5 / M, output: 25 / M },
  'anthropic:claude-opus-4-7': { input: 5 / M, output: 25 / M },
  'anthropic:claude-opus-4-6': { input: 5 / M, output: 25 / M },
  'anthropic:claude-sonnet-4-6': { input: 3 / M, output: 15 / M },
  'anthropic:claude-haiku-4-5': { input: 1 / M, output: 5 / M },
};
// A model without a listed price is logged at the old, higher provider
// rate, so an omission over-counts spend rather than hiding it.
const UNLISTED: Record<string, { input: number; output: number }> = {
  openai: { input: 5 / M, output: 15 / M },
  anthropic: { input: 3 / M, output: 15 / M },
};

export function ratesFor(provider: string, model: string) {
  return RATES[`${provider}:${model}`] ?? UNLISTED[provider] ?? UNLISTED.openai;
}
