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
