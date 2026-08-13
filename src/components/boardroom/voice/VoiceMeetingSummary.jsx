import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Pin, CheckCircle2, Clock } from "lucide-react";

export default function VoiceMeetingSummary({ result, advisors, companyId, onSave, onClose }) {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(result?.summary || {});
  const [tasks, setTasks] = useState(summary.tasks_and_owners || []);
  const [pins, setPins] = useState(summary.suggested_pins || []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateTask = (i, field, value) => {
    setTasks(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t));
  };

  const updatePin = (i, field, value) => {
    setPins(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  };

  const handleSave = async () => {
    setSaving(true);
    const finalSummary = { ...summary, tasks_and_owners: tasks, suggested_pins: pins };
    await onSave(finalSummary);
    setSaving(false);
    setSaved(true);
  };

  const fmtTime = (sec) => {
    const m = Math.floor(sec / 60);
    return `${m} min${m !== 1 ? "s" : ""}`;
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl">Meeting Summary</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {result?.duration_minutes ? `${result.duration_minutes} min meeting` : ""} ·
            {" "}
            {fmtTime(summary.estimated_time_saved_minutes || 0)} estimated saved
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondaryOutline" size="sm" onClick={onClose}>Close</Button>
          {!saved && (
            <Button onClick={handleSave} disabled={saving} variant="primary">
              {saving ? "Saving…" : "Save to records"}
            </Button>
          )}
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-brand">
              <CheckCircle2 className="w-4 h-4" /> Saved
            </span>
          )}
        </div>
      </div>

      {/* Executive Summary */}
      {summary.executive_summary && (
        <div className="bg-card border border-border/70 rounded-2xl p-6 mb-4">
          <h3 className="font-display text-lg mb-3">Executive Summary</h3>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{summary.executive_summary}</p>
        </div>
      )}

      {/* Recommendations */}
      {summary.main_recommendations?.length > 0 && (
        <div className="bg-card border border-border/70 rounded-2xl p-6 mb-4">
          <h3 className="font-display text-lg mb-3">Main Recommendations</h3>
          <ul className="space-y-2">
            {summary.main_recommendations.map((r, i) => (
              <li key={i} className="text-sm text-muted-foreground flex gap-2">
                <span className="text-brand mt-0.5">→</span> {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Agreement & Disagreement */}
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        {summary.areas_of_agreement?.length > 0 && (
          <div className="bg-card border border-border/70 rounded-2xl p-5">
            <h3 className="font-display text-base mb-2 text-brand">Agreement</h3>
            <ul className="space-y-1.5">
              {summary.areas_of_agreement.map((a, i) => (
                <li key={i} className="text-xs text-muted-foreground">• {a}</li>
              ))}
            </ul>
          </div>
        )}
        {summary.areas_of_disagreement?.length > 0 && (
          <div className="bg-card border border-border/70 rounded-2xl p-5">
            <h3 className="font-display text-base mb-2 text-destructive">Disagreement</h3>
            <ul className="space-y-1.5">
              {summary.areas_of_disagreement.map((d, i) => (
                <li key={i} className="text-xs text-muted-foreground">• {d}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Risks & Questions */}
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        {summary.important_risks?.length > 0 && (
          <div className="bg-card border border-border/70 rounded-2xl p-5">
            <h3 className="font-display text-base mb-2">Risks</h3>
            <ul className="space-y-1.5">
              {summary.important_risks.map((r, i) => (
                <li key={i} className="text-xs text-muted-foreground">⚠ {r}</li>
              ))}
            </ul>
          </div>
        )}
        {summary.open_questions?.length > 0 && (
          <div className="bg-card border border-border/70 rounded-2xl p-5">
            <h3 className="font-display text-base mb-2">Open Questions</h3>
            <ul className="space-y-1.5">
              {summary.open_questions.map((q, i) => (
                <li key={i} className="text-xs text-muted-foreground">? {q}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Tasks */}
      {tasks.length > 0 && (
        <div className="bg-card border border-border/70 rounded-2xl p-6 mb-4">
          <h3 className="font-display text-lg mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Tasks
          </h3>
          <div className="space-y-2">
            {tasks.map((t, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  value={t.title || ""}
                  onChange={(e) => updateTask(i, "title", e.target.value)}
                  className="flex-1 text-sm bg-background rounded-lg border border-border px-3 py-1.5"
                />
                <input
                  value={t.assigned_to || ""}
                  onChange={(e) => updateTask(i, "assigned_to", e.target.value)}
                  className="w-32 text-xs bg-background rounded-lg border border-border px-2 py-1.5"
                  placeholder="Assignee"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Pins */}
      {pins.length > 0 && (
        <div className="bg-card border border-border/70 rounded-2xl p-6 mb-4">
          <h3 className="font-display text-lg mb-3 flex items-center gap-2">
            <Pin className="w-4 h-4" /> Suggested Pins
          </h3>
          <div className="space-y-2">
            {pins.map((p, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-soft text-brand mt-1">{p.pin_type || "Insight"}</span>
                <input
                  value={p.summary || ""}
                  onChange={(e) => updatePin(i, "summary", e.target.value)}
                  className="flex-1 text-sm bg-background rounded-lg border border-border px-3 py-1.5"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next meeting */}
      {summary.recommended_next_meeting && (
        <div className="bg-brand-soft border border-brand/30 rounded-2xl p-5 mb-4">
          <h3 className="font-display text-base mb-1 flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand" /> Recommended Next Meeting
          </h3>
          <p className="text-sm text-muted-foreground">{summary.recommended_next_meeting}</p>
        </div>
      )}

      {/* Full Transcript */}
      {result?.transcript?.length > 0 && (
        <div className="bg-card border border-border/70 rounded-2xl p-6">
          <h3 className="font-display text-lg mb-3">Full Transcript</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {result.transcript.map((msg, i) => (
              <div key={i} className="text-sm">
                <span className={`font-medium ${msg.speaker_type === "founder" ? "text-foreground" : "text-brand"}`}>
                  {msg.speaker_type === "founder" ? "Founder" : msg.speaker_name}:
                </span>
                <span className="text-muted-foreground ml-2">{msg.message_text}</span>
                {msg.was_interrupted && <span className="text-xs text-destructive ml-1">[interrupted]</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}