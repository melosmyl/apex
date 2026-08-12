import React, { useState } from "react";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PinnableText from "@/components/pins/PinnableText";
import { usePin } from "@/components/pins/PinContext";
import UnavailableNotice from "@/components/boardroom/UnavailableNotice";
import { base44 } from "@/api/base44Client";

// A missing_information item is either a plain string (older meetings, or a
// gap that isn't one of the founder's profile fields) or {detail, profile_field}
// — the board's own mechanism for recovering what the shortened onboarding
// form no longer collects, answered right where the gap came up rather than
// in a form. "Not sure yet" is a real, low-cost out: it just hides this one
// prompt — the field stays open and can come up again in a later meeting
// where it's actually relevant, nothing nags.
function MissingInfoItem({ item, companyId }) {
  const [mode, setMode] = useState("idle"); // idle | answering | saving | saved | dismissed
  const [value, setValue] = useState("");

  const detail = typeof item === "string" ? item : item.detail;
  const profileField = typeof item === "object" && item ? item.profile_field : null;

  const save = async () => {
    if (!value.trim()) return;
    setMode("saving");
    try {
      await base44.entities.Company.update(companyId, { [profileField]: value.trim() });
      setMode("saved");
    } catch {
      setMode("answering");
    }
  };

  if (mode === "saved") {
    return <li className="text-sm flex gap-2"><span className="text-muted-foreground">—</span><span>{detail} <span className="text-emerald-700">— saved.</span></span></li>;
  }
  if (mode === "dismissed") {
    return <li className="text-sm flex gap-2 text-muted-foreground/50"><span>—</span><span className="line-through">{detail}</span></li>;
  }

  return (
    <li className="text-sm">
      <div className="flex gap-2">
        <span className="text-muted-foreground">—</span>
        <div className="flex-1 min-w-0">
          <p>{detail}</p>
          {profileField && mode === "idle" && (
            <div className="flex items-center gap-3 mt-1">
              <button onClick={() => setMode("answering")} className="text-xs text-primary hover:text-primary/80">Answer</button>
              <button onClick={() => setMode("dismissed")} className="text-xs text-muted-foreground hover:text-foreground">Not sure yet</button>
            </div>
          )}
          {profileField && (mode === "answering" || mode === "saving") && (
            <div className="flex items-center gap-2 mt-1.5">
              <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Your answer" autoFocus className="h-8 text-sm rounded-lg" onKeyDown={(e) => e.key === "Enter" && save()} disabled={mode === "saving"} />
              <Button size="sm" variant="ghost" className="h-8 px-2.5 text-xs shrink-0" onClick={save} disabled={mode === "saving" || !value.trim()}>Save</Button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

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
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Position</div>
          <p className="text-sm">{independent.position}</p>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Recommendation</div>
          <p className="text-sm font-medium">{independent.recommendation}</p>
        </div>
        {independent.key_arguments?.length > 0 && (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Key Arguments</div>
            <ul className="space-y-1">{independent.key_arguments.map((a, i) => <li key={i} className="text-sm flex gap-2"><span className="text-muted-foreground">—</span>{a}</li>)}</ul>
          </div>
        )}
        {independent.risks?.length > 0 && (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Risks Identified</div>
            <ul className="space-y-1">{independent.risks.map((a, i) => <li key={i} className="text-sm flex gap-2"><span className="text-muted-foreground">—</span>{a}</li>)}</ul>
          </div>
        )}
        {independent.missing_information?.length > 0 && (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Missing Information</div>
            <ul className="space-y-2">{independent.missing_information.map((item, i) => <MissingInfoItem key={i} item={item} companyId={companyId} />)}</ul>
          </div>
        )}
        {independent.suggested_actions?.length > 0 && (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Suggested Actions</div>
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