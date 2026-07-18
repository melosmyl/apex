import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Lightbulb, Gavel, ArrowRight, FlaskConical, ListChecks, MessageSquare } from "lucide-react";
import ConversationView from "@/components/boardroom/ConversationView";
import FounderDecisionControls from "@/components/boardroom/FounderDecisionControls";

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

export default function MeetingResult({ result, advisors, companyId, onRecordDecision }) {
  const resolution = result.board_resolution || {};
  const transcript = result.transcript || [];
  const conf = Math.round(resolution.overall_confidence_score || 0);

  return (
    <div className="space-y-8">
      {/* Boardroom Conversation */}
      <div className="bg-card border border-border/70 rounded-2xl p-6 sm:p-8 rise-in">
        <div className="flex items-center gap-2 mb-5">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h3 className="font-display text-2xl">Boardroom Conversation</h3>
        </div>
        <ConversationView transcript={transcript} advisors={advisors} />
      </div>

      {/* Chair's Conclusion */}
      <div className="bg-card border border-border/70 rounded-2xl p-6 sm:p-8 rise-in">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-2"><Gavel className="w-5 h-5 text-primary" /><h3 className="font-display text-2xl">Chair's Conclusion</h3></div>
          <div className="text-center shrink-0">
            <div className="font-display text-3xl">{conf}<span className="text-lg text-muted-foreground">%</span></div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Confidence</div>
          </div>
        </div>
        <p className="text-[15px] leading-relaxed mb-6">{resolution.executive_summary}</p>
        <div className="bg-accent/50 rounded-xl p-5 mb-6">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Recommended Direction</div>
          <p className="font-display text-lg leading-snug">{resolution.recommended_direction}</p>
        </div>
        {resolution.reasoning && (
          <div className="mb-4"><div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Reasoning</div><p className="text-sm leading-relaxed">{resolution.reasoning}</p></div>
        )}
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <List icon={Lightbulb} title="Consensus" items={resolution.areas_of_agreement} />
          <List icon={AlertTriangle} title="Unresolved Disagreements" items={resolution.areas_of_disagreement} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <List icon={AlertTriangle} title="Key Risks" items={resolution.main_risks} />
          <List icon={Lightbulb} title="Assumptions" items={resolution.assumptions} />
        </div>
        {resolution.minority_opinion && (
          <div className="bg-card border border-border/70 rounded-2xl p-5 mb-4">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Minority Opinion</div>
            <p className="text-sm leading-relaxed italic text-muted-foreground">{resolution.minority_opinion}</p>
          </div>
        )}
        {resolution.missing_information?.length > 0 && (
          <List icon={AlertTriangle} title="Missing Information" items={resolution.missing_information} />
        )}
        {resolution.recommended_experiment && (
          <div className="bg-secondary/40 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-1"><FlaskConical className="w-4 h-4 text-muted-foreground" /><span className="text-[11px] uppercase tracking-widest text-muted-foreground">Recommended Experiment</span></div>
            <p className="text-sm">{resolution.recommended_experiment}</p>
          </div>
        )}
        {resolution.next_actions?.length > 0 && (
          <div className="bg-card border border-border/70 rounded-2xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-3"><ListChecks className="w-4 h-4 text-muted-foreground" /><h4 className="font-display text-base">Action Items & Delegated Tasks</h4></div>
            <ul className="space-y-2">
              {resolution.next_actions.map((a, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="text-muted-foreground">—</span>
                  <span>{a.title}{a.assigned_to && <span className="text-muted-foreground"> (assigned to {a.assigned_to})</span>}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {onRecordDecision && (
          <div className="flex justify-end mt-4">
            <Button onClick={onRecordDecision} variant="outline" className="rounded-full px-5">Record in Decision Centre <ArrowRight className="w-4 h-4 ml-1.5" /></Button>
          </div>
        )}
      </div>

      <FounderDecisionControls meetingId={result.meeting_id} nextActions={resolution.next_actions} companyId={companyId} />
    </div>
  );
}