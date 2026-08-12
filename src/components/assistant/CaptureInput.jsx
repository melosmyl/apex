import React, { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Check, ArrowUp } from "lucide-react";
import { captureNote, recordProgressionAnswer } from "@/lib/assistant";

// Capture must be frictionless (thought to captured in under three
// seconds) and must confirm immediately — a note vanishing silently into
// this box is the exact failure mode the whole feature exists to prevent.
// The confirmation fires the instant Note.create() resolves, before any
// background tagging/classification has even started.
//
// pendingNodeAnswer switches this into the Progression Tree's "I've done
// this" hand-off mode: the same input, but submit routes to
// recordProgressionAnswer instead of captureNote — never a disguised
// checkbox, still a real conversational reply.
export default function CaptureInput({ companyId, onCaptured, pendingNodeAnswer, onNodeAnswered }) {
  const [text, setText] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | confirmed

  const submit = async () => {
    if (!text.trim() || state === "sending") return;
    setState("sending");
    try {
      if (pendingNodeAnswer) {
        const result = await recordProgressionAnswer(companyId, pendingNodeAnswer.id, text);
        setText("");
        setState("confirmed");
        setTimeout(() => { setState("idle"); onNodeAnswered?.(result); }, 1400);
        return;
      }
      const note = await captureNote(companyId, text);
      setText("");
      setState("confirmed");
      setTimeout(() => { setState("idle"); onCaptured?.(note); }, 1400);
    } catch {
      setState("idle");
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  if (state === "confirmed") {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground rise-in">
        <Check className="w-4 h-4 text-brand" strokeWidth={2} /> {pendingNodeAnswer ? "Got it" : "Captured"}
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={pendingNodeAnswer ? "Yes, and here's what happened…" : "Capture a thought…"}
        rows={2}
        autoFocus
        className="resize-none text-sm bg-background"
      />
      <Button
        size="icon"
        className="rounded-full shrink-0"
        disabled={!text.trim() || state === "sending"}
        onClick={submit}
        aria-label="Capture"
      >
        <ArrowUp className="w-4 h-4" />
      </Button>
    </div>
  );
}
