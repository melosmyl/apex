import React, { useRef, useState } from "react";
import { base44, supabase } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import { ANSWERS, CALLS, CALL_REASON, decisionPatch } from "@/lib/meetingResult";

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

// The call has three states (owner, 16 October 2026): none yet (still open),
// or accept, modify or reject, each with an optional reason. The meeting
// holds it; a Decision Centre record for the meeting follows it.
export function YourCall({ meetingId, initialCall, initialNotes }) {
  const known = ["accept", "modify", "reject"].includes(initialCall) ? initialCall : null;
  const [call, setCall] = useState(known);
  const [notes, setNotes] = useState(known ? initialNotes || "" : "");
  const savedNotes = useRef(known ? initialNotes || "" : "");
  const current = useRef({ call: known, notes: known ? initialNotes || "" : "" });
  // Saves go out one at a time, in the order chosen.
  const queue = useRef(Promise.resolve());

  // A failed save shows what's actually stored rather than guess.
  const reload = async () => {
    saveFailed();
    const row = await base44.entities.BoardMeeting.get(meetingId).catch(() => null);
    if (!row) return;
    const stored = ["accept", "modify", "reject"].includes(row.founder_decision) ? row.founder_decision : null;
    const storedNotes = stored ? row.founder_decision_notes || "" : "";
    setCall(stored);
    setNotes(storedNotes);
    savedNotes.current = storedNotes;
    current.current = { call: stored, notes: storedNotes };
  };

  // Any Decision Centre record for this meeting follows the call. A failure
  // there is said on its own: the call itself saved.
  const syncRecords = async () => {
    const { data: records, error } = await supabase.from("decisions").select("id, status, decision_taken").eq("meeting_id", meetingId);
    let failed = !!error;
    for (const r of records || []) {
      const patch = decisionPatch(r, current.current.call, current.current.notes);
      if (!patch) continue;
      const { error: e } = await supabase.from("decisions").update(patch).eq("id", r.id);
      if (e) failed = true;
    }
    if (failed) toast({ title: "Your call is saved", description: "The Decision Centre didn't update just now. It will next time you change your call." });
  };

  // The meeting first, then any Decision Centre record for it.
  const save = (patch) => {
    queue.current = queue.current
      .then(() => base44.entities.BoardMeeting.update(meetingId, patch))
      .then(syncRecords, reload)
      .catch(() => toast({ title: "Your call is saved", description: "The Decision Centre didn't update just now. It will next time you change your call." }));
  };

  const choose = (next) => {
    setCall(next);
    // A reason belongs to the call it was given for: a new call starts
    // without one, so the next meeting isn't told "accept" with an old
    // reason for rejecting attached.
    const patch = { founder_decision: next || "undecided", founder_decision_notes: null };
    setNotes(""); savedNotes.current = "";
    current.current = { call: next, notes: "" };
    save(patch);
  };

  const saveNotes = () => {
    if (notes === savedNotes.current) return;
    savedNotes.current = notes;
    current.current = { ...current.current, notes: notes.slice(0, 2000) };
    save({ founder_decision_notes: notes.slice(0, 2000) });
  };

  if (!meetingId) return null;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="room-mono shrink-0">Your call</span>
      <Choice options={CALLS} value={call} onChange={choose} label="Your call on the verdict" />
      {call && (
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          maxLength={2000}
          placeholder={CALL_REASON[call]}
          aria-label={call === "modify" ? "What you would change" : call === "accept" ? "Why you accept" : "Why you reject"}
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
