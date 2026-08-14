import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Mic, MicOff } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

export default function FounderReplyBox({ onSubmit }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const { isListening, toggle, supported } = useSpeechRecognition({
    onTranscript: (text) => setMessage(text),
  });

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
    <div>
      <div className="relative">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Share additional context, challenge a recommendation, or ask the board to reconsider…"
          className="text-sm resize-none bg-background rounded-xl pr-12"
          disabled={sending}
        />
        {supported && (
          <button
            onClick={toggle}
            disabled={sending}
            title={isListening ? "Stop listening" : "Speak your reply"}
            className={`absolute right-3 bottom-3 w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 ${isListening ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"}`}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-destructive mt-2">{error}</p>}
      <div className="flex justify-end mt-2">
        <Button onClick={submit} disabled={!message.trim() || sending} variant="primary" className="px-5">
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