import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ADVISOR_LIBRARY } from "@/lib/advisorLibrary";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { AdvisorProfileDialog } from "@/components/advisors/AdvisorProfilePanel";
import { profileFor } from "@/lib/advisorProfiles";
import { Check } from "lucide-react";

// The library of advisors a founder can invite. Clicking an advisor's
// portrait or name opens their profile, with the Invite button on it, so
// they can meet an advisor before choosing them (K4).
export default function AddAdvisorDialog({ open, onOpenChange, existingKeys = [], onAdd, atCap = false, maxAdvisors = 6, seatsFilled = 0 }) {
  const [adding, setAdding] = useState(null);
  const [viewing, setViewing] = useState(null);

  const add = async (lib) => {
    setAdding(lib.key);
    await onAdd(lib);
    setAdding(null);
  };

  // What a founder can do about an advisor, in the list and on their profile.
  const inviteControl = (a, { large = false } = {}) => {
    if (existingKeys.includes(a.key)) {
      return <span className="text-sm text-muted-foreground flex items-center gap-1 shrink-0"><Check className="w-3.5 h-3.5" /> On your board</span>;
    }
    if (atCap) {
      return <span className="text-sm text-muted-foreground shrink-0">Your board is full</span>;
    }
    return (
      <Button size={large ? "default" : "sm"} variant={large ? "primary" : "secondaryOutline"} className="shrink-0" onClick={() => add(a)} disabled={adding === a.key}>
        {adding === a.key ? "Inviting…" : large ? "Invite to your board" : "Invite"}
      </Button>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-light">Invite an advisor</DialogTitle>
            <p className="text-sm font-medium" aria-live="polite">
              {Math.min(seatsFilled, maxAdvisors)} of {maxAdvisors} seats filled
            </p>
            <p className="text-sm text-muted-foreground">
              {atCap
                ? "Your board is full. Remove an advisor from your team to make room for another."
                : "Choose a specialist to join your board. Open anyone's profile to meet them first."}
            </p>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3 pt-2">
            {ADVISOR_LIBRARY.map((a) => (
              <div key={a.key} className="flex items-center gap-3 border border-border/70 rounded-xl p-3">
                <button
                  type="button"
                  onClick={() => setViewing(a)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-lg hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                  aria-label={`Meet ${a.name}`}
                >
                  <AdvisorAvatar name={a.name} libraryKey={a.key} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{a.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{a.role}</div>
                  </div>
                </button>
                {inviteControl(a)}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AdvisorProfileDialog
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        profile={viewing ? profileFor({ libraryKey: viewing.key }) : null}
        actions={viewing ? inviteControl(viewing, { large: true }) : null}
      />
    </>
  );
}
