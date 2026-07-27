import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { Sparkles, X, Plus, ArrowRight, Landmark, CheckSquare, Target, Check } from "lucide-react";
import { ADVISOR_LIBRARY } from "@/lib/advisorLibrary";
import { getJourney, STAGE_LABELS } from "@/lib/companyJourney";
import { createCompanyFromOnboarding } from "@/lib/onboarding";

export default function OnboardingReview({ answers, plan, onComplete, onBack }) {
  const [advisors, setAdvisors] = useState(plan.recommended_advisors || []);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const journey = getJourney(plan.recommended_journey || answers.stage);

  const removeAdvisor = (key) => {
    setAdvisors((prev) => prev.filter((a) => a.key !== key));
  };

  const addAdvisor = (libAdvisor) => {
    if (advisors.some((a) => a.key === libAdvisor.key)) return;
    setAdvisors((prev) => [...prev, {
      key: libAdvisor.key,
      name: libAdvisor.name,
      role: libAdvisor.role,
      reason: "Added by you."
    }]);
  };

  const availableToAdd = ADVISOR_LIBRARY.filter((a) => !advisors.some((rec) => rec.key === a.key));

  const handleBegin = async () => {
    setCreating(true);
    setError(null);
    try {
      const updatedPlan = { ...plan, recommended_advisors: advisors };
      const { company } = await createCompanyFromOnboarding(answers, updatedPlan);
      onComplete(company);
    } catch (e) {
      console.error("Onboarding creation failed:", e);
      setError(e.message || "Something went wrong creating your company. Please try again.");
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
          <Sparkles className="w-3.5 h-3.5 text-brand" /> Your board is ready
        </div>
        <h2 className="text-3xl sm:text-[2.5rem] sm:leading-[1.1] font-display font-normal mb-3 text-balance">
          {plan.executive_briefing || "Here's your recommended starting point."}
        </h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Your company type: <span className="text-foreground font-medium">{plan.company_type}</span> · Your journey: <span className="text-foreground font-medium">{journey.label}</span>
        </p>
      </div>

      {/* Start here */}
      {plan.start_here_action && (
        <div className="bg-card border border-brand/30 rounded-2xl p-6 mb-8 shadow-warm-glow">
          <div className="flex items-start gap-4">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-brand text-brand-foreground shrink-0">
              <Target className="w-5 h-5" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <div className="text-xs uppercase tracking-[0.16em] text-brand font-medium mb-1">Start here</div>
              <p className="text-lg font-display leading-snug">{plan.start_here_action}</p>
            </div>
          </div>
        </div>
      )}

      {/* Recommended board */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl">Your recommended board</h3>
          <button onClick={() => setShowAddPanel(!showAddPanel)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add advisor
          </button>
        </div>

        {showAddPanel && (
          <div className="bg-secondary/50 rounded-2xl p-4 mb-4 max-h-64 overflow-y-auto">
            <div className="grid sm:grid-cols-2 gap-2">
              {availableToAdd.map((a) => (
                <button key={a.key} onClick={() => addAdvisor(a)} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors text-left">
                  <AdvisorAvatar name={a.name} accent={a.accent} photo_url={a.photo_url} size="sm" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{a.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{a.role}</div>
                  </div>
                  <Plus className="w-3.5 h-3.5 text-muted-foreground ml-auto shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {advisors.map((a) => {
            const lib = ADVISOR_LIBRARY.find((la) => la.key === a.key);
            return (
              <div key={a.key} className="bg-card border border-border/70 rounded-2xl p-4 flex items-start gap-4 group rise-in">
                <AdvisorAvatar name={a.name} accent={lib?.accent || "#7a5c3e"} photo_url={lib?.photo_url} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{a.name}</span>
                    <span className="text-xs text-muted-foreground">{a.role}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{a.reason}</p>
                </div>
                {a.key !== "chair" && (
                  <button onClick={() => removeAdvisor(a.key)} className="text-muted-foreground hover:text-destructive transition-colors p-1 opacity-0 group-hover:opacity-100">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* First meetings + tasks */}
      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        {plan.suggested_meetings?.length > 0 && (
          <div className="bg-card border border-border/70 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Landmark className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
              <h4 className="font-display text-base">First meetings</h4>
            </div>
            <ul className="space-y-2.5">
              {plan.suggested_meetings.map((q, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <span className="font-display text-muted-foreground/60 mt-0.5">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-foreground/90">{q}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {plan.suggested_tasks?.length > 0 && (
          <div className="bg-card border border-border/70 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckSquare className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
              <h4 className="font-display text-base">First tasks</h4>
            </div>
            <ul className="space-y-2.5">
              {plan.suggested_tasks.map((t, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  <Check className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" strokeWidth={1.5} />
                  <div>
                    <span className="text-foreground/90">{t.title}</span>
                    <span className="text-xs text-muted-foreground block">{t.assigned_to}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Journey preview */}
      <div className="bg-secondary/40 rounded-2xl p-5 mb-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Your journey</span>
        </div>
        <p className="text-sm text-muted-foreground mb-3">{journey.description}</p>
        <div className="flex flex-wrap gap-2">
          {journey.milestones.slice(0, 4).map((m, i) => (
            <span key={i} className="text-xs bg-card border border-border/60 rounded-full px-3 py-1 text-muted-foreground">{m}</span>
          ))}
          {journey.milestones.length > 4 && <span className="text-xs text-muted-foreground self-center">+{journey.milestones.length - 4} more</span>}
        </div>
      </div>

      {error && <p className="text-sm text-destructive text-center mb-4">{error}</p>}

      <div className="flex items-center justify-between">
        <Button onClick={onBack} variant="ghost" className="rounded-full px-5" disabled={creating}>
          Back
        </Button>
        <Button onClick={handleBegin} variant="brand" className="rounded-full px-8 h-12" disabled={creating || advisors.length < 3}>
          {creating ? "Setting up your company…" : "Begin" } {!creating && <ArrowRight className="w-4 h-4 ml-1.5" />}
        </Button>
      </div>
      {advisors.length < 3 && <p className="text-xs text-muted-foreground text-right mt-2">A board needs at least 3 advisors.</p>}
    </div>
  );
}