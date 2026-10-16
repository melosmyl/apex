import { assert, assertEquals } from 'jsr:@std/assert@1';
import { callLine, callOf, openCallsForOpening, pastMeetingsSection, pastResolutionsSection } from './founderCalls.ts';

const meeting = (over: Record<string, unknown> = {}) => ({
  id: 'm1', question: 'Should we take the stall?', board_resolution: { recommended_direction: 'Book one Saturday first.' }, founder_decision: null, ...over,
});

Deno.test('three states: the board recommended it; the founder made a call (with the reason); or it is still open', () => {
  assertEquals(callOf(meeting()).state, 'open');
  assertEquals(callOf(meeting({ founder_decision: 'undecided' })).state, 'open');
  assertEquals(callOf(meeting({ founder_decision: 'reject', founder_decision_notes: 'Too far to travel' })), { state: 'reject', reason: 'Too far to travel' });
  // A Decision Centre record: its meeting's call wins; marked decided by hand counts; pending is open.
  assertEquals(callOf({ status: 'pending', call: 'accept', call_notes: '' }).state, 'accept');
  assertEquals(callOf({ status: 'decided', decision_taken: 'We will do two markets' }), { state: 'decided', reason: 'We will do two markets' });
  assertEquals(callOf({ status: 'pending', decision_taken: '' }).state, 'open');
  assert(callLine(meeting()).startsWith('STILL OPEN'));
  assert(callLine(meeting({ founder_decision: 'modify', founder_decision_notes: 'Only in spring' })).includes('MODIFIED it: "Only in spring"'));
});

Deno.test("board memory never calls an open recommendation a decision", () => {
  const s = pastResolutionsSection([{ question: 'Hire?', final_recommendation: 'Hire a part-timer', status: 'pending', created_at: '2026-10-01' }]);
  assert(s.includes('Recommended: Hire a part-timer') && s.includes('STILL OPEN') && s.includes('Only the founder\'s calls are decisions'));
  assert(!/past decisions related/i.test(s));
  assert(pastMeetingsSection([meeting({ founder_decision: 'accept' })]).includes('The founder ACCEPTED it.'));
});

Deno.test("the Chair's opening names open calls as open", () => {
  const s = openCallsForOpening([meeting(), meeting({ id: 'm2', question: 'Raise prices?', founder_decision: 'accept' }), meeting({ id: 'm3', question: 'Hire?', board_resolution: null })]);
  assert(s.includes('"Should we take the stall?"') && !s.includes('Raise prices?') && !s.includes('Hire?'));
  assert(s.includes("You haven't decided on X yet"));
  assertEquals(openCallsForOpening([meeting({ founder_decision: 'reject' })]), '');
});

Deno.test("a call made in the Decision Centre counts; a meeting's progress isn't a call; older calls with words count", () => {
  assertEquals(callOf(meeting({ status: 'complete', decision_status: 'decided', decision_taken: 'Two markets, not one' })), { state: 'decided', reason: 'Two markets, not one' });
  assertEquals(callOf(meeting({ status: 'complete' })).state, 'open');
  assertEquals(callOf(meeting({ founder_decision: 'custom', founder_decision_notes: 'Only weekends' })), { state: 'decided', reason: 'Only weekends' });
  assertEquals(callOf(meeting({ founder_decision: 'pending', founder_decision_notes: 'x' })).state, 'open');
});

Deno.test("the state comes before a long recommendation, which is capped", () => {
  const s = pastMeetingsSection([meeting({ board_resolution: { recommended_direction: 'x'.repeat(2000) } })]);
  assert(s.indexOf('STILL OPEN') < s.indexOf('Recommended:') && s.length < 1200);
});
