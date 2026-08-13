import React, { useEffect, useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Sparkles, Loader2, CheckCircle2, AlertCircle, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";

const AGENT_NAME = "project_planner";

function ToolCallDisplay({ toolCall }) {
  const [expanded, setExpanded] = useState(false);
  const rawStatus = toolCall.status;
  const isFailed = rawStatus === "failed" || rawStatus === "error";
  const isSuccess = rawStatus === "completed" || rawStatus === "success";
  const isPending = !isSuccess && !isFailed;

  let parsedResults = toolCall.results;
  try { parsedResults = typeof parsedResults === "string" ? JSON.parse(parsedResults) : parsedResults; } catch { /* keep raw */ }
  if (parsedResults && typeof parsedResults === "object" && parsedResults.success === false) {
    // treat as failed
  }

  let parsedArgs = toolCall.arguments_string;
  try { parsedArgs = typeof parsedArgs === "string" ? JSON.parse(parsedArgs) : parsedArgs; } catch { /* keep raw */ }

  const dp = toolCall.display_projection || {};
  const hideDetails = dp.hide_details && dp.details_redacted;
  const label = isFailed
    ? (dp.error_label || dp.label || toolCall.name)
    : isSuccess
      ? (dp.label || toolCall.name)
      : (dp.active_label || dp.label || toolCall.name);

  const Icon = isFailed ? AlertCircle : isSuccess ? CheckCircle2 : Loader2;
  const iconColor = isFailed ? "text-red-400" : isSuccess ? "text-emerald-500" : "text-muted-foreground";

  return (
    <div className="flex items-start gap-2 my-1.5 text-xs">
      <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${iconColor} ${isPending ? "animate-spin" : ""}`} strokeWidth={2} />
      <div className="flex-1 min-w-0">
        <button
          onClick={() => !hideDetails && setExpanded(!expanded)}
          disabled={hideDetails}
          className={`text-muted-foreground capitalize ${hideDetails ? "cursor-default" : "hover:text-foreground transition-colors"}`}
        >
          {label}
          {!hideDetails && <ChevronRight className={`w-3 h-3 inline ml-1 transition-transform ${expanded ? "rotate-90" : ""}`} />}
        </button>
        {expanded && !hideDetails && (
          <div className="mt-1 space-y-1">
            {parsedArgs != null && (
              <div>
                <span className="text-muted-foreground/50">Parameters</span>
                <pre className="mt-0.5 p-2 bg-background/60 rounded text-[10px] overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(parsedArgs, null, 2)}</pre>
              </div>
            )}
            {parsedResults != null && (
              <div>
                <span className="text-muted-foreground/50">Result</span>
                <pre className="mt-0.5 p-2 bg-background/60 rounded text-[10px] overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(parsedResults, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${isUser ? "bg-primary text-primary-foreground" : "bg-secondary/70"}`}>
        {message.content && (
          isUser
            ? <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
            : <div className="text-sm leading-relaxed [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_strong]:font-medium [&_h1]:text-base [&_h1]:font-medium [&_h1]:mt-2 [&_h2]:text-sm [&_h2]:font-medium [&_h2]:mt-2 [&_code]:text-xs [&_code]:bg-background/50 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
        )}
        {message.tool_calls?.map((tc, i) => <ToolCallDisplay key={i} toolCall={tc} />)}
      </div>
    </div>
  );
}

export default function ProjectPlannerDialog({ project, companyId, open, onOpenChange }) {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const initialSentRef = useRef(false);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setConversation(null);
      setMessages([]);
      setInput("");
      setSending(false);
      setStarting(false);
      setError(null);
      initialSentRef.current = false;
    }
  }, [open]);

  // Create conversation when opened with a project
  useEffect(() => {
    if (open && project && !conversation && !starting) {
      setStarting(true);
      setError(null);
      base44.agents.createConversation({
        agent_name: AGENT_NAME,
        metadata: { name: `Plan: ${project.name}`, project_id: project.id, company_id: companyId },
      })
        .then((conv) => {
          setConversation(conv);
          setStarting(false);
        })
        .catch((e) => {
          console.error("Failed to create conversation:", e);
          setError("Could not start the planning session. Please try again.");
          setStarting(false);
        });
    }
  }, [open, project]);

  // Subscribe to conversation updates and send initial message
  useEffect(() => {
    if (!conversation?.id) return;
    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
    });

    if (!initialSentRef.current && project) {
      initialSentRef.current = true;
      const parts = [`Please organize the project "${project.name}" into clear, prioritized tasks.`];
      if (project.description) parts.push(`Description: ${project.description}.`);
      if (project.timeline) parts.push(`Timeline: ${project.timeline}.`);
      if (project.executive_owner) parts.push(`Executive owner: ${project.executive_owner}.`);
      parts.push(`The project ID is ${project.id} and the company ID is ${companyId}.`);
      parts.push("Read the project, check for existing tasks, review the available advisors, then create a well-sequenced task breakdown.");
      base44.agents.addMessage(conversation, { role: "user", content: parts.join(" ") })
        .catch((e) => console.error("Failed to send initial message:", e));
    }

    return () => unsubscribe();
  }, [conversation?.id]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  const send = async () => {
    if (!input.trim() || !conversation || sending) return;
    const msg = input.trim();
    setInput("");
    setSending(true);
    try {
      const updated = await base44.agents.addMessage(conversation, { role: "user", content: msg });
      setMessages(updated.messages || messages);
    } catch (e) {
      console.error("Failed to send message:", e);
      setError("Could not send your message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const isStarting = starting && messages.length === 0;
  const isResponding = !starting && conversation && messages.length > 0 && messages[messages.length - 1].role === "user";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 flex flex-col max-h-[85vh] gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/60 shrink-0 pr-12">
          <DialogTitle className="font-display text-2xl font-light flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-muted-foreground" strokeWidth={1.5} />
            Plan with AI
          </DialogTitle>
          {project && <p className="text-sm text-muted-foreground mt-0.5">Breaking down &ldquo;{project.name}&rdquo; into prioritized tasks</p>}
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-3 min-h-[300px]">
          {isStarting && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Starting planning session...
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-500">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          {isResponding && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Working on it...
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border/60 shrink-0 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask for changes or more detail..."
            disabled={!conversation || sending}
            className="flex-1"
          />
          <Button onClick={send} disabled={!input.trim() || !conversation || sending} size="icon" variant="primary" className="shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}