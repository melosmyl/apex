import React from "react";
import { Button } from "@/components/ui/button";
import { Landmark } from "lucide-react";

// The one interaction exempt from the interjection budget (see
// AssistantWidget) — a direct, synchronous response to what the founder
// just typed, not a proactive interruption. She is the interface to the
// board, not an alternative to it: this is the one place that's true in
// the UI, not just the prompt.
export default function RoutingPrompt({ promptText, onAccept, onDismiss }) {
  return (
    <div className="mt-3 pt-3 border-t border-border/60 rise-in">
      <p className="text-sm mb-3">{promptText}</p>
      <div className="flex gap-2">
        <Button size="sm" className="rounded-full flex-1" onClick={onAccept}>
          <Landmark className="w-3.5 h-3.5 mr-1.5" /> Open board meeting
        </Button>
        <Button size="sm" variant="ghost" className="rounded-full" onClick={onDismiss}>
          Not now
        </Button>
      </div>
    </div>
  );
}
