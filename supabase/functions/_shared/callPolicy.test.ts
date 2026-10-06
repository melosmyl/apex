import { assertEquals } from 'jsr:@std/assert@1';
import { claudeSettings, legacyPolicy, lowerEffort, maxOutputFor, policyFor, ratesFor } from './callPolicy.ts';

Deno.test('every meeting call has its policy; documents and assistant calls keep theirs', () => {
  for (const t of ['independent', 'discussion_round_2', 'discussion_round_3', 'founder_followup', 'chair_opening',
    'chair_synthesis', 'task_acknowledgment', 'onboarding_plan', 'admin_test']) {
    assertEquals(policyFor(t) !== null, true, t);
  }
  for (const t of ['deliverable_spec', 'assistant_tag', 'progression_node_expand', 'unknown', null]) assertEquals(policyFor(t), null);
});

Deno.test('the limits are the approved ones', () => {
  assertEquals(policyFor('independent')!.maxTokens, { anthropic: 16_000, openai: 8_000 });
  assertEquals(policyFor('discussion_round_2')!.maxTokens, { anthropic: 16_000, openai: 8_000 });
  assertEquals(policyFor('chair_opening')!.maxTokens, { anthropic: 8_000, openai: 4_000 });
  assertEquals(policyFor('chair_synthesis')!.maxTokens, { anthropic: 64_000, openai: 16_000 });
  assertEquals(policyFor('chair_synthesis')!.effort, 'high');
  assertEquals(policyFor('task_acknowledgment')!.maxTokens, { anthropic: 4_000, openai: 1_000 });
  assertEquals(policyFor('onboarding_plan')!.maxTokens, { anthropic: 8_000, openai: 8_000 });
  assertEquals(legacyPolicy(400, 60_000).nativeFormat, false);
});

Deno.test('each Claude model gets thinking settings it accepts', () => {
  assertEquals(claudeSettings('claude-sonnet-5', 'adaptive', 'high'), { thinking: { type: 'adaptive' }, effort: 'high', label: 'adaptive' });
  assertEquals(claudeSettings('claude-sonnet-5', 'off', 'high'), { thinking: { type: 'disabled' }, effort: 'high', label: 'disabled' });
  // Sonnet 5.5 turns thinking off with between_tools, only at effort high or below.
  assertEquals(claudeSettings('claude-sonnet-5-5', 'off', 'xhigh'), { thinking: { type: 'between_tools' }, effort: 'high', label: 'between_tools' });
  // Opus 5.5 and Fable 5.1 always think: "off" is adaptive at low effort.
  assertEquals(claudeSettings('claude-fable-5-1', 'off', 'high'), { thinking: { type: 'adaptive' }, effort: 'low', label: 'adaptive (no off setting)' });
  assertEquals(claudeSettings('claude-opus-5-5', 'off', 'high').thinking, { type: 'adaptive' });
  // Haiku 4.5 has neither adaptive thinking nor effort.
  assertEquals(claudeSettings('claude-haiku-4-5', 'adaptive', 'high'), { label: 'none' });
});

Deno.test('a cut-off retry steps effort down until there is nowhere lower', () => {
  assertEquals(lowerEffort('max'), 'xhigh');
  assertEquals(lowerEffort('high'), 'medium');
  assertEquals(lowerEffort('low'), null);
});

Deno.test('output limits never exceed what the model allows', () => {
  assertEquals(maxOutputFor('openai', 'gpt-4o', 16_000), 16_000);
  assertEquals(maxOutputFor('openai', 'gpt-4o', 64_000), 16_384);
  assertEquals(maxOutputFor('anthropic', 'claude-sonnet-5', 64_000), 64_000);
});

Deno.test('prices are the real ones', () => {
  const perM = (p: string, m: string) => { const r = ratesFor(p, m); return [Math.round(r.input * 1e8) / 100, Math.round(r.output * 1e8) / 100]; };
  assertEquals(perM('anthropic', 'claude-sonnet-5'), [2, 10]);
  assertEquals(perM('anthropic', 'claude-sonnet-5-5'), [2, 10]);
  assertEquals(perM('anthropic', 'claude-opus-5-5'), [4, 20]);
  assertEquals(perM('anthropic', 'claude-fable-5-1'), [10, 50]);
  assertEquals(perM('openai', 'gpt-4o'), [2.5, 10]);
  assertEquals(perM('openai', 'gpt-4o-mini'), [0.15, 0.6]);
});
