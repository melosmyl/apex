import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { Copy, Loader2 } from "lucide-react";
import { DOING, acceptRun, discardRun, isActive, isRunnable, startRun } from "@/lib/taskRuns";
import { formatCost } from "@/lib/money";

// "Do this for me" on one task (Workstream M2a): the button, the advisor at
// work, and what they hand back, with Accept / Redo with notes / Discard.
// Inline on the meeting's results page; compact on the Tasks board, where
// the result opens in a dialog.

const firstName = (name = "") => String(name).replace(/^Dr\.?\s+/, "").split(" ")[0];
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
const day = (iso) => { try { return dayFmt.format(new Date(`${iso}T12:00:00`)); } catch { return iso; } };

// Plain names for the models a result can come from.
const MODEL_NAMES = {
  "claude-sonnet-5-5": "Claude Sonnet 5.5", "claude-sonnet-5": "Claude Sonnet 5", "claude-opus-5-5": "Claude Opus 5.5",
  "gpt-4o": "GPT-4o", "gpt-4o-mini": "GPT-4o mini", "gpt-6.1-sol": "GPT-6.1 Sol",
};
const modelName = (m) => MODEL_NAMES[m] || m;

const failed = (e) => toast({ title: "That didn't go through", description: e?.message || "Please try again in a moment." });

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast({ title: "Copied" }); }
  catch { toast({ title: "Couldn't copy", description: "Select the text and copy it instead." }); }
}

function DraftResult({ r }) {
  // A subject line belongs to an email only.
  const subject = r.kind === "email" ? r.subject : "";
  const full = [subject ? `Subject: ${subject}` : "", r.body].filter(Boolean).join("\n\n");
  return (
    <div className="space-y-3">
      {subject && <p className="text-sm"><span className="room-mono mr-2">Subject</span>{subject}</p>}
      <div className="relative rounded-md border border-border bg-background p-4">
        <button type="button" onClick={() => copy(full)} className="absolute right-2 top-2 inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground">
          <Copy className="h-3.5 w-3.5" /> Copy
        </button>
        <p className="whitespace-pre-wrap pr-14 text-[0.95rem] leading-relaxed">{r.body}</p>
      </div>
      {r.placeholders?.length > 0 && <p className="text-sm text-muted-foreground">Fill in: {r.placeholders.join(", ")}</p>}
      {r.check_before_sending?.length > 0 && (
        <ul className="space-y-1 text-sm text-muted-foreground">{r.check_before_sending.map((c, i) => <li key={i}>— {c}</li>)}</ul>
      )}
      <p className="text-sm text-muted-foreground">You send it; we never send anything for you.</p>
    </div>
  );
}

function PlanResult({ r }) {
  return (
    <div className="space-y-3">
      {r.summary && <p className="text-[0.95rem]">{r.summary}</p>}
      <ol className="space-y-2">
        {(r.steps || []).map((s, i) => (
          <li key={i} className="flex gap-3 text-[0.95rem] leading-snug">
            <span className="w-24 shrink-0 font-mono text-xs uppercase tracking-wider text-muted-foreground tabular-nums pt-0.5">{s.date ? day(s.date) : `Step ${i + 1}`}</span>
            <span className="min-w-0">{s.step}{s.detail && <span className="block text-sm text-muted-foreground">{s.detail}</span>}</span>
          </li>
        ))}
      </ol>
      {r.helper && (
        <div className="relative rounded-md border border-border bg-background p-4">
          <button type="button" onClick={() => copy(r.helper.body)} className="absolute right-2 top-2 inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground">
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
          <p className="room-mono mb-1.5">{r.helper.title || "Helper"}</p>
          <p className="whitespace-pre-wrap pr-14 text-sm leading-relaxed">{r.helper.body}</p>
        </div>
      )}
    </div>
  );
}

const VERDICTS = {
  looks_legitimate: { label: "Looks legitimate", tone: "border-[hsl(var(--sage))] bg-[hsl(var(--sage)/0.25)]" },
  unclear: { label: "Unclear", tone: "border-border bg-secondary" },
  warning_signs: { label: "Warning signs", tone: "border-destructive/60 bg-destructive/10" },
};

function SourceLink({ source }) {
  if (!source?.url) return null;
  let host = "";
  try { host = new URL(source.url).hostname.replace(/^www\./, ""); } catch { /* not a URL */ }
  return (
    <a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2" title={source.title}
      aria-label={`Source: ${source.title || host} (opens in a new tab)`}>{host || "source"}</a>
  );
}

function Unsure({ items, label }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="room-mono mb-1">{label}</p>
      <ul className="space-y-1 text-sm text-muted-foreground">{items.map((u, i) => <li key={i}><span aria-hidden="true">— </span>{u}</li>)}</ul>
    </div>
  );
}

function ManualChecks({ items }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-md border border-border bg-secondary/50 p-3 text-sm">
      <p className="room-mono mb-1">Check by hand</p>
      {items.map((m, i) => <p key={i}><span className="font-medium">{m.site}:</span> {m.how}</p>)}
    </div>
  );
}

