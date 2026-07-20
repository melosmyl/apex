import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";

export default function FounderReplyBox({ onSubmit }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit(message.trim());
      setMessage("");
    } catch (e) {
      setError(e.message || "The board couldn't process your message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-t border-border/50 p-4">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Reply to the board</div>
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        placeholder="Share additional context, challenge a recommendation, or ask the board to reconsider…"
        className="text-sm resize-none bg-background rounded-xl"
        disabled={sending}
      />
      {error && <p className="text-sm text-destructive mt-2">{error}</p>}
      <div className="flex justify-end mt-2">
        <Button onClick={submit} disabled={!message.trim() || sending} className="rounded-full px-5">
          {sending ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
              Board is responding…
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-1.5" /> Send to board
            </>
          )}
        </Button>
      </div>
    </div>
  );
}