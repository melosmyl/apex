import { assertEquals } from 'jsr:@std/assert@1';
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
  const sql = await Deno.readTextFile(new URL('../../migrations/20261015100000_p0_server_meeting.sql', import.meta.url));
  const job = sql.slice(sql.indexOf("'meeting-run-sweep'"));
  assertEquals((job.match(/interval '4 minutes'/g) || []).length, 3);
  assertEquals((job.match(/interval '30 seconds'/g) || []).length, 3);
  assertEquals([STEP_STALE_MS, IDLE_GRACE_MS], [4 * 60_000, 30_000]);
});
