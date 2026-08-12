import React from "react";
import { X } from "lucide-react";

// The "good version of persistence" per the spec — surfacing a captured
// note only on genuine semantic relevance (match_notes), at most once per
// day across every kind of Assistant-initiated speech. Never a list to
// open, never a digest — this is the whole surfacing.
export default function InterjectionBanner({ text, onDismiss }) {
  return (
    <div className="mt-3 pt-3 border-t border-border/60 rise-in flex items-start gap-2">
      <p className="text-sm flex-1">{text}</p>
      <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Dismiss">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
