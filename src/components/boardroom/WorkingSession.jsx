import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { Send, Sparkles, CheckSquare, AlertCircle, Lightbulb } from "lucide-react";
import { runWorkingSessionMessage, runWorkingSessionSummary, saveWorkingSessionMeeting } from "@/lib/meetingModes";

export default function WorkingSession({ company, companyId, advisors }) {
  const [selectedAdvisors, setSelectedAdvisors] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [wrappingUp, setWrappingUp] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const toggleAdvisor = (a) => {
    setSelectedAdvisors((prev) => {
      if (prev.some((x) => x.id === a.id)) return prev.filter((x) => x.id !== a.id);
      if (prev.length >= 3) return prev;
      return [...prev, a];
    });
  };

  const send = async () => {
    if (!input.trim() || selectedAdvisors.length === 0 || loading) return;
    const founderMsg = { role: "founder", message: input.trim() };
    const newMessages = [...messages, founderMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      for (const advisor of selectedAdvisors) {
        const history = [...newMessages];
        const response = await runWorkingSessionMessage({ company, message: founderMsg.message, advisor, history });
        const advisorMsg = { role: "advisor", advisor_id: advisor.id, advisor_name: advisor.name, message: response };
        newMessages.push(advisorMsg);
        setMessages([...newMessages]);
      }
    } catch (e) {
      setError(e.message || "An advisor couldn't respond. Try again.");
    }
    setLoading(false);
  };

  const wrapUp = async () => {
    if (messages.length < 2) return;
    setWrappingUp(true);
    setError(null);
    try {
      const result = await runWorkingSessionSummary({
        company,
        messages,
        advisorNames: selectedAdvisors.map((a) => a.name)
      });
      setSummary(result);
      await saveWorkingSessionMeeting({
        companyId,
        advisorNames: selectedAdvisors.map((a) => a.name),
        messages,
        summary: result
      });
    } catch (e) {
      setError(e.message || "Couldn't generate a summary.");
    }
    setWrappingUp(false);
  };

  if (summary) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-display text-xl">Session summary</h2>
            <p className="text-xs text-muted-foreground mt-1">{selectedAdvisors.map((a) => a.name).join(", ")}</p>
          </div>
          <Button variant="outline" className="rounded-full" onClick={() => { setSummary(null); setMessages([]); }}>
            New session
          </Button>
        </div>

        <div className="bg-card border border-border/70 rounded-2xl p-6 mb-4 rise-in">
          <p className="leading-relaxed">{summary.summary}</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <SummarySection icon={Lightbulb} title="Key insights" items={summary.key_insights} />
          <SummarySection icon={CheckSquare} title="Areas of agreement" items={summary.areas_of_agreement} />
          <SummarySection icon={AlertCircle} title="Areas of disagreement" items={summary.areas_of_disagreement} />
          <SummarySection icon={Sparkles} title="Unresolved questions" items={summary.unresolved_questions} />
        </div>

        <div className="bg-brand-soft border border-brand/30 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckSquare className="w-4 h-4 text-brand" strokeWidth={1.5} />
            <span className="text-xs uppercase tracking-[0.16em] text-brand font-medium">Recommended actions</span>
          </div>
          <ul className="space-y-2">
            {summary.recommended_actions?.map((a, i) => (
              <li key={i} className="text-sm flex items-start gap-2.5">
                <span className="font-display text-muted-foreground/60">{String(i + 1).padStart(2, "0")}</span>{a}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      {messages.length === 0 && (
        <>
          <h2 className="text-2xl font-display mb-1">Working Session</h2>
          <p className="text-muted-foreground mb-6">A live, iterative conversation with up to three advisors. They'll respond in turn and can react to each other.</p>

          <div className="mb-6">
            <div className="text-sm font-medium mb-2.5">Choose up to 3 advisors</div>
            <div className="flex flex-wrap gap-2">
              {advisors.map((a) => (
                <button key={a.id} onClick={() => toggleAdvisor(a)} className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${selectedAdvisors.some((x) => x.id === a.id) ? "border-brand bg-brand-soft" : "border-border/70 bg-card hover:border-border"}`}>
                  <AdvisorAvatar name={a.name} accent={a.accent} photo_url={a.avatar} size="sm" />
                  <span className="text-sm">{a.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {messages.length > 0 && (
        <div ref={scrollRef} className="space-y-4 mb-4 max-h-[50vh] overflow-y-auto pr-2">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "founder" ? "flex-row-reverse" : ""}`}>
              {m.role === "advisor" && (
                <AdvisorAvatar name={m.advisor_name} size="sm" className="mt-1" />
              )}
              <div className={`max-w-[80%] ${m.role === "founder" ? "bg-primary text-primary-foreground" : "bg-card border border-border/70"} rounded-2xl px-4 py-3`}>
                {m.role === "advisor" && <div className="text-xs font-medium mb-1 text-muted-foreground">{m.advisor_name}</div>}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.message}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm pl-1">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" /> An advisor is thinking…
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive mb-3">{error}</p>}

      {selectedAdvisors.length > 0 && messages.length > 0 && (
        <div className="flex justify-end mb-3">
          <Button onClick={wrapUp} disabled={wrappingUp || loading || messages.length < 2} variant="outline" className="rounded-full text-sm">
            {wrappingUp ? "Wrapping up…" : "Wrap up & summarise"}
          </Button>
        </div>
      )}

      <div className="flex gap-2 items-end">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          placeholder={messages.length === 0 ? "Start the conversation…" : "Ask a follow-up, challenge an advisor, introduce new info…"}
          className="resize-none"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <Button onClick={send} disabled={!input.trim() || selectedAdvisors.length === 0 || loading} variant="brand" className="rounded-xl h-11 px-5 shrink-0">
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function SummarySection({ icon: Icon, title, items }) {
  return (
    <div className="bg-card border border-border/70 rounded-2xl p-5 rise-in">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
        <span className="text-xs uppercase tracking-[0.14em] font-medium text-muted-foreground">{title}</span>
      </div>
      <ul className="space-y-2">
        {items?.map((item, i) => (
          <li key={i} className="text-sm text-foreground/85 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5">·</span>{item}
          </li>
        ))}
      </ul>
    </div>
  );
}