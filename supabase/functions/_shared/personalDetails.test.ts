import { assert, assertEquals } from 'jsr:@std/assert@1';
import { ownWords, personalDetailsNote, usedPersonalDetail } from './personalDetails.ts';
import { buildSystemPrompt } from './advisorPrompt.ts';

const amara = {
  id: 'a1', name: 'Amara Vance', role: 'Visionary', system_instructions: 'You are Amara Vance, the Visionary on this founder\'s board.',
  book: 'Invisible Cities, Italo Calvino.', hobby: 'Stargazing with a telescope she doesn\'t fully know how to use.',
  favourite_place: 'Kyoto in the rain.', mug: '“What\'s next”', personal_detail_terms: ['Invisible Cities', 'Calvino', 'telescope', 'stargazing', 'Kyoto'],
};

Deno.test('the note offers book, hobby and place with the once-only rule, and never the mug', () => {
  const note = personalDetailsNote(amara);
  assert(note.includes('Invisible Cities') && note.includes('Stargazing') && note.includes('Kyoto'));
  assert(/at most once in this meeting/.test(note) && /Never as small talk/.test(note));
  assert(!note.includes("What's next"), 'the mug is never offered');
});

Deno.test('the prompt carries the note only when offered', () => {
  assert(buildSystemPrompt(amara, null, null, null, true).includes('Off the clock'));
  assert(!buildSystemPrompt(amara, null, null, null, false).includes('Off the clock'));
  assert(!buildSystemPrompt(amara, null, null, null).includes('Off the clock'), 'off by default');
  assert(!buildSystemPrompt({ ...amara, book: null, hobby: null, favourite_place: null }, null, null, null, true).includes('Off the clock'),
    'a custom advisor with no details gets no note');
});

Deno.test('a mention in any of their own earlier turns is caught, whatever the case', () => {
  assertEquals(usedPersonalDetail(amara, ['We should think bigger.']), false);
  assertEquals(usedPersonalDetail(amara, ['As I learned in KYOTO, rain changes plans.']), true);
  assertEquals(usedPersonalDetail({ ...amara, personal_detail_terms: [] }, ['Kyoto']), false);
});

Deno.test("only the advisor's own words count, Round 1 included", () => {
  const r1 = [{ advisor_id: 'a1', position: 'Think bigger', recommendation: 'Like Invisible Cities, imagine the map', key_arguments: [] },
    { advisor_id: 'x', position: 'I love Kyoto', recommendation: '' }];
  const transcript = [{ advisor_id: 'x', message: 'Kyoto again' }, { advisor_id: 'a1', message: 'Still bigger.' }];
  assertEquals(usedPersonalDetail(amara, ownWords(amara, [r1[1]], transcript)), false, "another advisor's mention doesn't count");
  assertEquals(usedPersonalDetail(amara, ownWords(amara, r1, transcript)), true);
});

Deno.test('ordinary business words never count as a mention', async () => {
  const { ADVISOR_LIBRARY } = await import('../../../src/lib/advisorLibrary.js');
  const byKey = (k: string) => ADVISOR_LIBRARY.find((a: { key: string }) => a.key === k);
  const everyday = [
    'Growing revenue matters; we are borrowing against throwing money at it.',
    'Altogether, a Palo Alto start-up would see a black swan event as plain sailing.',
    'Treat it as a marathon, not a sprint; time-boxing and unboxing the product helps.',
    'Demand is mushrooming; check the share allotment and the market town of your customers.',
  ];
  for (const k of ['investor', 'people_culture', 'risk_analyst', 'operator', 'supply_chain', 'contrarian', 'scientist', 'customer_advocate', 'arthur-penrose']) {
    assertEquals(usedPersonalDetail(byKey(k), everyday), false, `${k} fired on an everyday phrase`);
  }
});

Deno.test('real mentions are caught, curly apostrophes and all', async () => {
  const { ADVISOR_LIBRARY } = await import('../../../src/lib/advisorLibrary.js');
  const byKey = (k: string) => ADVISOR_LIBRARY.find((a: { key: string }) => a.key === k);
  assertEquals(usedPersonalDetail(byKey('investor'), ['Rowing at six teaches you patience.']), true);
  assertEquals(usedPersonalDetail(byKey('investor'), ['From my bench in Regent’s Park…']), true);
  assertEquals(usedPersonalDetail(byKey('capital_allocator'), ['Sun Tzu would not fight this battle.']), true);
  assertEquals(usedPersonalDetail(byKey('nathan-cole'), ['When I build furniture, I over-engineer.']), true);
  assertEquals(usedPersonalDetail(byKey('theo-lindqvist'), ['Like cold water swimming: get in, no talking.']), true);
});

Deno.test("an advisor's own risks and questions count as their words", () => {
  const words = ownWords(amara, [{ advisor_id: 'a1', position: 'x', recommendation: 'y', missing_information: [{ detail: 'Have you been to Kyoto?' }] }],
    [{ advisor_id: 'a1', message: 'ok', new_risks: ['stargazing distracts'] }]);
  assert(words.includes('Have you been to Kyoto?') && words.includes('stargazing distracts'));
});

Deno.test('a very long founder-edited detail never cuts off the rule', () => {
  const note = personalDetailsNote({ ...amara, book: 'x'.repeat(5000) });
  assert(/Never as small talk/.test(note) && note.length < 1500);
});
