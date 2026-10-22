import { useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

// Short titles for task cards (Workstream T): a task with long wording waits
// for one (short_title_pending); the first page that shows it asks the server
// to write them, ten at a time, and patches them in. Until then the card shows
// the full wording.
const MAX_ROUNDS = 3;

// One request per company at a time, shared by every page that asks (the
// Dashboard and the board), so moving between them can't pay twice.
const inFlight = new Map();

function askFor(companyId) {
  if (!inFlight.has(companyId)) {
    const run = (async () => {
      const all = new Map();
      try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const { data } = await base44.functions.invoke("shortenTaskTitles", { company_id: companyId });
          const titles = data?.titles || [];
          if (!titles.length) break;
          for (const t of titles) all.set(t.id, t.short_title);
        }
      } catch {
        // A missing short title only means the card shows the full wording.
      }
      return all;
    })().finally(() => inFlight.delete(companyId));
    inFlight.set(companyId, run);
  }
  return inFlight.get(companyId);
}

export function useShortTitles(companyId, tasks, onTitles) {
  const latest = useRef(onTitles);
  latest.current = onTitles;
  // The tasks waiting now: a new one arriving asks again; the same ones
  // (still waiting after a failed try) don't.
  const waitingKey = (tasks || []).filter((t) => t.short_title_pending).map((t) => t.id).sort().join(",");

  useEffect(() => {
    if (!companyId || !waitingKey) return undefined;
    let stopped = false;
    askFor(companyId).then((titles) => {
      if (!stopped && titles.size) latest.current(titles);
    });
    return () => { stopped = true; };
  }, [companyId, waitingKey]);
}

// Puts written short titles into a list of tasks.
export const withShortTitles = (tasks, titles) =>
  tasks?.map((t) => (titles.has(t.id) ? { ...t, short_title: titles.get(t.id), short_title_pending: false } : t)) || tasks;
