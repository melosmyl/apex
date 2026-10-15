import { assert, assertEquals } from 'jsr:@std/assert@1';
import { IDLE_GRACE_MS, STEP_STALE_MS, needsSweep, nextStep } from './meetingDriver.ts';

const NOW = Date.parse('2026-10-15T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const m = (fields: Record<string, unknown>) => ({ driver: 'server', step_attempts: 0, awaiting_human_input: false, updated_at: ago(1000), ...fields });

Deno.test('a server-run meeting moves to the next step, and waits while a step runs', () => {
  assertEquals(nextStep(m({ status: 'preparing', step_claimed_at: ago(1000) }), NOW), null);
  assertEquals(nextStep(m({ status: 'preparing', step_claimed_at: ago(STEP_STALE_MS) }), NOW), 'round1');
  assertEquals(nextStep(m({ status: 'independent_complete' }), NOW), 'round');
  assertEquals(nextStep(m({ status: 'discussing', step_claimed_at: null }), NOW), 'round');
  assertEquals(nextStep(m({ status: 'discussing', step_claimed_at: ago(1000) }), NOW), null);
  assertEquals(nextStep(m({ status: 'discussing', step_claimed_at: ago(STEP_STALE_MS) }), NOW), 'round');
  assertEquals(nextStep(m({ status: 'discussion_complete' }), NOW), 'synthesis');
  assertEquals(nextStep(m({ status: 'synthesizing', updated_at: ago(1000) }), NOW), null);
  assertEquals(nextStep(m({ status: 'synthesizing', updated_at: ago(STEP_STALE_MS) }), NOW), 'synthesis');
  for (const status of ['complete', 'superseded']) assertEquals(nextStep(m({ status }), NOW), null);
});

Deno.test('human advisors: the meeting waits for the founder after Round 1', () => {
  assertEquals(nextStep(m({ status: 'independent_complete', awaiting_human_input: true }), NOW), null);
  assertEquals(needsSweep(m({ status: 'independent_complete', awaiting_human_input: true, updated_at: ago(60 * 60_000) }), NOW), false);
});

Deno.test('a failed meeting is tried again only when the founder asks, and only with a discussion to resolve', () => {
  const failed = m({ status: 'failed', independent_responses: [{ advisor_id: 'a' }] });
  assertEquals(nextStep(failed, NOW), null);
  assertEquals(nextStep(failed, NOW, true), 'synthesis');
  assertEquals(nextStep(m({ status: 'failed', independent_responses: [{ unavailable: true }] }), NOW, true), null);
});

Deno.test('a meeting the page runs is never moved by the server', () => {
  for (const status of ['preparing', 'independent_complete', 'discussing', 'discussion_complete', 'synthesizing'])
    assertEquals([nextStep({ driver: 'browser', status }, NOW), needsSweep({ driver: 'browser', status, updated_at: ago(STEP_STALE_MS) }, NOW)], [null, false]);
});

Deno.test('the sweep picks up stalled steps and meetings left between steps', () => {
  assertEquals(needsSweep(m({ status: 'independent_complete', updated_at: ago(IDLE_GRACE_MS - 1000) }), NOW), false);
  assertEquals(needsSweep(m({ status: 'independent_complete', updated_at: ago(IDLE_GRACE_MS) }), NOW), true);
  assertEquals(needsSweep(m({ status: 'discussing', step_claimed_at: null, updated_at: ago(IDLE_GRACE_MS) }), NOW), true);
  assertEquals(needsSweep(m({ status: 'discussing', step_claimed_at: ago(60_000), updated_at: ago(60_000) }), NOW), false);
  assertEquals(needsSweep(m({ status: 'discussing', step_claimed_at: ago(STEP_STALE_MS) }), NOW), true);
  assertEquals(needsSweep(m({ status: 'synthesizing', updated_at: ago(60_000) }), NOW), false);
  assertEquals(needsSweep(m({ status: 'complete', updated_at: ago(STEP_STALE_MS) }), NOW), false);
  assertEquals(needsSweep(m({ status: 'preparing', step_claimed_at: null }), NOW), false);
  assertEquals(nextStep(m({ status: 'preparing', step_claimed_at: null }), NOW), null);
  assertEquals(needsSweep(m({ status: 'discussion_complete', updated_at: ago(IDLE_GRACE_MS) }), NOW), true);
  assertEquals(needsSweep(m({ status: 'synthesizing', updated_at: ago(STEP_STALE_MS) }), NOW), true);
});

Deno.test("the sweep's thresholds match the cron job's filter in the migration", async () => {
  const sql = await Deno.readTextFile(new URL('../../migrations/20261016100000_sit_in.sql', import.meta.url));
  const job = sql.slice(sql.indexOf("'meeting-run-sweep'"));
  assertEquals((job.match(/interval '4 minutes'/g) || []).length, 3);
  assertEquals((job.match(/interval '30 seconds'/g) || []).length, 3);
  assertEquals([STEP_STALE_MS, IDLE_GRACE_MS], [4 * 60_000, 30_000]);
});

// ---- P1: the founder in the room
import { challengerFor, nextTarget, roundsFor, unusedNotes } from './meetingDriver.ts';



Deno.test("a note is used once a round has taken it in; extra rounds are capped at two", () => {
  const notes = [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }];
  assertEquals(unusedNotes({ founder_notes: notes, discussion_transcript: [{ note_id: 'a' }, { advisor_name: 'Grace' }] }).map((n: any) => n.id), ['b']);
  assertEquals(unusedNotes({}), []);
  assertEquals([roundsFor(3, {}), roundsFor(3, { rounds_target: 4 }), roundsFor(3, { rounds_target: null })], [3, 4, 3]);
});

