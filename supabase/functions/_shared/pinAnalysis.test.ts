import { assert, assertEquals } from 'jsr:@std/assert@1';
import { PIN_ANALYSIS_SCHEMA, normalisePinAnalysis, pinPrompt } from './pinAnalysis.ts';

Deno.test('a pin gets only allowed values, and only pins that exist are linked', () => {
  const r = normalisePinAnalysis({
    pin_title: '  Price the dinner set at £45  ', summary: 'Why the price matters.', category: 'finance', subcategory: 'Pricing',
    themes: ['Premium Positioning', 'Premium Positioning', ''], tags: ['Pricing', 'margin', 'pricing'], pin_type: 'made up', importance: 'URGENT',
    category_confidence: 7, related_pin_ids: ['p1', 'invented', 'p1'],
  }, 'the selected text', ['p1', 'p2']);
  assertEquals([r.pin_title, r.category, r.pin_type, r.importance, r.category_confidence], ['Price the dinner set at £45', 'Finance', 'Insight', 'normal', 1]);
  assertEquals([r.themes, r.tags, r.related_pin_ids], [['Premium Positioning'], ['pricing', 'margin'], ['p1']]);
  // Nothing usable back: the founder still gets a title to start from.
  const empty = normalisePinAnalysis(null, 'We should test the price at three markets first', []);
  assertEquals([empty.pin_title, empty.category, empty.related_pin_ids], ['We should test the price at three markets first', 'Other', []]);
});

Deno.test('the prompt trims long text and lists existing pins with their ids', () => {
  const p = pinPrompt({ selected_text: 'x'.repeat(9000), source_type: 'board_resolution', source_title: 'Pricing meeting' },
    [{ id: 'p1', pin_title: 'Old pin', summary: 's', themes: ['Customer Trust'], category: 'Customer' }]);
  assert(!p.includes('x'.repeat(4001)));
  assert(p.includes('"id":"p1"') && p.includes('Customer Trust') && p.includes('Pricing meeting'));
  assertEquals(PIN_ANALYSIS_SCHEMA.required.length, Object.keys(PIN_ANALYSIS_SCHEMA.properties).length);
});

Deno.test('a long pin list stays inside what the model is sent', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ id: `id-${i}`, pin_title: 't'.repeat(400), summary: 's'.repeat(900), themes: ['A', 'B', 'C', 'D'], category: 'Finance' }));
  const p = pinPrompt({ selected_text: 'x'.repeat(4000), surrounding_context: 'c'.repeat(4000) }, many);
  // routeAdvisorRequest cuts the prompt at 20,000 characters.
  assert(p.length < 18_000, `prompt is ${p.length} characters`);
  assert(p.includes('"id":"id-0"'), 'the newest pins come first');
  assert(p.trimEnd().endsWith(']'), 'the list is whole, not cut mid-way');
});
