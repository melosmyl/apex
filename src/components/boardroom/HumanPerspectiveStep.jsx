import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { ArrowRight, Mic } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

function HumanPerspectiveRow({ advisor, question, onChange }) {
  const [position, setPosition] = useState("");
  const [recommendation, setRecommendation] = useState("");

  const { isListening, toggle, supported } = useSpeechRecognition({
    onTranscript: (text) => {
      setPosition(text);
      onChange(advisor.id, text, recommendation);
    },
  });

  const handlePositionChange = (e) => {
    setPosition(e.target.value);
    onChange(advisor.id, e.target.value, recommendation);
  };

  return (
    <div className="border border-border/70 rounded-2xl p-4 bg-background/50">
      <div className="flex items-center gap-3 mb-3">
        <AdvisorAvatar name={advisor.name} accent={advisor.accent || "#7a5c3e"} size="sm" />
        <div>
          <div className="font-display text-sm font-medium">{advisor.name}</div>
          <div className="text-xs text-muted-foreground">{advisor.role}</div>
        </div>
        {supported && (
          <button
            onClick={toggle}
            className={`ml-auto inline-flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 transition-colors ${isListening ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground hover:bg-accent"}`}
          >
            <Mic className={`w-3.5 h-3.5 ${isListening ? "animate-pulse" : ""}`} />
            {isListening ? "Listening…" : "Speak"}
          </button>
        )}
      </div>
      <Textarea
        value={position}
        onChange={handlePositionChange}
        rows={3}
        placeholder={`${advisor.name}'s position on this question…`}
        className="text-sm resize-none bg-background"
      />
    </div>
  );
}

export default function HumanPerspectiveStep({ humanAdvisors, question, onSubmit, onSkip }) {
  const [perspectives, setPerspectives] = useState({});

  const handleChange = (advisorId, position, recommendation) => {
    setPerspectives((prev) => ({
      ...prev,
      [advisorId]: { position, recommendation },
    }));
  };

  const submit = () => {
    const filled = humanAdvisors
      .filter((a) => perspectives[a.id]?.position?.trim())
      .map((a) => ({
        advisor_id: a.id,
        advisor_name: a.name,
        role: a.role,
        provider_used: "human",
        model_used: "human",
        used_fallback: false,
        position: perspectives[a.id].position,
        recommendation: perspectives[a.id].recommendation || perspectives[a.id].position,
        key_arguments: [],
        assumptions: [],
        risks: [],
        missing_information: [],
        suggested_actions: [],
        confidence_score: null,
      }));
    onSubmit(filled);
  };

  const filledCount = humanAdvisors.filter((a) => perspectives[a.id]?.position?.trim()).length;

  return (
    <div className="max-w-3xl rise-in">
      <div className="bg-card border border-border/70 rounded-3xl p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Human Perspectives</div>
          <h2 className="font-display text-2xl font-light mb-1">What do your human advisors think?</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Your AI board has given their positions. Now capture your human advisors' input before the discussion — their perspectives will shape the debate.
          </p>
        </div>

        <div className="bg-secondary/40 rounded-xl p-3 mb-6 text-center">
          <p className="font-display text-sm italic text-muted-foreground">"{question}"</p>
        </div>

        <div className="space-y-5">
          {humanAdvisors.map((a) => (
            <HumanPerspectiveRow key={a.id} advisor={a} question={question} onChange={handleChange} />
          ))}
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/50">
          <button onClick={onSkip} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Skip human input
          </button>
          <Button onClick={submit} disabled={filledCount === 0} className="rounded-full px-6">
            Continue to discussion <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>
        {filledCount > 0 && (
          <p className="text-xs text-muted-foreground text-center mt-3">{filledCount} of {humanAdvisors.length} perspectives captured</p>
        )}
      </div>
    </div>
  );
}