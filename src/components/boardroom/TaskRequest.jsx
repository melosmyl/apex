import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import ReactMarkdown from "react-markdown";
import { ArrowRight, RotateCcw, FileText, CheckCircle2, Link2 } from "lucide-react";
import { runTaskRequest, saveTaskDeliverable } from "@/lib/meetingModes";
import { useNavigate } from "react-router-dom";

export default function TaskRequest({ company, companyId, advisors }) {
  const navigate = useNavigate();
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [selectedAdvisor, setSelectedAdvisor] = useState(null);
  const [result, setResult] = useState(null);
  const [savedDoc, setSavedDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    if (!taskTitle.trim() || !selectedAdvisor) return;
    setLoading(true);
    setError(null);
    try {
      const res = await runTaskRequest({ company, taskTitle, taskDescription: taskDescription || taskTitle, advisor: selectedAdvisor });
      setResult(res);
      const { doc } = await saveTaskDeliverable({ companyId, taskTitle, advisor: selectedAdvisor, result: res });
      setSavedDoc(doc);
    } catch (e) {
      setError(e.message || "Something went wrong producing the deliverable.");
    }
    setLoading(false);
  };

  if (result) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <AdvisorAvatar name={selectedAdvisor?.name} accent={selectedAdvisor?.accent} photo_url={selectedAdvisor?.avatar} size="md" />
            <div>
              <div className="font-medium">{selectedAdvisor?.name}</div>
              <div className="text-xs text-muted-foreground">{selectedAdvisor?.role}</div>
            </div>
          </div>
          <Button variant="secondaryOutline" onClick={() => { setResult(null); setSavedDoc(null); setTaskTitle(""); setTaskDescription(""); }}>
            <RotateCcw className="w-4 h-4 mr-1.5" /> New request
          </Button>
        </div>

        {savedDoc && (
          <div className="bg-brand-soft border border-brand/30 rounded-2xl p-4 mb-5 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-brand shrink-0" />
            <span className="text-sm flex-1">Deliverable saved to Documents.</span>
            <Button variant="ghost" className="text-sm" onClick={() => navigate(`/company/${companyId}/documents`)}>
              <Link2 className="w-3.5 h-3.5 mr-1" /> Open
            </Button>
          </div>
        )}

        <div className="bg-card border border-border/70 rounded-2xl p-6 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
            <h3 className="font-display text-lg">{taskTitle}</h3>
          </div>
          <div className="prose-editor text-[0.92rem]">
            <ReactMarkdown>{result.content}</ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-display mb-1">Task Request</h2>
      <p className="text-muted-foreground mb-6">Ask an advisor to produce a finished deliverable — a report, plan, or analysis. It's saved automatically to Documents.</p>

      <div className="mb-6">
        <Label className="mb-2.5 block text-sm">Choose an advisor</Label>
        <div className="flex flex-wrap gap-2">
          {advisors.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedAdvisor(a)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                selectedAdvisor?.id === a.id ? "border-brand bg-brand-soft" : "border-border/70 bg-card hover:border-border"
              }`}
            >
              <AdvisorAvatar name={a.name} accent={a.accent} photo_url={a.avatar} size="sm" />
              <span className="text-sm">{a.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <Label className="mb-2.5 block text-sm">What do you need?</Label>
        <Input
          value={taskTitle}
          onChange={(e) => setTaskTitle(e.target.value)}
          placeholder="e.g. Competitor analysis for the UK meal-kit market"
          className="h-11"
        />
      </div>

      <div className="mb-4">
        <Label className="mb-2.5 block text-sm">Details and requirements</Label>
        <Textarea
          value={taskDescription}
          onChange={(e) => setTaskDescription(e.target.value)}
          rows={4}
          placeholder="What should it cover? Any specific angles, constraints, or data to include?"
          className="resize-none"
        />
      </div>

      {error && <p className="text-sm text-destructive mb-4">{error}</p>}

      <Button onClick={run} disabled={!taskTitle.trim() || !selectedAdvisor || loading} variant="primary" className="px-8">
        {loading ? "Producing deliverable…" : "Request deliverable"} {!loading && <ArrowRight className="w-4 h-4 ml-1.5" />}
      </Button>
    </div>
  );
}