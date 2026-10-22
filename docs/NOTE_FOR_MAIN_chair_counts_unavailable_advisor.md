# For the main session: the Chair counted an unavailable advisor as agreeing

Found 16 October 2026 while building the landing section (Workstream L, People and Growth). The meeting
code is the main session's; nothing here was changed.

## What happened

petit m's meeting `f150cbfc-270f-4ed4-8ff5-73115a40e551` ("Should petit m price the dinner set at £45 or
£65?", 16 October 2026, turn shape on) was read once, read-only, with the owner's yes.

- In `independent_responses` (Round 1), Julian Rhodes (Legal Advisor) has `unavailable: true`, position
  "This advisor was temporarily unavailable.", confidence 0. Four advisors answered.
- The Chair's `board_resolution.confidence_reason` begins: "All five advisors converged on £65, so the
  agreement has not been stress-tested." Confidence 57.

So the Chair counted Julian among the advisors who agreed. Whether Julian spoke in a later round wasn't
read (only Round 1, the resolution and the tasks were selected). If he did, the claim may be fair for
the later rounds. If he didn't, the Chair turned silence into agreement.

## Where to look (main, read from the repo only)

- `supabase/functions/runChairSynthesis/index.ts` ~line 123: `formatTranscriptForChair` tells the Chair
  "gave no view this round… Don't count them as agreeing or disagreeing", but only for transcript
  entries that carry `unavailable`. Check that Round 1 entries copied into `discussion_transcript` keep
  that flag for an advisor who was unavailable in `independent_responses`.
- ~line 302: with no discussion transcript, the fallback lists every independent response, including
  the placeholder ("Position: This advisor was temporarily unavailable… Confidence: 0%"), with no
  instruction not to count it.
- Line 84 (AGREEMENT IS NOT EVIDENCE) worked as intended: the Chair lowered confidence for the
  agreement. It just counted one advisor too many.

## Suggested fix (the main session's call)

Fold it into the missing-turns fix: pass the Chair the list of advisors who gave no view in each round,
and have the resolution's agreement and disagreement counts use only those who spoke. A local test with
the fake providers: one advisor unavailable in Round 1, the others agreeing; the resolution must not say
"all N".
