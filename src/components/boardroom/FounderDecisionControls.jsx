import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, Edit3, CircleDot } from "lucide-react";

const OPTIONS = [
  { value: "accept", label: "Accept", icon: Check },
  { value: "reject", label: "Reject", icon: X },
  { value: "modify", label: "Modify", icon: Edit3 },
  { value: "undecided", label: "Undecided", icon: CircleDot },
];

// Next actions become real tasks automatically server-side (see
// runChairSynthesis) — this component only records the founder's own
// decision about the resolution. See CommitmentsNote for the read-only
// "these were added to Tasks" confirmation.
export default function FounderDecisionControls({ meetingId }) {
  const [decision, setDecision] = useState("pending");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await base44.entities.BoardMeeting.update(meetingId, {
        founder_decision: decision, founder_decision_notes: notes,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border/70 rounded-2xl p-6 space-y-5">
      <div>
        <h4 className="font-display text-lg mb-1">Founder's Decision</h4>
        <p className="text-xs text-muted-foreground mb-3">The board advises. You decide.</p>
        <div className="flex flex-wrap gap-2">
          {OPTIONS.map(opt => {
            const Icon = opt.icon;
            return (
              <button key={opt.value} onClick={() => setDecision(opt.value)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${decision === opt.value ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"}`}>
                <Icon className="w-4 h-4" /> {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium mb-1.5 block">Notes / Your own decision</label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
          placeholder="Add your thoughts, conditions, or your own final decision…" />
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving || decision === "pending"} variant="primary" className="px-6">
          {saved ? "Saved" : saving ? "Saving…" : "Save decision"}
        </Button>
      </div>
    </div>
  );
}