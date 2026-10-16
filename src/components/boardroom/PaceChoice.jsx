import React, { useEffect, useState } from "react";
import { base44, supabase } from "@/api/base44Client";

// How the founder holds the meeting (owner, 15 October 2026).
export const PACES = [
  { key: "quick", label: "Ask the board", hint: "The board debates on its own. About two minutes." },
  { key: "sit_in", label: "Sit in", hint: "The board stops after every round for you. As long as you like." },
  { key: "join", label: "Join the board", hint: "One advisor at a time. Coming soon." },
];

// "Sit in" is offered once its own system switch is on, or for a test when the
// address asks for it (?sitIn=1, or the older ?openDoor=1), remembered for
// the browser tab.
function sitInAsked() {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("sitIn") === "1" || q.get("openDoor") === "1") sessionStorage.setItem("sitIn", "1");
    return sessionStorage.getItem("sitIn") === "1";
  } catch {
    return false;
  }
}

// The turn shape (Workstream I) for a test, before it's on for everyone:
// the address asks for it (?turnShape=1), remembered for the browser tab.
// The server decides; a free visitor never gets it.
export function turnShapeAsked() {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("turnShape") === "1") sessionStorage.setItem("turnShape", "1");
    return sessionStorage.getItem("turnShape") === "1";
  } catch {
    return false;
  }
}

// Whether this founder is offered a choice of pace: signed in (free visitors
// get Ask the board), and Sit in switched on or asked for.
export function usePaceOffered() {
  // Both switches are read as soon as the page opens, so they're remembered
  // for the tab even once the address changes.
  const [asked, setAsked] = useState(() => { turnShapeAsked(); return sitInAsked(); });
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let live = true;
    supabase.auth.getUser().then(({ data }) => { if (live) setSignedIn(!!data?.user && !data.user.is_anonymous); });
    base44.entities.SystemLimits.list().then((rows) => {
      if (live && rows?.[0]?.sit_in === true) setAsked(true);
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  return asked && signedIn;
}

export default function PaceChoice({ pace, onChange, className = "" }) {
  return (
    <fieldset className={className}>
      <legend className="mb-2 text-sm font-medium">How do you want to hold it?</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {PACES.map((p) => {
          const disabled = p.key === "join";
          return (
            <label key={p.key} className={`flex flex-col rounded-xl border-[1.5px] px-3 py-2 text-sm ${pace === p.key ? "border-foreground bg-secondary" : "border-border"} ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
              <span className="flex items-center gap-2">
                <input id={`pace-${p.key}`} type="radio" name="pace" value={p.key} checked={pace === p.key} disabled={disabled} onChange={() => onChange(p.key)} />
                <b className="font-medium">{p.label}</b>
              </span>
              <span className="mt-0.5 text-xs text-muted-foreground">{p.hint}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// "Before the board starts" (owner, 16 October 2026): facts or constraints
// every advisor should have before Round 1, which is blind.
export function BeforeNote({ value, onChange, className = "" }) {
  return (
    <div className={className}>
      <label htmlFor="before-the-board" className="mb-1 block text-sm font-medium">Before the board starts <span className="font-normal text-muted-foreground">(optional)</span></label>
      <textarea
        id="before-the-board"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Facts or limits every advisor should know first, like a budget, a date or what you've already tried."
        className="block w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <p className="mt-1 text-xs text-muted-foreground">Each advisor gets this before Round 1, which they answer alone.</p>
    </div>
  );
}
