import { assertEquals } from 'jsr:@std/assert@1';
// The page's rule for Decision Centre records (src/lib/meetingResult.js).
import { decisionPatch } from '../../../src/lib/meetingResult.js';

Deno.test("a Decision Centre record follows the call, but keeps the founder's own words and a review", () => {
  assertEquals(decisionPatch({ status: 'pending', decision_taken: null }, 'accept', 'Cheap enough'), { status: 'decided', decision_taken: "Accepted the board's recommendation: Cheap enough" });
  assertEquals(decisionPatch({ status: 'decided', decision_taken: 'We go with two markets' }, 'reject', ''), { status: 'decided' });
  assertEquals(decisionPatch({ status: 'reviewed', decision_taken: "Accepted the board's recommendation" }, 'modify', 'Spring only'), { status: 'reviewed', decision_taken: "Modified the board's recommendation: Spring only" });
  assertEquals(decisionPatch({ status: 'decided', decision_taken: "Rejected the board's recommendation" }, null, ''), { status: 'pending', decision_taken: null });
  assertEquals(decisionPatch({ status: 'decided', decision_taken: 'Our own decision' }, null, ''), null);
});
