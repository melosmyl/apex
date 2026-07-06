import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { AlertTriangle, Lightbulb, ListChecks, MessageSquareQuote, Sparkles, ArrowRight } from "lucide-react";

const STANCE = {
  supports: "text-emerald-800 bg-emerald-50 border-emerald-200",
  challenges: "text-rose-800 bg-rose-50 border-rose-200",
  questions: "text-amber-800 bg-amber-50 border-amber-200",
  neutral: "text-stone-700 bg-stone-50 border-stone-200",
};

function List({ icon: Icon, title, items }) {
  if (!items?.length) return null;
  return (
    <div className="bg-card border border-border/70 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3"><Icon className="w-4 h-4 text-muted-foreground" /><h4 className="font-display text-base">{title}</h4></div>
      <ul className="space-y-2">
        {items.map((it, i) => <li key={i} className="text-sm flex gap-2"><span className="text-muted-foreground">—</span>{it}</li>)}
      </ul>
    </div>
  );
}

export default function MeetingResult({ result, advisors, onRecordDecision, recording }) {
  const accentOf = (name) => advisors.find((a) => a.name === name)?.accent || "#7a5c3e";
  const conf = Math.round(result.confidence_score || 0);

  return (
    <div className="space-y-8">
      <div className="bg-card border border-border/70 rounded-2xl p-6 sm:p-8 rise-in">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /><h3 className="font-display text-2xl">Executive Summary</h3></div>
          <div className="text-center shrink-0">
            <div className="font-display text-3xl">{conf}<span className="text-lg text-muted-foreground">%</span></div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Confidence</div>
          </div>
        </div>
        <p className="text-[15px] leading-relaxed mb-6">{result.executive_summary}</p>
        <div className="bg-accent/50 rounded-xl p-5">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Recommendation</div>
          <p className="font-display text-lg leading-snug">{result.recommendation}</p>
        </div>
        {onRecordDecision && (
          <div className="flex justify-end mt-6">
            <Button onClick={onRecordDecision} disabled={recording} className="rounded-full px-5">
              {recording ? "Recording…" : <>Record in Decision Centre <ArrowRight className="w-4 h-4 ml-1.5" /></>}
            </Button>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <List icon={AlertTriangle} title="Risks" items={result.risks} />
        <List icon={Lightbulb} title="Alternative Strategies" items={result.alternative_strategies} />
        <List icon={ListChecks} title="Next Steps" items={result.next_steps} />
        {result.minority_opinion && (
          <div className="bg-card border border-border/70 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3"><MessageSquareQuote className="w-4 h-4 text-muted-foreground" /><h4 className="font-display text-base">Minority Opinion</h4></div>
            <p className="text-sm leading-relaxed italic text-muted-foreground">{result.minority_opinion}</p>
          </div>
        )}
      </div>

      {result.assigned_tasks?.length > 0 && (
        <div>
          <h4 className="font-display text-lg mb-3">Assigned Tasks</h4>
          <div className="space-y-2">
            {result.assigned_tasks.map((t, i) => (
              <div key={i} className="flex items-center gap-3 bg-card border border-border/70 rounded-xl p-3">
                <AdvisorAvatar name={t.assigned_to} accent={accentOf(t.assigned_to)} size="sm" />
                <span className="text-sm flex-1">{t.title}</span>
                <span className="text-xs text-muted-foreground">{t.assigned_to}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="font-display text-lg mb-3">The Discussion</h4>
        <div className="space-y-4">
          {result.discussion?.map((turn, i) => (
            <div key={i} className="flex gap-3 rise-in">
              <AdvisorAvatar name={turn.advisor} accent={accentOf(turn.advisor)} size="md" />
              <div className="flex-1 bg-card border border-border/70 rounded-2xl rounded-tl-sm p-4">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="font-medium text-sm">{turn.advisor}</span>
                  <span className="text-xs text-muted-foreground">{turn.role}</span>
                  {turn.stance && <Badge variant="outline" className={`text-[10px] font-normal capitalize ${STANCE[turn.stance] || STANCE.neutral}`}>{turn.stance}</Badge>}
                </div>
                <p className="text-sm leading-relaxed">{turn.message}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}