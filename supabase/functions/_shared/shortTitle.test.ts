import { assert, assertEquals } from 'jsr:@std/assert@1';
import { cleanShortTitle, matchShortTitles, shortTitlePrompt } from './shortTitle.ts';

Deno.test('a short title is trimmed and kept within seven words', () => {
  assertEquals(cleanShortTitle('  Price the stall against three markets  '), 'Price the stall against three markets');
  assertEquals(cleanShortTitle('"Call the Spitalfields organiser."'), 'Call the Spitalfields organiser');
  assertEquals(cleanShortTitle('Work out the margin at £65'), 'Work out the margin at £65');
  assertEquals(cleanShortTitle('Work out the margin per set at £65'), null); // eight words
  assertEquals(cleanShortTitle('one two three four five six seven eight'), null);
  assertEquals(cleanShortTitle('x'.repeat(81)), null);
  assertEquals(cleanShortTitle(''), null);
  assertEquals(cleanShortTitle('   '), null);
  assertEquals(cleanShortTitle(42), null);
});

Deno.test('answers are matched to the tasks asked about, and nothing else', () => {
  const asked = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const m = matchShortTitles(asked, { titles: [
    { id: 'a', short_title: 'Ask the shop owners three questions' },
    { id: 'b', short_title: 'this one is far too long to be a short title' },
    { id: 'z', short_title: 'Someone else entirely' },
    { id: 'a', short_title: 'A second answer for a' },
  ] });
  assertEquals([...m!.entries()], [['a', 'Ask the shop owners three questions'], ['b', null], ['c', null]]);
  // No list, an empty one, or one naming none of the tasks: a failed try,
  // not three answers of "none".
  assertEquals(matchShortTitles(asked, { titles: [] }), null);
  assertEquals(matchShortTitles(asked, { titles: [{ id: '1', short_title: 'Mangled id' }] }), null);
  assertEquals(matchShortTitles(asked, null), null);
  assertEquals(matchShortTitles(asked, { titles: 'nope' }), null);
});

Deno.test('the prompt carries each task by id, cut to a safe length', () => {
  const p = shortTitlePrompt([{ id: 't1', title: 'Draft a short message to the six parents' }, { id: 't2', title: 'y'.repeat(900) }]);
  assert(p.includes('"id":"t1"') && p.includes('six parents'));
  assert(!p.includes('y'.repeat(601)));
});
