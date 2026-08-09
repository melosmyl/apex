import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, ArrowLeft, Sparkles, Check } from "lucide-react";
import OnboardingReview from "@/components/onboarding/OnboardingReview";
import { generateOnboardingPlan } from "@/lib/onboarding";

const QUESTIONS = [
  { id: "name", type: "text", question: "What's the name of your company or idea?", placeholder: "e.g. Lumen & Co.", hint: "Don't worry — you can change this later.", required: true },
  { id: "description", type: "textarea", question: "In a sentence or two, what does it do?", placeholder: "We help…", hint: "Just the gist — your advisors will learn the rest.", required: true },
  { id: "stage", type: "choice", question: "Where are you right now?", options: [
    { value: "idea_validation", label: "Idea stage" },
    { value: "pre_launch", label: "Pre-launch" },
    { value: "early_revenue", label: "Early revenue" },
    { value: "growth", label: "Growth" },
    { value: "fundraising", label: "Fundraising" },
    { value: "product_launch", label: "Product launch" },
    { value: "market_expansion", label: "Market expansion" },
    { value: "turnaround", label: "Turnaround" }
  ], required: true },
  { id: "current_challenges", type: "textarea", question: "What's keeping you up at night?", placeholder: "The thing you most need help with right now.", hint: "Your board will ask for more detail as it gets to know you.", required: true }
];

const PHASE_MESSAGES = [
  "Understanding your situation…",
  "Selecting the right advisors…",
  "Preparing your first steps…"
];

export default function GuidedOnboarding({ open, onClose }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState("welcome");
  const [answers, setAnswers] = useState({});
  const [stepIndex, setStepIndex] = useState(0);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [analyzingStep, setAnalyzingStep] = useState(0);

  const visibleQuestions = QUESTIONS.filter((q) => !q.showIf || q.showIf(answers));
  const current = visibleQuestions[stepIndex];
  const progress = phase === "questions" ? Math.round((stepIndex / visibleQuestions.length) * 100) : phase === "welcome" ? 0 : 100;

  const set = (k, v) => { setAnswers((a) => ({ ...a, [k]: v })); };

  const beginQuestions = () => {
    setPhase("questions");
    setStepIndex(0);
  };

  const next = () => {
    if (stepIndex < visibleQuestions.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      analyze();
    }
  };

  const back = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
    else setPhase("welcome");
  };

  const canProceed = () => {
    if (!current) return false;
    if (!current.required) return true;
    const v = answers[current.id];
    return v && String(v).trim();
  };

  const analyze = async () => {
    setPhase("analyzing");
    setError(null);
    setAnalyzingStep(0);
    const interval = setInterval(() => {
      setAnalyzingStep((s) => (s < PHASE_MESSAGES.length - 1 ? s + 1 : s));
    }, 2000);
    try {
      const result = await generateOnboardingPlan(answers);
      clearInterval(interval);
      setPlan(result);
      setPhase("review");
    } catch (e) {
      clearInterval(interval);
      setError(e.message || "Something went wrong. Please try again.");
      setPhase("questions");
    }
  };

  const handleComplete = (company) => {
    onClose?.();
    navigate(`/company/${company.id}/dashboard`);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <div className="min-h-screen flex flex-col">
        {/* Progress bar */}
        {phase !== "welcome" && phase !== "review" && (
          <div className="sticky top-0 z-10 bg-background/80 backdrop-blur px-5 sm:px-8 py-4">
            <div className="max-w-xl mx-auto">
              <div className="flex items-center justify-between mb-2">
                <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                {phase === "questions" && (
                  <span className="text-xs text-muted-foreground">{stepIndex + 1} of {visibleQuestions.length}</span>
                )}
              </div>
              <div className="h-1 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-brand rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 flex items-center justify-center px-5 sm:px-8 py-10">
          {phase === "welcome" && (
            <div className="max-w-xl text-center fade-in">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-soft mb-6">
                <Sparkles className="w-6 h-6 text-brand" strokeWidth={1.5} />
              </div>
              <h1 className="text-3xl sm:text-[2.5rem] sm:leading-[1.1] font-display font-normal mb-4 text-balance">
                Let's build your board.
              </h1>
              <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-md mx-auto mb-8">
                Four quick questions. We'll assemble the right advisors and map your first steps — the rest, your board will ask you directly.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={beginQuestions} variant="brand" className="rounded-full px-8 h-12 text-[0.95rem]">
                  Begin <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
                <Button onClick={onClose} variant="ghost" className="rounded-full px-6">Maybe later</Button>
              </div>
              <p className="text-xs text-muted-foreground/70 mt-8">Takes about a minute. One question at a time.</p>
            </div>
          )}

          {phase === "questions" && current && (
            <div className="w-full max-w-xl rise-in" key={current.id}>
              <div className="mb-8">
                <h2 className="text-2xl sm:text-[2rem] sm:leading-[1.15] font-display font-normal text-balance mb-2">
                  {current.question}
                </h2>
                {current.hint && <p className="text-sm text-muted-foreground">{current.hint}</p>}
              </div>

              {current.type === "text" && (
                <Input
                  value={answers[current.id] || ""}
                  onChange={(e) => set(current.id, e.target.value)}
                  placeholder={current.placeholder}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter" && canProceed()) next(); }}
                  className="text-base h-12 rounded-xl"
                />
              )}

              {current.type === "textarea" && (
                <Textarea
                  value={answers[current.id] || ""}
                  onChange={(e) => set(current.id, e.target.value)}
                  placeholder={current.placeholder}
                  rows={4}
                  autoFocus
                  className="text-base resize-none rounded-xl"
                />
              )}

              {current.type === "choice" && (
                <div className="space-y-2.5">
                  {current.options.map((opt) => {
                    const selected = answers[current.id] === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => set(current.id, opt.value)}
                        className={`w-full text-left px-5 py-4 rounded-xl border transition-all duration-200 flex items-center justify-between ${
                          selected
                            ? "border-brand bg-brand-soft text-foreground"
                            : "border-border/70 bg-card hover:border-border hover:bg-accent/40"
                        }`}
                      >
                        <span className="text-[0.95rem]">{opt.label}</span>
                        {selected && <Check className="w-4 h-4 text-brand" />}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between mt-8">
                <Button onClick={back} variant="ghost" className="rounded-full px-5">
                  <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
                </Button>
                <Button onClick={next} disabled={!canProceed()} variant="brand" className="rounded-full px-8">
                  {stepIndex === visibleQuestions.length - 1 ? "See my board" : "Continue"} <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>

              {error && <p className="text-sm text-destructive mt-4 text-center">{error}</p>}
            </div>
          )}

          {phase === "analyzing" && (
            <div className="max-w-xl text-center fade-in">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-soft mb-6">
                <Sparkles className="w-6 h-6 text-brand animate-pulse" strokeWidth={1.5} />
              </div>
              <h2 className="text-2xl font-display font-normal mb-3">Assembling your board…</h2>
              <p className="text-muted-foreground text-base mb-8">{PHASE_MESSAGES[analyzingStep]}</p>
              <div className="flex gap-1.5 justify-center">
                {[0, 1, 2].map((i) => (
                  <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i <= analyzingStep ? "bg-brand w-8" : "bg-secondary w-4"}`} />
                ))}
              </div>
            </div>
          )}

          {phase === "review" && plan && (
            <div className="w-full max-w-3xl rise-in">
              <OnboardingReview answers={answers} plan={plan} onComplete={handleComplete} onBack={() => setPhase("questions")} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}