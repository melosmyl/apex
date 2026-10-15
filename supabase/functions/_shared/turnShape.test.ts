import { assert, assertEquals } from 'jsr:@std/assert@1';
import { chairTags, discussionSchema, recordWords, shapedEntry, similarity, turnFlags } from './turnShape.ts';

const names = ['Sofia Marchetti', 'Victor Hale'];
const record = recordWords('petit m sells hand-painted dinner sets. £3,500 saved. Stall at Spitalfields market.', 'Should we take a stall?');
const turn = (over: Record<string, unknown> = {}) => ({
  position: 'Do one Saturday at Spitalfields before committing the £3,500.', because: 'A single £140 pitch tests whether dinner sets sell to passing trade.',
  answering_who: 'Victor Hale', answering_point: 'Go all in on the big market', stance: 'disagree', adds: 'Breakage in transport is uninsured.',
  message: 'Victor, one Saturday tells us more than a month of planning.', changed_opinion: false, new_position: '', moved_by: '', change_because: '',
  founder_answer: '', treated_as: '', against_me: '', would_change_my_mind: '', new_risks: [], confidence_score: 60, answerable: true, ...over,
});
const entry = (over = {}, isLastRound = false) => ({ advisor_name: 'Sofia Marchetti', ...shapedEntry(turn(over), { speaker: 'Sofia Marchetti', isLastRound }) });
const flags = (e: any, sameRound: any[] = [], isLastRound = false, earlier: any[] = []) => turnFlags(e, { sameRound, earlier, record, isLastRound });

Deno.test('who is answered can only be someone in the meeting, the founder, or nobody', () => {
  const s: any = discussionSchema(names);
  assertEquals(s.properties.answering_who.enum, ['Sofia Marchetti', 'Victor Hale', 'Founder', '']);
  assertEquals(s.properties.moved_by.enum, s.properties.answering_who.enum);
  assertEquals((discussionSchema(['Founder', 'Ann Lee', 'Ann Lee', ' ']) as any).properties.answering_who.enum, ['Ann Lee', 'Founder', '']);
  assertEquals([...s.required].sort(), Object.keys(s.properties).sort());
});

Deno.test("the fields every reader uses are worked out from the shape", () => {
  const e = entry();
  assertEquals([e.message_type, e.reply_to_advisor, e.agrees_with, e.changed_opinion], ['challenge', 'Victor Hale', null, false]);
  assertEquals(entry({ stance: 'agree', adds: '' }).agrees_with, 'Victor Hale');
  assertEquals(entry({ stance: 'agree', adds: 'Also the van.' }).agrees_with, null);
  assertEquals(entry({ answering_who: 'Sofia Marchetti' }).reply_to_advisor, null);
  assertEquals(entry({}, true).message_type, 'final_statement');
  assertEquals(entry({ changed_opinion: true, new_position: 'Go', moved_by: 'Victor Hale', change_because: 'He showed footfall' }).message_type, 'opinion_changed');
});

Deno.test("the founder's and the final round's parts are kept only where they belong", () => {
  const e = shapedEntry(turn({ founder_answer: 'Yes', treated_as: 'fact', against_me: 'x', would_change_my_mind: 'y' }), { speaker: 'Sofia Marchetti', isLastRound: false });
  assertEquals([e.founder_answer, e.treated_as, e.against_me, e.would_change_my_mind], ['', '', '', '']);
  const f = shapedEntry(turn({ founder_answer: 'Yes', treated_as: 'fact', against_me: 'x', would_change_my_mind: 'y' }), { speaker: 'Sofia Marchetti', isLastRound: true, founderSpoke: true });
  assertEquals([f.founder_answer, f.treated_as, f.against_me, f.would_change_my_mind], ['Yes', 'fact', 'x', 'y']);
});

Deno.test('a good turn passes every check', () => {
  assertEquals(flags(entry()), []);
});

Deno.test('a generic reason, a bare agreement, nobody answered and a change with no reason are flagged', () => {
  assert(flags(entry({ because: 'You should validate demand before you commit.' })).includes('generic_reason'));
  assert(flags(entry({ because: '' })).includes('generic_reason'));
  // Stock advice next to a company word, or a number that isn't a quantity, isn't specific.
  assert(flags(entry({ because: 'Validate demand and secure suppliers first.' })).includes('generic_reason'));
  assert(flags(entry({ because: 'Round 2 showed nobody has thought it through.' })).includes('generic_reason'));
  assertEquals(flags(entry({ because: 'The café on Spitalfields is already full at lunchtime.' })).includes('generic_reason'), false);
  assertEquals(flags(entry({ because: 'Each set costs £40 to make.' })).includes('generic_reason'), false);
  assert(flags(entry({ stance: 'agree', adds: '' })).includes('bare_agreement'));
  assert(flags(entry({ answering_who: '' })).includes('answers_no_one'));
  assert(flags(entry({ changed_opinion: true, new_position: 'Sign it', moved_by: 'Founder', change_because: "The founder has decided to go ahead." })).includes('change_without_reason'));
  assert(flags(entry({ changed_opinion: true, new_position: 'Sign it', moved_by: '', change_because: '' })).includes('change_without_reason'));
  assertEquals(flags(entry({ changed_opinion: true, new_position: 'Two stalls', moved_by: 'Victor Hale', change_because: 'His Spitalfields footfall figure.' })), []);
});

Deno.test('the same point twice in a round, a repeat of an earlier round, a long turn and a checklist are flagged', () => {
  const victor = { advisor_name: 'Victor Hale', message: 'Victor, one Saturday tells us more than a month of planning.' };
  assert(flags(entry(), [victor]).includes('same_point:Victor Hale'));
  assert(flags(entry(), [], false, [victor]).includes('repeats:Victor Hale'));
  assert(similarity('the stall at Spitalfields', 'renting a van in Leeds') < 0.3);
  assert(flags(entry({ message: Array(160).fill('word').join(' ') })).includes('long'));
  const list = '1. Validate demand\n2. Ensure compliance\n3. Secure suppliers';
  assert(flags(entry({ message: list })).includes('checklist'));
  assert(!flags(entry({ message: list }, true), [], true).includes('checklist'));
});

Deno.test('the Chair is told what failed', () => {
  assertEquals(chairTags(['generic_reason', 'same_point:Victor Hale', 'change_without_reason', 'repeats:Priya Nair']),
    ['[NO SPECIFIC REASON]', '[CHANGE WITHOUT A REASON — counts as their earlier position]', '[SAME POINT AS Victor Hale — count once]', "[REPEATS Priya Nair'S EARLIER POINT]"]);
  assertEquals(chairTags(['long', 'checklist', 'bare_agreement']), []);
  assertEquals(chairTags(null), []);
  assertEquals(chairTags('generic_reason'), []);
});
