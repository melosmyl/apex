import { assert, assertEquals } from 'jsr:@std/assert@1';
import { FACTS_RULE, withFactsRule } from './factsRule.ts';

Deno.test('the facts rule follows the record, and only where there is one', () => {
  assertEquals(withFactsRule('Company: Stoked'), `Company: Stoked\n\n${FACTS_RULE}`);
  assertEquals(withFactsRule(null), null);
  assertEquals(withFactsRule('  '), null);
});

Deno.test('advisors ask what would change their advice; the Chair\'s opening asks nothing', () => {
  assert(FACTS_RULE.includes('never a premise') && FACTS_RULE.includes('If knowing it would change your advice, ask it'));
  const opening = withFactsRule('Company: Stoked', { asks: false })!;
  assert(opening.includes('=== FACTS ABOUT THIS BUSINESS ===') && opening.includes('never state it, assume it or guess at it'));
  assert(!opening.includes('ask it'));
});
