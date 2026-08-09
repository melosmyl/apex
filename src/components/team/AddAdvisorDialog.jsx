import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ADVISOR_LIBRARY } from "@/lib/advisorLibrary";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { Check } from "lucide-react";

export default function AddAdvisorDialog({ open, onOpenChange, existingKeys = [], onAdd, atCap = false, maxAdvisors = 6 }) {
  const [adding, setAdding] = useState(null);

  const add = async (lib) => {
    setAdding(lib.key);
    await onAdd(lib);
    setAdding(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-light">Invite an advisor</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Choose a specialist to join your executive team.
            {atCap
              ? ` Your board is at its current limit of ${maxAdvisors} AI advisors — more coming soon.`
              : ` Your board can include up to ${maxAdvisors} AI advisors.`}
          </p>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3 pt-2">
          {ADVISOR_LIBRARY.map((a) => {
            const on = existingKeys.includes(a.key);
            return (
              <div key={a.key} className="flex items-center gap-3 border border-border/70 rounded-xl p-3">
                <AdvisorAvatar name={a.name} accent={a.accent} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{a.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{a.role}</div>
                </div>
                {on ? (
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Added</span>
                ) : atCap ? (
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Coming soon</span>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => add(a)} disabled={adding === a.key}>
                    {adding === a.key ? "…" : "Invite"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}