Deno.test('one more round means exactly one more: past the plan, or past where an early-settled discussion stopped', () => {
  assertEquals(nextTarget(3, { status: 'preparing', discussion_rounds_completed: 0 }), 4);
  assertEquals(nextTarget(3, { status: 'discussing', discussion_rounds_completed: 2, rounds_target: 4 }), 5);
  assertEquals(nextTarget(3, { status: 'discussion_complete', discussion_rounds_completed: 2 }), 3);
  assertEquals(nextTarget(3, { status: 'discussion_complete', discussion_rounds_completed: 3 }), 4);
});

Deno.test('the challenge duty rotates, starting with the Contrarian when seated', () => {
  const board = [{ id: 'g', role: 'Customer Advocate' }, { id: 'v', library_key: 'contrarian', role: 'Contrarian' }, { id: 'p', role: 'Product' }];
  assertEquals([2, 3, 4, 5].map((r) => challengerFor(board, r)?.id), ['v', 'p', 'g', 'v']);
  assertEquals([2, 3].map((r) => challengerFor([{ id: 'a' }, { id: 'b' }], r)?.id), ['a', 'b']);
  assertEquals(challengerFor([], 2), null);
});

// ---- P1.1: the room keeps pace with an engaged founder's screen



Deno.test('a failed step is tried again after a pause, however often the page checks in', () => {
  const failed = { status: 'discussing', step_claimed_at: null, step_attempts: 1, discussion_rounds_completed: 1 };
  assertEquals(nextStep(m({ ...failed, step_finished_at: ago(5000) }), NOW), null);
  assertEquals(nextStep(m({ ...failed, step_finished_at: ago(IDLE_GRACE_MS) }), NOW), 'round');
  // A step that finished normally (attempts back to 0) moves on at once.
  assertEquals(nextStep(m({ ...failed, step_attempts: 0, step_finished_at: ago(1000) }), NOW), 'round');
});


Deno.test('Decide now after a failed round goes straight to the Chair', () => {
  assertEquals(nextStep(m({ status: 'discussing', step_claimed_at: null, step_attempts: 1, step_finished_at: ago(2000), decide_now: true }), NOW), 'synthesis');
});

// ---- The resolution is Claude's (owner, 15 October 2026)
import { resolutionCallFields } from './chair.ts';

Deno.test("the Chair's resolution always goes to Claude, with no other provider as backup", () => {
  const onGpt: any = resolutionCallFields({ id: 'c', default_provider: 'openai', default_model: 'gpt-4o', system_instructions: 'x' });
  assertEquals([onGpt.model_override, onGpt.same_provider_only], [{ provider: 'anthropic', model: 'claude-sonnet-5-5' }, true]);
  const onClaude: any = resolutionCallFields({ id: 'c', default_provider: 'anthropic', default_model: 'claude-sonnet-5-5', system_instructions: 'x' });
  assertEquals([onClaude.model_override, onClaude.same_provider_only], [undefined, true]);
  const builtIn: any = resolutionCallFields(null);
  assertEquals([builtIn.advisor_override?.default_provider, builtIn.same_provider_only], ['anthropic', true]);
});


// ---- Sit in (owner, 15 October 2026)
Deno.test('Sit in: at a stop nothing starts, and the sweep leaves it alone, until the founder acts', () => {
  for (const status of ['independent_complete', 'discussing', 'discussion_complete']) {
    const waiting = m({ status, step_claimed_at: null, waiting_for_founder: true, updated_at: ago(24 * 60 * 60_000) });
    assertEquals([nextStep(waiting, NOW), needsSweep(waiting, NOW)], [null, false]);
    assertEquals(nextStep({ ...waiting, waiting_for_founder: false }, NOW), status === 'discussion_complete' ? 'synthesis' : 'round');
  }
  // A round that is running isn't affected by the flag.
  assertEquals(nextStep(m({ status: 'discussing', step_claimed_at: ago(STEP_STALE_MS), waiting_for_founder: true }), NOW), 'round');
});

Deno.test('Sit in: asking for the decision always wins over a stop written at the same moment', () => {
  for (const status of ['independent_complete', 'discussing', 'discussion_complete']) {
    const both = m({ status, step_claimed_at: null, waiting_for_founder: true, decide_now: true, updated_at: ago(60_000) });
    assertEquals([nextStep(both, NOW), needsSweep(both, NOW)], ['synthesis', true]);
  }
});

Deno.test("the cron job never calls the sweep for a meeting at a stop, and counts a day from the last move", async () => {
  const sql = await Deno.readTextFile(new URL('../../migrations/20261016100000_sit_in.sql', import.meta.url));
  const job = sql.slice(sql.indexOf("'meeting-run-sweep'"));
  assertEquals((job.match(/\(not waiting_for_founder or decide_now\)/g) || []).length, 3);
  assert(job.includes("updated_at > now() - interval '1 day'") && !job.includes("created_at > now()"));
});
