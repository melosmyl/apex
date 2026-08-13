import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { ArrowRight, RotateCcw } from "lucide-react";
import { runQuickAsk, saveQuickAskMeeting } from "@/lib/meetingModes";

export default function QuickAsk({ company, companyId, advisors, initialQuestion, initialMeeting }) {
  const [question, setQuestion] = useState(initialQuestion || "");
  const [selectedAdvisor, setSelectedAdvisor] = useState(null);
  const [result, setResult] = useState(initialMeeting?.mode_result || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (initialMeeting?.participants?.[0]) {
      const adv = advisors.find((a) => a.name === initialMeeting.participants[0]);
      if (adv) setSelectedAdvisor(adv);
    }
  }, [initialMeeting, advisors]);

  const run = async () => {
    if (!question.trim() || !selectedAdvisor) return;
    setLoading(true);
    setError(null);
    try {
      const res = await runQuickAsk({ company, question, advisor: selectedAdvisor });
      setResult(res);
      await saveQuickAskMeeting({ companyId, question, advisor: selectedAdvisor, result: res });
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  if (result) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <AdvisorAvatar name={selectedAdvisor?.name} accent={selectedAdvisor?.accent} photo_url={selectedAdvisor?.avatar} size="md" />
            <div>
              <div className="font-medium">{selectedAdvisor?.name}</div>
              <div className="text-xs text-muted-foreground">{selectedAdvisor?.role}</div>
            </div>
          </div>
          <Button variant="secondaryOutline" onClick={() => { setResult(null); setQuestion(""); }}>
            <RotateCcw className="w-4 h-4 mr-1.5" /> New question
          </Button>
        </div>

        <div className="bg-card border border-border/70 rounded-2xl p-6 mb-4">
          <p className="font-display text-lg text-muted-foreground italic">"{question}"</p>
        </div>

        <div className="bg-card border border-border/70 rounded-2xl p-6 mb-4 rise-in">
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground mb-3">Answer</div>
          <p className="leading-relaxed text-[0.95rem]">{result.answer}</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-card border border-border/70 rounded-2xl p-5 rise-in">
            <div className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground mb-2">Reasoning</div>
            <p className="text-sm text-muted-foreground leading-relaxed">{result.reasoning}</p>
          </div>
          <div className="bg-card border border-brand/30 bg-brand-soft rounded-2xl p-5 rise-in">
            <div className="font-mono text-xs uppercase tracking-[0.16em] text-brand font-medium mb-2">Next action</div>
            <p className="text-sm">{result.next_action}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-display mb-1">Quick Ask</h2>
      <p className="text-muted-foreground mb-6">A fast, direct answer from one advisor. Perfect for simple questions.</p>

      <div className="mb-6">
        <Label className="mb-2.5 block text-sm">Choose an advisor</Label>
        <div className="flex flex-wrap gap-2">
          {advisors.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedAdvisor(a)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                selectedAdvisor?.id === a.id ? "border-brand bg-brand-soft" : "border-border/70 bg-card hover:border-border"
              }`}
            >
              <AdvisorAvatar name={a.name} accent={a.accent} photo_url={a.avatar} size="sm" />
              <span className="text-sm">{a.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <Label className="mb-2.5 block text-sm">Your question</Label>
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="What do you need to know?"
          className="resize-none"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(); }}
        />
      </div>

      {error && <p className="text-sm text-destructive mb-4">{error}</p>}

      <Button onClick={run} disabled={!question.trim() || !selectedAdvisor || loading} variant="primary" className="px-8">
        {loading ? "Getting answer…" : "Get answer"} {!loading && <ArrowRight className="w-4 h-4 ml-1.5" />}
      </Button>
    </div>
  );
}