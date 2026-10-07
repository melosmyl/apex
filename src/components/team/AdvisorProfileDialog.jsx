import React from "react";
import { Button } from "@/components/ui/button";
import { AdvisorProfileDialog as ProfilePanel } from "@/components/advisors/AdvisorProfilePanel";
import { profileFor } from "@/lib/advisorProfiles";

// Your advisors' profile window: the advisor's profile (K4) with the
// board's own action on it (Remove from team), or a note when there's none
// (the Chair can't be removed).
export default function AdvisorProfileDialog({ advisor, open, onOpenChange, onAction, actionLabel, actionVariant = "default", actionNote = null }) {
  if (!advisor) return null;
  const actions = onAction
    ? <Button variant={actionVariant} onClick={() => onAction(advisor)}>{actionLabel}</Button>
    : actionNote ? <p className="text-sm text-muted-foreground">{actionNote}</p> : null;
  return <ProfilePanel open={open} onOpenChange={onOpenChange} profile={profileFor({ advisor })} actions={actions} />;
}
