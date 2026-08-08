import React from "react";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { Badge } from "@/components/ui/badge";
import PinnableText from "@/components/pins/PinnableText";
import { usePin } from "@/components/pins/PinContext";
import UnavailableNotice from "@/components/boardroom/UnavailableNotice";

export default function AdvisorResponseCard({ independent, challenge, accent, meetingId, companyId, meetingTitle }) {
  const { createPin } = usePin();
  const conf = Math.round(independent.confidence_score || 0);
  const unavailable = independent.unavailable;

  if (unavailable) {
    return (
      <div className="bg-card border border-border/70 rounded-2xl p-5 rise-in">
        <div className="flex items-start gap-3 mb-4">
          <AdvisorAvatar name={independent.advisor_name} accent={accent} size="md" />
          <div className="flex-1 min-w-0">
            <h4 className="font-display text-lg leading-tight">{independent.advisor_name}</h4>
            <p className="text-xs text-muted-foreground">{independent.role}</p>
          </div>
          <div className="text-center shrink-0">
            <div className="font-display text-xl text-muted-foreground">—</div>
          </div>
        </div>
        <UnavailableNotice>
          This advisor could not be reached, so they gave no position on this question. The board continued without them — the resolution does not reflect their view.
        </UnavailableNotice>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border/70 rounded-2xl p-5 rise-in">
      <div className="flex items-start gap-3 mb-4">
        <AdvisorAvatar name={independent.advisor_name} accent={accent} size="md" />
        <div className="flex-1 min-w-0">
          <h4 className="font-display text-lg leading-tight">{independent.advisor_name}</h4>
          <p className="text-xs text-muted-foreground">{independent.role}</p>
        </div>
        <div className="text-center shrink-0">
          <div className="font-display text-xl">{conf}<span className="text-sm text-muted-foreground">%</span></div>
        </div>
      </div>

      <PinnableText companyId={companyId} sourceType="advisor_perspective" sourceId={meetingId} sourceTitle={meetingTitle || independent.advisor_name} sourceUrl={meetingId ? `/company/${companyId}/boardroom?meeting=${meetingId}` : undefined} meetingId={meetingId} advisorId={independent.advisor_id} onPin={createPin}>
      <div className="space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Position</div>
          <p className="text-sm">{independent.position}</p>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Recommendation</div>
          <p className="text-sm font-medium">{independent.recommendation}</p>
        </div>
        {independent.key_arguments?.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Key Arguments</div>
            <ul className="space-y-1">{independent.key_arguments.map((a, i) => <li key={i} className="text-sm flex gap-2"><span className="text-muted-foreground">—</span>{a}</li>)}</ul>
          </div>
        )}
        {independent.risks?.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Risks Identified</div>
            <ul className="space-y-1">{independent.risks.map((a, i) => <li key={i} className="text-sm flex gap-2"><span className="text-muted-foreground">—</span>{a}</li>)}</ul>
          </div>
        )}
        {independent.missing_information?.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Missing Information</div>
            <ul className="space-y-1">{independent.missing_information.map((a, i) => <li key={i} className="text-sm flex gap-2"><span className="text-muted-foreground">—</span>{a}</li>)}</ul>
          </div>
        )}
        {independent.suggested_actions?.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Suggested Actions</div>
            <ul className="space-y-1">{independent.suggested_actions.map((a, i) => <li key={i} className="text-sm flex gap-2"><span className="text-muted-foreground">—</span>{a}</li>)}</ul>
          </div>
        )}
      </div>

      </PinnableText>

      {challenge && challenge.revised_position && (
        <div className="mt-4 pt-4 border-t border-border/50">
          <Badge variant="outline" className="text-[10px] font-normal mb-2">Challenge Round</Badge>
          {challenge.challenged_advisor && <p className="text-xs text-muted-foreground mb-1">Challenged {challenge.challenged_advisor}: {challenge.point_challenged}</p>}
          <PinnableText companyId={companyId} sourceType="challenge_round" sourceId={meetingId} sourceTitle={meetingTitle || "Challenge Round"} sourceUrl={meetingId ? `/company/${companyId}/boardroom?meeting=${meetingId}` : undefined} meetingId={meetingId} advisorId={independent.advisor_id} onPin={createPin}>
            <p className="text-sm italic">{challenge.revised_position}</p>
          </PinnableText>
        </div>
      )}
    </div>
  );
}