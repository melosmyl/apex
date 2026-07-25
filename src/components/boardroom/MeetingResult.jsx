import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Lightbulb, Gavel, ArrowRight, FlaskConical } from "lucide-react";
import AdvisorResponseCard from "@/components/boardroom/AdvisorResponseCard";
import FounderDecisionControls from "@/components/boardroom/FounderDecisionControls";
import ExecutiveDiscussion from "@/components/boardroom/ExecutiveDiscussion";
import PinnableText from "@/components/pins/PinnableText";
import { usePin } from "@/components/pins/PinContext";

function List({ icon: Icon, title, items }) {
  if (!items?.length) return null;
  return (
    <div className="bg-card border border-border/50 rounded-[var(--radius)] p-6 shadow-soft">
      <div className="flex items-center gap-2 mb-3"><Icon className="w-[15px] h-[15px] text-muted-foreground" strokeWidth={1.5} /><h4 className="font-display text-base font-normal">{title}</h4></div>
      <ul className="space-y-2.5">
        {items.map((it, i) => <li key={i} className="text-sm flex gap-2.5 leading-relaxed"><span className="text-muted-foreground mt-0.5">—</span>{it}</li>)}
      </ul>
    </div>
  );
}

export default function MeetingResult({ result, advisors, companyId, onRecordDecision, onFollowup }) {
  const { createPin } = usePin();
  const accentOf = (name) => advisors.find((a) => a.name === name)?.accent || "#7a5c3e";
  const resolution = result.board_resolution || {};
  const independent = result.independent_responses || [];
  const challenges = result.challenge_responses || [];
  const conf = Math.round(resolution.overall_confidence_score || 0);
  const meetingId = result.meeting_id;
  const meetingTitle = result.question || "Board Meeting";
  const sourceUrl = `/company/${companyId}/boardroom?meeting=${meetingId}`;

  return (
    <div className="space-y-10">
      <div className="bg-card border border-border/50 rounded-[var(--radius)] p-8 sm:p-10 shadow-card rise-in">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-2.5"><Gavel className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.5} /><h3 className="font-display text-2xl font-normal">Board Resolution</h3></div>
          <div className="text-center shrink-0">
            <div className="font-display text-3xl font-normal">{conf}<span className="text-lg text-muted-foreground">%</span></div>
            <div className="text-[11px] uppercase tracking-editorial text-muted-foreground mt-1 font-medium">Confidence</div>
          </div>
        </div>
        <PinnableText companyId={companyId} sourceType="board_resolution" sourceId={meetingId} sourceTitle={meetingTitle} sourceUrl={sourceUrl} meetingId={meetingId} onPin={createPin}>
          <p className="text-[15px] leading-relaxed mb-6 text-foreground/90">{resolution.executive_summary}</p>
          <div className="bg-accent/40 rounded-xl p-6 mb-6 border border-border/30">
            <div className="text-[11px] uppercase tracking-editorial text-muted-foreground mb-2 font-medium">Recommended Direction</div>
            <p className="font-display text-xl leading-snug font-normal">{resolution.recommended_direction}</p>
          </div>
        </PinnableText>
        {resolution.reasoning && (
          <div className="mb-5"><div className="text-[11px] uppercase tracking-editorial text-muted-foreground mb-2 font-medium">Reasoning</div><p className="text-sm leading-relaxed text-foreground/85">{resolution.reasoning}</p></div>
        )}
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <List icon={Lightbulb} title="Areas of Agreement" items={resolution.areas_of_agreement} />
          <List icon={AlertTriangle} title="Areas of Disagreement" items={resolution.areas_of_disagreement} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <List icon={AlertTriangle} title="Main Risks" items={resolution.main_risks} />
          <List icon={Lightbulb} title="Assumptions" items={resolution.assumptions} />
        </div>
        {resolution.minority_opinion && (
          <div className="bg-card border border-border/50 rounded-[var(--radius)] p-6 mb-4 shadow-soft">
            <div className="text-[11px] uppercase tracking-editorial text-muted-foreground mb-2 font-medium">Minority Opinion</div>
            <p className="text-sm leading-relaxed italic text-muted-foreground font-display text-base">{resolution.minority_opinion}</p>
          </div>
        )}
        {resolution.missing_information?.length > 0 && (
          <List icon={AlertTriangle} title="Missing Information" items={resolution.missing_information} />
        )}
        {resolution.recommended_experiment && (
          <div className="bg-secondary/40 rounded-xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-2"><FlaskConical className="w-[15px] h-[15px] text-muted-foreground" strokeWidth={1.5} /><span className="text-[11px] uppercase tracking-editorial text-muted-foreground font-medium">Recommended Experiment</span></div>
            <p className="text-sm leading-relaxed">{resolution.recommended_experiment}</p>
          </div>
        )}
        {onRecordDecision && (
          <div className="flex justify-end mt-6">
            <Button onClick={onRecordDecision} variant="outline" className="px-5">Record in Decision Centre <ArrowRight className="w-4 h-4 ml-1.5" /></Button>
          </div>
        )}
      </div>

      <ExecutiveDiscussion transcript={result.discussion_transcript || []} evaluation={resolution.discussion_evaluation} advisors={advisors} onFollowup={onFollowup} meetingId={meetingId} companyId={companyId} meetingTitle={meetingTitle} />

      <FounderDecisionControls meetingId={result.meeting_id} nextActions={resolution.next_actions} companyId={companyId} />

      <div>
        <h4 className="font-display text-xl mb-4 font-normal">Advisor Perspectives</h4>
        <div className="grid sm:grid-cols-2 gap-5">
          {independent.map((resp, i) => {
            const challenge = challenges.find(c => c.advisor_id === resp.advisor_id);
            return <AdvisorResponseCard key={i} independent={resp} challenge={challenge} accent={accentOf(resp.advisor_name)} meetingId={meetingId} companyId={companyId} meetingTitle={meetingTitle} />;
          })}
        </div>
      </div>
    </div>
  );
}