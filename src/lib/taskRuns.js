import { useCallback, useEffect, useRef, useState } from "react";
import { base44, supabase } from "@/api/base44Client";

// "Do this for me" (Workstream M2a): the advisor who owns a task does it in
// the background (taskRun); the founder accepts, redoes or discards it.

// What can be done for the founder: all four task types.
export const RUNNABLE_TYPES = new Set(["draft", "plan", "research", "calculate"]);

export const DOING = { draft: "is drafting this", plan: "is planning this", research: "is researching this", calculate: "is working this out" };

export const isRunnable = (task) =>
  !!task && RUNNABLE_TYPES.has(task.task_type) && !!task.advisor_id && task.status !== "done";

const ACTIVE = new Set(["queued", "running"]);
export const isActive = (run) => !!run && ACTIVE.has(run.status);

async function call(body) {
  const { data } = await base44.functions.invoke("taskRun", body);
  return data;
}

export const startRun = (taskId, notes) => call({ action: "start", task_id: taskId, ...(notes ? { notes } : {}) });
export const acceptRun = (runId) => call({ action: "accept", run_id: runId });
export const discardRun = (runId) => call({ action: "discard", run_id: runId });

const LIST_COLUMNS = "id, task_id, status, task_type, advisor_name, cost_usd, error, previous_run_id, created_at";

// The latest run for each task, plus how many earlier attempts it has. The
// list is read without results (in batches, so a long board can't overflow
// the address); the result is fetched only for runs waiting on a decision.
export async function latestRuns(taskIds) {
  if (!taskIds.length) return {};
  const out = {};
  for (let i = 0; i < taskIds.length; i += 50) {
    const { data, error } = await supabase.from("task_runs").select(LIST_COLUMNS)
      .in("task_id", taskIds.slice(i, i + 50)).order("created_at", { ascending: false });
    if (error) throw error;
    for (const r of data || []) {
      if (!out[r.task_id]) out[r.task_id] = { ...r, earlier: 0 };
      else out[r.task_id].earlier += 1;
    }
  }
  const waiting = Object.values(out).filter((r) => r.status === "done").map((r) => r.id);
  if (waiting.length) {
    const { data, error } = await supabase.from("task_runs").select("id, result").in("id", waiting);
    if (error) throw error;
    for (const r of data || []) {
      const run = Object.values(out).find((x) => x.id === r.id);
      if (run) run.result = r.result;
    }
  }
  return out;
}

// Runs for a set of tasks, checked every few seconds while any is in
// progress. onSettled fires when a run finishes, so a page can reload the
// tasks whose status the runner changed.
export function useTaskRuns(taskIds, onSettled) {
  const [runs, setRuns] = useState({});
  const key = [...taskIds].sort().join(",");
  const settled = useRef(onSettled);
  settled.current = onSettled;
  const previous = useRef({});
  // One check at a time (a slow one is never abandoned for the next tick);
  // an answer is dropped only if the page showed a run it just started while
  // the check was out.
  const seq = useRef(0);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const ids = key ? key.split(",") : [];
    const mine = seq.current;
    try {
      const next = await latestRuns(ids);
      if (mine !== seq.current) return;
      const finished = Object.values(previous.current).some((r) => isActive(r) && next[r.task_id]?.id === r.id && !isActive(next[r.task_id]));
      previous.current = next;
      setRuns(next);
      if (finished) settled.current?.();
    } catch { /* keep what we have; the next check retries */ } finally {
      inFlight.current = false;
    }
  }, [key]);

  useEffect(() => { refresh(); }, [refresh]);

  const anyActive = Object.values(runs).some(isActive);
  useEffect(() => {
    if (!anyActive) return undefined;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [anyActive, refresh]);

  // Shows a run the page has just started, before the next check.
  const put = useCallback((run) => {
    seq.current += 1;
    // A new run adds one earlier attempt; the same run updated (an Accept)
    // doesn't.
    setRuns((prev) => {
      const before = prev[run.task_id];
      const earlier = !before ? 0 : before.id === run.id ? before.earlier : before.earlier + 1;
      return { ...prev, [run.task_id]: { ...before, ...run, earlier } };
    });
    previous.current = { ...previous.current, [run.task_id]: run };
  }, []);

  return { runs, refresh, put };
}
