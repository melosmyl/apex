import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import { ANSWERS, CALLS } from "@/lib/meetingResult";

// The founder's side of the results page (M1): their call on the verdict,
// and their answers to the decisions only they can make. Both save the
// moment they're chosen and load back with the meeting, so a past meeting
// shows what was decided. Outcome tracking reads them later.
//
// The parent passes the values as stored, fetched fresh when the page opens,
// so state here starts from the saved record.

// One choice from a few, as toggle buttons: pressing the chosen one again
// clears it ("I haven't decided").
function Choice({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : o.value)}
            className={`rounded-full border-[1.5px] border-foreground px-3.5 py-1 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${on ? "bg-foreground text-background" : "bg-card hover:bg-secondary"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const saveFailed = () => toast({ title: "Couldn't save that", description: "Check your connection and try again." });

export function YourCall({ meetingId, initialCall, initialNotes }) {
  const [call, setCall] = useState(["accept", "modify", "reject"].includes(initialCall) ? initialCall : null);
  const [notes, setNotes] = useState(initialCall === "modify" ? initialNotes || "" : "");
  const savedNotes = useRef(initialCall === "modify" ? initialNotes || "" : "");
  // Saves go out one at a time, in the order chosen.
  const queue = useRef(Promise.resolve());

  // A failed save shows what's actually stored rather than guess.
  const reload = async () => {
    saveFailed();
    const row = await base44.entities.BoardMeeting.get(meetingId).catch(() => null);
    if (!row) return;
    const stored = ["accept", "modify", "reject"].includes(row.founder_decision) ? row.founder_decision : null;
    const storedNotes = stored === "modify" ? row.founder_decision_notes || "" : "";
    setCall(stored);
    setNotes(storedNotes);
    savedNotes.current = storedNotes;
  };

  const save = (patch) => {
    queue.current = queue.current.then(() => base44.entities.BoardMeeting.update(meetingId, patch)).catch(reload);
  };

  const choose = (next) => {
    setCall(next);
    // A note belongs to "Modify": choosing anything else clears it, so the
    // next meeting isn't told "accept" with an old modification attached.
    const patch = { founder_decision: next || "undecided" };
    if (next !== "modify") { patch.founder_decision_notes = null; setNotes(""); savedNotes.current = ""; }
    save(patch);
  };

  const saveNotes = () => {
    if (notes === savedNotes.current) return;
    savedNotes.current = notes;
    save({ founder_decision_notes: notes.slice(0, 2000) });
  };

  if (!meetingId) return null;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="room-mono shrink-0">Your call</span>
      <Choice options={CALLS} value={call} onChange={choose} label="Your call on the verdict" />
      {call === "modify" && (
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          maxLength={2000}
          placeholder="What would you change?"
          aria-label="What you would change"
          className="min-w-0 flex-1 border-b border-foreground bg-transparent py-1 text-sm outline-none placeholder:italic placeholder:text-muted-foreground"
        />
      )}
    </div>
  );
}

export function FounderQuestions({ meetingId, questions, initialAnswers, readOnly = false }) {
  const [answers, setAnswers] = useState(initialAnswers && typeof initialAnswers === "object" && !Array.isArray(initialAnswers) ? initialAnswers : {});
  // The latest answers, and saves one at a time, each sending everything
  // chosen so far, so a slow save can't overwrite a later one.
  const latest = useRef(answers);
  const queue = useRef(Promise.resolve());

  const answer = (i, value) => {
    const next = { ...latest.current };
    if (value) next[i] = value; else delete next[i];
    latest.current = next;
    setAnswers(next);
    queue.current = queue.current
      .then(() => base44.entities.BoardMeeting.update(meetingId, { founder_answers: latest.current }))
      .catch(async () => {
        saveFailed();
        // Show what's actually saved rather than guess.
        const row = await base44.entities.BoardMeeting.get(meetingId).catch(() => null);
        const stored = row?.founder_answers && typeof row.founder_answers === "object" ? row.founder_answers : {};
        latest.current = stored;
        setAnswers(stored);
      });
  };

  return (
    <ul className="space-y-3">
      {questions.map((q, i) => (
        <li key={i} className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <span className="min-w-0 text-[0.95rem] leading-snug">{q}</span>
          {meetingId && !readOnly && <Choice options={ANSWERS} value={answers[i] || null} onChange={(v) => answer(i, v)} label={q} />}
        </li>
      ))}
    </ul>
  );
}
