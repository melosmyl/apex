import React from "react";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { Badge } from "@/components/ui/badge";
import PinnableText from "@/components/pins/PinnableText";
import { usePin } from "@/components/pins/PinContext";

export default function AdvisorResponseCard({ independent, challenge, accent, meetingId, companyId, meetingTitle }) {
  const { createPin } = usePin();
  const conf = Math.round(independent.confidence_score || 0);

  return (
    <div className="bg-card border border-border/50 rounded-[var(--radius)] p-6 shadow-card rise-in">
      <div className="flex items-start gap-3 mb-5">
        <AdvisorAvatar name={independent.advisor_name} accent={accent} size="md" />
        <div className="flex-1 min-w-0">
          <h4 className="font-display text-lg leading-tight font-normal">{independent.advisor_name}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">{independent.role}</p>
        </div>
        <div className="text-center shrink-0">
          <div className="font-display text-xl font-normal">{conf}<span className="text-sm text-muted-foreground">%</span></div>
        </div>
      </div>

      <PinnableText companyId={companyId} sourceType="advisor_perspective" sourceId={meetingId} sourceTitle={meetingTitle || independent.advisor_name} sourceUrl={meetingId ? `/company/${companyId}/boardroom?meeting=${meetingId}` : undefined} meetingId={meetingId} advisorId={independent.advisor_id} onPin={createPin}>
      <div className="space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-editorial text-muted-foreground mb-1 font-medium">Position</div>
          <p className="text-sm leading-relaxed">{independent.position}</p>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-editorial text-muted-foreground mb-1 font-medium">Recommendation</div>
          <p className="text-sm font-medium leading-relaxed">{independent.recommendation}</p>
        </div>
        {independent.key_arguments?.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-editorial text-muted-foreground mb-1.5 font-medium">Key Arguments</div>
            <ul className="space-y-1.5">{independent.key_arguments.map((a, i) => <li key={i} className="text-sm flex gap-2.5 leading-relaxed"><span className="text-muted-foreground mt-0.5">—</span>{a}</li>)}</ul>
          </div>
        )}
        {independent.risks?.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-editorial text-muted-foreground mb-1.5 font-medium">Risks Identified</div>
            <ul className="space-y-1.5">{independent.risks.map((a, i) => <li key={i} className="text-sm flex gap-2.5 leading-relaxed"><span className="text-muted-foreground mt-0.5">—</span>{a}</li>)}</ul>
          </div>
        )}
        {independent.missing_information?.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-editorial text-muted-foreground mb-1.5 font-medium">Missing Information</div>
            <ul className="space-y-1.5">{independent.missing_information.map((a, i) => <li key={i} className="text-sm flex gap-2.5 leading-relaxed"><span className="text-muted-foreground mt-0.5">—</span>{a}</li>)}</ul>
          </div>
        )}
        {independent.suggested_actions?.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-editorial text-muted-foreground mb-1.5 font-medium">Suggested Actions</div>
            <ul className="space-y-1.5">{independent.suggested_actions.map((a, i) => <li key={i} className="text-sm flex gap-2.5 leading-relaxed"><span className="text-muted-foreground mt-0.5">—</span>{a}</li>)}</ul>
          </div>
        )}
      </div>

      </PinnableText>

      {challenge && challenge.revised_position && (
        <div className="mt-5 pt-5 border-t border-border/50">
          <Badge variant="outline" className="text-[10px] font-normal mb-2">Challenge Round</Badge>
          {challenge.challenged_advisor && <p className="text-xs text-muted-foreground mb-2 leading-relaxed">Challenged {challenge.challenged_advisor}: {challenge.point_challenged}</p>}
          <PinnableText companyId={companyId} sourceType="challenge_round" sourceId={meetingId} sourceTitle={meetingTitle || "Challenge Round"} sourceUrl={meetingId ? `/company/${companyId}/boardroom?meeting=${meetingId}` : undefined} meetingId={meetingId} advisorId={independent.advisor_id} onPin={createPin}>
            <p className="text-sm italic leading-relaxed font-display text-base">{challenge.revised_position}</p>
          </PinnableText>
        </div>
      )}
    </div>
  );
}