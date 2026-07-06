import React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AdvisorAvatar from "@/components/AdvisorAvatar";

function Section({ title, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => <Badge key={i} variant="secondary" className="font-normal rounded-full">{it}</Badge>)}
      </div>
    </div>
  );
}

export default function AdvisorProfileDialog({ advisor, open, onOpenChange, onAction, actionLabel, actionVariant = "default" }) {
  if (!advisor) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center gap-4 mb-5">
          <AdvisorAvatar name={advisor.name} accent={advisor.accent} size="xl" />
          <div>
            <h2 className="font-display text-2xl">{advisor.name}</h2>
            <p className="text-muted-foreground">{advisor.role}</p>
          </div>
        </div>
        <p className="text-sm leading-relaxed mb-5">{advisor.biography}</p>
        <div className="grid sm:grid-cols-2 gap-4 mb-5">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Decision style</div>
            <p className="text-sm">{advisor.decision_style}</p>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Communication style</div>
            <p className="text-sm">{advisor.communication_style}</p>
          </div>
        </div>
        <div className="space-y-4">
          <Section title="Expertise" items={advisor.expertise} />
          <Section title="Strengths" items={advisor.strengths} />
          <Section title="Weaknesses" items={advisor.weaknesses} />
          <Section title="Personality" items={advisor.personality_traits} />
        </div>
        {onAction && (
          <div className="flex justify-end mt-6">
            <Button variant={actionVariant} onClick={() => onAction(advisor)}>{actionLabel}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}