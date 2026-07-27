import React, { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";
import { MEETING_MODES, getMode, recommendMode } from "@/lib/meetingModes";
import { Zap, MessagesSquare, Landmark, FileText, ClipboardCheck, Radio } from "lucide-react";

const ICONS = { Zap, MessagesSquare, Landmark, FileText, ClipboardCheck, Radio };

export default function ModeSelector({ advisors, onSelectMode }) {
  const [question, setQuestion] = useState("");
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(false);

  const suggest = async () => {
    if (!question.trim()) return;
    setLoading(true);
    try {
      const rec = await recommendMode(question, advisors);
      setRecommendation(rec);
    } catch (e) {
      // silent — user can still pick manually
    }
    setLoading(false);
  };

  const handleSelect = (modeKey) => {
    onSelectMode(modeKey, question);
  };

  return (
    <div>
      <div className="bg-card border border-border/70 rounded-3xl p-6 sm:p-8 mb-8 rise-in">
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="What do you need help with? Type your question or request…"
          className="text-base resize-none bg-background rounded-2xl"
        />
        <div className="flex justify-end mt-3">
          <Button onClick={suggest} disabled={!question.trim() || loading} variant="outline" className="rounded-full">
            {loading ? <><Sparkles className="w-4 h-4 mr-1.5 animate-pulse" /> Analysing…</> : <><Sparkles className="w-4 h-4 mr-1.5" /> Suggest a mode</>}
          </Button>
        </div>
      </div>

      {recommendation && (
        <div className="bg-brand-soft border border-brand/30 rounded-2xl p-5 mb-8 rise-in">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-brand mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium mb-1">Recommended: {getMode(recommendation.recommended_mode)?.label}</p>
              <p className="text-sm text-muted-foreground mb-3">{recommendation.reason}</p>
              <Button onClick={() => handleSelect(recommendation.recommended_mode)} variant="brand" className="rounded-full">
                Start {getMode(recommendation.recommended_mode)?.label} <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MEETING_MODES.map((m) => {
          const Icon = ICONS[m.icon];
          const isRecommended = recommendation?.recommended_mode === m.key;
          return (
            <button
              key={m.key}
              onClick={() => handleSelect(m.key)}
              className={`text-left p-5 rounded-2xl border transition-all hover:shadow-soft hover:border-border group ${
                isRecommended ? "border-brand bg-brand-soft" : "border-border/70 bg-card"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isRecommended ? "bg-brand text-brand-foreground" : "bg-secondary group-hover:bg-accent"}`}>
                  <Icon className="w-4 h-4" strokeWidth={1.5} />
                </div>
                {isRecommended && <span className="text-xs text-brand font-medium">Recommended</span>}
              </div>
              <h3 className="font-display text-lg mb-1">{m.label}</h3>
              <p className="text-xs text-muted-foreground mb-2">{m.tagline}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{m.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}