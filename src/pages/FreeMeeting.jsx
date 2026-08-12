import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, ArrowRight } from "lucide-react";
import { supabase, base44 } from "@/api/base44Client";
import { IDENTITY_ACCENT_STYLE } from "@/lib/branding";
import { generateOnboardingPlan, createCompanyFromOnboarding } from "@/lib/onboarding";
import { QUESTIONS as PROFILE_QUESTIONS } from "@/components/onboarding/GuidedOnboarding";
import BoardDebate from "@/components/boardroom/BoardDebate";
import TurnstileWidget from "@/components/TurnstileWidget";

function useFreeMeetingGate() {
  const check = async () => {
    const { data } = await base44.functions.invoke("freeMeetingGate", { action: "check" });
    return data;
  };
  const complete = async (attemptId, meetingId) => {
    try { await base44.functions.invoke("freeMeetingGate", { action: "complete", attempt_id: attemptId, meeting_id: meetingId }); } catch { /* logging, non-critical */ }
  };
  return { check, complete };
}

function ConversionCapture({ meetingId, companyId }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | sent | error

  const submit = async () => {
    if (!email.trim()) return;
    setState("sending");
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    if (error) { setState("error"); return; }
    setState("sent");
  };

  if (state === "sent") {
    return (
      <div className="bg-card border border-border/70 rounded-2xl p-6 text-center">
        <p className="font-display text-lg mb-1">Check your email</p>
        <p className="text-sm text-muted-foreground">We sent a confirmation link to {email}. Click it, and this board — company, meeting, everything — is already yours.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border/70 rounded-2xl p-6">
      <p className="font-display text-lg mb-1">Keep this board</p>
      <p className="text-sm text-muted-foreground mb-4">This transcript is already yours to keep and share, no account needed. Enter your email and these same advisors remember this conversation and carry it forward — a real board, not a one-off.</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="flex-1" onKeyDown={(e) => e.key === "Enter" && submit()} />
        <Button onClick={submit} disabled={state === "sending" || !email.trim()} className="rounded-full px-6 shrink-0">
          {state === "sending" ? "Sending…" : "Keep this board"}
        </Button>
      </div>
      {state === "error" && <p className="text-sm text-destructive mt-2">Something went wrong. Please try again.</p>}
    </div>
  );
}

export default function FreeMeeting() {
  const gate = useFreeMeetingGate();
  const [phase, setPhase] = useState("intro"); // intro | form | starting | assembling | debate | blocked | error
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState({});
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [blockedMessage, setBlockedMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [company, setCompany] = useState(null);
  const [advisors, setAdvisors] = useState(null);
  const [attemptId, setAttemptId] = useState(null);
  const [resultReady, setResultReady] = useState(false);
  const [meetingIdForConversion, setMeetingIdForConversion] = useState(null);

  const set = (k, v) => setAnswers((a) => ({ ...a, [k]: v }));
  const canSubmit = question.trim() && answers.name?.trim() && answers.description?.trim() && answers.stage && answers.current_challenges?.trim();

  const begin = async () => {
    setPhase("starting");
    setErrorMessage("");
    try {
      const { data: { session: existing } } = await supabase.auth.getSession();
      if (!existing) {
        const { error: signInErr } = await supabase.auth.signInAnonymously(
          turnstileToken ? { options: { captchaToken: turnstileToken } } : undefined
        );
        if (signInErr) throw new Error(signInErr.message);
      }

      const gateResult = await gate.check();
      if (!gateResult?.eligible) {
        setBlockedMessage(gateResult?.message || "This isn't available right now.");
        setPhase("blocked");
        return;
      }
      setAttemptId(gateResult.attempt_id);

      setPhase("assembling");
      const plan = await generateOnboardingPlan(answers);
      const { company: newCompany, advisors: newAdvisors } = await createCompanyFromOnboarding(answers, plan);
      setCompany(newCompany);
      setAdvisors(newAdvisors);
      setPhase("debate");
    } catch (e) {
      setErrorMessage(e.message || "Something went wrong. Please try again.");
      setPhase("error");
    }
  };

  const handleResult = (final) => {
    setResultReady(true);
    setMeetingIdForConversion(final?.meeting_id);
    gate.complete(attemptId, final?.meeting_id);
  };

  return (
    <div className="min-h-screen bg-background" style={IDENTITY_ACCENT_STYLE}>
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-12">
        {phase === "intro" && (
          <div className="text-center rise-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-soft mb-6">
              <Sparkles className="w-6 h-6 text-brand" strokeWidth={1.5} />
            </div>
            <h1 className="font-display text-3xl sm:text-4xl leading-tight mb-4 text-balance">One real question. One real board meeting.</h1>
            <p className="text-muted-foreground text-base sm:text-lg leading-relaxed mb-8 max-w-md mx-auto">
              No account, no card. Bring something you're actually stuck on — five advisors will debate it for real, and you keep the result either way.
            </p>
            <Button onClick={() => setPhase("form")} variant="brand" className="rounded-full px-8 h-12">Begin <ArrowRight className="w-4 h-4 ml-1.5" /></Button>
          </div>
        )}

        {phase === "form" && (
          <div className="rise-in space-y-6">
            <div>
              <h2 className="font-display text-2xl mb-2">What are you stuck on?</h2>
              <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} placeholder="The real question you want the board to debate." autoFocus />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Company or idea name</label>
              <Input value={answers.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Lumen & Co." />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">What does it do?</label>
              <Textarea value={answers.description || ""} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="We help…" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Where are you right now?</label>
              <div className="grid grid-cols-2 gap-2">
                {PROFILE_QUESTIONS.find((q) => q.id === "stage").options.map((opt) => (
                  <button key={opt.value} onClick={() => set("stage", opt.value)} className={`text-left px-4 py-2.5 rounded-xl border text-sm transition-colors ${answers.stage === opt.value ? "border-brand bg-brand-soft" : "border-border/70 hover:bg-accent/40"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">What's keeping you up at night?</label>
              <Textarea value={answers.current_challenges || ""} onChange={(e) => set("current_challenges", e.target.value)} rows={2} placeholder="The thing you most need help with right now." />
            </div>

            <TurnstileWidget onToken={setTurnstileToken} />

            <Button onClick={begin} disabled={!canSubmit} variant="brand" className="rounded-full px-8 h-12 w-full sm:w-auto">
              Convene the board <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        )}

        {(phase === "starting" || phase === "assembling") && (
          <div className="text-center py-24 rise-in">
            <Sparkles className="w-6 h-6 text-brand animate-pulse mx-auto mb-4" />
            <p className="text-muted-foreground">{phase === "starting" ? "Getting things ready…" : "Assembling your board…"}</p>
          </div>
        )}

        {phase === "blocked" && (
          <div className="text-center py-24">
            <p className="text-lg text-muted-foreground max-w-md mx-auto">{blockedMessage}</p>
          </div>
        )}

        {phase === "error" && (
          <div className="text-center py-24">
            <p className="text-lg text-muted-foreground max-w-md mx-auto mb-4">{errorMessage}</p>
            <Button variant="outline" className="rounded-full" onClick={() => setPhase("form")}>Try again</Button>
          </div>
        )}

        {phase === "debate" && company && advisors && (
          <div className="space-y-8">
            <BoardDebate company={company} companyId={company.id} advisors={advisors} initialQuestion={question} autoStart onResult={handleResult} />
            {resultReady && <ConversionCapture meetingId={meetingIdForConversion} companyId={company.id} />}
          </div>
        )}

        <div className="flex items-center justify-center gap-4 mt-16 pt-6 border-t border-border/50">
          <Link to="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</Link>
          <Link to="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
        </div>
      </div>
    </div>
  );
}
