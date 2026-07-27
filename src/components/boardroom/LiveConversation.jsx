import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import VoiceMeetingScreen from "@/components/boardroom/voice/VoiceMeetingScreen";
import VoiceMeetingSummary from "@/components/boardroom/voice/VoiceMeetingSummary";
import { useVoiceMeeting } from "@/hooks/useVoiceMeeting";
import { saveMeetingResults } from "@/lib/liveBoardroom";
import { Radio, ShieldCheck, ArrowLeft, Check } from "lucide-react";

const PROMPTS = [
  "Should we raise our prices by 20% next quarter?",
  "How should we prioritise our product roadmap for the next 6 months?",
  "Is this the right time to expand into a new market?",
];

export default function LiveConversation({ company, companyId, advisors }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState("setup"); // setup, meeting, summary
  const [selectedIds, setSelectedIds] = useState([]);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [topic, setTopic] = useState("");
  const [autoJoin, setAutoJoin] = useState(true);
  const [summary, setSummary] = useState(null);

  const aiAdvisors = advisors.filter((a) => a.type !== "human");

  const toggleAdvisor = (a) => {
    if (!hasInteracted) {
      setSelectedIds([a.id]);
      setHasInteracted(true);
    } else {
      setSelectedIds((prev) =>
        prev.includes(a.id) ? prev.filter((id) => id !== a.id) : [...prev, a.id]
      );
    }
  };

  const selectedAdvisors = aiAdvisors.filter((a) => selectedIds.includes(a.id));

  const voiceMeeting = useVoiceMeeting({
    companyId,
    advisors: selectedAdvisors,
    topic,
    settings: { autoJoin },
    onMeetingEnd: (result) => {
      setSummary(result);
      setPhase("summary");
    },
  });

  const handleStart = () => {
    if (!topic.trim() || selectedAdvisors.length < 1) return;
    setPhase("meeting");
  };

  const handleSave = async (finalSummary) => {
    await saveMeetingResults({
      companyId,
      sessionId: voiceMeeting.sessionId,
      summary: finalSummary,
      advisorNames: selectedAdvisors.map((a) => a.name),
      topic,
    });
  };

  // Setup phase
  if (phase === "setup") {
    return (
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate(`/company/${companyId}/boardroom`)}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> All modes
        </button>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-soft mb-4">
            <Radio className="w-6 h-6 text-brand" />
          </div>
          <h2 className="font-display text-2xl mb-2">Live Conversation</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Speak naturally with your AI advisors in a real voice meeting. They'll respond aloud, remember the full conversation, and challenge each other's thinking.
          </p>
        </div>

        {/* Privacy notice */}
        <div className="flex items-start gap-3 bg-muted/50 rounded-xl p-4 mb-6">
          <ShieldCheck className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium mb-1">Voice privacy</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your audio is processed by your browser to create the conversation and transcript. Raw audio is not stored. The transcript is saved to your meeting records.
            </p>
          </div>
        </div>

        {/* Topic */}
        <div className="bg-card border border-border/70 rounded-2xl p-5 mb-4">
          <label className="text-sm font-medium mb-2 block">Meeting topic</label>
          <Textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={2}
            placeholder="What would you like to discuss with your board?"
            className="text-sm resize-none bg-background rounded-xl"
          />
          <div className="flex flex-wrap gap-2 mt-3">
            {PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => setTopic(p)}
                className="text-xs text-muted-foreground bg-secondary hover:bg-accent rounded-full px-3 py-1.5 transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Advisor selection */}
        <div className="bg-card border border-border/70 rounded-2xl p-5 mb-4">
          <label className="text-sm font-medium mb-3 block">
            Select advisors ({selectedAdvisors.length}/3)
          </label>
          <div className="grid grid-cols-3 gap-3">
            {aiAdvisors.slice(0, 9).map((advisor) => {
              const selected = selectedIds.includes(advisor.id);
              return (
                <button
                  key={advisor.id}
                  onClick={() => toggleAdvisor(advisor)}
                  disabled={!selected && selectedAdvisors.length >= 3}
                  className={`flex flex-col items-center p-3 rounded-xl border transition-all ${
                    selected
                      ? "border-brand bg-brand-soft"
                      : "border-border/60 hover:border-border"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <AdvisorAvatar
                    name={advisor.name}
                    accent={advisor.accent}
                    photo_url={advisor.avatar}
                    size="md"
                  />
                  <p className="font-display text-xs font-medium mt-2 text-center leading-tight">{advisor.name}</p>
                  <p className="text-[10px] text-muted-foreground text-center leading-tight">{advisor.role}</p>
                  {selected && <Check className="w-3 h-3 text-brand mt-1" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Settings */}
        <div className="bg-card border border-border/70 rounded-2xl p-5 mb-6">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm font-medium">Allow advisors to join naturally</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Advisors can contribute without being invited when they have a relevant perspective or disagreement
              </p>
            </div>
            <button
              onClick={() => setAutoJoin(!autoJoin)}
              className={`w-11 h-6 rounded-full transition-colors relative ${autoJoin ? "bg-brand" : "bg-muted-foreground/30"}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${autoJoin ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </label>
        </div>

        <Button
          onClick={handleStart}
          disabled={!topic.trim() || selectedAdvisors.length < 1}
          className="w-full rounded-full h-12"
        >
          <Radio className="w-4 h-4 mr-2" /> Start voice meeting
        </Button>
      </div>
    );
  }

  // Meeting phase
  if (phase === "meeting") {
    return (
      <VoiceMeetingScreen
        company={company}
        topic={topic}
        advisors={selectedAdvisors}
        voiceMeeting={voiceMeeting}
        onEnd={() => voiceMeeting.endMeeting()}
        onShowTranscript={() => {}}
      />
    );
  }

  // Summary phase
  if (phase === "summary") {
    return (
      <div className="py-6">
        <button
          onClick={() => navigate(`/company/${companyId}/boardroom`)}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Boardroom
        </button>
        {summary ? (
          <VoiceMeetingSummary
            result={summary}
            advisors={selectedAdvisors}
            companyId={companyId}
            onSave={handleSave}
            onClose={() => navigate(`/company/${companyId}/boardroom`)}
          />
        ) : (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground">Could not generate the meeting summary.</p>
          </div>
        )}
      </div>
    );
  }

  return null;
}