function Stats({ r }) {
  const s = r.stats || {};
  if (!s.searches && !s.pages) return null;
  return <p className="text-xs text-muted-foreground">{s.searches || 0} {s.searches === 1 ? "search" : "searches"}, {s.pages || 0} {s.pages === 1 ? "page" : "pages"} read.</p>;
}

function Incomplete({ r }) {
  if (!r.incomplete) return null;
  return <p className="rounded-md border-l-4 border-foreground bg-secondary/60 px-3 py-2 text-sm">This was cut short before the research finished, so it may be incomplete. Redo it if you need more.</p>;
}

function ResearchResult({ r }) {
  return (
    <div className="space-y-4">
      <Incomplete r={r} />
      {r.summary && <p className="text-[0.95rem] leading-relaxed">{r.summary}</p>}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">Findings, each with the page it came from</caption>
          <thead className="bg-secondary/60 text-left">
            <tr><th className="px-3 py-2 font-medium">Finding</th><th className="px-3 py-2 font-medium">Detail</th><th className="px-3 py-2 font-medium">Source</th></tr>
          </thead>
          <tbody>
            {(r.findings || []).map((f, i) => (
              <tr key={i} className="border-t border-border align-top">
                <td className="px-3 py-2">{f.finding}</td>
                <td className="px-3 py-2 text-muted-foreground">{f.detail}</td>
                <td className="px-3 py-2 whitespace-nowrap"><SourceLink source={f.source} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.legitimacy?.length > 0 && (
        <div>
          <p className="room-mono mb-2">Who looks legitimate</p>
          <ul className="space-y-2">
            {r.legitimacy.map((l, i) => {
              const v = VERDICTS[l.verdict] || VERDICTS.unclear;
              return (
                <li key={i} className="flex flex-wrap items-baseline gap-2 text-sm">
                  <span className="font-medium">{l.name}</span>
                  <span className={`rounded-full border px-2 py-px text-xs ${v.tone}`}>{v.label}</span>
                  <span className="min-w-0 text-muted-foreground">{l.why}</span>
                  {l.source && <SourceLink source={l.source} />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {r.risks?.length > 0 && (
        <div>
          <p className="room-mono mb-1">Risks</p>
          <ul className="space-y-1.5 text-sm">{r.risks.map((x, i) => <li key={i}><span className="font-medium">{x.risk}</span> {x.what_to_do && <span className="text-muted-foreground">What to do: {x.what_to_do}</span>}</li>)}</ul>
        </div>
      )}
      <Unsure items={r.unsure} label="Couldn't establish" />
      <ManualChecks items={r.manual_checks} />
      <Stats r={r} />
    </div>
  );
}

function CalculateResult({ r }) {
  return (
    <div className="space-y-4">
      <Incomplete r={r} />
      <p className="font-display text-lg leading-snug">{r.answer}</p>
      <ol className="space-y-1.5 text-sm">
        {(r.workings || []).map((w, i) => (
          <li key={i} className="flex gap-3"><span className="w-5 shrink-0 text-muted-foreground tabular-nums">{i + 1}.</span><span className="min-w-0">{w.step}{w.result && <span className="font-medium">: {w.result}</span>}</span></li>
        ))}
      </ol>
      {r.inputs?.length > 0 && (
        <div>
          <p className="room-mono mb-1">Figures used</p>
          <ul className="space-y-1 text-sm">
            {r.inputs.map((x, i) => (
              <li key={i}>
                {x.name}: <span className="font-medium">{x.value}</span>{" "}
                <span className="text-muted-foreground">({x.from_founder ? "your figure" : x.source ? <SourceLink source={x.source} /> : "assumed"})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{r.code_used ? "Worked out by running the numbers, not estimated." : "Worked out step by step."}</p>
      <Unsure items={r.unsure} label="Couldn't pin down" />
      <ManualChecks items={r.manual_checks} />
      <Stats r={r} />
    </div>
  );
}

// The advisor's finished work and the founder's three choices.
function Finished({ task, run, onChanged, onAccepted }) {
  const [redoing, setRedoing] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(null);
  const who = firstName(run.advisor_name || task.assigned_to);
  const r = run.result || {};

  const act = async (kind) => {
    setBusy(kind);
    try {
      if (kind === "accept") { const d = await acceptRun(run.id); onAccepted?.(run.id); onChanged?.(d.run); toast({ title: "Saved to Knowledge", description: "Your board will use it in the next meeting." }); }
      if (kind === "discard") { const d = await discardRun(run.id); onChanged?.(d.run); }
      if (kind === "redo") { const d = await startRun(task.id, notes.trim()); setRedoing(false); setNotes(""); onChanged?.(d.run); }
    } catch (e) { failed(e); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm"><span className="font-medium">{who} finished this.</span> <span className="text-muted-foreground">Cost {formatCost(run.cost_usd)}{run.earlier ? ` · ${run.earlier} earlier ${run.earlier === 1 ? "attempt" : "attempts"} kept` : ""}</span></p>
      {r.written_by?.structured_fallback && r.written_by.structured_by && (
        <p className="text-sm text-muted-foreground">Put into shape by {modelName(r.written_by.structured_by)} instead of Claude Sonnet 5.5.</p>
      )}
      {r.written_by?.fallback && r.written_by.model && r.written_by.model !== r.written_by.intended && (
        <p className="text-sm text-muted-foreground">Written by {modelName(r.written_by.model)} instead of {modelName(r.written_by.intended || "claude-sonnet-5-5")}.</p>
      )}
      {run.task_type === "plan" ? <PlanResult r={r} />
        : run.task_type === "research" ? <ResearchResult r={r} />
        : run.task_type === "calculate" ? <CalculateResult r={r} />
        : <DraftResult r={r} />}
      {r.professional_note && <p className="rounded-md border-l-4 border-foreground bg-secondary/60 px-3 py-2 text-sm font-medium">{r.professional_note}</p>}
      {redoing ? (
        <div className="space-y-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            rows={3}
            autoFocus
            placeholder={`What should ${who} change?`}
            aria-label={`What should ${who} change?`}
            className="block w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" disabled={!notes.trim() || !!busy} onClick={() => act("redo")}>{busy === "redo" ? "Sending…" : `Ask ${who} to redo it`}</Button>
            <Button size="sm" variant="ghost" onClick={() => setRedoing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" disabled={!!busy} onClick={() => act("accept")}>{busy === "accept" ? "Saving…" : "Accept"}</Button>
          <Button size="sm" variant="secondaryOutline" disabled={!!busy} onClick={() => setRedoing(true)}>Redo with notes</Button>
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act("discard")}>{busy === "discard" ? "Discarding…" : "Discard"}</Button>
        </div>
      )}
    </div>
  );
}

// The line for the task's current state, and the button that goes with it.
function Status({ task, run, onChanged, onOpen, justAccepted }) {
  const [busy, setBusy] = useState(false);
  const who = firstName(run?.advisor_name || task.assigned_to);
  const start = async () => {
    setBusy(true);
    try { const d = await startRun(task.id); onChanged?.(d.run); } catch (e) { failed(e); } finally { setBusy(false); }
  };

  if (isActive(run)) {
    return <p className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{who} {DOING[task.task_type] || "is on it"}…</p>;
  }
  if (run?.status === "done") {
    return onOpen ? <button type="button" onClick={onOpen} className="text-sm font-medium underline underline-offset-2">{who} finished this: see it</button> : null;
  }
  // Accepted and the task done: that's the end of it. Moved back to To Do,
  // it can be done again; the accepted version stays until a new one is
  // accepted.
  // (Just accepted here: the task is done, even before the page reloads it.)
  const acceptedLine = <p className="text-sm text-muted-foreground">Accepted and saved to Knowledge.</p>;
  if (run?.status === "accepted" && (task.status === "done" || justAccepted === run.id)) return acceptedLine;
  if (!isRunnable(task)) {
    if (run?.status === "accepted") return acceptedLine;
    return run?.status === "failed" ? <p className="text-sm text-muted-foreground">{run.error}</p> : null;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button size="sm" variant="secondaryOutline" disabled={busy} onClick={start}>{busy ? "Asking…" : run?.status === "failed" ? "Try again" : "Do this for me"}</Button>
      {run?.status === "failed" && <span className="text-sm text-muted-foreground">{run.error}</span>}
      {run?.status === "discarded" && <span className="text-sm text-muted-foreground">You set the last attempt aside.</span>}
      {run?.status === "accepted" && <span className="text-sm text-muted-foreground">Your accepted version stays until you accept a new one.</span>}
    </div>
  );
}

export default function TaskDesk({ task, run, onChanged, compact = false }) {
  const [open, setOpen] = useState(false);
  const [justAccepted, setJustAccepted] = useState(null);
  if (!task) return null;
  const done = run?.status === "done";

  if (!compact) {
    // One live region that stays put, so "Grace finished this" is announced.
    return (
      <div aria-live="polite">
        {done
          ? <div className="mt-3 rounded-md border-[1.5px] border-foreground bg-card p-4"><Finished task={task} run={run} onChanged={onChanged} onAccepted={setJustAccepted} /></div>
          : <div className="mt-2"><Status task={task} run={run} onChanged={onChanged} justAccepted={justAccepted} /></div>}
      </div>
    );
  }

  return (
    <>
      <div className="mt-2" aria-live="polite"><Status task={task} run={run} onChanged={onChanged} onOpen={() => setOpen(true)} justAccepted={justAccepted} /></div>
      <Dialog open={open && done} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle className="font-display text-xl font-normal">{run?.result?.title || task.title}</DialogTitle></DialogHeader>
          {done && <Finished task={task} run={run} onAccepted={setJustAccepted} onChanged={(r) => { onChanged?.(r); setOpen(false); }} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
