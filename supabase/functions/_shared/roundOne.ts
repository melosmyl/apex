// Round 1 (anti-convergence, owner 15 October 2026): when two advisors come
// back with near-identical answers, the later one is asked once more for
// their own view. Shared so it can be tested apart from startBoardMeeting.
// deno-lint-ignore-file no-explicit-any
import { embedText, cosineSimilarity } from './embeddings.ts';

// Round 1 answers this close are the same answer (the threshold sits above
// the 0.90 the discussion uses to flag converged advisors).
const DISTINCT_THRESHOLD = 0.92;
const MAX_REDOS = 2;
// Enough for the re-ask to get a real answer from the advisor's own model
// (debaters keep 20s back for their backup).
const REDO_MIN_MS = 60_000;
const normalise = (t: unknown) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export async function distinctRoundOne({ responses, selectedAdvisors, deadlineAt, ask, embed = embedText }: any) {
  const live = responses.filter((r: any) => !r.unavailable && String(r.recommendation || '').trim());
  if (live.length < 2 || deadlineAt - Date.now() < REDO_MIN_MS) return responses;
  let vectors = null;
  try {
    vectors = await Promise.all(live.map((r: any) => embed(r.recommendation)));
  } catch (e) {
    console.error('Round 1 distinctness check skipped (embedding failed):', (e as Error).message);
  }
  const redo = new Map();
  for (let i = 0; i < live.length && redo.size < MAX_REDOS; i++) {
    if (redo.has(live[i].advisor_id)) continue;
    for (let j = i + 1; j < live.length && redo.size < MAX_REDOS; j++) {
      if (redo.has(live[j].advisor_id)) continue;
      // Text the normaliser can't read (e.g. another script) is compared by
      // meaning only, never as "equal" because both came out empty.
      const a = normalise(live[i].recommendation), b = normalise(live[j].recommendation);
      const same = (a && a === b)
        || (vectors && cosineSimilarity(vectors[i], vectors[j]) >= DISTINCT_THRESHOLD);
      if (same) redo.set(live[j].advisor_id, live[i]);
    }
  }
  if (!redo.size) return responses;
  const byId = new Map<string, any>(selectedAdvisors.map((a: any) => [a.id, a]));
  const redone = await Promise.all([...redo].map(async ([advisorId, other]) => {
    const advisor = byId.get(advisorId);
    if (!advisor) return null;
    const mine = responses.find((r: any) => r.advisor_id === advisorId);
    const note = `Your first answer was almost word for word ${other.advisor_name}'s: "${String(mine?.recommendation || '').slice(0, 600)}". The founder needs each advisor's own view, not the same sentence twice. Answer again from your speciality as the ${String(advisor.role || 'advisor').slice(0, 100)}: keep what you genuinely hold, and say what you see that ${other.advisor_name} doesn't. If you truly see nothing different, say so plainly in one line and then add the one thing from your area the founder most needs to know.`;
    const fresh = await ask(advisor, note);
    return fresh && !fresh.unavailable ? { ...fresh, redone_after: other.advisor_name } : null;
  }));
  const replaced = new Map<string, any>(redone.filter(Boolean).map((r: any) => [r.advisor_id, r]));
  return responses.map((r: any) => replaced.get(r.advisor_id) || r);
}

